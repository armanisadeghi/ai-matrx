import type { Database } from "@/types/database.types";

/**
 * Expertise Packs — the versioned, citable rulebook primitive.
 * DB truth: platform.expertise_pack (see aidream db/migrations/platform_expertise_pack_create.sql
 * and common-docs systems/expertise-packs/FEATURE.md). The generated Row type keeps the JSONB
 * columns as Json; these are the ONE set of app-level shapes for their contents — never
 * re-declare them beside a consumer.
 */

export type ExpertisePackRow =
  Database["platform"]["Tables"]["expertise_pack"]["Row"];

export type PackVisibility = Database["platform"]["Enums"]["visibility"];

export type PackStatus = "draft" | "active" | "archived";

export type PrincipleSeverity = "critical" | "major" | "minor";

/** Where an ingested rule came from (Phase 3 keeps every rule clickable back to its source). */
export interface PrincipleSourceRef {
  /** Page number(s) in the source document, e.g. "12" or "12-14". */
  pages?: string;
  /** Chunk index in the ingestion run that produced this rule. */
  chunk?: number;
  /** Ingestion run id (docproc / extraction run) for full traceability. */
  run_id?: string;
  /** Free-form pointer ("Chapter 6", timestamp for audio, etc.). */
  note?: string;
}

/** One rule of the pack. `id` is the citable handle every audit verdict points at. */
export interface PackPrinciple {
  id: string;
  name: string;
  /** Section code — key into ExpertisePack.sections. */
  section: string;
  /** The faithful imperative — what the expert demands. */
  statement: string;
  /** Why the rule exists, in the expert's reasoning. */
  rationale?: string;
  /** Verbatim contiguous span of the source (machine-verified at ingestion). */
  quote?: string;
  /** How a violation is recognized — what the auditor applies. */
  detection?: string;
  severity: PrincipleSeverity;
  /** Optional chapter/locator carried from distillation. */
  chapter?: string;
  /** Retired rules stay in the pack for citation history but are excluded from compiled desks. */
  retired?: boolean;
  /** Drafts (from ingestion or the interview agent) awaiting the expert's approval. */
  draft?: boolean;
  /** Back-reference to the source location this rule was distilled from. */
  source_ref?: PrincipleSourceRef;
}

export interface PackSectionDef {
  label: string;
}

/** Section code → definition, e.g. { U: { label: "Elementary Rules of Usage" } } */
export type PackSections = Record<string, PackSectionDef>;

export interface PackSource {
  title?: string;
  author?: string;
  year?: number | string;
  provenance_url?: string;
  license?: string;
  note?: string;
}

/** The parsed pack — Row with its JSONB columns given their real shapes. */
export interface ExpertisePack
  extends Omit<ExpertisePackRow, "principles" | "sections" | "source"> {
  principles: PackPrinciple[];
  sections: PackSections;
  source: PackSource;
}

/** Narrow list-row projection for the /expertise list page. */
export interface ExpertisePackListRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  source: PackSource;
  version: number;
  status: PackStatus;
  visibility: PackVisibility;
  principle_count: number;
  created_by: string;
  organization_id: string;
  created_at: string;
  updated_at: string;
}

/** A desk (workflow) compiled from a pack — read from workflow.definition metadata stamps. */
export interface PackDesk {
  id: string;
  name: string;
  description: string | null;
  desk_kind: string | null;
  compiled_from_pack: string | null;
  pack_version: number | null;
  created_at: string;
  updated_at: string;
  visibility: string;
}

export function parsePack(row: ExpertisePackRow): ExpertisePack {
  return {
    ...row,
    principles: Array.isArray(row.principles)
      ? (row.principles as unknown as PackPrinciple[])
      : [],
    sections:
      row.sections && typeof row.sections === "object" && !Array.isArray(row.sections)
        ? (row.sections as unknown as PackSections)
        : {},
    source:
      row.source && typeof row.source === "object" && !Array.isArray(row.source)
        ? (row.source as unknown as PackSource)
        : {},
  };
}

export const SEVERITY_LABELS: Record<PrincipleSeverity, string> = {
  critical: "Critical",
  major: "Major",
  minor: "Minor",
};

export const STATUS_LABELS: Record<PackStatus, string> = {
  draft: "Draft",
  active: "Active",
  archived: "Archived",
};
