import type { Database } from "@/types/database.types";

/**
 * Rulebooks — the versioned, citable capture of one Expert's judgment.
 * DB truth: platform.rulebook (see common-docs systems/vocabulary/FEATURE.md
 * § Settled — Masterwork). The generated Row type keeps the JSONB columns as
 * Json; these are the ONE set of app-level shapes for their contents — never
 * re-declare them beside a consumer.
 */

export type RulebookRow = Database["platform"]["Tables"]["rulebook"]["Row"];

export type RulebookVisibility = Database["platform"]["Enums"]["visibility"];

export type RulebookStatus = "draft" | "active" | "archived";

export type RuleSeverity = "critical" | "major" | "minor";

/** Where a distilled rule came from (every rule stays clickable back to its source). */
export interface RuleSourceRef {
  /** Page number(s) in the source document, e.g. "12" or "12-14". */
  pages?: string;
  /**
   * Real page anchors from the file Approach — the pages of the uploaded
   * document this rule was extracted from (`/masterworks/ingest-file`).
   */
  source_pages?: number[];
  /** The uploaded source file (`files.files` id) — openable at /files/f/{id}. */
  file_id?: string;
  /** The extraction template that read the document, openable in the studio. */
  page_extraction_job_id?: string;
  /** The extraction run that produced this rule. */
  page_extraction_run_id?: string;
  /** Chunk index in the ingestion run that produced this rule. */
  chunk?: number;
  /** Ingestion run id (docproc / extraction run) for full traceability. */
  run_id?: string;
  /** Free-form pointer ("Chapter 6", timestamp for audio, etc.). */
  note?: string;
  /** True when the source was reverse-engineered exemplar work. */
  exemplar?: boolean;
  /** The quote could not be machine-verified verbatim — needs a human look. */
  quote_unverified?: boolean;
  /** Set by the Scout interview Approach. */
  interview?: boolean;
  conversation_id?: string;
}

/** One rule of the Rulebook. `id` is the citable handle every audit verdict points at. */
export interface RulebookRule {
  id: string;
  name: string;
  /** Section code — key into Rulebook.sections. */
  section: string;
  /** The faithful imperative — what the Expert demands. */
  statement: string;
  /** Why the rule exists, in the Expert's reasoning. */
  rationale?: string;
  /** Verbatim contiguous span of the source (machine-verified at ingestion). */
  quote?: string;
  /** How a violation is recognized — what the auditor applies. */
  detection?: string;
  severity: RuleSeverity;
  /** Optional chapter/locator carried from Distillation. */
  chapter?: string;
  /** Retired rules stay in the Rulebook for citation history but are excluded from built Masterworks. */
  retired?: boolean;
  /** Drafts (from ingestion or the Scout) awaiting the Expert's approval. */
  draft?: boolean;
  /** Back-reference to the source location this rule was distilled from. */
  source_ref?: RuleSourceRef;
}

export interface RulebookSectionDef {
  label: string;
}

/** Section code → definition, e.g. { U: { label: "Elementary Rules of Usage" } } */
export type RulebookSections = Record<string, RulebookSectionDef>;

export interface RulebookSource {
  title?: string;
  author?: string;
  year?: number | string;
  provenance_url?: string;
  license?: string;
  note?: string;
}

/** The parsed Rulebook — Row with its JSONB columns given their real shapes. */
export interface Rulebook
  extends Omit<RulebookRow, "rules" | "sections" | "source"> {
  rules: RulebookRule[];
  sections: RulebookSections;
  source: RulebookSource;
}

/** Narrow list-row projection for the /masterwork list page. */
export interface RulebookListRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  source: RulebookSource;
  version: number;
  status: RulebookStatus;
  visibility: RulebookVisibility;
  rule_count: number;
  created_by: string;
  organization_id: string;
  created_at: string;
  updated_at: string;
}

/**
 * A Masterwork (the workflow projection) built from a Rulebook — read from
 * workflow.definition metadata stamps.
 */
export interface Masterwork {
  id: string;
  name: string;
  description: string | null;
  masterwork_kind: string | null;
  built_from_rulebook: string | null;
  rulebook_version: number | null;
  created_at: string;
  updated_at: string;
  visibility: string;
}

export function parseRulebook(row: RulebookRow): Rulebook {
  return {
    ...row,
    rules: Array.isArray(row.rules)
      ? (row.rules as unknown as RulebookRule[])
      : [],
    sections:
      row.sections && typeof row.sections === "object" && !Array.isArray(row.sections)
        ? (row.sections as unknown as RulebookSections)
        : {},
    source:
      row.source && typeof row.source === "object" && !Array.isArray(row.source)
        ? (row.source as unknown as RulebookSource)
        : {},
  };
}

export const SEVERITY_LABELS: Record<RuleSeverity, string> = {
  critical: "Critical",
  major: "Major",
  minor: "Minor",
};

export const STATUS_LABELS: Record<RulebookStatus, string> = {
  draft: "Draft",
  active: "Active",
  archived: "Archived",
};
