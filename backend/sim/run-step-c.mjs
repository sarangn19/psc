// run-step-c.mjs — STEP C: current picker vs pickerV2 vs random.
// Run with: node backend/sim/run-step-c.mjs   (from the repo root)
//
// Both scenarios, 20 seeds, mean +/- sd, users A-D. Metrics:
//   1. maxStreak
//   2. Accuracy by window (1-50, 51-100, 101-200, 201-300)
//   3. Final mean knowledge and per-concept gain
//   4. Sessions and average questions per session
//   5. Cold start distribution for User D (first 30 questions)
//   6. Wrong answers resurfaced and the gap in questions
//   7. Estimated mastery vs true knowledge at the end
//   8. Selection time per call
// Then PASS/FAIL with numbers, problems found, and notes on which
// pickerV2 parts are pure functions (no refactoring done).

import { writeFileSync } from 'fs';
import { join } from 'path';
import {
  CONCEPT_IDS, USERS, generateBank, simulateUser, computeMetrics,
  aggregateRunMetrics, ms, SCENARIOS, NUM_SEEDS, SEED_BASE, SIM_DIR,
} from './engine.mjs';
import { adaptivePick, randomPick, createPickerV2 } from './pickers.mjs';

const PICKER_FACTORIES = {
  adaptive: () => ({ pick: adaptivePick }),
  v2: () => createPickerV2(),
  random: () => ({ pick: randomPick }),
};
const PICKER_NAMES = ['adaptive', 'v2', 'random'];
const LEARNER_USERS = ['A', 'C', 'D']; // User B has learnRate 0 (cannot learn)

function printTable(headers, rows) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i]).length)));
  const line = cells => cells.map((c, i) => String(c).padEnd(widths[i])).join('  ').trimEnd();
  console.log(line(headers));
  console.log(widths.map(w => '-'.repeat(w)).join('  '));
  for (const r of rows) console.log(line(r));
}

// ============================================================
// RUN
// ============================================================
const data = {};
let runFailed = false;
for (const scenario of SCENARIOS) {
  const bank = generateBank(scenario.questionsPerConcept);
  data[scenario.name] = { scenario, users: {} };
  for (const [userKey, userConfig] of Object.entries(USERS)) {
    data[scenario.name].users[userKey] = {};
    for (const name of PICKER_NAMES) {
      const runs = [];
      for (let s = 0; s < NUM_SEEDS; s++) {
        const seed = SEED_BASE + s * 1000 + PICKER_NAMES.indexOf(name); // same seeds per picker
        const picker = PICKER_FACTORIES[name](); // fresh state per seed
        const sim = simulateUser(userConfig, picker, seed, bank, scenario.totalAnswers);
        runs.push(computeMetrics(sim, userConfig, userConfig.label, name, scenario.totalAnswers));
      }
      data[scenario.name].users[userKey][name] = { runs, agg: aggregateRunMetrics(runs) };
      // sanity: every run must reach the full answer budget
      if (runs.some(r => r.total < scenario.totalAnswers)) runFailed = true;
    }
  }
}
if (runFailed) {
  console.log('RUN FAILURE: some runs did not reach the full answer budget.');
}

