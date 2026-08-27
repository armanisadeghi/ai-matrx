/**
 * THE FINDING CATALOG — one declared row per Shape Doctor finding code.
 *
 * Why this file exists: the board used to render findings as an undifferentiated
 * list of red lines. On 2026-08-26 that list was 130 reds, of which 119 were
 * BOOKKEEPING (a committed generated snapshot had gone stale) and 11 were real
 * system defects. An admin cannot find 11 in 130. The difference between
 * "something is broken" and "a JSON file in the repo is out of date" is the
 * single most load-bearing fact about a finding, so it is DECLARED here, per
 * code, next to the honest answer to "can I do anything about this from a
 * browser?".
 *
 * TWO LAWS THIS FILE OBEYS
 *
 *  1. EVERY CODE IS ALWAYS RENDERED, INCLUDING AT ZERO. A code sitting at zero
 *     is information — it says that class of defect is currently clean. Hiding
 *     it turns the summary into a list of today's problems instead of a status
 *     board. The catalog is a `Record<FindingCode, …>`, so the compiler refuses
 *     a new code in `shape-doctor.ts` that nobody described here.
 *
 *  2. A COUNT THAT CANNOT BE NON-ZERO MUST NEVER READ AS A PASS. Two codes
 *     (`coverage-input-missing`, `detector-extract-failed`) are raised ONLY by
 *     the CLI — the board's inputs are bundled, so it can never observe them.
 *     They carry `measuredOnBoard: false` and render as "not measured here",
 *     never as a green zero. Same discipline as the fallback law: a check that
 *     cannot fail is worse than no check.
 *
 * Pure module — no React, no server imports. Shared by the server summary
 * builder and the client cards.
 */

import type {
  FindingCode,
  FindingSeverity,
} from "@/features/content-ir/registry/shape-doctor";

/**
 * WHERE a finding of this code actually gets closed. This is the honest answer
 * to "can the admin fix this from the browser", and it drives the card's
 * labelling — never optimism.
 */
export type FindingResolutionLane =
  /** Decidable and writable right here, on the finding's resolution surface. */
  | "resolve-here"
  /** Closed on the kind's own detail page (add an example, register a component…). */
  | "kind-surface"
  /** Bookkeeping: a committed generated snapshot is stale. A CLI refresh + commit
   *  is the ONLY fix — no browser click can regenerate a file in the repo. */
  | "cli-refresh"
  /** Needs a source change in this repo (a detector literal, a dispatch key). */
  | "code-change";

export interface FindingCodeSpec {
  code: FindingCode;
  /** Human title for the card. */
  label: string;
  severity: FindingSeverity;
  lane: FindingResolutionLane;
  /** What the finding means, in one sentence an admin can act on. */
  what: string;
  /** What closing it takes. */
  how: string;
  /** The exact command, for `cli-refresh` codes. */
  command?: string;
  /**
   * False when the live board physically cannot observe this code (CLI-only
   * emission). Such a card reports "not measured here", never a green zero.
   */
  measuredOnBoard: boolean;
}

