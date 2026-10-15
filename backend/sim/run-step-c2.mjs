// run-step-c2.mjs — STEP C2 (under STEP A4 model):
//   current picker vs pickerV2a vs pickerV2b vs random.
// Run with: node backend/sim/run-step-c2.mjs   (from the repo root)
//
// A4 model: when a quit ends a session, with probability 0.4 the user
// churns PERMANENTLY (no more answers); otherwise a new session starts
// as before (stated here and in the report header).
//
// Both scenarios, 20 seeds, mean +/- sd, users A-D.
// Headline metrics (A4-2): total answers completed (of budget),
// number of quits, average questions per session, % of runs that
// churned, final mean knowledge.
// Kept metrics: maxStreak, accuracy by window, knowledge gain per concept.
// Also: first-30-questions concept distribution for pickerV2b (per user),
// and the best-picker verdicts for (a) total answers completed,
// (b) final mean knowledge, (c) accuracy zone (55-75%) after window 1.

import { writeFileSync } from 'fs';
import { join } from 'path';
import {
  CONCEPT_IDS, USERS, generateBank, simulateUser, computeMetrics,
  aggregateRunMetrics, ms, SCENARIOS, NUM_SEEDS, SEED_BASE, SIM_DIR,
  QUIT_CHURN_PROB,
} from './engine.mjs';
import { adaptivePick, randomPick, createPickerV2 } from './pickers.mjs';

const CHURN_PROB = QUIT_CHURN_PROB; // 0.4 (A4-1)

const PICKER_FACTORIES = {
  adaptive: () => ({ pick: adaptivePick }),
  v2a: () => createPickerV2(),
  v2b: () => createPickerV2({
    targetAccuracy: 0.70,
    earlyAnswers: 50,
    earlyTargets: { weak: 0.45, review: 0.20, exploration: 0.35 },
  }),
  random: () => ({ pick: randomPick }),
};
const PICKER_NAMES = ['adaptive', 'v2a', 'v2b', 'random'];
const LEARNER_USERS = ['A', 'C', 'D']; // User B has learnRate 0 (cannot learn)
const ZONE_LO = 0.55, ZONE_HI = 0.75;

function printTable(headers, rows) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i]).length)));
  const line = cells => cells.map((c, i) => String(c).padEnd(widths[i])).join('  ').trimEnd();
  console.log(line(headers));
  console.log(widths.map(w => '-'.repeat(w)).join('  '));
  for (const r of rows) console.log(line(r));
}

// ============================================================
// RUN (A4 model: churn on quit with probability 0.4)
// ============================================================
const data = {};
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
        const sim = simulateUser(userConfig, picker, seed, bank, scenario.totalAnswers, { churnProb: CHURN_PROB });
        runs.push(computeMetrics(sim, userConfig, userConfig.label, name, scenario.totalAnswers));
      }
      data[scenario.name].users[userKey][name] = { runs, agg: aggregateRunMetrics(runs) };
    }
  }
}