// ============================================================
// TABLES 1-8
// ============================================================
for (const scenario of SCENARIOS) {
  const sc = data[scenario.name];
  console.log('');
  console.log(`########## ${scenario.name} (${scenario.questionsPerConcept}/concept = ${scenario.questionsPerConcept * 6} questions, ${scenario.totalAnswers} answers) — mean±sd, ${NUM_SEEDS} seeds ##########`);
  console.log('(window "201-300" covers 201-end on the 1000-answer scenario)');

  // ---- 1. maxStreak ----
  console.log('');
  console.log('--- 1. maxStreak (longest run of consecutive questions from the same concept) ---');
  printTable(
    ['user', 'adaptive', 'pickerV2', 'random'],
    Object.keys(USERS).map(u => [u, ms(sc.users[u].adaptive.agg.maxStreak), ms(sc.users[u].v2.agg.maxStreak), ms(sc.users[u].random.agg.maxStreak)]),
  );

  // ---- 2. Accuracy by window ----
  console.log('');
  console.log('--- 2. Accuracy by window ---');
  for (const wn of ['1-50', '51-100', '101-200', '201-300']) {
    printTable(
      ['user', 'adaptive', 'pickerV2', 'random'],
      Object.keys(USERS).map(u => [u, ms(sc.users[u].adaptive.agg.accuracyByWindow[wn]), ms(sc.users[u].v2.agg.accuracyByWindow[wn]), ms(sc.users[u].random.agg.accuracyByWindow[wn])]),
    );
    console.log(`  (window ${wn})`);
  }

  // ---- 3. Final mean knowledge + per-concept gain ----
  console.log('');
  console.log('--- 3a. Final mean knowledge (end of run) ---');
  printTable(
    ['user', 'adaptive', 'pickerV2', 'random'],
    Object.keys(USERS).map(u => [u, ms(sc.users[u].adaptive.agg.finalMeanKnowledge), ms(sc.users[u].v2.agg.finalMeanKnowledge), ms(sc.users[u].random.agg.finalMeanKnowledge)]),
  );
  console.log('');
  console.log('--- 3b. Per-concept knowledge gain (end - start) ---');
  const gainRows = [];
  for (const u of Object.keys(USERS)) {
    for (const c of CONCEPT_IDS) {
      gainRows.push([
        `U${u} C${c}`,
        ms(sc.users[u].adaptive.agg.finalKnowledgeGain[c]),
        ms(sc.users[u].v2.agg.finalKnowledgeGain[c]),
        ms(sc.users[u].random.agg.finalKnowledgeGain[c]),
      ]);
    }
  }
  printTable(['user/concept', 'adaptive', 'pickerV2', 'random'], gainRows);

  // ---- 4. Sessions + avg session length ----
  console.log('');
  console.log('--- 4. Sessions per user and average questions per session ---');
  printTable(
    ['user', 'adaptive sessions', 'v2 sessions', 'random sessions', 'adaptive avgLen', 'v2 avgLen', 'random avgLen'],
    Object.keys(USERS).map(u => [
      u,
      ms(sc.users[u].adaptive.agg.sessions), ms(sc.users[u].v2.agg.sessions), ms(sc.users[u].random.agg.sessions),
      ms(sc.users[u].adaptive.agg.avgSessionLength), ms(sc.users[u].v2.agg.avgSessionLength), ms(sc.users[u].random.agg.avgSessionLength),
    ]),
  );

  // ---- 5. Cold start distribution (User D) ----
  console.log('');
  console.log('--- 5. Cold start distribution, User D (questions per concept, first 30 questions; ideal = 5 each) ---');
  printTable(
    ['picker', ...CONCEPT_IDS.map(c => `C${c}`)],
    PICKER_NAMES.map(p => [p, ...CONCEPT_IDS.map(c => ms(sc.users.D[p].agg.coldStartDist[c]))]),
  );

  // ---- 6. Wrong answers resurfaced + gap ----
  console.log('');
  console.log('--- 6. Wrong answers that resurfaced (count, avg gap in questions) ---');
  printTable(
    ['user', 'adaptive cnt', 'v2 cnt', 'random cnt', 'adaptive gap', 'v2 gap', 'random gap'],
    Object.keys(USERS).map(u => [
      u,
      ms(sc.users[u].adaptive.agg.wrongResurfacedCount), ms(sc.users[u].v2.agg.wrongResurfacedCount), ms(sc.users[u].random.agg.wrongResurfacedCount),
      sc.users[u].adaptive.agg.wrongResurfacedAvgGap ? ms(sc.users[u].adaptive.agg.wrongResurfacedAvgGap) : 'n/a',
      sc.users[u].v2.agg.wrongResurfacedAvgGap ? ms(sc.users[u].v2.agg.wrongResurfacedAvgGap) : 'n/a',
      sc.users[u].random.agg.wrongResurfacedAvgGap ? ms(sc.users[u].random.agg.wrongResurfacedAvgGap) : 'n/a',
    ]),
  );
  console.log('');
  console.log('--- 6b. pickerV2 missed-question re-ask gaps (stated rule: first re-ask after 8-15 questions, then longer if answered correctly) ---');
  printTable(
    ['user', 'firstReasks', 'sched gap mean±sd', 'sched gap min-max', 'actual gap mean±sd', 'actual gap min-max', 'sched within 8-15', 'actual >= sched'],
    Object.keys(USERS).map(u => {
      const v2 = sc.users[u].v2.agg.v2;
      if (!v2) return [u, 'n/a', 'n/a', 'n/a', 'n/a', 'n/a', 'n/a', 'n/a'];
      const sched = v2.reaskFirstScheduled;
      const act = v2.reaskFirstGap;
      return [
        u,
        sched.count,
        sched.mean === null ? 'n/a' : `${sched.mean}±${sched.sd}`,
        sched.min === null ? 'n/a' : `${sched.min}-${sched.max}`,
        act.mean === null ? 'n/a' : `${act.mean}±${act.sd}`,
        act.min === null ? 'n/a' : `${act.min}-${act.max}`,
        sched.within815Share === null ? 'n/a' : sched.within815Share,
        act.min >= sched.min ? 'yes' : 'NO',
      ];
    }),
  );

  // ---- 7. Estimated mastery vs true knowledge at the end ----
  console.log('');
  console.log('--- 7. Estimated mastery vs TRUE knowledge at the end (est/true, per concept) ---');
  const mRows = [];
  for (const u of Object.keys(USERS)) {
    for (const c of CONCEPT_IDS) {
      mRows.push([
        `U${u} C${c}`,
        `${sc.users[u].adaptive.agg.estimatedMastery[c].estimated.mean}/${sc.users[u].adaptive.agg.estimatedMastery[c].trueEnd.mean}`,
        `${sc.users[u].v2.agg.estimatedMastery[c].estimated.mean}/${sc.users[u].v2.agg.estimatedMastery[c].trueEnd.mean}`,
        `${sc.users[u].v2.agg.v2.finalSmoothedMastery[c].mean}/${sc.users[u].v2.agg.estimatedMastery[c].trueEnd.mean}`,
        `${sc.users[u].random.agg.estimatedMastery[c].estimated.mean}/${sc.users[u].random.agg.estimatedMastery[c].trueEnd.mean}`,
      ]);
    }
  }
  printTable(['user/concept', 'adaptive est/true', 'v2 raw est/true', 'v2 SMOOTHED est/true', 'random est/true'], mRows);

  // ---- 8. Selection time per call ----
  console.log('');
  console.log('--- 8. Selection time per call (ms) ---');
  printTable(
    ['user', 'adaptive avg', 'v2 avg', 'random avg', 'adaptive worst', 'v2 worst', 'random worst'],
    Object.keys(USERS).map(u => [
      u,
      ms(sc.users[u].adaptive.agg.avgTime), ms(sc.users[u].v2.agg.avgTime), ms(sc.users[u].random.agg.avgTime),
      ms(sc.users[u].adaptive.agg.worstTime), ms(sc.users[u].v2.agg.worstTime), ms(sc.users[u].random.agg.worstTime),
    ]),
  );

  // ---- v2 pool shares ----
  console.log('');
  console.log('--- v2 pool shares (targets: weak 60%, review 25%, exploration 15%) ---');
  console.log('    (poolNonEmpty = fraction of seeds where the pool had >=1 concept)');
  printTable(
    ['user', 'weak', 'review', 'exploration', 'weak nonEmpty', 'review nonEmpty', 'explor nonEmpty'],
    Object.keys(USERS).map(u => [
      u,
      ms(sc.users[u].v2.agg.v2.poolShares.weak),
      ms(sc.users[u].v2.agg.v2.poolShares.review),
      ms(sc.users[u].v2.agg.v2.poolShares.exploration),
      sc.users[u].v2.agg.v2.poolNonEmptyShare.weak.mean,
      sc.users[u].v2.agg.v2.poolNonEmptyShare.review.mean,
      sc.users[u].v2.agg.v2.poolNonEmptyShare.exploration.mean,
    ]),
  );
}

