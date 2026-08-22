/**
 * Runtime wrapper kinds — the reader, and THE elision gate.
 *
 * Cross-repo contract (system of record):
 * `common-docs/systems/content-ir-system/RUNTIME_WRAPPER_WIRE.md`.
 *
 * A runtime wrapper is the CLOSED set of envelopes that carry instance
 * context with a data kind NESTED inside: `node_outcome` (one settled node
 * invocation) and `run_result` (one terminated run, nesting one
 * `node_outcome` per terminal node). `tool_result` is registered server-side
 * but nothing emits it yet, so nothing here reads it.
 *
 * ## THE ELISION RULE — do it ONCE, here
 *
 * The payload is NEVER sent twice. On the wire `output` is `null` and
 * `output_ref` names the FRAME field that already holds the value:
 *
 *  - `"output"`              → the frame's own `output` (`node_completed.output`,
 *                              the run row's `output`).
 *  - `"output.<node_id>"`    → that key of the frame's terminal output map.
 *
 * PRESENCE OF `output_ref` IS THE MARKER. A bare `output: null` with NO ref is
 * a legitimately empty payload — never an elision, never something to go
 * looking for. This is the same rule the `__ir` envelope follows with
 * `value_ref`, for the same reason: otherwise every payload is serialized
 * twice per streamed event, twice per durable row and twice per run read.
 *
 * Rehydration happens at the single INGEST GATE (the workflow-runs reducer),
 * before anything reads the wrapper. No renderer, selector or component ever
 * sees an un-rehydrated wrapper, so none of them may re-implement this.
 *
 * ## Never load-bearing
 *
 * Assembly is a pure read. A malformed wrapper yields `null` and the frame's
 * own fields carry the surface exactly as they did before the wrapper
 * existed — additive on the wire, additive here.
 */

import { KIND_KEY } from "@ai-matrx/content-ir";

/** The registered slugs — named once, never spelled by hand elsewhere. */
export const NODE_OUTCOME_KIND = "node_outcome";
export const RUN_RESULT_KIND = "run_result";

/** One settled node invocation, with its data kind nested in `output`. */
export interface NodeOutcomeWrapper {
  __kind: typeof NODE_OUTCOME_KIND;
  run_id: string;
  node_id: string;
  workflow_id: string | null;
  step: number | null;
  attempt: number;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  /** `0` is a REAL duration, not "unknown"; `null` is unknown. */
  duration_ms: number | null;
  /** null = the node declared no kind (a loud defect, never a pass). */
  output_kind: string | null;
  /** null = never checked / degraded — NEVER renderable as a pass. */
  output_kind_ok: boolean | null;
  output_kind_errors: string[] | null;
  /** Rehydrated by {@link rehydrateNodeOutcome}; null = genuinely empty. */
  output: unknown;
}