// ============================================================
// TABLES (one per scenario)
// ============================================================
for (const scenario of SCENARIOS) {
  const sc = data[scenario.name];
  console.log('');
  console.log(`########## ${scenario.name} (${scenario.questionsPerConcept}/concept = ${scenario.questionsPerConcept * 6} questions, ${scenario.totalAnswers}-answer budget) — mean±sd, ${NUM_SEEDS} seeds, A4 churn=${CHURN_PROB} ##########`);
  console.log('(window "201-300" covers 201-end; with churn, runs may end early)');

  // ---- HEADLINE (A4-2) ----
  console.log('');
  console.log('--- HEADLINE: total answers (of budget) | quits | avg questions/session | % runs churned | final mean knowledge ---');
  printTable(
    ['user', 'picker', 'answers done', 'budget', 'quits', 'avg sess len', 'churned %', 'final mean K'],
    Object.keys(USERS).flatMap(u => PICKER_NAMES.map(p => [
      u, p,
      ms(sc.users[u][p].agg.totalAnswers),
      scenario.totalAnswers,
      ms(sc.users[u][p].agg.quits),
      ms(sc.users[u][p].agg.avgSessionLength),
      sc.users[u][p].agg.churnedPct,
      ms(sc.users[u][p].agg.finalMeanKnowledge),
    ])),
  );

  // ---- maxStreak (kept) ----
  console.log('');
  console.log('--- maxStreak (longest run of consecutive questions from the same concept) ---');
  printTable(
    ['user', 'adaptive', 'v2a', 'v2b', 'random'],
    Object.keys(USERS).map(u => [u, ms(sc.users[u].adaptive.agg.maxStreak), ms(sc.users[u].v2a.agg.maxStreak), ms(sc.users[u].v2b.agg.maxStreak), ms(sc.users[u].random.agg.maxStreak)]),
  );

  // ---- Accuracy by window (kept) ----
  console.log('');
  console.log('--- Accuracy by window (0±0 = no run reached that window; churn ended them early) ---');
  for (const wn of ['1-50', '51-100', '101-200', '201-300']) {
    printTable(
      ['user', 'adaptive', 'v2a', 'v2b', 'random'],
      Object.keys(USERS).map(u => [u, ms(sc.users[u].adaptive.agg.accuracyByWindow[wn]), ms(sc.users[u].v2a.agg.accuracyByWindow[wn]), ms(sc.users[u].v2b.agg.accuracyByWindow[wn]), ms(sc.users[u].random.agg.accuracyByWindow[wn])]),
    );
    console.log(`  (window ${wn})`);
  }

  // ---- Per-concept knowledge gain (kept) ----
  console.log('');
  console.log('--- Per-concept knowledge gain (end - start) ---');
  const gainRows = [];
  for (const u of Object.keys(USERS)) {
    for (const c of CONCEPT_IDS) {
      gainRows.push([
        `U${u} C${c}`,
        ms(sc.users[u].adaptive.agg.finalKnowledgeGain[c]),
        ms(sc.users[u].v2a.agg.finalKnowledgeGain[c]),
        ms(sc.users[u].v2b.agg.finalKnowledgeGain[c]),
        ms(sc.users[u].random.agg.finalKnowledgeGain[c]),
      ]);
    }
  }
  printTable(['user/concept', 'adaptive', 'v2a', 'v2b', 'random'], gainRows);

  // ---- V2b cold start: first 30 questions' concept distribution, per user ----
  console.log('');
  console.log('--- pickerV2b: first 30 questions, concept distribution per user (mean±sd; ideal = 5 per concept) ---');
  for (const u of Object.keys(USERS)) {
    printTable(
      [`User ${u}`, ...CONCEPT_IDS.map(c => `C${c}`)],
      [['v2b', ...CONCEPT_IDS.map(c => ms(sc.users[u].v2b.agg.coldStartDist[c]))]],
    );
  }
}

// ============================================================
// BEST-PICKER VERDICTS
// ============================================================
console.log('');
console.log('########## BEST PICKER ##########');

const combos = [];
for (const s of SCENARIOS) for (const u of Object.keys(USERS)) combos.push({ s: s.name, u });

// (a) total answers completed
{
  const perCombo = combos.map(({ s, u }) => {
    const row = PICKER_NAMES.map(p => ({ p, v: data[s].users[u][p].agg.totalAnswers.mean }));
    const best = row.slice().sort((a, b) => b.v - a.v)[0];
    return { s, u, best, row };
  });
  const overall = PICKER_NAMES.map(p => ({
    p,
    v: perCombo.reduce((acc, c) => acc + c.row.find(r => r.p === p).v, 0) / perCombo.length,
  })).sort((a, b) => b.v - a.v);
  // per-scenario fraction of the answer budget completed (mean over users)
  const fracRows = SCENARIOS.map(s => [
    `${s.name} (budget ${s.totalAnswers})`,
    ...PICKER_NAMES.map(p => {
      const us = Object.keys(USERS);
      const frac = us.reduce((a, u) => a + data[s.name].users[u][p].agg.totalAnswers.mean / s.totalAnswers, 0) / us.length;
      return `${(100 * frac).toFixed(1)}%`;
    }),
  ]);
  console.log('');
  console.log(`(a) TOTAL ANSWERS COMPLETED (of budget) — best overall: ${overall[0].p} (grand mean ${overall[0].v.toFixed(1)} answers)`);
  printTable(
    ['scenario', ...PICKER_NAMES],
    fracRows,
  );
  console.log('    (percent of answer budget completed, mean over users A-D)');
  printTable(
    ['picker', 'grand mean answers done', 'wins (user x scenario)'],
    PICKER_NAMES.map(p => [
      p,
      overall.find(r => r.p === p).v.toFixed(1),
      perCombo.filter(c => c.best.p === p).length,
    ]),
  );
  for (const { s, u, best } of perCombo) {
    console.log(`    ${s} User ${u}: ${best.p} (mean ${best.v.toFixed(1)} answers)`);
  }
}