// ============================================================
// PASS / FAIL
// ============================================================
console.log('');
console.log('########## PASS / FAIL ##########');
const checks = [];
function addCheck(name, pass, detail) { checks.push({ name, pass, detail }); }

// Criterion 1: no streak above 3 for pickerV2
{
  let worst = 0;
  const detail = [];
  for (const s of SCENARIOS) {
    for (const u of Object.keys(USERS)) {
      const w = Math.max(...data[s.name].users[u].v2.runs.map(r => r.maxStreak));
      worst = Math.max(worst, w);
      detail.push(`${s.name} U${u} worst-seed maxStreak=${w}`);
    }
  }
  addCheck('pickerV2 never exceeds a 3-question concept streak', worst <= 3,
    `worst seed maxStreak across all scenarios/users = ${worst}; ${detail.join('; ')}`);
}

// Criterion 2: accuracy within 55-75% after window 1 (pickerV2, learners A/C/D)
{
  const detail = [];
  let pass = true;
  for (const s of SCENARIOS) {
    for (const u of LEARNER_USERS) {
      for (const wn of ['51-100', '101-200', '201-300']) {
        const m = data[s.name].users[u].v2.agg.accuracyByWindow[wn].mean;
        const ok = m >= 0.55 && m <= 0.75;
        if (!ok) pass = false;
        detail.push(`${s.name} U${u} ${wn}: ${m.toFixed(3)} ${ok ? 'OK' : 'OUT OF RANGE'}`);
      }
    }
  }
  // User B is structurally capped: base knowledge 0.25, EASY max P(correct)=0.35
  const bAcc = data[SCENARIOS[0].name].users.B.v2.agg.accuracyByWindow['51-100'].mean;
  addCheck('pickerV2 accuracy within 55-75% after window 1 (learners A/C/D)', pass,
    `${detail.join('; ')} | User B (learnRate=0) window 51-100 accuracy=${bAcc.toFixed(3)} — structurally below 55% (max possible P(correct) = 0.25+0.10 = 0.35), not a picker defect`);
}

