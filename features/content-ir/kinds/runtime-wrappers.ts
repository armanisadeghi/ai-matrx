/**
 * `node_outcome` / `run_result` — the RUNTIME WRAPPER kinds, and the layer
 * boundary they exist to hold.
 *
 * Cross-repo contract (system of record):
 * `common-docs/systems/content-ir-system/RUNTIME_WRAPPER_WIRE.md`.
 * Layer model: `KINDS_EVERYWHERE_PLAN.md` §4.1.
 *
 * ## Two layers, and the line between them
 *
 * A DATA kind is a portable shape — it travels and renders anywhere. A
 * RUNTIME WRAPPER is the closed set of envelopes that carry INSTANCE CONTEXT
 * with a data kind nested inside: which workflow, which node, which attempt,
 * how long it took, and whether the engine's kind check passed. A wrapper
 * never absorbs payload fields, and a payload never carries runtime fields.
 *
 * 🚨 **DELEGATE, NEVER REIMPLEMENT.** The component for a wrapper renders
 * PROVENANCE CHROME ONLY and then hands the nested `output` back to the kind
 * registry, so the data kind's own component draws it — recursion all the way
 * down. A wrapper component that re-renders a payload itself is exactly the
 * corruption the layer model exists to undo.
 *
 * Edges are NOT in this picture (ratified): a workflow edge carries the data
 * kind only. The wrapper exists at persistence and at transport to the UI,
 * nowhere else.
 *
 * ## Why compiled kinds rather than DB-authored components
 *
 * Both kinds are python-owned: `data` is NULL and the contract is
 * `emitted_json_schema`, derived from the `NodeOutcomeWrapper` /
 * `RunResultWrapper` pydantic models. The content_ir adapter declines to
 * flatten such a contract into a `KindSchema`, so the WARM registry never
 * delivers one — a DB-authored component would render where the caller hands
 * over a complete envelope and nowhere else. Same trade-off, same reasoning
 * as `agent_result` (see kinds/agent-result.ts); the bootstrap schemas below
 * mirror the pydantic models and must move with them.
 *
 * COMPLETE bridges, deliberately: a wrapper describes SETTLED work — a node
 * that finished, a run that terminated. There is no half-finished one to
 * render (that is the `__ir_partial` channel, on its own contract).
 */

import type { KindSchema } from "@ai-matrx/content-ir";
import type { KindDefinition } from "@ai-matrx/content-ir";
import {
  NODE_OUTCOME_KIND,
  RUN_RESULT_KIND,
  readNodeOutcomeValue,
  readRunResultValue,
  type NodeOutcomeWrapper,
  type RunResultWrapper,
} from "../core/runtime-wrapper";
import { makeCompleteEnvelopeBridge } from "./legacy-bridge-utils";
import { humanizeKind, joinBlocks } from "./kind-markdown-utils";

export { NODE_OUTCOME_KIND, RUN_RESULT_KIND };

// ---------------------------------------------------------------------------
// Schemas — the compiled bootstrap mirroring the pydantic wrapper models
// ---------------------------------------------------------------------------

/** Shared provenance/verdict fields — one definition, both wrappers. */
const TIMING_FIELDS: KindSchema["fields"] = {
  status: {
    type: "string",
    description: "How the work settled — completed, failed, cancelled.",
  },
  started_at: { type: "string", nullable: true, description: "ISO start." },
  ended_at: { type: "string", nullable: true, description: "ISO end." },
  duration_ms: {
    type: "number",
    nullable: true,
    description: "Wall-clock time in ms. 0 is a REAL duration, not 'unknown'.",
  },
};

export const nodeOutcomeKindSchema: KindSchema = {
  kind: NODE_OUTCOME_KIND,
  fields: {
    run_id: { type: "string", required: true, description: "The run." },
    node_id: { type: "string", required: true, description: "The node." },
    workflow_id: {
      type: "string",
      nullable: true,
      description: "The workflow definition this invocation belongs to.",
    },
    step: { type: "number", nullable: true, description: "Step index." },
    attempt: { type: "number", description: "Which attempt settled." },
    ...TIMING_FIELDS,
    output_kind: {
      type: "string",
      nullable: true,
      description:
        "The kind the node declared it produces. Null = it declared none — a loud defect, never a pass.",
    },
    output_kind_ok: {
      type: "boolean",
      nullable: true,
      description:
        "The engine's drift verdict. Null = never checked / degraded, and NEVER renderable as a pass.",
    },
    output_kind_errors: {
      type: "string[]",
      nullable: true,
      description: "Why the check failed, when it did.",
    },
    output: {
      type: "json",
      nullable: true,
      description:
        "The nested data-kind instance — delegated to its own component, never re-rendered here.",
    },
    // Declared so the parser keeps it in the value rather than pushing it into
    // residue. Resolved ONCE at the ingest gate (core/runtime-wrapper.ts) and
    // never read again past it.
    output_ref: {
      type: "string",
      nullable: true,
      description:
        "Elision marker: the frame field holding the payload, so it is never serialized twice.",
    },
  },
};

