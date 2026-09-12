import type { Database } from "@/types/database.types";

/**
 * Rulebooks — the versioned, citable capture of one Expert's judgment.
 * DB truth: platform.rulebook (see common-docs systems/platform/vocabulary/FEATURE.md
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
  /**
   * WHICH PIECE of a body of work this rule was distilled from — the canonical
   * key of the `platform.masterwork_corpus_item` row, stamped on both piece
   * paths (link and file) so it speaks the same vocabulary as a synthesized
   * rule's `pieces` citations.
   */
  corpus_piece?: string;
  /** The cross-piece synthesis pass wrote this rule. */
  synthesis?: boolean;
  /** The pieces a synthesized rule cites as proof — `corpus_piece` keys. */
  pieces?: string[];
  /**
   * The distinct pieces that have produced this evidence rule. Its length is
   * the rule's support; the promotion knob
   * (`masterwork_distillation.evidence_promotion_pieces`) is the threshold.
   */
  evidence_pieces?: string[];
  /** Support at the moment the server promoted this rule out of evidence. */
  promoted_from_evidence?: number;
}

/**
 * THE RELATIONSHIP VOCABULARY — four kinds, and only four. Mirrors
 * `aidream/services/distillation/distill.py::RELATION_KINDS`; keep them
 * byte-identical.
 */
export const RULE_RELATION_KINDS = [
  "refines",
  "depends_on",
  "exception_to",
  "contrast_with",
] as const;

export type RuleRelationKind = (typeof RULE_RELATION_KINDS)[number];

/** How the connection reads to the Expert, in their language — never jargon. */
export const RULE_RELATION_LABELS: Record<RuleRelationKind, string> = {
  refines: "Narrows down",
  depends_on: "Only applies after",
  exception_to: "Is the exception to",
  contrast_with: "Easy to confuse with",
};

/**
 * One documented connection from this rule to a SIBLING rule.
 *
 * 🚨 THE ANTI-MISLEADING LAW (Arman, 2026-08-18, after reading all 28 rules of
 * the SEO Rulebook by hand): a rule that silently refines, qualifies, depends
 * on, or contradicts another rule — and presents itself as standalone — is a
 * CORRECTNESS defect, not a style nit.
 *
 * This is the SECOND half of the fix, never the first: the connecting aspect
 * must ALSO be carried concisely inside `statement`, so the rule is not
 * misleading anywhere `relates_to` is not rendered (a printed Masterwork, an
 * audit verdict, an export). This object makes the connection machine-readable
 * and gives the UI a door to the sibling.
 */
export interface RuleRelation {
  /** The sibling rule's `id` — guaranteed to exist in this Rulebook: the
   * server drops an unresolvable reference rather than write a dead link. */
  rule_id: string;
  kind: RuleRelationKind;
  /** One short clause naming WHAT connects them — the link's label. */
  note?: string;
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
  /**
   * 🚨 THE EVIDENCE STANDING (2026-09-12). `"evidence"` means this rule is what
   * ONE piece of a body of work showed — the proof behind a cross-piece rule,
   * not a question the Expert owes an answer on.
   *
   * The incident: 20 published pieces produced 416 per-piece drafts plus 4
   * synthesized rules, all of them "Waiting on you", and the only controls were
   * Approve-all or one-by-one — so the Expert pressed Approve-all, which is the
   * failure this lane exists to prevent. Evidence rules are still drafts (a
   * machine never activates anything), are excluded from the counters, the
   * review queue and every built Masterwork, and are reached behind the
   * synthesized rule that cites them. They become ordinary drafts when the
   * Expert promotes one, or when the server sees the same judgment recur across
   * enough distinct pieces. Absent on every rule written before 2026-09-12 and
   * on every other lane — absence means "an ordinary rule".
   */
  standing?: "evidence";
  /** Back-reference to the source location this rule was distilled from. */
  source_ref?: RuleSourceRef;
  /**
   * Documented connections to sibling rules — see `RuleRelation`. Additive and
   * optional; a genuinely standalone rule has none. Deliberately NOT in
   * `RULE_CONTENT_FIELDS`: that list is the string fields a manual edit
   * compares, and relations are structural, not prose.
   */
  relates_to?: RuleRelation[];
}