// Criterion 3: cold start spread evenly across concepts (User D, first 30)
{
  const detail = [];
  let pass = true;
  for (const s of SCENARIOS) {
    for (const c of CONCEPT_IDS) {
      const m = data[s.name].users.D.v2.agg.coldStartDist[c].mean;
      const ok = m >= 3 && m <= 7;
      if (!ok) pass = false;
      detail.push(`${s.name} C${c}: ${m}`);
    }
  }
  addCheck('pickerV2 cold start spread evenly across concepts (User D, first 30; 3-7 per concept)', pass, detail.join('; '));
}

// Criterion 4: final knowledge >= current picker's and > random (pickerV2)
{
  const detail = [];
  let passLearners = true, bTie = true;
  for (const s of SCENARIOS) {
    for (const u of LEARNER_USERS) {
      const v2 = data[s.name].users[u].v2.agg.finalMeanKnowledge.mean;
      const ad = data[s.name].users[u].adaptive.agg.finalMeanKnowledge.mean;
      const ra = data[s.name].users[u].random.agg.finalMeanKnowledge.mean;
      const ok = v2 >= ad && v2 > ra;
      if (!ok) passLearners = false;
      detail.push(`${s.name} U${u}: v2=${v2.toFixed(4)} vs adaptive=${ad.toFixed(4)} vs random=${ra.toFixed(4)} ${ok ? 'OK' : 'FAIL'}`);
    }
    const bV2 = data[s.name].users.B.v2.agg.finalMeanKnowledge.mean;
    const bRa = data[s.name].users.B.random.agg.finalMeanKnowledge.mean;
    const bAd = data[s.name].users.B.adaptive.agg.finalMeanKnowledge.mean;
    if (!(bV2 >= bAd && bV2 >= bRa)) bTie = false;
    detail.push(`${s.name} U B (learnRate=0): v2=${bV2.toFixed(4)} adaptive=${bAd.toFixed(4)} random=${bRa.toFixed(4)} — tie expected (no learning possible)`);
  }
  addCheck('pickerV2 final knowledge >= current picker and > random (learners A/C/D)', passLearners, detail.join('; '));
}

