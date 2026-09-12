/**
 * The two UNFOLDING-CASE kinds — `case_disclosure` and `unfolding_ruling`.
 *
 * Contract: `common-docs/systems/masterwork/unfolding-case-contract.md` §3.
 * Server half: aidream's `masterwork.case.disclose` graph node (the case
 * oracle) and the desk's terminal ruling step.
 *
 * ## Why these are registered kinds and not a renderer in the run box
 *
 * Because a sealed case unfolds LIVE: the desk asks, the case answers (or
 * says it cannot), and the Expert watches the ledger grow. Everything a
 * viewer sees during that run reaches it through the ONE pipeline, so both
 * shapes are registered kinds with exactly ONE component each — the run box,
 * the Audition, a window panel and a chat message all draw the identical
 * ledger because none of them owns a renderer.
 *
 * ## `case_disclosure` — the growing ledger
 *
 * One emission per disclosure step. `ledger` is CUMULATIVE (every request so
 * far, with what answered it), so the LATEST disclosure is the whole story:
 * a surface renders that one and gets the complete ledger, and a replayed run
 * rebuilds identically. `available: false` is not a failure — it is the case
 * being silent, which is precisely when the desk turns to the Expert, and the
 * component says so in those words.
 *
 * ## `unfolding_ruling` — where the desk committed
 *
 * The terminal document: the diagnosis, how sure, at which step it committed,
 * the path it took, and the dangerous branches it considered. The dangerous
 * branches are rendered even when the list is empty, because "considered
 * none" is itself the safety fact the Audition scores.
 *
 * Both bridges are COMPLETE bridges: the node emits a whole disclosure or a
 * whole ruling — there is no half-written one on the wire.
 */

import type { KindDefinition, KindSchema } from "@ai-matrx/content-ir";
import { KIND_KEY } from "@ai-matrx/content-ir";

import { makeCompleteEnvelopeBridge } from "./legacy-bridge-utils";
import {
  additionalDetailsSection,
  collectExtras,
  joinBlocks,
} from "./kind-markdown-utils";

/** The registered slugs — named once, never spelled by hand elsewhere. */
export const CASE_DISCLOSURE_KIND = "case_disclosure";
export const UNFOLDING_RULING_KIND = "unfolding_ruling";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

/**
 * The ledger, declared as an OPEN inline object rather than a third slug: a
 * ledger is never rendered on its own (a new slug is a migration, a DB row and
 * a crosswalk rule for something no reader ever sees by itself), and `open`
 * means a server that adds a field to it loses nothing on the way here.
 */
const ledgerField = (description: string) =>
  ({
    type: "inline_object",
    open: true,
    description,
    fields: {
      steps: { type: "number", description: "Disclosure steps used so far." },
      cost: { type: "number", description: "Running cost of the path taken." },
      risk: { type: "number", description: "Running risk of the path taken." },
      requests: {
        type: "json[]",
        description:
          "Every request the desk made, in order: {step, request{kind,target,question,cost,risk,rule_id}, answered_from_step, available, answered_by}.",
      },
    },
  }) as const;

export const caseDisclosureKindSchema: KindSchema = {
  kind: CASE_DISCLOSURE_KIND,
  fields: {
    disclosed: {
      type: "string[]",
      required: true,
      description:
        "The facts the case released for this request, verbatim from the sealed timeline.",
    },
    answer: {
      type: "string",
      description: "The case's answer to the request, in its own words.",
    },
    available: {
      type: "boolean",
      required: true,
      description:
        "Did the case answer at all? false means the case is silent — the desk asks the Expert instead.",
    },
    reason: {
      type: "string",
      description: "Why nothing was released, when nothing was.",
    },
    case_over: {
      type: "boolean",
      description:
        "The case has no more to give (the step ceiling, or the desk committed).",
    },
    ledger: ledgerField("Every request so far, cumulative."),
    additionalDetails: { type: "inline_object", open: true, fields: {} },
  },
};

export const unfoldingRulingKindSchema: KindSchema = {
  kind: UNFOLDING_RULING_KIND,
  fields: {
    diagnosis: {
      type: "string",
      required: true,
      description: "What the desk concluded — the answer it commits to.",
    },
    confidence: {
      type: "union",
      scalars: ["string", "number"],
      description:
        "How sure the desk is: a 0-1 number, or a word the desk used. Rendered honestly either way.",
    },
    committed_at_step: {
      type: "number",
      description: "The disclosure step at which the desk committed.",
    },
    path: ledgerField("The ledger of the path taken to get here."),
    dangerous_branches_considered: {
      type: "json[]",
      description:
        "The dangerous branches the desk weighed: a name, or {branch, why}. An empty list means none were considered — itself a safety fact.",
    },
    additionalDetails: { type: "inline_object", open: true, fields: {} },
  },
};

