// Smoke test for Pocket mode (backend API + offline-queue semantics).
// Requires a running backend; verifies exactly-once effects under replay.
//
//   BASE=http://localhost:5000 \
//   POCKET_EMAIL=demo@student.com POCKET_PASSWORD=student123 \
//   node backend/scripts/smoke-pocket.mjs
//
// Covers: start (batch deal + quota), answer, idempotent replay, offline sync
// flush, sync replay, ownership (404 for another user), end, input validation,
// and that QuestionAttempt / UserConceptStat grow by exactly the unique answers.
import { PrismaClient } from '@prisma/client';

const BASE = process.env.BASE || 'http://localhost:5000';
const EMAIL = process.env.POCKET_EMAIL || 'demo@student.com';
const PASSWORD = process.env.POCKET_PASSWORD || 'student123';
const ADMIN_EMAIL = process.env.POCKET_ADMIN_EMAIL || 'admin@keralapsc.com';
const ADMIN_PASSWORD = process.env.POCKET_ADMIN_PASSWORD || 'admin123';

const prisma = new PrismaClient();

const login = async (email, password) => {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then((x) => x.json());
  const token = r.token || r.accessToken;
  if (!token) throw new Error(`login failed for ${email}`);
  return { token, userId: r.user?.id };
};

const call = (token, method, path, body) =>
  fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, data: await r.json() }));

const snapStats = async (userId) => {
  const rows = await prisma.userConceptStat.findMany({
    where: { userId },
    select: { conceptId: true, chapterId: true, total: true, correct: true },
  });
  const m = new Map();
  for (const r of rows) m.set(`c:${r.conceptId ?? '-'}|ch:${r.chapterId ?? '-'}`, { total: r.total, correct: r.correct });
  return m;
};

