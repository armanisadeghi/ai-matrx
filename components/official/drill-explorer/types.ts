// components/official/drill-explorer/types.ts — THE EXPLORER'S TYPES, IN ONE PLACE (lane DRILL-EXPLORER).
//
// The contract additions below (built-in Saved views, findings, records, `having`, `as_of`,
// `stale_after_knob`, the `ratio` Measure) are being added to `@ai-matrx/records` drill.ts by lane
// DRILL-LEDGER-RECORDS (program DRILL-FINISH decision 25). The published @ai-matrx/records does not
// carry them yet, so they are written HERE, once, as optional fields read defensively from the
// door's JSON; when the package publishes them, these become re-exports of the package's own types
// (PROGRESS-DRILL-EXPLORER "After publish").

import type { ReactNode } from "react";
import type { DrillAnswer, DrillDefinition, DrillQuestion, DrillSource } from "@ai-matrx/records";
import type { MatrxDrillQuestion } from "@ai-matrx/design-system/data-table";

// ── the contract additions (decision 25), read as optional ──────────────────

/** A threshold on a Measure, applied by the door before the group limit (a finding's rule). */
export interface DrillHaving {
  measure: string;
  op: ">=" | ">";
  value?: number;
  share_of_total?: number;
  times_median?: number;
  median_nonzero?: boolean;
  /** A feature knob whose value replaces `value` (`drill.finding.<definition>.<finding>.<knob>`). */
  knob?: string;
}

/** A door question with the additions (`having`). */
export type DrillQuestionWithHaving = DrillQuestion & { having?: DrillHaving[] };

/** A built-in Saved view declared in the definition file: read-only, listed first. */
export interface DrillBuiltInView {
  key: string;
  label: string;
  question: DrillQuestionWithHaving;
}

/** A finding ("dig here"): a question whose `having` picks the groups worth a look. */
export interface DrillFinding {
  key: string;
  label: string;
  question: DrillQuestionWithHaving;
  knobs?: Record<string, { default: number; label: string; unit: string }>;
}

/** The records behind a number, when the definition declares them (read through `drill_rows`). */
export interface DrillRecordsDeclaration {
  fact: string;
  columns: string[];
}

/** What `drill_describe` returns, with the additions. */
export type DrillDefinitionPlus = DrillDefinition & {
  views?: DrillBuiltInView[];
  findings?: DrillFinding[];
  records?: DrillRecordsDeclaration | null;
  /** The feature knob naming how old an answer may be before the screen says so. */
  stale_after_knob?: string | null;
};

// ── defensive readers of the door's JSON ────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isQuestion(value: unknown): value is DrillQuestionWithHaving {
  return isRecord(value);
}

/** The built-in views describe returned, or none (the field is optional until the contract lands). */
export function builtInViewsOf(def: DrillDefinition | null): DrillBuiltInView[] {
  const views = def ? (def as DrillDefinitionPlus).views : undefined;
  if (!Array.isArray(views)) return [];
  return views.filter((v): v is DrillBuiltInView => isRecord(v) && typeof v.key === "string" && typeof v.label === "string" && isQuestion(v.question));
}

/** The findings describe returned, or none. */
export function findingsOf(def: DrillDefinition | null): DrillFinding[] {
  const findings = def ? (def as DrillDefinitionPlus).findings : undefined;
  if (!Array.isArray(findings)) return [];
  return findings.filter((f): f is DrillFinding => isRecord(f) && typeof f.key === "string" && typeof f.label === "string" && isQuestion(f.question));
}

/** The records declaration, when the definition has records. */
export function recordsOf(def: DrillDefinition | null): DrillRecordsDeclaration | null {
  const records = def ? (def as DrillDefinitionPlus).records : undefined;
  if (!isRecord(records) || typeof records.fact !== "string" || !Array.isArray(records.columns)) return null;
  return { fact: records.fact, columns: records.columns.filter((c): c is string => typeof c === "string") };
}

export function staleAfterKnobOf(def: DrillDefinition | null): string | null {
  const knob = def ? (def as DrillDefinitionPlus).stale_after_knob : undefined;
  return typeof knob === "string" && knob.length > 0 ? knob : null;
}

/** `as_of` of an answer (every row carries it once the contract lands), or null. */
export function asOfAnswer(answer: DrillAnswer | null | undefined): string | null {
  for (const row of answer?.rows ?? []) {
    const v = (row as { as_of?: unknown }).as_of;
    if (typeof v === "string") return v;
  }
  return null;
}

/** `as_of` of a records page, or null. */
export function asOfPage(page: unknown): string | null {
  return isRecord(page) && typeof page.as_of === "string" ? page.as_of : null;
}

// ── the door's question ↔ the address's question ────────────────────────────

const ISO_DAY = /^\d{4}-\d{2}-\d{2}/;