// Criterion 5: sessions per user not worse than random (pickerV2)
{
  const detail = [];
  let pass = true;
  for (const s of SCENARIOS) {
    for (const u of Object.keys(USERS)) {
      const v2 = data[s.name].users[u].v2.agg.sessions.mean;
      const ra = data[s.name].users[u].random.agg.sessions.mean;
      const ok = v2 <= ra;
      if (!ok) pass = false;
      detail.push(`${s.name} U${u}: v2=${v2} vs random=${ra} ${ok ? 'OK' : 'MORE SESSIONS'}`);
    }
  }
  addCheck('pickerV2 sessions per user not worse than random (<= random)', pass, detail.join('; '));
}

// Criterion 6: wrong answers resurface within the stated gaps (pickerV2)
{
  const detail = [];
  let pass = true;
  for (const s of SCENARIOS) {
    for (const u of Object.keys(USERS)) {
      const v2 = data[s.name].users[u].v2.agg.v2;
      const sched = v2.reaskFirstScheduled;
      const act = v2.reaskFirstGap;
      const ok = sched.count > 0 && sched.min >= 8 && sched.max <= 15 && act.min >= sched.min;
      if (!ok) pass = false;
      detail.push(`${s.name} U${u}: firstReasks=${sched.count}, scheduled=${sched.min}-${sched.max} (mean ${sched.mean}), actual=${act.min}-${act.max} (mean ${act.mean}) ${ok ? 'OK' : 'FAIL'}`);
    }
  }
  addCheck('pickerV2 wrong answers resurface within the stated gaps (first re-ask scheduled 8-15, never early)', pass, detail.join('; '));
}

for (const c of checks) {
  console.log('');
  console.log(`${c.pass ? 'PASS' : 'FAIL'} — ${c.name}`);
  console.log(`       ${c.detail}`);
}

// ============================================================
// PROBLEMS FOUND
// ============================================================
console.log('');
console.log('########## PROBLEMS FOUND ##########');
const problems = [];

