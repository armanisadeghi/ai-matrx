/**
 * Constraint rules
 *
 * Each rule is a tiny standalone function that returns either a
 * ConstraintViolation or null. Add new rules by writing a new function and
 * appending it to the CONSTRAINTS array at the bottom.
 *
 * Rules can:
 *   - add a penalty to the total (severity: "penalty", points > 0)
 *   - flag a warning that surfaces in the UI without points (severity:
 *     "warning", points: 0)
 *   - (later) declare a list of (control, value) combinations to grey out
 *     in the UI via `disables`
 *
 * No rule reads from any other rule. No rule shares tables with point
 * rules. Each one stands alone.
 */

import type { ConstraintRule, ConstraintViolation } from '../types';

// ── 1. Frontier intelligence requires premium pricing ────────────────────────

const intelligenceRequiresCost: ConstraintRule = (input) => {
  const intel = input.attributes.rawIntelligence;
  const cost = input.attributes.cost;
  if ((intel === 'high' || intel === 'max') && (cost === 'minimal' || cost === 'low')) {
    return {
      rule: 'intelligenceRequiresCost',
      severity: 'penalty',
      points: 50,
      reason:
        `Raw Intelligence at "${intel}" cannot be served at cost "${cost}". ` +
        `Frontier intelligence is only available on premium-priced models.`,
      disables: [
        {
          control: 'attributes.cost',
          values: ['minimal', 'low'],
          hint: 'Not compatible with frontier intelligence',
        },
      ],
    };
  }
  return null;
};

// ── 2. Max thinking depth requires a reasoning-class model ───────────────────

const maxThinkingNeedsReasoning: ConstraintRule = (input) => {
  const thinking = input.thinkingLevel;
  const reasoning = input.attributes.reasoningAbility;
  if (thinking === 'max' && reasoning !== 'high' && reasoning !== 'max') {
    return {
      rule: 'maxThinkingNeedsReasoning',
      severity: 'penalty',
      points: 20,
      reason:
        '"Max" thinking depth requires Reasoning Ability of "high" or "max". ' +
        'Non-reasoning models cannot honour deep thinking.',
    };
  }
  return null;
};

// ── 3. Video output cannot be cheap ──────────────────────────────────────────

const videoOutputBumpsCost: ConstraintRule = (input) => {
  if (
    input.primaryOutput === 'video' &&
    (input.attributes.cost === 'minimal' || input.attributes.cost === 'low')
  ) {
    return {
      rule: 'videoOutputBumpsCost',
      severity: 'penalty',
      points: 30,
      reason:
        `Video output is not available at cost "${input.attributes.cost}". ` +
        'Video synthesis is uniformly expensive across providers.',
      disables: [
        {
          control: 'attributes.cost',
          values: ['minimal', 'low'],
          hint: 'Not compatible with video output',
        },
      ],
    };
  }
  return null;
};

// ── 4. Audio output cannot be cheap ──────────────────────────────────────────

const audioOutputBumpsCost: ConstraintRule = (input) => {
  if (input.primaryOutput === 'audio' && input.attributes.cost === 'minimal') {
    return {
      rule: 'audioOutputBumpsCost',
      severity: 'penalty',
      points: 12,
      reason:
        'Audio output is not available at the lowest cost tier. ' +
        'TTS and audio synthesis carry per-second pricing.',
    };
  }
  return null;
};

// ── 5. YouTube + non-Google preference ───────────────────────────────────────
//
//   Google models support YouTube videos natively. Other providers must
//   transcribe the video first, which adds cost and time. This rule is a
//   placeholder: it fires when the user wants YouTube AND demands max
//   speed (which biases away from Google's larger, slower models).
//
//   When the resolver picks an actual model, this rule should be replaced
//   by a model-aware check. For now it gives the algorithm a hook.

const youtubeOnFastNonGoogle: ConstraintRule = (input) => {
  if (!input.inputModes.includes('youtube')) return null;
  if (input.attributes.speed !== 'max') return null;
  return {
    rule: 'youtubeOnFastNonGoogle',
    severity: 'penalty',
    points: 12,
    reason:
      'YouTube input combined with maximum speed will likely route to a ' +
      'non-Google model. Non-Google models need an extra transcription pipeline.',
  };
};

// ── 6. Many capabilities marked Critical at once ─────────────────────────────
//
//   Each Critical capability narrows the field. Four or more Criticals can
//   only be satisfied by the largest frontier models. Penalty scales.

const tooManyCriticals: ConstraintRule = (input) => {
  const count = Object.values(input.importance).filter((v) => v === 'max').length;
  if (count < 4) return null;
  return {
    rule: 'tooManyCriticals',
    severity: 'penalty',
    points: count * 5,
    reason:
      `${count} capabilities marked Critical. Only the largest frontier ` +
      'models satisfy this many simultaneously.',
  };
};

// ── 7. Image input requires an image-capable model ───────────────────────────
//
//   No-op penalty for now (handled by input-modes points), but kept here as
//   an example of a constraint that could later disable cost tiers when
//   image input is required and the multimodal options are all premium.

const imageInputAllowsCheaper: ConstraintRule = () => null;

// ── 8. Min cost incompatible with max speed AND max intelligence ─────────────

const cheapFastSmartImpossible: ConstraintRule = (input) => {
  if (
    input.attributes.cost === 'minimal' &&
    input.attributes.speed === 'max' &&
    (input.attributes.rawIntelligence === 'high' || input.attributes.rawIntelligence === 'max')
  ) {
    return {
      rule: 'cheapFastSmartImpossible',
      severity: 'penalty',
      points: 25,
      reason:
        'Pick at most two of: cheapest cost, fastest speed, frontier intelligence. ' +
        'No model in any provider satisfies all three.',
    };
  }
  return null;
};

// ── Registry — append new rules here ─────────────────────────────────────────

export const CONSTRAINTS: { name: string; evaluate: ConstraintRule }[] = [
  { name: 'intelligenceRequiresCost', evaluate: intelligenceRequiresCost },
  { name: 'maxThinkingNeedsReasoning', evaluate: maxThinkingNeedsReasoning },
  { name: 'videoOutputBumpsCost', evaluate: videoOutputBumpsCost },
  { name: 'audioOutputBumpsCost', evaluate: audioOutputBumpsCost },
  { name: 'youtubeOnFastNonGoogle', evaluate: youtubeOnFastNonGoogle },
  { name: 'tooManyCriticals', evaluate: tooManyCriticals },
  { name: 'imageInputAllowsCheaper', evaluate: imageInputAllowsCheaper },
  { name: 'cheapFastSmartImpossible', evaluate: cheapFastSmartImpossible },
];

// ── Driver — runs all rules, collects violations ─────────────────────────────

export function evaluateConstraints(
  input: Parameters<ConstraintRule>[0],
): ConstraintViolation[] {
  const out: ConstraintViolation[] = [];
  for (const c of CONSTRAINTS) {
    const v = c.evaluate(input);
    if (v) out.push(v);
  }
  return out;
}
