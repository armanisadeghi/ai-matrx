/**
 * `agent_result` — the canonical output of every matrx-ai graph action, and
 * the shape that taught us an envelope is not an answer.
 *
 * ## The defect this kind exists to close
 *
 * `agent_result` was registered and ACTIVE in `content_ir.kind_definition`
 * with ZERO `content_ir.kind_component` rows, so every surface rendering a
 * value of this kind fell through to the generic JSON viewer and printed the
 * whole run envelope: `usage` (per-model token counts and dollar cost),
 * `messages` (the verbatim system and user prompt), `metadata`, `request_id`,
 * `conversation_id` — beside the two keys anyone actually wants. A learner
 * opening the "Study notes" box of a finished Study Pack run got the system
 * prompt and the token bill where their study notes should have been.
 *
 * ## What the component shows, and why the split is where it is
 *
 * The CONTENT is what the agent produced — `final_text` through the canonical
 * markdown pipeline, or `structured_output` when the agent was schema-bound.
 * Everything else is a NUMBER ABOUT the run (duration, iterations, tool
 * calls, cost, tokens) and lives behind one secondary disclosure. `messages`
 * is neither: it never reaches the component at all (see
 * `features/workflow-runtime/agent-run-output.ts`), and the transcript stays
 * reachable through the conversation door instead, where the database — not a
 * UI flag — decides who may read it.
 *
 * ## Why a compiled kind rather than a DB-authored component
 *
 * This kind is python-owned: its `data` is NULL and its contract is
 * `emitted_json_schema`, derived from `AiExecutionResult`. The content_ir
 * adapter deliberately declines to flatten such a contract into a
 * `KindSchema`, so the WARM registry never delivers one — meaning the
 * streaming `__kind` parser can only ever type an `agent_result` arriving in
 * chat from the compiled bootstrap schema below. A DB-authored component
 * would render in the workflow readout (which builds a complete envelope
 * directly) and never in chat.
 *
 * The Python contract is `matrx_ai`'s `AiExecutionResult`; the fields below
 * mirror it and must move with it.
 *
 * COMPLETE bridge, deliberately: an agent-run envelope is a settled record of
 * a finished run. There is no half-finished one to render.
 */

import type { KindSchema } from "../core/kind-schema.types";
import type { KindDefinition } from "../registry/kind-registry.types";
import {
  readAgentRunFacts,
  readAgentRunOutput,
  looksLikeJsonDocument,
  type AgentRunFacts,
} from "@/features/workflow-runtime/agent-run-output";
import { makeCompleteEnvelopeBridge } from "./legacy-bridge-utils";

/** The registered kind slug — named once, never spelled by hand elsewhere. */
export const AGENT_RESULT_KIND = "agent_result";

// ---------------------------------------------------------------------------
// Schema — the compiled bootstrap (see the module header for why it exists)
// ---------------------------------------------------------------------------

export const agentResultKindSchema: KindSchema = {
  kind: AGENT_RESULT_KIND,
  fields: {
    final_text: {
      type: "string",
      description:
        "The final assistant response — what the agent produced, and the only field most readers want.",
    },
    structured_output: {
      type: "json",
      description:
        "The schema-bound payload, when the agent was bound to an output schema.",
    },
    // Declared so the parser keeps them in the value rather than pushing them
    // into residue — and NEVER read past the bridge. See the module header.
    messages: {
      type: "json[]",
      description:
        "The full conversation as the workflow saw it, so the next node can continue the thread. Plumbing — never rendered.",
    },
    final_message: { type: "json", description: "The last message, verbatim." },
    usage: {
      type: "json",
      description: "Aggregated token / cost usage for the run.",
    },
    metadata: {
      type: "json",
      description: "Provider response metadata (model name, response id, …).",
    },
    iterations: {
      type: "number",
      required: true,
      description: "How many agent-loop turns the run took.",
    },
    request_id: {
      type: "string",
      required: true,
      description: "The stream request this run was carried on.",
    },
    conversation_id: {
      type: "string",
      required: true,
      description: "The conversation the run wrote to.",
    },
    duration_ms: { type: "number", description: "Wall-clock time, in ms." },
    tool_calls_made: { type: "number", description: "Tool calls in the run." },
    finish_reason: {
      type: "string",
      nullable: true,
      description: "Why the provider stopped generating.",
    },
  },
};

// ---------------------------------------------------------------------------
// serverData bridge
// ---------------------------------------------------------------------------

/** Exactly what `AgentResultBlock` renders — no envelope reaches the component. */
export interface AgentResultData extends Record<string, unknown> {
  /** The agent's own text, ready for the canonical markdown pipeline. */
  finalText: string | null;
  /** True when `finalText` is a bare JSON document and needs a json fence. */
  finalTextIsJson: boolean;
  /** The schema-bound payload, when the agent was bound to one. */
  structured: Record<string, unknown> | unknown[] | null;
  /** Numbers about the run — secondary detail, never the content. */
  facts: AgentRunFacts;
}

export const agentResultServerData = makeCompleteEnvelopeBridge<AgentResultData>(
  AGENT_RESULT_KIND,
  (value) => {
    const produced = readAgentRunOutput(value);
    const facts = readAgentRunFacts(value);
    // Not an agent-run envelope after all (a foreign payload wearing the
    // slug) — decline, and the routed block falls back to its raw-content
    // parse path rather than rendering an empty card.
    if (!produced || !facts) return undefined;

    return {
      finalText: produced.finalText,
      finalTextIsJson:
        produced.finalText !== null && looksLikeJsonDocument(produced.finalText),
      structured: produced.structured,
      facts,
    };
  },
  // `structured_output` is arbitrary agent JSON that may legitimately carry a
  // `__kind` of its own — stripping deep would erase it and cost that payload
  // its own component when the pipeline re-renders it.
  { strip: "root" },
);

// ---------------------------------------------------------------------------
// toMarkdown — the produced content, never the envelope
// ---------------------------------------------------------------------------

export function agentResultMarkdown(value: Record<string, unknown>): string {
  const produced = readAgentRunOutput(value);
  if (!produced) return "";
  if (produced.finalText) {
    return looksLikeJsonDocument(produced.finalText)
      ? `\`\`\`json\n${produced.finalText}\n\`\`\``
      : produced.finalText;
  }
  if (produced.structured) {
    return `\`\`\`json\n${JSON.stringify(produced.structured, null, 2)}\n\`\`\``;
  }
  return "";
}

// ---------------------------------------------------------------------------
// Compiled definition
// ---------------------------------------------------------------------------

export const AGENT_RESULT_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: AGENT_RESULT_KIND,
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: AGENT_RESULT_KIND,
    toLegacyServerData: agentResultServerData,
    toMarkdown: agentResultMarkdown,
    schema: agentResultKindSchema,
  },
];