// accuracy out of range details
for (const s of SCENARIOS) {
  for (const u of Object.keys(USERS)) {
    for (const wn of ['51-100', '101-200', '201-300']) {
      const m = data[s.name].users[u].v2.agg.accuracyByWindow[wn].mean;
      if (m < 0.55 || m > 0.75) {
        problems.push(`pickerV2 accuracy outside 55-75%: ${s.name} U${u} window ${wn} = ${m.toFixed(3)}${u === 'B' ? ' (structural: User B max P(correct)=0.35)' : ''}`);
      }
    }
  }
}
// pool share deviations (only meaningful when the pool was non-empty;
// an empty pool's share is structurally redistributed by the quota rule)
for (const s of SCENARIOS) {
  for (const u of Object.keys(USERS)) {
    const sh = data[s.name].users[u].v2.agg.v2.poolShares;
    const occ = data[s.name].users[u].v2.agg.v2.poolNonEmptyShare;
    if (occ.weak.mean > 0.5 && Math.abs(sh.weak.mean - 0.60) > 0.05) {
      problems.push(`pickerV2 weak-pool share off target (pool non-empty): ${s.name} U${u} = ${sh.weak.mean} (target 0.60)`);
    }
    if (occ.review.mean > 0.5 && Math.abs(sh.review.mean - 0.25) > 0.05) {
      problems.push(`pickerV2 review-pool share off target (pool non-empty): ${s.name} U${u} = ${sh.review.mean} (target 0.25)`);
    }
    if (occ.exploration.mean > 0.5 && Math.abs(sh.exploration.mean - 0.15) > 0.05) {
      problems.push(`pickerV2 exploration-pool share off target (pool non-empty): ${s.name} U${u} = ${sh.exploration.mean} (target 0.15)`);
    }
  }
}
// knowledge comparisons
for (const s of SCENARIOS) {
  for (const u of LEARNER_USERS) {
    const v2 = data[s.name].users[u].v2.agg.finalMeanKnowledge.mean;
    const ad = data[s.name].users[u].adaptive.agg.finalMeanKnowledge.mean;
    const ra = data[s.name].users[u].random.agg.finalMeanKnowledge.mean;
    if (v2 < ad) problems.push(`pickerV2 final knowledge BELOW current picker: ${s.name} U${u} v2=${v2.toFixed(4)} < adaptive=${ad.toFixed(4)}`);
    if (v2 <= ra) problems.push(`pickerV2 final knowledge NOT above random: ${s.name} U${u} v2=${v2.toFixed(4)} vs random=${ra.toFixed(4)}`);
  }
}
// sessions
for (const s of SCENARIOS) {
  for (const u of Object.keys(USERS)) {
    const v2 = data[s.name].users[u].v2.agg.sessions.mean;
    const ra = data[s.name].users[u].random.agg.sessions.mean;
    if (v2 > ra) problems.push(`pickerV2 MORE sessions than random: ${s.name} U${u} v2=${v2} > random=${ra}`);
  }
}
// smoothed mastery estimate quality: the estimate is a P(correct) proxy on
// the SERVED difficulty (not the knowledge parameter), so compare its error
// against the true knowledge with the current picker's raw accuracy as the
// baseline; flag only if pickerV2's smoothed estimate is WORSE than that baseline.
for (const s of SCENARIOS) {
  for (const u of Object.keys(USERS)) {
    let v2Mae = 0, adMae = 0;
    for (const c of CONCEPT_IDS) {
      const est = data[s.name].users[u].v2.agg.v2.finalSmoothedMastery[c].mean;
      const adEst = data[s.name].users[u].adaptive.agg.estimatedMastery[c].estimated.mean;
      const tru = data[s.name].users[u].v2.agg.estimatedMastery[c].trueEnd.mean;
      v2Mae += Math.abs(est - tru);
      adMae += Math.abs(adEst - tru);
    }
    v2Mae /= CONCEPT_IDS.length; adMae /= CONCEPT_IDS.length;
    if (v2Mae > adMae + 0.02) {
      problems.push(`pickerV2 smoothed mastery WORSE than current picker's raw accuracy: ${s.name} U${u} smoothedMAE=${v2Mae.toFixed(3)} vs rawAccMAE=${adMae.toFixed(3)}`);
    }
  }
}

if (problems.length === 0) {
  console.log('None — all checks passed within tolerance.');
} else {
  for (const p of problems) console.log(`- ${p}`);
}

// Structural notes (context, not defects)
console.log('');
console.log('STRUCTURAL NOTES (context for the failures above):');
console.log('- The smoothed mastery estimate measures P(correct) on the SERVED');
console.log('  difficulty (v2 targets ~65%), so it is an accuracy proxy, not the');
console.log('  knowledge parameter; the current picker\'s raw accuracy has the same');
console.log('  property (see table 7).');
for (const s of SCENARIOS) {
  for (const u of Object.keys(USERS)) {
    const occ = data[s.name].users[u].v2.agg.v2.poolNonEmptyShare;
    const notes = [];
    if (occ.review.mean < 0.5) notes.push('review pool empty in most seeds (no concept reaches 0.75 mastery)');
    if (occ.exploration.mean < 0.5) notes.push('exploration pool empty in most seeds');
    if (occ.weak.mean < 0.5) notes.push('weak pool empty in most seeds');
    if (notes.length > 0) console.log(`- ${s.name} U${u}: ${notes.join('; ')} — quota redistributes to non-empty pools (by design).`);
  }
}
console.log('- User B has learnRate=0: no picker can change knowledge; all');
console.log('  pickers tie at the 0.25 base (final-knowledge criterion is a tie).');
console.log('- Users A/C with low concept knowledge cannot reach 55% accuracy even');
console.log('  on EASY questions until their knowledge grows (structural, not a');
console.log('  picker defect).');