export const FINDING_CATALOG: Record<FindingCode, FindingCodeSpec> = {
  // ── red ──────────────────────────────────────────────────────────────────
  "duplicate-skill": {
    code: "duplicate-skill",
    label: "Duplicate skill",
    severity: "red",
    lane: "resolve-here",
    what: "Two or more render_block skills teach the same kind in the same syntax. R9 is ONE skill per kind per syntax, so the model gets contradictory teaching for one shape.",
    how: "Decide which skill OWNS the kind. Usually one skill is named for a container kind and merely embeds this one as a child — that skill is not the owner. The decision is recorded on the kind, non-destructively; no skill is deleted.",
    measuredOnBoard: true,
  },
  "active-gate-fail": {
    code: "active-gate-fail",
    label: "Active gate failure",
    severity: "red",
    lane: "kind-surface",
    what: "The kind is ACTIVE but its canonical example does not validate against its own schema — it is live and promising a shape it cannot prove.",
    how: "On the kind's page: fix the schema or the example so the structural gate passes, or deactivate the kind until it does.",
    measuredOnBoard: true,
  },
  "component-without-schema": {
    code: "component-without-schema",
    label: "Component without schema",
    severity: "red",
    lane: "kind-surface",
    what: "A kind_component is registered to render a kind that declares no emitted_json_schema — the renderer has nothing to render against.",
    how: "On the kind's page: give the kind an emitted_json_schema, or retire the component registration.",
    measuredOnBoard: true,
  },
  "dangling-component-key": {
    code: "dangling-component-key",
    label: "Dangling component key",
    severity: "red",
    lane: "code-change",
    what: "A bundled kind_component names a component_key that resolveBlockDispatch has no entry for — the row points at a renderer that does not exist.",
    how: "Add the key to the block dispatch table in this repo, or repoint the component row at a key that exists.",
    measuredOnBoard: true,
  },
  "manual-data-only-flag": {
    code: "manual-data-only-flag",
    label: "Manual data-only flag returned",
    severity: "red",
    lane: "code-change",
    what: "A kind_definition row carries metadata.data_only. That per-row flag was eradicated 2026-08-27 (Arman's ruling) — the render-leg exemption is FAMILY-derived only (workflow_io/tool_io/action_io), with no per-row override. Zero backlog by construction.",
    how: "Strip the key: UPDATE content_ir.kind_definition SET metadata = metadata - 'data_only' WHERE id = '<id>'. Then find and fix whatever code path wrote it — none should.",
    measuredOnBoard: true,
  },
  "unknown-loading-component": {
    code: "unknown-loading-component",
    label: "Unknown loading component",
    severity: "red",
    lane: "kind-surface",
    what: "The kind declares a loading_component slug that is not in the loading library — while it streams, the loader silently falls back.",
    how: "On the kind's page: set metadata.loading_component to a slug the loading library actually ships.",
    measuredOnBoard: true,
  },
  "surface-token-undetectable": {
    code: "surface-token-undetectable",
    label: "Undetectable surface token",
    severity: "red",
    lane: "code-change",
    what: "An ACTIVE kind_surface declares a token no host literal can fire — the surface is registered but nothing on the client will ever detect it.",
    how: "Register the token in the host detector literals in this repo, or deactivate the surface row.",
    measuredOnBoard: true,
  },
  "vocab-unclassified": {
    code: "vocab-unclassified",
    label: "Vocabulary unclassified",
    severity: "red",
    lane: "cli-refresh",
    what: "BOOKKEEPING. A kind, detector or surface name is missing from the committed content-vocab crosswalk. The system is fine; the committed file is behind.",
    how: "Regenerate the crosswalk and commit it. Nothing in the browser can write a file in the repo.",
    command: "pnpm check:shapes:crosswalk:refresh",
    measuredOnBoard: true,
  },
  "contract-gap": {
    code: "contract-gap",
    label: "Contract manifest gap",
    severity: "red",
    lane: "cli-refresh",
    what: "BOOKKEEPING. The committed content-ir contract manifest disagrees with the live catalog for a generated contract family.",
    how: "Regenerate the manifest and commit it.",
    command: "pnpm check:shapes:manifest:refresh",
    measuredOnBoard: true,
  },
  "snapshot-drift": {
    code: "snapshot-drift",
    label: "Snapshot drift",
    severity: "red",
    lane: "cli-refresh",
    what: "BOOKKEEPING. Live per-kind asset statuses differ from the committed shapes-status snapshot. The board measures this itself as drifted rows.",
    how: "Regenerate the status snapshot and commit it.",
    command: "pnpm check:shapes:refresh",
    measuredOnBoard: true,
  },
  "coverage-input-missing": {
    code: "coverage-input-missing",
    label: "Coverage input missing",
    severity: "red",
    lane: "cli-refresh",
    what: "The crosswalk or contract manifest could not be read at all, so the coverage gate ran BLIND. Raised only by the CLI — this board reads bundled copies and can never observe it.",
    how: "Run the CLI check locally; it reports which input is unreadable.",
    command: "pnpm check:shapes",
    measuredOnBoard: false,
  },
  "detector-extract-failed": {
    code: "detector-extract-failed",
    label: "Detector extract failed",
    severity: "red",
    lane: "code-change",
    what: "A frozen detector literal vanished from its source file, so the detector census is blind. Raised only by the CLI — the board reports the same condition as a degradation warning instead.",
    how: "Restore the literal in the named source file, or update the frozen literal the extractor looks for.",
    command: "pnpm check:shapes",
    measuredOnBoard: false,
  },

  // ── yellow ───────────────────────────────────────────────────────────────
  "no-loading-component": {
    code: "no-loading-component",
    label: "No loading component",
    severity: "yellow",
    lane: "kind-surface",
    what: "The kind renders but declares no loader and its shape derives none — while it streams the reader watches a shapeless generic skeleton.",
    how: "On the kind's page: set metadata.loading_component to a loading-library slug.",
    measuredOnBoard: true,
  },
  "no-example": {
    code: "no-example",
    label: "No example",
    severity: "yellow",
    lane: "kind-surface",
    what: "The kind has no example at all, so nothing proves its schema describes real data.",
    how: "On the kind's page: add an example and mark it canonical.",
    measuredOnBoard: true,
  },
  "no-canonical-example": {
    code: "no-canonical-example",
    label: "No canonical example",
    severity: "yellow",
    lane: "kind-surface",
    what: "Examples exist but none is marked canonical (or only interim sample_data does the job), so the gate has no authoritative specimen.",
    how: "On the kind's page: promote one example to canonical.",
    measuredOnBoard: true,
  },
  "no-skill": {
    code: "no-skill",
    label: "No skill",
    severity: "yellow",
    lane: "kind-surface",
    what: "No render_block skill teaches this kind, so no model is ever told how to emit it.",
    how: "Author a render_block skill whose body demonstrates the kind's canonical `__kind` JSON.",
    measuredOnBoard: true,
  },
  "no-content-block": {
    code: "no-content-block",
    label: "No content block",
    severity: "yellow",
    lane: "kind-surface",
    what: "No render definition template references this kind's canonical `__kind` slug.",
    how: "Add a render definition whose template emits the kind.",
    measuredOnBoard: true,
  },
  "stale-example": {
    code: "stale-example",
    label: "Stale example",
    severity: "yellow",
    lane: "kind-surface",
    what: "The kind's schema was updated after its example was — the specimen may no longer describe the shape.",
    how: "On the kind's page: re-validate the example against the current schema and re-save it.",
    measuredOnBoard: true,
  },
  "detector-token-unregistered": {
    code: "detector-token-unregistered",
    label: "Detector token unregistered",
    severity: "yellow",
    lane: "code-change",
    what: "A host detector literal fires for a token no kind_surface row declares — the host detects something the registry does not know about.",
    how: "Register a kind_surface for the token, or remove the host literal in this repo.",
    measuredOnBoard: true,
  },
};

/** Stable render order: reds first, then yellows; alphabetical within severity. */
export const FINDING_CATALOG_ORDER: FindingCodeSpec[] = Object.values(
  FINDING_CATALOG,
).sort((a, b) => {
  if (a.severity !== b.severity) return a.severity === "red" ? -1 : 1;
  return a.code.localeCompare(b.code);
});

/** `true` when the code names a stale committed file rather than a broken system. */
export function isBookkeeping(spec: FindingCodeSpec): boolean {
  return spec.lane === "cli-refresh";
}

export function findingSpec(code: string): FindingCodeSpec | undefined {
  return FINDING_CATALOG[code as FindingCode];
}