export const MASTERWORK_UNFOLDING_KIND_SCHEMAS: KindSchema[] = [
  caseDisclosureKindSchema,
  unfoldingRulingKindSchema,
];

// ---------------------------------------------------------------------------
// serverData bridges
// ---------------------------------------------------------------------------

/** What the desk asked the case for. */
export interface CaseRequest {
  kind: string | null;
  target: string | null;
  question: string | null;
  cost: number | null;
  risk: number | null;
  ruleId: string | null;
}

/** One row of the ledger: a request and what answered it. */
export interface CaseLedgerEntry {
  step: number | null;
  request: CaseRequest;
  /** Which timeline step the answer came from, when the case answered. */
  answeredFromStep: number | null;
  available: boolean;
  /** "case" | "human" — who answered. Null when the server did not say. */
  answeredBy: string | null;
}

export interface CaseLedger {
  steps: number | null;
  cost: number | null;
  risk: number | null;
  requests: CaseLedgerEntry[];
}

export interface CaseDisclosureData {
  disclosed: string[];
  answer: string | null;
  available: boolean;
  reason: string | null;
  caseOver: boolean;
  ledger: CaseLedger;
}

/** One dangerous branch, as the judge scores it. */
export interface DangerousBranch {
  branch: string;
  why: string | null;
}

export interface UnfoldingRulingData {
  diagnosis: string;
  /** Verbatim, already formatted for a reader ("high", "72%"). */
  confidence: string | null;
  committedAtStep: number | null;
  path: CaseLedger;
  dangerousBranches: DangerousBranch[];
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => text(item))
    .filter((item): item is string => item !== null);
}

function readRequest(value: unknown): CaseRequest {
  const raw = isRecordValue(value) ? value : {};
  return {
    kind: text(raw.kind),
    target: text(raw.target),
    question: text(raw.question),
    cost: num(raw.cost),
    risk: num(raw.risk),
    ruleId: text(raw.rule_id),
  };
}

function readLedgerEntries(value: unknown): CaseLedgerEntry[] {
  if (!Array.isArray(value)) return [];
  const out: CaseLedgerEntry[] = [];
  for (const item of value) {
    if (!isRecordValue(item)) continue;
    out.push({
      step: num(item.step),
      request: readRequest(item.request),
      answeredFromStep: num(item.answered_from_step),
      // Absent reads as ANSWERED only when the server said so: a row whose
      // availability is unknown must not be drawn as a confident answer.
      available: item.available === true,
      answeredBy: text(item.answered_by),
    });
  }
  return out;
}

export function readCaseLedger(value: unknown): CaseLedger {
  const raw = isRecordValue(value) ? value : {};
  return {
    steps: num(raw.steps),
    cost: num(raw.cost),
    risk: num(raw.risk),
    requests: readLedgerEntries(raw.requests),
  };
}

/** The canonical reading of a `case_disclosure` value — one implementation. */
export function readCaseDisclosure(
  value: Record<string, unknown>,
): CaseDisclosureData {
  return {
    disclosed: strings(value.disclosed),
    answer: text(value.answer),
    available: value.available === true,
    reason: text(value.reason),
    caseOver: value.case_over === true,
    ledger: readCaseLedger(value.ledger),
  };
}

/** The canonical reading of an `unfolding_ruling` value. */
export function readUnfoldingRuling(
  value: Record<string, unknown>,
): UnfoldingRulingData | undefined {
  const diagnosis = text(value.diagnosis);
  // A ruling with no diagnosis is not a ruling — render nothing rather than an
  // empty verdict card claiming the desk decided something.
  if (!diagnosis) return undefined;
  const rawConfidence = value.confidence;
  const confidence =
    typeof rawConfidence === "number" && Number.isFinite(rawConfidence)
      ? rawConfidence <= 1
        ? `${Math.round(rawConfidence * 100)}%`
        : `${rawConfidence}`
      : text(rawConfidence);
  const branches: DangerousBranch[] = Array.isArray(
    value.dangerous_branches_considered,
  )
    ? value.dangerous_branches_considered
        .map((item): DangerousBranch | null => {
          const name = text(item);
          if (name) return { branch: name, why: null };
          if (!isRecordValue(item)) return null;
          const branch = text(item.branch) ?? text(item.name);
          if (!branch) return null;
          return { branch, why: text(item.why) ?? text(item.note) };
        })
        .filter((item): item is DangerousBranch => item !== null)
    : [];
  return {
    diagnosis,
    confidence,
    committedAtStep: num(value.committed_at_step),
    path: readCaseLedger(value.path),
    dangerousBranches: branches,
  };
}

