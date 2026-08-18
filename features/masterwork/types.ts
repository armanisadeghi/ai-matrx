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
  /**
   * Time anchor for a rule distilled from a RECORDING (the monologue lane):
   * the seconds range of the transcript portion the rule came from. `end`
   * is null when the transcription carried no end offset.
   */
  time_range?: { start: number; end?: number | null };
  /**
   * The monologue distiller's read on how plainly the expert stated the
   * rule — "low" means an inference from an aside the Expert should confirm.
   */
  confidence?: "high" | "medium" | "low";
  /**
   * The Distillation Approach that produced this rule — a `platform.approach`
   * key (interview / source / exemplar / file / …), stamped by every lane
   * through the one shared rule builder. Additive; older rules lack it.
   */
  approach?: string;
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
  /**
   * The dump Approach's provenance for a rule distilled from an ATTACHED
   * entity (`platform.associations` role `distillation_source`): the canonical
   * token + row id of the source. Rendered as a named door via the registry.
   */
  entity?: { token: string; id: string };
  /** The dump Approach's provenance for a rule distilled from a URL source. */
  url?: string;
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
  /**
   * The Expert rejected this rule; `feedback` carries their reason. The Scout
   * clears it next turn — rewrite per the feedback (re-queues as a fresh
   * draft) or withdraw the rule. Rejected rules never power a Build.
   */
  rejected?: boolean;
  /**
   * Transient review note from the Expert — the reason on a rejected rule, or
   * a request-changes note on any rule. It is review state, never part of the
   * rule: the Scout applying it consumes it, and approval clears it.
   */
  feedback?: string;
  /** Back-reference to the source location this rule was distilled from. */
  source_ref?: RuleSourceRef;
}

/** The one review state of a rule — precedence retired > rejected > draft > approved. */
export type RuleState = "approved" | "draft" | "rejected" | "retired";

export function ruleState(rule: RulebookRule): RuleState {
  if (rule.retired === true) return "retired";
  if (rule.rejected === true) return "rejected";
  if (rule.draft === true) return "draft";
  return "approved";
}

/** The fields an edit can change — the content of a rule, as opposed to its review state. */
export const RULE_CONTENT_FIELDS = [
  "name",
  "statement",
  "rationale",
  "detection",
  "quote",
  "severity",
  "section",
] as const;

function contentChanged(prev: RulebookRule, next: RulebookRule): boolean {
  return RULE_CONTENT_FIELDS.some(
    (field) => (prev[field] ?? "") !== (next[field] ?? ""),
  );
}

/**
 * SAVING AN EDIT IS NOT APPROVING (Arman, 2026-08-17: "save rule is actually
 * approving even though it shouldn't approve. You're updating the data, not
 * approving it."). The ONE merge for a manual edit-save — the full matrix is
 * documented in FEATURE.md § The review-verb matrix:
 *
 * - `draft` / approved status is PRESERVED exactly. A draft the Expert
 *   corrected is still a draft awaiting the explicit Approve button; an
 *   approved rule they touched stays approved.
 * - `rejected` + `feedback` survive an edit that changes NOTHING — but a
 *   content-changing edit RESOLVES them: those flags are messages to the
 *   Scout about the OLD text, and the Expert's own hand supersedes the note
 *   they wrote for the agent. A resolved rejected rule returns to the
 *   Expert's own draft queue (still not approved — save is never approve).
 */
export function applyManualRuleEdit(
  prev: RulebookRule,
  edited: RulebookRule,
): RulebookRule {
  if (!contentChanged(prev, edited)) return { ...prev, ...edited };
  const merged = { ...prev, ...edited };
  delete merged.rejected;
  delete merged.feedback;
  return merged;
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

/**
 * A URL staged for the dump Approach — durable on
 * `rulebook.metadata.dump_url_sources` (guarded CAS writes only; see
 * `writeDumpUrlSources` in service.ts). The scrape-on-add preview is honest UI
 * only: the SERVER re-fetches every URL through the policy-enforcing scraper
 * at run time, so nothing but the address and a display title is stored here.
 */
export interface DumpUrlSource {
  url: string;
  title?: string;
  added_at: string;
}

/** The staged dump URLs off a Rulebook's metadata (tolerant read). */
export function dumpUrlSources(rulebook: Rulebook): DumpUrlSource[] {
  const meta = rulebook.metadata;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return [];
  const raw = (meta as Record<string, unknown>).dump_url_sources;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const rec = item as Record<string, unknown>;
    if (typeof rec.url !== "string" || !rec.url.trim()) return [];
    return [
      {
        url: rec.url,
        ...(typeof rec.title === "string" && rec.title.trim()
          ? { title: rec.title }
          : {}),
        added_at:
          typeof rec.added_at === "string" ? rec.added_at : new Date(0).toISOString(),
      },
    ];
  });
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
 *
 * Lifecycle: every Build lands as a DRAFT. The Expert releases it from the
 * Studio (`metadata.released_at` gets stamped); only a released Masterwork
 * appears on /masterwork/encore, where an Operator runs it. Un-release clears the stamp.
 */
export interface Masterwork {
  id: string;
  name: string;
  description: string | null;
  masterwork_kind: string | null;
  built_from_rulebook: string | null;
  rulebook_version: number | null;
  /** When the Expert released it to Operators; null = draft (Studio-only). */
  released_at: string | null;
  /**
   * True for the Rulebook's Understudy — the crude one-agent system that runs
   * from minute one and is rebuilt free on every rules save. Never releasable;
   * rendered on the Rulebook page, not in the built-Masterworks list.
   */
  understudy: boolean;
  /** workflow.definition row version — the CAS token for release writes. */
  version: number;
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
