/**
 * Settings translation grid — row shapes (contracts K2, K3, K5 in
 * common-docs/projects/settings-translation/CONTRACTS.md).
 *
 * STAND-IN for generated types: `ai.translation_cell`, `ai.setting_profile` and
 * the `ai.offering_rules_compiled` view exist on the nightly clone first and on
 * live only after the C2 apply. REMEDY once they are live: regenerate
 * `types/database.types.ts`, then read these rows from it and delete the
 * hand-written shapes below.
 */

import type { ControlRule } from "../types";

export type CellLayer = "api" | "profile" | "offering";
export type CellState = "approved" | "agent" | "proposed" | "inherited";
export type CellSource = "human" | "agent" | "probe" | "ingest" | "migration";

export type EvidenceEntry = {
  kind: "doc" | "probe" | "ingest" | "replay" | "rejection";
  ref?: unknown;
  at?: string;
  result?: unknown;
};

export type CellConflict = {
  sources?: { name?: string; says?: unknown; confidence?: number | null; rationale?: string | null }[];
  at?: string;
};

/** One `ai.translation_cell` row (K3). */
export type TranslationCellRow = {
  id: string;
  layer: CellLayer;
  layer_owner_id: string;
  setting_key: string;
  rule: ControlRule;
  state: CellState;
  confidence: number | null;
  rationale: string | null;
  evidence: EvidenceEntry[];
  source: CellSource;
  conflict: CellConflict | null;
  rejection_fingerprint: string | null;
  approved_by: string | null;
  approved_at: string | null;
  version: number;
  updated_at: string | null;
};

/** One `ai.offering_rules_compiled` row (K5) — the one merge. */
export type CompiledRow = {
  offering_id: string;
  setting_key: string;
  cell_id: string;
  layer: CellLayer;
  state: CellState;
};

/** One `ai.setting_profile` row (K2). */
export type SettingProfileRow = {
  id: string;
  api_id: string;
  name: string;
  modality: string;
};

export type TranslationApi = {
  id: string;
  name: string;
  display_name: string | null;
  translator_key: string;
};

/** The slice of `ai.model_definition.capabilities` the modality rule reads. */
export type ModelCapabilities = {
  input?: string[] | null;
  output?: string[] | null;
  interaction?: string | null;
};

export type TranslationOffering = {
  id: string;
  api_id: string;
  model_id: string;
  provider_model_id: string | null;
  setting_profile_id: string | null;
  model_name: string;
  /** The model's declared capabilities with the listing's override applied. */
  capabilities: ModelCapabilities | null;
};

export type TranslationSetting = {
  key: string;
  value_type: string;
  canonical_min: number | null;
  canonical_max: number | null;
  canonical_values: unknown[] | null;
  default_value: unknown;
  value_positions: Record<string, number> | null;
  family: string | null;
};

/** Everything the grid reads, in one bundle. */
export type TranslationBundle = {
  cells: TranslationCellRow[];
  compiled: CompiledRow[];
  profiles: SettingProfileRow[];
  apis: TranslationApi[];
  offerings: TranslationOffering[];
  settings: TranslationSetting[];
};

/** What the read answered: the bundle, or "the tables are not on this database". */
export type TranslationRead =
  | { status: "ready"; bundle: TranslationBundle }
  | { status: "absent" };
