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

import { explorerQuestionParts, type ExplorerQuestion } from "./questionParts";

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
  /** The words a person reads for a column where its name would mislead ("Request's top model"; decision 14). */
  labels?: Record<string, string>;
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
  const out: DrillRecordsDeclaration = { fact: records.fact, columns: records.columns.filter((c): c is string => typeof c === "string") };
  if (isRecord(records.labels)) {
    const labels = Object.fromEntries(Object.entries(records.labels).filter((e): e is [string, string] => typeof e[1] === "string" && e[1].length > 0));
    if (Object.keys(labels).length > 0) out.labels = labels;
  }
  return out;
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

/**
 * A declared question (a built-in view, a finding, the definition's default) as the explorer's
 * question: the address question, with everything the address cannot say carried beside it in
 * `door` — sent to the door with every ask and said on screen, never silently dropped
 * (`questionParts.ts`; VERIFY-DRILL-WAVE1 F3). `doorQuestionOf` is its exact inverse.
 */
export function explorerQuestionOf(q: DrillQuestionWithHaving): ExplorerQuestion {
  return explorerQuestionParts(q);
}

/**
 * The finding's question, asked in the explorer's window unless it names its own. A finding row
 * drills into ONE group, so the finding's rule (its thresholds and group limit) stays behind: the
 * group is the crumb. Its other filters come along.
 */
export function findingQuestion(finding: DrillFinding, current: MatrxDrillQuestion): ExplorerQuestion {
  const own = explorerQuestionOf(finding.question);
  const out: ExplorerQuestion = { ...own, window: own.window ?? current.window ?? null };
  if (out.door) {
    const { having: _having, limit: _limit, ...rest } = out.door;
    if (Object.keys(rest).length > 0) out.door = rest;
    else delete out.door;
  }
  return out;
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
  /**
   * How an id reads while its name is being read, or when the resolver did not name it ("A person
   * whose name could not be read"). Never the id itself: keys never reach a person (VERIFIER-32 F5).
   */
  missingLabel?: string;
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
  /**
   * The sentence before the link and the link's words: "The calls behind a number open in the",
   * "Spend Explorer". A function when the sentence depends on the question (what the other screen
   * cannot narrow by is said, never silently dropped — VERIFIER-32 F2).
   */
  lead: string | ((question: MatrxDrillQuestion) => string);
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
  /**
   * PLAIN WORDS for code-valued Dimensions (an origin's `child_agent` → "An agent it started"), per
   * Dimension key. A Dimension with neither a resolver nor words shows its values as the definition
   * says them — so every code-valued Dimension of a definition belongs here (VERIFIER-32 F5).
   */
  words?: Record<string, (value: string) => string> | undefined;
  /**
   * The Measure a row COUNTS (the usage rollup's rows are hourly totals; what a person counts is
   * requests). Given, every answer also asks it, a group's summary reads "N <rowNoun>s" of THAT
   * Measure, and "See these <rowNoun>s" names the same thing (VERIFIER-32 F3).
   */
  countMeasure?: string | undefined;
  /**
   * A definition counted in whole hours (a rollup): the window starts on the hour, so the page equals
   * its oracle over the same stated window, and the header says where it starts (VERIFIER-32 F1).
   */
  windowAlign?: "hour" | undefined;
  /** More controls for the header row (an "Old usage page" link). */
  headerExtras?: ReactNode;
  /** A data attribute on the root, so a host's walk can find its mount. */
  dataAttributes?: Record<string, string> | undefined;
}