// ============================================================
// REPORT FILE
// ============================================================
const report = {
  generatedAt: new Date().toISOString(),
  step: 'C',
  seedBase: SEED_BASE,
  numSeeds: NUM_SEEDS,
  pickers: PICKER_NAMES,
  scenarios: {},
  passFail: checks,
  problems,
};
for (const scenario of SCENARIOS) {
  report.scenarios[scenario.name] = {
    questionsPerConcept: scenario.questionsPerConcept,
    totalAnswers: scenario.totalAnswers,
    totalQuestions: scenario.questionsPerConcept * 6,
    results: {},
  };
  for (const [userKey] of Object.entries(USERS)) {
    for (const name of PICKER_NAMES) {
      report.scenarios[scenario.name].results[`${userKey}|${name}`] = data[scenario.name].users[userKey][name].agg;
    }
  }
}
writeFileSync(join(SIM_DIR, 'report-stepc.json'), JSON.stringify(report, null, 2));
console.log('');
console.log('Report written to backend/sim/report-stepc.json');

// ============================================================
// PURE-FUNCTION EXTRACTION CANDIDATES in pickerV2 (not refactored)
// ============================================================
console.log('');
console.log('########## pickerV2 PURE-FUNCTION EXTRACTION CANDIDATES (not refactored) ##########');
console.log(`
Already pure (no mutable run state, no rng, no I/O) and directly extractable:
  - targetDifficulty(mastery, target=0.65) -> 'EASY'|'MEDIUM'|'HARD'
      picks the difficulty whose adjusted P(correct) is closest to 65%.
  - smoothedMasteryUpdate(wc, wt, correct) -> {wc, wt, mastery}
      one step of the exponential-weight mastery estimate:
      Wc' = Wc*0.9 + [correct]; Wt' = Wt*0.9 + 1;
      mastery = (Wc+1)/(Wt+2)  (neutral uniform Beta(1,1) prior, mean 0.5;
      effective sample size converges to 1/(1-0.9) = 10 answers).
  - reviewGapTransition(gap, correct) -> gap'   [inline in syncFromHistory]
      correct due review: min(32, gap*2); wrong due review: 8.
  - reaskGapTransition(currentGap, outcome) -> nextGap  [inline in syncFromHistory]
      correct re-ask: min(60, gap*2); failed re-ask: U(8..15);
      first-ever miss: U(8..15).
  - poolDeficitChoice(poolCounts, targets={weak:.6,review:.25,exploration:.15}) -> pool
      largest (target - actual/total); extractable from v2Pick.
  - weakConceptRanking(masteryByConcept) -> [cid,...]  (ascending mastery)
  - reviewDueConcept(cid, answeredCount, lastPractice, reviewGap) -> bool
      answeredCount - lastPractice >= reviewGap.
  - overdueRatio(answeredCount, lastPractice, reviewGap) -> number

NOT pure (would need state/context injection to extract):
  - v2Pick / selectQuestion / syncFromHistory: depend on the mutable per-run
    state (perConcept, perQuestion, poolCounts, poolEverNonEmpty, pending)
    and on rng.
  - cold-start round-robin: pure given (concept -> answerCount) map.
  - serveConcept: mutates poolCounts/poolEverNonEmpty/pending (side effects).

Extraction path (NOT done here, per instructions): move the pure functions
into a module (e.g. backend/sim/v2-policy.mjs), unit-test them against the
formulas above, and leave the stateful picker as a thin wrapper.
`);
