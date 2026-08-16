/**
 * `plan_page_review` (+ child `plan_review_issue`) — the Website Factory's
 * editorial pass over a page draft, AND the revised draft it produced.
 *
 * Produced by the per-page pipeline's P5 reviewer
 * (`aidream/services/content_plan/page_pipeline.py` → `PageReview`), persisted
 * as a `plan.node_artifact` on step `p5_review`.
 *
 * Canonical `__kind` JSON shape:
 *   { "__kind":"plan_page_review", "verdict":"revised",
 *     "issues":[ { "severity":"blocker", "section":"…",
 *                  "problem":"…", "fix":"…" } ],
 *     "revised": { …a plan_page_draft… } }
 *
 * FIELD PARITY is with `PageReview` / `ReviewIssue` in that module
 * (`extra="forbid"` on both).
 *
 * 🚨 `issues` IS THE VALUABLE PART. This pass has caught fabricated facts in
 * production. It is the reason a non-technical page owner can trust what the
 * factory wrote, so it renders as plain language ranked by severity — never a
 * JSON array, never a collapsed count.
 *
 * `revised` IS a `plan_page_draft` and is declared as one (`{type:"object",
 * kind:"plan_page_draft"}`), so the parser types it and the review component
 * composes THE draft component's exported parts rather than re-rendering a
 * draft by hand — THE CANONICAL COMPONENT LAW's parent/child escape hatch, the
 * only sanctioned way to show part of another shape. On an `approved` verdict
 * `revised` is the input draft unchanged; it is always present.
 *
 * WHY THE NESTED DRAFT CARRIES NO `__kind`: the reviewer emits a bare object;
 * speculative descent commits it from this field's `kind` prediction. Designed
 * path — do not stamp a discriminator the server has never written.
 *
 * The bridge is STREAMING: `issues` is an array of a CHILD KIND, so issues
 * appear one at a time and a still-empty list is a normal mid-stream state.
 */

import type { CanonicalBlockIR } from "../core/ir-types";
import type { KindSchema } from "../core/kind-schema.types";
import type { KindDefinition } from "../registry/kind-registry.types";
import { isRecord } from "./legacy-bridge-utils";
import {
  additionalDetailsSection,
  collectExtras,
  joinBlocks,
} from "./kind-markdown-utils";
import {
  planPageDraftBodyMarkdown,
  readPlanPageDraftValue,
  type PlanPageDraftData,
} from "./plan-page-draft";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

/** Worst first — the render order, and the sort key the component uses. */
export const REVIEW_SEVERITIES = ["blocker", "important", "minor"] as const;

export type ReviewSeverity = (typeof REVIEW_SEVERITIES)[number];

export const planReviewIssueKindSchema: KindSchema = {
  kind: "plan_review_issue",
  fields: {
    severity: {
      type: "enum",
      values: [...REVIEW_SEVERITIES],
      description:
        "How badly this hurts the page — blocker (must not publish), important, or minor.",
      default: "minor",
    },
    section: {
      type: "string",
      description:
        "The section heading this applies to. Empty means it applies to the whole page.",
    },
    problem: {
      type: "string",
      required: true,
      description: "What is wrong, stated plainly.",
    },
    fix: {
      type: "string",
      description: "What to do about it.",
    },
  },
};

export const planPageReviewKindSchema: KindSchema = {
  kind: "plan_page_review",
  fields: {
    verdict: {
      type: "enum",
      values: ["approved", "revised"],
      description:
        "`approved` — the draft stands as written. `revised` — the reviewer rewrote it.",
      default: "revised",
    },
    issues: {
      type: "array",
      itemKinds: ["plan_review_issue"],
      description: "Everything the review found, worst first.",
    },
    revised: {
      type: "object",
      kind: "plan_page_draft",
      required: true,
      description:
        "The improved draft. On an `approved` verdict this is the input draft, unchanged.",
    },
  },
};

export const PLAN_PAGE_REVIEW_KIND_SCHEMAS: KindSchema[] = [
  planPageReviewKindSchema,
  planReviewIssueKindSchema,
];

// ---------------------------------------------------------------------------
// serverData bridge — STREAMING.
// ---------------------------------------------------------------------------

