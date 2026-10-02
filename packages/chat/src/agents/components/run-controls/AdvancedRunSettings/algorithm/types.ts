/**
 * Algorithm types — shared across the rule files and the engine.
 *
 * The engine never imports concrete rules; rules never import the engine.
 * Both depend only on this file + the constants module.
 */

import type {
  AdvancedRunSettingsValue,
  ArtifactSkillKey,
  ImportanceKey,
  InputMode,
  Level,
  PrimaryOutput,
  ToolKey,
} from '../constants';

/** What the engine receives — same shape as the panel's value. */
export type AlgorithmInput = AdvancedRunSettingsValue;

/** A single positive (or zero) contribution to the total. */
export interface PointContribution {
  /** Stable id for grouping / debugging — e.g. "attributes.rawIntelligence". */
  source: string;
  /** Human label — e.g. "Raw Intelligence: max". */
  label: string;
  /** Points added to the total. */
  points: number;
}

/** A penalty (or warning) raised by a constraint rule. */
export interface ConstraintViolation {
  /** Stable id for the rule that fired. */
  rule: string;
  /** Plain-language reason for the user / debug. */
  reason: string;
  /** "warning" surfaces in UI but contributes 0 points. */
  severity: 'warning' | 'penalty';
  /** Penalty points added to the total. 0 for warnings. */
  points: number;
  /**
   * (Optional, future) Combinations to grey out in the UI as a result of
   * this constraint. Engine doesn't act on this yet — just passes it through.
   */
  disables?: ConstraintDisable[];
}

/** A specific (control, value) combination this constraint forbids. */
export interface ConstraintDisable {
  control:
    | 'primaryOutput'
    | 'inputModes'
    | `attributes.${'rawIntelligence' | 'speed' | 'cost' | 'reasoningAbility'}`
    | `importance.${ImportanceKey}`
    | 'thinkingLevel'
    | 'tools'
    | 'artifactSkills';
  /** Specific values for this control that are forbidden. */
  values: string[];
  /** Short reason shown on hover when the option is greyed out. */
  hint: string;
}

/** Result the engine returns. */
export interface AlgorithmResult {
  total: number;
  contributions: PointContribution[];
  constraints: ConstraintViolation[];
  band: ComplexityBand;
}

export type ComplexityBand = 'low' | 'moderate' | 'high' | 'extreme';

// ── Rule shapes — match these to register a new rule ─────────────────────────

/** A point-adding rule. Returns 0+ contributions. */
export type PointRule = (input: AlgorithmInput) => PointContribution[];

/** A constraint rule. Returns one violation, or null if it doesn't fire. */
export type ConstraintRule = (input: AlgorithmInput) => ConstraintViolation | null;

// ── Re-exports for rule files ────────────────────────────────────────────────

export type {
  ArtifactSkillKey,
  ImportanceKey,
  InputMode,
  Level,
  PrimaryOutput,
  ToolKey,
};
