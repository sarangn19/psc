// Answer application — exact port of sim pickers.mjs syncFromHistory.
// Pure: same event applied to the same state yields the same transition.
// RNG is consumed ONLY for miss-gap draws: first miss and wrong re-ask.

import type { PickerConfig } from './config';
import { applyMastery } from './mastery';
import { alreadyApplied, pushRecent } from './state';
import type { AnswerEvent, ConceptState, PickerState } from './types';

function randomGap(cfg: PickerConfig, rng: () => number): number {
  return cfg.reaskMin + Math.floor(rng() * (cfg.reaskMax - cfg.reaskMin + 1));
}

/**
 * Fold one answer into state (plan §d): focused answers bump concept
 * mastery + global answerCount ONLY — no in-flight consumption, no
 * poolWeights/warmup/reviewGap changes.
 */
export function applyAnswer(
  state: PickerState,
  event: AnswerEvent,
  cfg: PickerConfig,
  rng: () => number
): void {
  const concept = state.conceptStates.get(event.conceptKey);
  if (!concept) return;

  // plan §d: focused answers never touch in-flight/ladder
  if (event.focused) {
    if (alreadyApplied(state, event.questionId)) return;
    pushRecent(state, event.questionId);
    applyMasteryToConcept(concept, event.correct, cfg);
    concept.count += 1;
    state.answerCount += 1;
    return;
  }

  const now = event.now ?? 0;
  const raw = state.inFlight.get(event.questionId);
  if (raw) state.inFlight.delete(event.questionId);
  // TTL: an entry older than cfg.inflightTtlMs is treated as absent
  const entry = raw && now - raw.at <= cfg.inflightTtlMs ? raw : null;

  // Ring guards UNATTRIBUTABLE answers only (duplicate POST / lost entry).
  // An answer with a fresh in-flight entry is always legitimate — re-asks
  // re-serve questions that are already in the ring.
  if (!entry && alreadyApplied(state, event.questionId)) return;
  pushRecent(state, event.questionId);

  const order = entry ? entry.order : event.order ?? state.answerCount + 1;

  applyMasteryToConcept(concept, event.correct, cfg);
  concept.count += 1;
  concept.lastPractice = order;
  concept.lastServedQid = event.questionId;
  state.answerCount += 1;

  // concept-level spaced review (sim: pending matched, wasDue gated)
  if (entry && entry.wasDue) {
    if (event.correct) {
      concept.reviewGap = Math.min(cfg.reviewGapMax, concept.reviewGap * 2);
    } else {
      concept.reviewGap = cfg.reviewGapStart;
    }
  }

  // question-level re-ask ladder (sim syncFromHistory, verbatim):
  //   miss (first ever)  -> gap = U(8..15)
  //   re-ask CORRECT     -> gap doubles (cap 60) for the next miss
  //   re-ask WRONG       -> gap resets to U(8..15)
  //   fresh miss after correct re-ask -> keep the accumulated gap (no draw)
  const qs = state.questions.get(event.questionId);
  if (qs) {
    const wasWrong = qs.wrongLast;
    if (event.correct) {
      if (wasWrong) {
        qs.currentGap = Math.min(cfg.reaskGapCap, (qs.currentGap ?? 0) * 2);
        qs.reaskCount += 1;
      }
      qs.wrongLast = false;
    } else {
      if (wasWrong) {
        qs.reaskCount += 1;
        qs.baseGap = randomGap(cfg, rng);
        qs.currentGap = qs.baseGap;
      } else if (qs.baseGap === null) {
        qs.baseGap = randomGap(cfg, rng);
        qs.currentGap = qs.baseGap;
      }
      // else: fresh miss after a successful re-ask -> keep accumulated gap
      qs.wrongLast = true;
      qs.dueAt = order + (qs.currentGap ?? 0);
    }
    qs.lastOrder = order;
  }
}

function applyMasteryToConcept(
  concept: ConceptState,
  correct: boolean,
  cfg: PickerConfig
): void {
  const next = applyMastery(concept.wc, concept.wt, correct, cfg);
  concept.wc = next.wc;
  concept.wt = next.wt;
  concept.mastery = next.mastery;
}