export const runResultKindSchema: KindSchema = {
  kind: RUN_RESULT_KIND,
  fields: {
    run_id: { type: "string", required: true, description: "The run." },
    workflow_id: {
      type: "string",
      required: true,
      description: "The workflow that ran.",
    },
    ...TIMING_FIELDS,
    output_kind: {
      type: "string",
      nullable: true,
      description:
        "Set only when the run ends in ONE terminal payload that declared a kind.",
    },
    output: {
      type: "json",
      nullable: true,
      description: "The run's terminal payload as the engine records it.",
    },
    output_ref: {
      type: "string",
      nullable: true,
      description: "Elision marker — see node_outcome.",
    },
    outputs: {
      type: "array",
      itemKinds: [NODE_OUTCOME_KIND],
      description: "One node_outcome per TERMINAL node, each nesting its kind.",
    },
  },
};

// ---------------------------------------------------------------------------
// serverData bridges
// ---------------------------------------------------------------------------

/** Exactly what `NodeOutcomeBlock` renders. */
export interface NodeOutcomeData extends Record<string, unknown> {
  wrapper: NodeOutcomeWrapper;
}

/** Exactly what `RunResultBlock` renders. */
export interface RunResultData extends Record<string, unknown> {
  wrapper: RunResultWrapper;
}

// `strip: "root"` is load-bearing on both: the nested `output` is a data-kind
// instance whose OWN `__kind` is the only thing that routes it to its
// component. Stripping deep would erase it and cost the payload its renderer —
// the exact corruption the delegation law forbids.
export const nodeOutcomeServerData = makeCompleteEnvelopeBridge<NodeOutcomeData>(
  NODE_OUTCOME_KIND,
  (value) => {
    const wrapper = readNodeOutcomeValue(value);
    return wrapper ? { wrapper } : undefined;
  },
  { strip: "root" },
);

export const runResultServerData = makeCompleteEnvelopeBridge<RunResultData>(
  RUN_RESULT_KIND,
  (value) => {
    const wrapper = readRunResultValue(value);
    return wrapper ? { wrapper } : undefined;
  },
  { strip: "root" },
);

// ---------------------------------------------------------------------------
// toMarkdown — provenance, then the payload handed on
// ---------------------------------------------------------------------------

function provenanceLines(wrapper: {
  workflow_id: string | null;
  duration_ms: number | null;
  status: string;
}): string[] {
  const lines: string[] = [`- Status: ${wrapper.status}`];
  if (wrapper.workflow_id) lines.push(`- Workflow: ${wrapper.workflow_id}`);
  if (wrapper.duration_ms !== null) {
    lines.push(`- Took: ${wrapper.duration_ms} ms`);
  }
  return lines;
}

function payloadBlock(output: unknown): string | null {
  if (output === null || output === undefined) return null;
  try {
    return "```json\n" + JSON.stringify(output, null, 2) + "\n```";
  } catch {
    return null;
  }
}

function nodeOutcomeMarkdownFrom(wrapper: NodeOutcomeWrapper): string {
  return joinBlocks([
    `# ${wrapper.node_id}`,
    `*${humanizeKind(NODE_OUTCOME_KIND)}*`,
    [
      ...provenanceLines(wrapper),
      `- Shape: ${wrapper.output_kind ?? "not declared"}${
        wrapper.output_kind_ok === true
          ? " (checked)"
          : wrapper.output_kind_ok === false
            ? " (check FAILED)"
            : " (unchecked)"
      }`,
    ].join("\n"),
    payloadBlock(wrapper.output),
  ]);
}

export function nodeOutcomeMarkdown(value: Record<string, unknown>): string {
  const wrapper = readNodeOutcomeValue(value);
  return wrapper ? nodeOutcomeMarkdownFrom(wrapper) : "";
}

export function runResultMarkdown(value: Record<string, unknown>): string {
  const wrapper = readRunResultValue(value);
  if (!wrapper) return "";
  return joinBlocks([
    `# ${humanizeKind(RUN_RESULT_KIND)}`,
    provenanceLines(wrapper).join("\n"),
    ...wrapper.outputs.map(nodeOutcomeMarkdownFrom),
    wrapper.outputs.length > 0 ? null : payloadBlock(wrapper.output),
  ]);
}

// ---------------------------------------------------------------------------
// Compiled definitions
// ---------------------------------------------------------------------------

export const RUNTIME_WRAPPER_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: NODE_OUTCOME_KIND,
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: NODE_OUTCOME_KIND,
    toLegacyServerData: nodeOutcomeServerData,
    toMarkdown: nodeOutcomeMarkdown,
    schema: nodeOutcomeKindSchema,
  },
  {
    kind: RUN_RESULT_KIND,
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: RUN_RESULT_KIND,
    toLegacyServerData: runResultServerData,
    toMarkdown: runResultMarkdown,
    schema: runResultKindSchema,
  },
];
