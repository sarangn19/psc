// run-a3.mjs — STEP A3: model adjustments, CURRENT picker + random only.
// Run with: node backend/sim/run-a3.mjs   (from the repo root)
//
// Reports (mean +/- sd, 20 seeds, both scenarios, users A-D):
//   maxStreak, accuracy by window, final mean knowledge,
//   sessions per user, average questions per session,
//   repeats, wrong answers that resurfaced.
// Gate: continue to Step B/C unless the random baseline's final mean
// knowledge is above 0.9 for any user, or the run fails.

import { writeFileSync } from 'fs';
import { join } from 'path';
import {
  CONCEPT_IDS, USERS, generateBank, simulateUser, computeMetrics,
  aggregateRunMetrics, ms, SCENARIOS, NUM_SEEDS, SEED_BASE, SIM_DIR,
  STREAK_FACTORS, RECENCY_GAP, RECENCY_BONUS,
  QUIT_CAP, QUIT_STREAK_COEF, QUIT_STREAK_THRESHOLD, QUIT_WRONG_COEF, QUIT_WRONG_THRESHOLD,
} from './engine.mjs';
import { adaptivePick, randomPick } from './pickers.mjs';

const PICKERS = [
  { name: 'adaptive', picker: { pick: adaptivePick } },
  { name: 'random', picker: { pick: randomPick } },
];

function printTable(headers, rows) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i]).length)));
  const line = cells => cells.map((c, i) => String(c).padEnd(widths[i])).join('  ').trimEnd();
  console.log(line(headers));
  console.log(widths.map(w => '-'.repeat(w)).join('  '));
  for (const r of rows) console.log(line(r));
}

const data = {};
let runFailed = false;

for (const scenario of SCENARIOS) {
  const bank = generateBank(scenario.questionsPerConcept);
  data[scenario.name] = { scenario, users: {} };
  for (const [userKey, userConfig] of Object.entries(USERS)) {
    data[scenario.name].users[userKey] = {};
    PICKERS.forEach((p, pIdx) => {
      const runs = [];
      for (let s = 0; s < NUM_SEEDS; s++) {
        const seed = SEED_BASE + s * 1000 + pIdx; // same seeds for both pickers
        const sim = simulateUser(userConfig, p.picker, seed, bank, scenario.totalAnswers);
        runs.push(computeMetrics(sim, userConfig, userConfig.label, p.name, scenario.totalAnswers));
      }
      const agg = aggregateRunMetrics(runs);
      data[scenario.name].users[userKey][p.name] = { runs, agg };
      // sanity: every run must reach the full answer budget
      if (runs.some(r => r.total < scenario.totalAnswers)) runFailed = true;
    });
  }
}

// ============================================================
// TABLE
// ============================================================
for (const scenario of SCENARIOS) {
  const sc = data[scenario.name];
  console.log('');
  console.log(`=== ${scenario.name} (${scenario.questionsPerConcept}/concept = ${scenario.questionsPerConcept * 6} questions, ${scenario.totalAnswers} answers) — mean±sd, ${NUM_SEEDS} seeds ===`);
  console.log('(window "201-300" covers 201-end on the 1000-answer scenario)');
  console.log('');
  const headers = ['picker', 'user', 'maxStreak', 'acc 1-50', 'acc 51-100', 'acc 101-200', 'acc 201-300', 'finalMeanK', 'sessions', 'avgSessLen', 'repeats', 'wrongResurfaced', 'resurfAvgGap', 'pickMs'];
  const rows = [];
  for (const [userKey] of Object.entries(USERS)) {
    for (const p of PICKERS) {
      const agg = sc.users[userKey][p.name].agg;
      rows.push([
        p.name, userKey,
        ms(agg.maxStreak),
        ms(agg.accuracyByWindow['1-50']),
        ms(agg.accuracyByWindow['51-100']),
        ms(agg.accuracyByWindow['101-200']),
        ms(agg.accuracyByWindow['201-300']),
        ms(agg.finalMeanKnowledge),
        ms(agg.sessions),
        ms(agg.avgSessionLength),
        ms(agg.repeats),
        ms(agg.wrongResurfacedCount),
        agg.wrongResurfacedAvgGap ? ms(agg.wrongResurfacedAvgGap) : 'n/a',
        ms(agg.avgTime),
      ]);
    }
  }
  printTable(headers, rows);
}

// ============================================================
// GATE CHECK for continuing to Step B/C
// ============================================================
console.log('');
console.log('=== GATE: random baseline final mean knowledge (must be <= 0.9 for every user) ===');
let gateOk = !runFailed;
for (const scenario of SCENARIOS) {
  for (const [userKey] of Object.entries(USERS)) {
    const agg = data[scenario.name].users[userKey].random.agg;
    const fm = agg.finalMeanKnowledge.mean;
    const over = fm > 0.9;
    if (over) gateOk = false;
    console.log(`${scenario.name} User ${userKey} random: finalMeanKnowledge = ${fm} ± ${agg.finalMeanKnowledge.sd} ${over ? '  <-- ABOVE 0.9' : ''}`);
  }
}
if (runFailed) {
  console.log('RUN FAILURE: some runs did not reach the full answer budget.');
}
console.log('');
console.log(gateOk
  ? 'GATE PASSED — random baseline final mean knowledge <= 0.9 for all users; continuing to Step B/C.'
  : 'GATE FAILED — stopping (random baseline final mean knowledge > 0.9 for some user, or run failed).');

// ============================================================
// MODEL + REPORT FILE
// ============================================================
const report = {
  generatedAt: new Date().toISOString(),
  step: 'A3',
  seedBase: SEED_BASE,
  numSeeds: NUM_SEEDS,
  model: {
    correctGain: 0.006,
    wrongGain: 0.003,
    knowledgeCap: 0.98,
    forgettingFactor: 0.9985,
    forgettingFloor: 'user starting level (baseKnowledge)',
    difficultyAdjustment: { EASY: 0.1, MEDIUM: 0.0, HARD: -0.1 },
    learnRates: { A: 1.0, B: 0.0, C: 0.5, D: 1.0 },
    A3_1_diminishingReturns: 'gain *= (1 - knowledge/0.98)',
    A3_2_spacing: `gain *= STREAK_FACTORS[min(n,4)-1] with STREAK_FACTORS=[${STREAK_FACTORS}] (n = consecutive same-concept answers incl. this one); gain *= ${RECENCY_BONUS} if concept last practiced >= ${RECENCY_GAP} answers ago (or never), else 1.0`,
    A3_3_quitProbability: `pQuit = min(${QUIT_CAP}, ${QUIT_STREAK_COEF}*max(0, sameConceptStreak-${QUIT_STREAK_THRESHOLD}) + ${QUIT_WRONG_COEF}*max(0, wrongRun-${QUIT_WRONG_THRESHOLD})), checked after every answer; quit ends session, next answer starts a fresh session (run state reset)`,
    A3_4_repeats: 'concept exhausted -> re-serve least recently seen question of that concept (adaptive); whole bank exhausted -> global least recently seen (random)',
  },
  gatePassed: gateOk,
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
    for (const p of PICKERS) {
      report.scenarios[scenario.name].results[`${userKey}|${p.name}`] = data[scenario.name].users[userKey][p.name].agg;
    }
  }
}
writeFileSync(join(SIM_DIR, 'report-a3.json'), JSON.stringify(report, null, 2));
console.log('');
console.log('Report written to backend/sim/report-a3.json');