// (b) final mean knowledge (learners A/C/D; User B ties at base by construction)
{
  const learnerCombos = [];
  for (const s of SCENARIOS) for (const u of LEARNER_USERS) learnerCombos.push({ s: s.name, u });
  const perCombo = learnerCombos.map(({ s, u }) => {
    const row = PICKER_NAMES.map(p => ({ p, v: data[s].users[u][p].agg.finalMeanKnowledge.mean }));
    const best = row.slice().sort((a, b) => b.v - a.v)[0];
    return { s, u, best, row };
  });
  const overall = PICKER_NAMES.map(p => ({
    p,
    v: perCombo.reduce((acc, c) => acc + c.row.find(r => r.p === p).v, 0) / perCombo.length,
  })).sort((a, b) => b.v - a.v);
  console.log('');
  console.log(`(b) FINAL MEAN KNOWLEDGE (learners A/C/D; User B ties at 0.25 base for all pickers) — best overall: ${overall[0].p} (grand mean ${overall[0].v.toFixed(4)})`);
  printTable(
    ['picker', 'grand mean final K', 'wins (learner x scenario)'],
    PICKER_NAMES.map(p => [
      p,
      overall.find(r => r.p === p).v.toFixed(4),
      perCombo.filter(c => c.best.p === p).length,
    ]),
  );
  for (const { s, u, best, row } of perCombo) {
    console.log(`    ${s} User ${u}: ${best.p}=${best.v.toFixed(4)} (adaptive=${row.find(r => r.p === 'adaptive').v.toFixed(4)}, v2a=${row.find(r => r.p === 'v2a').v.toFixed(4)}, v2b=${row.find(r => r.p === 'v2b').v.toFixed(4)}, random=${row.find(r => r.p === 'random').v.toFixed(4)})`);
  }
}

// (c) accuracy zone 55-75% after window 1 (learners A/C/D, windows 51-100/101-200/201-300)
{
  const checks = [];
  for (const s of SCENARIOS) {
    for (const u of LEARNER_USERS) {
      for (const wn of ['51-100', '101-200', '201-300']) {
        checks.push({ s: s.name, u, wn, vals: Object.fromEntries(PICKER_NAMES.map(p => [p, data[s.name].users[u][p].agg.accuracyByWindow[wn].mean])) });
      }
    }
  }
  const total = checks.length;
  const summary = PICKER_NAMES.map(p => {
    const inZone = checks.filter(c => c.vals[p] >= ZONE_LO && c.vals[p] <= ZONE_HI);
    const meanAcc = checks.reduce((a, c) => a + c.vals[p], 0) / checks.length;
    return { p, inZone: inZone.length, total, pct: +(100 * inZone.length / total).toFixed(1), meanAcc: +meanAcc.toFixed(4) };
  }).sort((a, b) => b.inZone - a.inZone);
  console.log('');
  console.log(`(c) ACCURACY ZONE ${Math.round(ZONE_LO * 100)}-${Math.round(ZONE_HI * 100)}% after window 1 (learners A/C/D, windows 51-100/101-200/201-300; ${total} checks per picker) — best: ${summary[0].p} (${summary[0].inZone}/${total} checks in zone, mean accuracy ${summary[0].meanAcc})`);
  printTable(
    ['picker', 'checks in zone', 'of', '% in zone', 'mean accuracy (all post-w1 checks)'],
    summary.map(r => [r.p, r.inZone, r.total, r.pct, r.meanAcc]),
  );
  console.log("    per-check detail (learner x scenario x window -> each picker's accuracy):");
  for (const c of checks) {
    console.log(`    ${c.s} U${c.u} ${c.wn}: adaptive=${c.vals.adaptive.toFixed(3)} v2a=${c.vals.v2a.toFixed(3)} v2b=${c.vals.v2b.toFixed(3)} random=${c.vals.random.toFixed(3)}`);
  }
}

// ============================================================
// REPORT FILE (header states the A4 churn rule and B2 tuning)
// ============================================================
const report = {
  generatedAt: new Date().toISOString(),
  step: 'C2 (under A4 model)',
  seedBase: SEED_BASE,
  numSeeds: NUM_SEEDS,
  modelHeader: {
    A4_1_churn: `When a quit ends a session, with probability ${QUIT_CHURN_PROB} the user churns PERMANENTLY (no more answers); otherwise a new session starts as before.`,
    pickers: {
      adaptive: 'current picker (adaptive.ts logic) + A3-4 repeats',
      v2a: 'pickerV2 original: quotas 60/25/15, difficulty target accuracy 0.65',
      v2b: 'pickerV2 tuned (B2): quotas 45/20/35 for the first 50 answers then 60/25/15, difficulty target accuracy 0.70; streak cap, cold start, mastery estimate and spaced-review rules identical to v2a',
      random: 'random baseline + A3-4 repeats',
    },
  },
  scenarios: {},
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
writeFileSync(join(SIM_DIR, 'report-stepc2.json'), JSON.stringify(report, null, 2));
console.log('');
console.log('Report written to backend/sim/report-stepc2.json');
