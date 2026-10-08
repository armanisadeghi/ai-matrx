// components/official/drill-explorer/types.ts — THE EXPLORER'S TYPES, IN ONE PLACE (lane DRILL-EXPLORER).
//
// The contract additions (built-in Saved views, findings, records, `having`, `as_of`,
// `stale_after_knob`) are `@ai-matrx/records`' own types since 0.58.109 (lane DRILL-LEDGER-RECORDS,
// program DRILL-FINISH decision 25); lane DRILL-ADOPT re-exports them here under the names the
// explorer already used. The door's JSON is still read defensively (a malformed entry is dropped).

import type { DrillSibling } from "./drillSiblings";
import type { ReactNode } from "react";
import type {
  DrillAnswer,
  DrillDefinition,
  DrillFinding as PackageDrillFinding,
  DrillHaving as PackageDrillHaving,
  DrillQuestion,
  DrillRecords,
  DrillSource,
  DrillView,
} from "@ai-matrx/records";
import type { MatrxDrillQuestion } from "@ai-matrx/design-system/data-table";

import { explorerQuestionParts, type ExplorerQuestion } from "./questionParts";
import type { DrillReconcileSpec } from "./useDrillReconcile";

// ── the contract additions (decision 25): the package's types ───────────────

/** A threshold on a Measure, applied by the door before the group limit (a finding's rule). */
export type DrillHaving = PackageDrillHaving;

/** A door question with the additions (`having`). */
export type DrillQuestionWithHaving = DrillQuestion & { having?: DrillHaving[] };

/** A built-in Saved view declared in the definition file: read-only, listed first. */
export type DrillBuiltInView = DrillView;

/** A finding ("dig here"): a question whose `having` picks the groups worth a look. */
export type DrillFinding = PackageDrillFinding;

/** The records behind a number, when the definition declares them (read through `drill_rows`). */
export type DrillRecordsDeclaration = DrillRecords;

/** What `drill_describe` returns (the package's definition carries the additions). */
export type DrillDefinitionPlus = DrillDefinition;

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
export function findingQuestion(finding: Pick<DrillFinding, "question">, current: MatrxDrillQuestion): ExplorerQuestion {
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
  /**
   * How an id reads once its read is over and named nothing (the read failed, or the answer left the
   * id out): the door's plain words ("A request whose details could not be read"). Default
   * "Name could not be read" (drillNames.ts). Never a perpetual loading state (lane DRILL-D1).
   */
  unreadLabel?: string;
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

/**
 * How one record of the definition's `records` opens (THE DOOR LAW: every record the UI names opens).
 * `column` holds the record's id; the cell reads `label` and opens through `href` (a page the seat
 * may open) or `open` (a window or peek — the admin seat's door, never the person's own list).
 */
export interface DrillRecordOpener {
  column: string;
  label: string;
  href?: ((id: string) => string) | undefined;
  open?: ((id: string) => void) | undefined;
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
  /** Ask with no lane: every organization she is in, her own row rules deciding each row. For a member page whose organization is a visible control (default All organizations), never the active organization. */
  acrossOrganizations?: boolean | undefined;
  /** The trail's first crumb and the header's name ("AI usage"). */
  title: string;
  rootLabel: string;
  /** The screen before anyone asks anything; default the definition's own default question. */
  firstQuestion?: MatrxDrillQuestion | undefined;
  /** Words for id-valued Dimensions, per Dimension key. */
  names?: Record<string, DrillNameResolver> | undefined;
  headline?: DrillExplorerHeadline | undefined;
  /**
   * The calendar the door cuts periods in, when the host knows it ("UTC": the platform lane asks in the
   * platform's own organization, whose calendar is UTC). Every time on the screen prints in it and a chip
   * says it once (VERIFY-DRILL-LIVE F8). Absent: the reader's own clock.
   */
  timeZone?: string | undefined;
  freshness?: DrillExplorerFreshness | undefined;
  recordsLink?: DrillExplorerRecordsLink | undefined;
  /** What one answer row counts ("hourly total"). */
  rowNoun?: string | undefined;
  /** How one record opens, when the definition declares records (its id column becomes its door). */
  openRecord?: DrillRecordOpener | undefined;
  /**
   * THE RECONCILIATION LINE (decisions 12, 29): the headline asked of another definition for the same
   * window and filters, and the difference said in words from the two measured numbers.
   */
  reconcile?: DrillReconcileSpec | undefined;
  /** Where a copied group was copied from ("Administration › AI usage"); default the title. */
  location?: string | undefined;
  /**
   * SIBLING DEFINITIONS (lane DRILL-PRESETS-RETIRE): other grains of the same subject whose built-in
   * views and findings this screen offers beside its own, each opening at the sibling's address.
   */
  siblings?: readonly DrillSibling[] | undefined;
  /** This definition's group name in the menus when siblings are offered ("Usage"). */
  groupLabel?: string | undefined;
  /**
   * PLAIN WORDS for code-valued Dimensions whose definition declares no `choices` yet (an origin's
   * `child_agent` → "An agent it started"), per Dimension key. The definition's own `choices` and the
   * door's relation `labels` come first (`dimensionWords.ts`, lane DRILL-GAPS): a mount of a definition
   * that declares its words passes none.
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
  /**
   * The mine lane's scope in words, said in the header whenever the lane is `mine` — the door counts a
   * person's own rows across ALL her organizations (VERIFY-DRILL-LEDGER-RECORDS F4). Default "Your
   * <rowNoun>s across all your organizations" (the usage page: "Your usage across all your organizations").
   */
  mineScope?: string | undefined;
  /**
   * THE PAGE'S OWN FILTERS (lane DRILL-FLIP-FIXES N1): Dimension key → value from a visible page control
   * (the organization filter, `?org_filter=`, default All organizations), narrowing every ask — the
   * answer, the chart, the records — without becoming a crumb of the trail. Absent = none.
   */
  pageWhere?: Record<string, unknown> | undefined;
  /**
   * THE HOST'S FIXED FILTERS (lane DRILL-PRIMITIVE-3): one site's id, applied to every ask like
   * `pageWhere`, and said first in the trail as a crumb no click removes.
   */
  base?: readonly DrillExplorerBase[] | undefined;
  /**
   * THE PAGE'S SURFACE (lane DRILL-FLIP-FIXES L4): given, the explorer registers it and hands it the
   * question and its answer at read time (`drillExplorerScope.ts`), as the old Spend Explorer did.
   */
  surfaceName?: string | undefined;
  /** More controls for the header row (an "Old usage page" link). */
  headerExtras?: ReactNode;
  /** A data attribute on the root, so a host's walk can find its mount. */
  dataAttributes?: Record<string, string> | undefined;
}

/** One fixed filter of the explorer: its Dimension key and value, and the crumb's words. */
export interface DrillExplorerBase {
  key: string;
  value: string | number | boolean | null;
  /** The crumb's name ("Site"). */
  label: string;
  /** The value's words ("Acme Dental"). */
  valueLabel: string;
}