/**
 * A declared question (a built-in view, a finding, the definition's default) as the explorer's
 * address question. Only what the address can say is carried: equality crumbs, a preset or a
 * `from..to` day range, the named comparisons. `having` is not an address thing — a finding is
 * answered through the door, and its row drills with ordinary crumbs.
 */
export function explorerQuestionOf(q: DrillQuestion): MatrxDrillQuestion {
  const where: MatrxDrillQuestion["where"] = [];
  for (const [dim, value] of Object.entries(q.where ?? {})) {
    if (value === null || typeof value === "string") where.push({ dim, value });
    else if (typeof value === "number" || typeof value === "boolean") where.push({ dim, value: String(value) });
  }
  let window: string | null = null;
  if (q.window?.preset) window = q.window.preset;
  else if (q.window?.from && q.window.to && ISO_DAY.test(q.window.from) && ISO_DAY.test(q.window.to)) {
    window = `${q.window.from.slice(0, 10)}..${q.window.to.slice(0, 10)}`;
  }
  const against = typeof q.compare === "string" ? q.compare : q.compare?.against;
  const out: MatrxDrillQuestion = {
    by: [...(q.by ?? [])],
    show: (q.show ?? []).filter((s): s is string => typeof s === "string"),
    where,
  };
  if (q.across) out.across = q.across;
  if (window) out.window = window;
  if (against === "previous_period" || against === "same_period_last_year") out.compare = against;
  if (q.sort) out.sort = { key: q.sort.key, direction: q.sort.direction ?? "desc" };
  return out;
}

/** The finding's question, asked in the explorer's window unless it names its own. */
export function findingQuestion(finding: DrillFinding, current: MatrxDrillQuestion): MatrxDrillQuestion {
  const own = explorerQuestionOf(finding.question);
  return { ...own, window: own.window ?? current.window ?? null };
}

/** The address's trail in the door's words: each crumb is an equality (`null` = not set; a period by its label). */
export function doorWhere(question: MatrxDrillQuestion): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  for (const w of question.where) where[w.dim] = w.value;
  return where;
}

// ── the explorer's own ports ────────────────────────────────────────────────

/** Words for the ids one Dimension groups by (a person's name for a person id). */
export interface DrillNameResolver {
  /** Read the words for these ids; ids it cannot name are simply absent. */
  resolve: (ids: string[]) => Promise<{ ok: true; names: Record<string, string> } | { ok: false; message: string }>;
  /** How the empty group reads ("No person"). Default the explorer's empty label. */
  emptyLabel?: string;
}

/**
 * FRESHNESS a host keeps itself (the usage page's recount of the rollup), until the door says
 * `as_of` on every answer. When the answers carry `as_of`, the explorer reads that instead.
 */
export interface DrillExplorerFreshness {
  countedThrough: string | null;
  recounting: boolean;
  /** A failed read or recount, in words. */
  error: string | null;
  /** Count the window again (the Recount button); absent = no button. */
  recount?: ((range: { from: string; to: string }) => void) | undefined;
  /** What the Recount button's title says it does. */
  recountTitle?: string | undefined;
  /** Changes whenever the counted data changed, so every answer is asked again. */
  version?: number | undefined;
}

/** The header's headline: which Measure is the big number, and which ride beside the window. */
export interface DrillExplorerHeadline {
  measure: string;
  /** Measures said after the window ("· 1,204 requests"), when the answer carries them. */
  also?: string[] | undefined;
}

/** "See these records" when the definition declares no records: a link to where they live. */
export interface DrillExplorerRecordsLink {
  href: (question: MatrxDrillQuestion) => string;
  /** The sentence before the link and the link's words: "The calls behind a number open in the", "Spend Explorer". */
  lead: string;
  label: string;
}

export interface DrillExplorerProps {
  /** The definition asked: `{ kind: 'entity', token }` (a declared definition) or a Table. */
  source: DrillSource;
  /** Who the question is asked for. */
  lane: "mine" | "organization" | "platform";
  /** The organization whose calendar cuts the periods (the platform organization in admin). */
  organizationId: string | null;
  /** The trail's first crumb and the header's name ("AI usage"). */
  title: string;
  rootLabel: string;
  /** The screen before anyone asks anything; default the definition's own default question. */
  firstQuestion?: MatrxDrillQuestion | undefined;
  /** Words for id-valued Dimensions, per Dimension key. */
  names?: Record<string, DrillNameResolver> | undefined;
  headline?: DrillExplorerHeadline | undefined;
  freshness?: DrillExplorerFreshness | undefined;
  recordsLink?: DrillExplorerRecordsLink | undefined;
  /** What one answer row counts ("hourly total"). */
  rowNoun?: string | undefined;
  /** Grains the door's periods may not be cut into here (the usage rollup's `hour`). */
  hideGrains?: readonly string[] | undefined;
  /** More controls for the header row (an "Old usage page" link). */
  headerExtras?: ReactNode;
  /** A data attribute on the root, so a host's walk can find its mount. */
  dataAttributes?: Record<string, string> | undefined;
}