/** One terminated run. `outputs` is one wrapper per TERMINAL node. */
export interface RunResultWrapper {
  __kind: typeof RUN_RESULT_KIND;
  run_id: string;
  workflow_id: string | null;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  duration_ms: number | null;
  output_kind: string | null;
  output: unknown;
  outputs: NodeOutcomeWrapper[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function bool(source: Record<string, unknown>, key: string): boolean | null {
  const value = source[key];
  return typeof value === "boolean" ? value : null;
}

function strings(
  source: Record<string, unknown>,
  key: string,
): string[] | null {
  const value = source[key];
  if (!Array.isArray(value)) return null;
  const out = value.filter((item): item is string => typeof item === "string");
  return out.length > 0 ? out : null;
}

/**
 * Resolve a dotted `output_ref` against the frame that carries the payload.
 * Returns `undefined` when the path does not resolve — the caller keeps
 * `output: null` rather than inventing a value.
 */
export function readOutputRef(frame: unknown, ref: string): unknown {
  let cursor: unknown = frame;
  for (const segment of ref.split(".")) {
    if (!isRecord(cursor)) return undefined;
    if (!(segment in cursor)) return undefined;
    cursor = cursor[segment];
  }
  return cursor;
}

/**
 * Read a `node_outcome` off a frame and rehydrate its elided payload.
 *
 * `frame` is the object the wrapper travelled ON — the `node_completed` event,
 * or the run read response for a `run_result`'s children. Returns null for
 * anything that is not a node_outcome (including a missing wrapper: the
 * producer fails OPEN, so an absent wrapper is a normal, non-fatal state).
 */
export function rehydrateNodeOutcome(
  raw: unknown,
  frame: unknown,
): NodeOutcomeWrapper | null {
  if (!isRecord(raw)) return null;
  if (raw[KIND_KEY] !== NODE_OUTCOME_KIND) return null;
  // THE ELISION RULE. Presence of the ref is the marker; a bare null is empty.
  const ref = str(raw, "output_ref");
  const resolved = ref === null ? undefined : readOutputRef(frame, ref);
  return readNodeOutcomeValue(
    resolved === undefined ? raw : { ...raw, output: resolved },
  );
}

/**
 * Read an ALREADY-REHYDRATED node_outcome value into its typed form.
 *
 * Deliberately does NOT require `__kind`: the render bridge strips the root
 * discriminator before the component sees the value, and it does NOT touch
 * `output_ref` — by the time anything renders, the ingest gate has already
 * resolved the elision, and a second resolution attempt against a frame that
 * is no longer there is how a payload goes missing.
 */
export function readNodeOutcomeValue(
  raw: unknown,
): NodeOutcomeWrapper | null {
  if (!isRecord(raw)) return null;
  const runId = str(raw, "run_id");
  const nodeId = str(raw, "node_id");
  if (!runId || !nodeId) return null;
  const output = raw.output ?? null;

  return {
    __kind: NODE_OUTCOME_KIND,
    run_id: runId,
    node_id: nodeId,
    workflow_id: str(raw, "workflow_id"),
    step: num(raw, "step"),
    attempt: num(raw, "attempt") ?? 1,
    status: str(raw, "status") ?? "completed",
    started_at: str(raw, "started_at"),
    ended_at: str(raw, "ended_at"),
    duration_ms: num(raw, "duration_ms"),
    output_kind: str(raw, "output_kind"),
    output_kind_ok: bool(raw, "output_kind_ok"),
    output_kind_errors: strings(raw, "output_kind_errors"),
    output,
  };
}

/**
 * Read a `run_result` off the run read response and rehydrate every elided
 * payload — its own, and each terminal node's. Both resolve against the SAME
 * frame (the run read response), which is what `"output.<node_id>"` addresses.
 */
export function rehydrateRunResult(
  raw: unknown,
  frame: unknown,
): RunResultWrapper | null {
  if (!isRecord(raw)) return null;
  if (raw[KIND_KEY] !== RUN_RESULT_KIND) return null;
  const ref = str(raw, "output_ref");
  const resolved = ref === null ? undefined : readOutputRef(frame, ref);
  const outputs = Array.isArray(raw.outputs)
    ? raw.outputs.map((child) => rehydrateNodeOutcome(child, frame) ?? child)
    : [];
  return readRunResultValue({
    ...raw,
    ...(resolved === undefined ? {} : { output: resolved }),
    outputs,
  });
}

/**
 * Read an ALREADY-REHYDRATED run_result value into its typed form. Same
 * contract as {@link readNodeOutcomeValue}: no `__kind` requirement, no
 * second elision pass.
 */
export function readRunResultValue(raw: unknown): RunResultWrapper | null {
  if (!isRecord(raw)) return null;
  const runId = str(raw, "run_id");
  if (!runId) return null;
  const output = raw.output ?? null;
  const outputs = Array.isArray(raw.outputs)
    ? raw.outputs
        .map((child) => readNodeOutcomeValue(child))
        .filter((child): child is NodeOutcomeWrapper => child !== null)
    : [];

  return {
    __kind: RUN_RESULT_KIND,
    run_id: runId,
    workflow_id: str(raw, "workflow_id"),
    status: str(raw, "status") ?? "completed",
    started_at: str(raw, "started_at"),
    ended_at: str(raw, "ended_at"),
    duration_ms: num(raw, "duration_ms"),
    output_kind: str(raw, "output_kind"),
    output,
    outputs,
  };
}

/**
 * The kind verdict, as three states the UI must keep distinct.
 *
 * `unchecked` is NEVER a pass: the engine either did not check (no declared
 * kind) or checked and could not conclude. Collapsing it into "ok" is how a
 * confidently-rendered document gets shown for a shape nobody verified.
 */
export type KindVerdict = "passed" | "failed" | "unchecked";

export function kindVerdictOf(wrapper: {
  output_kind: string | null;
  output_kind_ok: boolean | null;
}): KindVerdict {
  if (wrapper.output_kind_ok === true) return "passed";
  if (wrapper.output_kind_ok === false) return "failed";
  return "unchecked";
}