/**
 * The one review state of a rule — precedence
 * retired > rejected > evidence > draft > approved.
 *
 * `evidence` sits above `draft` deliberately: an evidence rule IS a draft in
 * the database (nothing a machine writes is ever active), and every surface
 * that asks "is this waiting on the Expert?" must get NO for it.
 */
export type RuleState =
  | "approved"
  | "draft"
  | "evidence"
  | "rejected"
  | "retired";

export function ruleState(rule: RulebookRule): RuleState {
  if (rule.retired === true) return "retired";
  if (rule.rejected === true) return "rejected";
  if (rule.standing === "evidence") return "evidence";
  if (rule.draft === true) return "draft";
  return "approved";
}

/** THE ONE predicate — mirrors `distill.is_evidence_rule` on the server. */
export function isEvidenceRule(rule: RulebookRule): boolean {
  return rule.standing === "evidence";
}

/** How many distinct pieces have produced this evidence rule. */
export function evidenceSupport(rule: RulebookRule): number {
  return new Set(rule.source_ref?.evidence_pieces ?? []).size;
}

/**
 * The evidence rules a synthesized rule is built on: every evidence rule whose
 * piece the synthesized rule cites. A rule with no citations has no evidence to
 * show — never a guess.
 */
export function evidenceFor(
  synthesized: RulebookRule,
  rules: readonly RulebookRule[],
): RulebookRule[] {
  const cited = new Set(synthesized.source_ref?.pieces ?? []);
  if (cited.size === 0) return [];
  return rules.filter(
    (rule) =>
      isEvidenceRule(rule) &&
      Boolean(rule.source_ref?.corpus_piece) &&
      cited.has(rule.source_ref!.corpus_piece!),
  );
}

/**
 * Promoting an evidence rule to an ordinary draft — the Expert's one click.
 * It raises standing only: the rule stays a draft awaiting their Approve, and
 * not one word of it changes.
 */
export function promoteEvidenceRule(rule: RulebookRule): RulebookRule {
  const { standing: _standing, ...rest } = rule;
  return { ...rest, draft: true };
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
  /**
   * WHAT THIS SYSTEM MAKES, in the Expert's own words — the answer they typed
   * into "What does it hand you when it's done?" at build time, stamped onto
   * the definition by the builder. Arman, 2026-08-24, staring at a freshly
   * built system: "no custom inputs, nothing that tells me I've now created a
   * workflow for keywords." The builder knew and threw it away; now every
   * surface that shows a Masterwork can say what it makes.
   */
  deliverable: string | null;
  /** Approved rules it was built from — the "checked against N rules" line. */
  rule_count: number | null;
  /** generate only: how many drafts it writes before picking a winner. */
  variant_count: number | null;
  /**
   * The run button's words, designed with the intake by the builder
   * ("Find my keywords"). Null = the button shows its icon alone rather than
   * inventing a verb (Arman, 2026-08-25).
   */
  submit_label: string | null;
  /** When the Expert released it to Operators; null = draft (Studio-only). */
  released_at: string | null;
  /**
   * True for the Rulebook's Understudy — the crude one-agent system that runs
   * from minute one and is rebuilt free on every rules save. Never releasable;
   * rendered on the Rulebook page, not in the built-Masterworks list.
   */
  understudy: boolean;
  /**
   * THE ARCHIVED-ITEMS LAW (`common-docs/policies/archived-items.md`, Arman
   * 2026-09-09). `workflow.definition.is_archived` — carried on EVERY
   * Masterwork read so no surface downstream can mistake an archived system
   * for a live one. Archived ≠ deleted: it stays reachable, one click away,
   * behind the surface's `ArchivedDisclosure`.
   */
  is_archived: boolean;
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