let failures = 0;
const check = (label, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? ' :: ' + extra : ''}`);
  if (!cond) failures++;
};

const main = async () => {
  const demo = await login(EMAIL, PASSWORD);
  const adm = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  const tok = demo.token;

  const statsBefore = await snapStats(demo.userId);
  const attemptsBefore = await prisma.questionAttempt.count({ where: { userId: demo.userId } });

  // ---- start: batch deal + quota ----
  const start = await call(tok, 'POST', '/api/pocket/start', { batchSize: 8 });
  check('start 200', start.status === 200, `status=${start.status}`);
  const { session, items } = start.data;
  check('8 items dealt', items.length === 8, `got ${items.length}`);
  check('quota met (>=70% NONE/MENTAL)', start.data.tiers.preferred >= 6, JSON.stringify(start.data.tiers));
  check('clientIds unique', new Set(items.map((i) => i.clientId)).size === 8);
  check('correctOption shipped for offline grading', items.every((i) => typeof i.question.correctOption === 'number'));
  check('options normalized', items.every((i) => Array.isArray(i.question.options) && i.question.options.length >= 2));

  // ---- answer + idempotent replay ----
  const a1 = await call(tok, 'POST', `/api/pocket/session/${session.id}/answer`, {
    clientId: items[0].clientId, questionId: items[0].question.id,
    selectedOption: items[0].question.correctOption, timeTaken: 1200,
  });
  check('answer graded correct', a1.data.isCorrect === true && a1.data.duplicate === false, JSON.stringify(a1.data));

  const replay = await call(tok, 'POST', `/api/pocket/session/${session.id}/answer`, {
    clientId: items[0].clientId, questionId: items[0].question.id,
    selectedOption: (items[0].question.correctOption + 1) % 4, timeTaken: 500,
  });
  check('replay flagged duplicate', replay.data.duplicate === true, JSON.stringify(replay.data));
  check('replay returns original grade', replay.data.isCorrect === true);

  const wrong = (items[1].question.correctOption + 1) % 4;
  const a2 = await call(tok, 'POST', `/api/pocket/session/${session.id}/answer`, {
    clientId: items[1].clientId, selectedOption: wrong, timeTaken: 3000,
  });
  check('wrong answer graded false', a2.data.isCorrect === false && a2.data.correctOption === items[1].question.correctOption);

  // ---- offline sync: full-queue replay must not double-count ----
  const answers = [
    { clientId: items[0].clientId, questionId: items[0].question.id, selectedOption: items[0].question.correctOption, timeTaken: 1200 },
    { clientId: items[1].clientId, questionId: items[1].question.id, selectedOption: wrong, timeTaken: 3000 },
    ...items.slice(2).map((it) => ({ clientId: it.clientId, questionId: it.question.id, selectedOption: it.question.correctOption, timeTaken: 900 })),
    { clientId: 'bogus-client-id', selectedOption: 0 },
  ];
  const sync1 = await call(tok, 'POST', `/api/pocket/session/${session.id}/sync`, { answers });
  check('sync applied only the 6 new answers', sync1.data.applied === 6, JSON.stringify(sync1.data));
  check('sync counted 2 replays as duplicates', sync1.data.duplicates === 2, JSON.stringify(sync1.data));
  check('sync rejected unknown clientId', sync1.data.rejected.length === 1);
  check('sync totals = 8 unique answers', sync1.data.totalQ === 8, `totalQ=${sync1.data.totalQ}`);
  check('sync correctQ = 7', sync1.data.correctQ === 7, `correctQ=${sync1.data.correctQ}`);

  const sync2 = await call(tok, 'POST', `/api/pocket/session/${session.id}/sync`, { answers });
  check('replayed sync applies nothing', sync2.data.applied === 0 && sync2.data.duplicates === 8, JSON.stringify(sync2.data));
  check('replayed sync leaves totals intact', sync2.data.totalQ === 8 && sync2.data.correctQ === 7);

  // ---- ownership ----
  check('other user cannot read session', (await call(adm.token, 'GET', `/api/pocket/session/${session.id}`)).status === 404);
  check('other user cannot answer', (await call(adm.token, 'POST', `/api/pocket/session/${session.id}/answer`, { clientId: items[2].clientId, selectedOption: 0 })).status === 404);

  // ---- input validation ----
  check('missing clientId -> 400', (await call(tok, 'POST', `/api/pocket/session/${session.id}/answer`, { selectedOption: 0 })).status === 400);
  check('non-integer option -> 400', (await call(tok, 'POST', `/api/pocket/session/${session.id}/answer`, { clientId: items[0].clientId, selectedOption: 1.5 })).status === 400);
  check('unknown clientId -> 404', (await call(tok, 'POST', `/api/pocket/session/${session.id}/answer`, { clientId: 'nope', selectedOption: 1 })).status === 404);
  check('clientId/questionId mismatch -> 409', (await call(tok, 'POST', `/api/pocket/session/${session.id}/answer`, { clientId: items[0].clientId, questionId: items[1].question.id, selectedOption: 1 })).status === 409);

  // ---- end ----
  const end = await call(tok, 'POST', `/api/pocket/session/${session.id}/end`);
  check('end scores 7/8', end.data.totalQ === 8 && end.data.correctQ === 7 && Math.abs(end.data.score - 7 / 8) < 1e-9, JSON.stringify(end.data));
  check('end reports unanswered=0', end.data.unanswered === 0);
  check('end is idempotent', (await call(tok, 'POST', `/api/pocket/session/${session.id}/end`)).data.totalQ === 8);

  // ---- exactly-once effects in the shared log ----
  const attemptsAfter = await prisma.questionAttempt.count({ where: { userId: demo.userId } });
  check('exactly 8 attempts written', attemptsAfter - attemptsBefore === 8, `delta=${attemptsAfter - attemptsBefore}`);

  const statsAfter = await snapStats(demo.userId);
  let totalAdded = 0;
  let correctAdded = 0;
  for (const [key, after] of statsAfter) {
    const before = statsBefore.get(key) || { total: 0, correct: 0 };
    totalAdded += after.total - before.total;
    correctAdded += after.correct - before.correct;
  }
  check('UserConceptStat totals grew by exactly 8', totalAdded === 8, `delta=${totalAdded}`);
  check('UserConceptStat correct grew by exactly 7', correctAdded === 7, `delta=${correctAdded}`);

  await prisma.$disconnect();
  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
};

main().catch(async (e) => {
  console.error('FAILED:', e.message);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