export interface PlanReviewIssueData {
  severity: ReviewSeverity;
  section: string;
  problem: string;
  fix: string;
}

export interface PlanPageReviewData {
  verdict: "approved" | "revised" | null;
  issues: PlanReviewIssueData[];
  /** Always projected through the DRAFT's own reader — never a second parse. */
  revised: PlanPageDraftData;
  hasRevised: boolean;
  isComplete: boolean;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function severityOf(value: unknown): ReviewSeverity {
  return REVIEW_SEVERITIES.includes(value as ReviewSeverity)
    ? (value as ReviewSeverity)
    : "minor";
}

/**
 * Worst first. A mid-stream issue without a `problem` is dropped rather than
 * rendered as an empty row — the same reflex every child-kind list here uses.
 */
export function readReviewIssues(value: unknown): PlanReviewIssueData[] {
  if (!Array.isArray(value)) return [];
  const out: PlanReviewIssueData[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const problem = stringOr(entry.problem, "");
    if (!problem) continue;
    out.push({
      severity: severityOf(entry.severity),
      section: stringOr(entry.section, ""),
      problem,
      fix: stringOr(entry.fix, ""),
    });
  }
  return out.sort(
    (a, b) =>
      REVIEW_SEVERITIES.indexOf(a.severity) -
      REVIEW_SEVERITIES.indexOf(b.severity),
  );
}

export function planPageReviewServerDataFromEnvelope(
  envelope: CanonicalBlockIR,
): (PlanPageReviewData & Record<string, unknown>) | undefined {
  if (envelope.root.kind !== "plan_page_review") return undefined;

  const value = envelope.root.value;
  const verdict = value.verdict;
  const isComplete = envelope.root.status === "complete";
  const revisedValue = value.revised;

  return {
    verdict:
      verdict === "approved" || verdict === "revised" ? verdict : null,
    issues: readReviewIssues(value.issues),
    revised: {
      ...readPlanPageDraftValue(revisedValue),
      // The nested draft is finished exactly when the review is.
      isComplete,
    },
    hasRevised: isRecord(revisedValue),
    isComplete,
  };
}

// ---------------------------------------------------------------------------
// toMarkdown facet
// ---------------------------------------------------------------------------

const MD_KNOWN_KEYS = ["verdict", "issues", "revised"];

const SEVERITY_LABEL: Record<ReviewSeverity, string> = {
  blocker: "Blocker",
  important: "Important",
  minor: "Minor",
};

export function planPageReviewMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const issues = readReviewIssues(value.issues);
  const verdict = value.verdict;
  const issueLines =
    issues.length > 0
      ? issues
          .map((issue) => {
            const where = issue.section ? ` (${issue.section})` : "";
            const fix = issue.fix ? `\n  - Fix: ${issue.fix}` : "";
            return `- **${SEVERITY_LABEL[issue.severity]}**${where} — ${issue.problem}${fix}`;
          })
          .join("\n")
      : "_(nothing flagged)_";

  const revisedBody = isRecord(value.revised)
    ? planPageDraftBodyMarkdown(value.revised)
    : "";

  return joinBlocks([
    "# Page review",
    verdict === "approved"
      ? "**Verdict:** approved — the draft stands as written."
      : verdict === "revised"
        ? "**Verdict:** revised — the reviewer rewrote the page."
        : null,
    "## What the review found",
    issueLines,
    revisedBody ? joinBlocks(["## The revised page", revisedBody]) : null,
    additionalDetailsSection(collectExtras(value, MD_KNOWN_KEYS)),
  ]);
}

// ---------------------------------------------------------------------------
// Compiled definitions — registered centrally in system-kinds.ts.
// ---------------------------------------------------------------------------

export const PLAN_PAGE_REVIEW_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "plan_page_review",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "plan_page_review",
    toLegacyServerData: planPageReviewServerDataFromEnvelope,
    toMarkdown: planPageReviewMarkdownFromValue,
    persistence: { persistStructured: true },
    loadingComponent: "list",
    schema: planPageReviewKindSchema,
  },
  {
    kind: "plan_review_issue",
    schemaSource: "system",
    tier: "eager",
    schema: planReviewIssueKindSchema,
  },
];