export const caseDisclosureServerData = makeCompleteEnvelopeBridge<
  CaseDisclosureData & Record<string, unknown>
>(
  CASE_DISCLOSURE_KIND,
  (value) =>
    readCaseDisclosure(value) as CaseDisclosureData & Record<string, unknown>,
);

export const unfoldingRulingServerData = makeCompleteEnvelopeBridge<
  UnfoldingRulingData & Record<string, unknown>
>(
  UNFOLDING_RULING_KIND,
  (value) =>
    readUnfoldingRuling(value) as
      | (UnfoldingRulingData & Record<string, unknown>)
      | undefined,
);

// ---------------------------------------------------------------------------
// toMarkdown — the same ledger, in prose
// ---------------------------------------------------------------------------

const DISCLOSURE_KNOWN_KEYS = [
  "disclosed",
  "answer",
  "available",
  "reason",
  "case_over",
  "ledger",
  KIND_KEY,
];

const RULING_KNOWN_KEYS = [
  "diagnosis",
  "confidence",
  "committed_at_step",
  "path",
  "dangerous_branches_considered",
  KIND_KEY,
];

/** "step 3 · test — lumbar puncture" — one ledger row as a sentence. */
export function describeLedgerEntry(entry: CaseLedgerEntry): string {
  const asked = [entry.request.kind, entry.request.target]
    .filter((part): part is string => Boolean(part))
    .join(" — ");
  const answered = entry.available
    ? entry.answeredBy === "human"
      ? "the Expert answered"
      : entry.answeredFromStep !== null
        ? `the case answered from step ${entry.answeredFromStep}`
        : "the case answered"
    : "the case does not say → asked the Expert";
  return `${entry.step !== null ? `Step ${entry.step}` : "Step"} · ${asked || "a request"} · ${answered}`;
}

function ledgerMarkdown(ledger: CaseLedger): string | null {
  if (ledger.requests.length === 0) return null;
  return joinBlocks([
    "### The path so far",
    ledger.requests.map((entry) => `- ${describeLedgerEntry(entry)}`).join("\n"),
    `*Steps ${ledger.steps ?? ledger.requests.length} · cost ${ledger.cost ?? 0} · risk ${ledger.risk ?? 0}*`,
  ]);
}

export function caseDisclosureMarkdown(value: Record<string, unknown>): string {
  const data = readCaseDisclosure(value);
  return joinBlocks([
    "## What the case released",
    data.available
      ? (data.answer ?? "The case answered.")
      : `The case does not say${data.reason ? ` — ${data.reason}` : ""}. The Expert was asked instead.`,
    data.disclosed.length > 0
      ? data.disclosed.map((fact) => `- ${fact}`).join("\n")
      : null,
    ledgerMarkdown(data.ledger),
    data.caseOver ? "*The case is over.*" : null,
    additionalDetailsSection(collectExtras(value, DISCLOSURE_KNOWN_KEYS)),
  ]);
}

export function unfoldingRulingMarkdown(value: Record<string, unknown>): string {
  const data = readUnfoldingRuling(value);
  if (!data) return "";
  return joinBlocks([
    "## The ruling",
    data.diagnosis,
    [
      data.confidence ? `Confidence: ${data.confidence}` : null,
      data.committedAtStep !== null
        ? `Committed at step ${data.committedAtStep}`
        : null,
    ]
      .filter((part): part is string => part !== null)
      .join(" · ") || null,
    ledgerMarkdown(data.path),
    "### Dangerous branches considered",
    data.dangerousBranches.length > 0
      ? data.dangerousBranches
          .map(
            (branch) =>
              `- ${branch.branch}${branch.why ? ` — ${branch.why}` : ""}`,
          )
          .join("\n")
      : "None were considered.",
    additionalDetailsSection(collectExtras(value, RULING_KNOWN_KEYS)),
  ]);
}

// ---------------------------------------------------------------------------
// Compiled definitions
// ---------------------------------------------------------------------------

export const MASTERWORK_UNFOLDING_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: CASE_DISCLOSURE_KIND,
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: CASE_DISCLOSURE_KIND,
    toLegacyServerData: caseDisclosureServerData,
    toMarkdown: caseDisclosureMarkdown,
    persistence: { persistStructured: true },
    loadingComponent: "list",
    schema: caseDisclosureKindSchema,
  },
  {
    kind: UNFOLDING_RULING_KIND,
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: UNFOLDING_RULING_KIND,
    toLegacyServerData: unfoldingRulingServerData,
    toMarkdown: unfoldingRulingMarkdown,
    persistence: { persistStructured: true },
    loadingComponent: "list",
    schema: unfoldingRulingKindSchema,
  },
];
