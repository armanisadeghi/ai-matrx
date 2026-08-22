/**
 * THE §6 CONTENT CHANNEL — the agent-run envelope's `content` list, from the
 * wire to the screen.
 *
 * `matrx-ai` has always sent it (`graph_nodes/shared.py` → `_extract_content`):
 * the response as an ORDERED LIST OF KIND INSTANCES, each carrying its own
 * `__kind`. The browser read only `structured_output` and `final_text`, so the
 * list reached the tab and was discarded — a reader got flat text where the
 * server had sent typed, renderable shapes.
 *
 * These tests pin BOTH halves of the fix, because either one alone is a
 * regression:
 *
 *  - POPULATED: every entry renders through ITS kind component, in the
 *    server's order, and the run facts stay below the content.
 *  - EMPTY: `_extract_content` returns `[]` for a schema-bound answer that
 *    named no kind (`shared.py:346`) — the NORMAL case, never an error and
 *    never a blank screen. The `structured_output` / `final_text` path must
 *    behave exactly as it did before the channel was read at all.
 *
 * The render assertions go through the REAL path (`AgentResultBlock` →
 * `AgentContentList` → `KindInstanceRender` → `SafeBlockRenderer`); only the
 * `next/dynamic` boundary is stubbed, and the stub reports the block type and
 * the routed kind so "rendered through its own component" is an assertion
 * rather than a hope.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The one boundary a static render cannot cross. Two dynamic components sit
// under this block: the heavy `BlockRenderer` (it receives a `block`, and the
// stub reports the kind on its envelope, which is the identity production
// routes on) and `MarkdownStream` (it receives `content`, and the stub renders
// the prose so the no-channel path stays assertable).
jest.mock("next/dynamic", () => ({
  __esModule: true,
  default: () => {
    const react = require("react") as typeof React;
    return function MockDynamic(props: Record<string, unknown>) {
      const block = props.block as
        | { metadata?: Record<string, unknown> }
        | undefined;
      if (block) {
        const envelope = block.metadata?.["__ir"] as
          | { root?: { kind?: string } }
          | undefined;
        return react.createElement("div", {
          "data-testid": "routed-block",
          "data-kind": envelope?.root?.kind ?? "none",
        });
      }
      return react.createElement(
        "div",
        { "data-testid": "markdown-stream" },
        typeof props.content === "string" ? props.content : null,
      );
    };
  },
}));

import { componentRegistry } from "../registry/component-registry";
import { kindRegistry } from "../registry/kind-registry";
import type { KindComponentProjection } from "../registry/schema-source-kind-components";
import {
  agentResultServerData,
  type AgentResultData,
} from "../kinds/agent-result";
import { envelopeFromCompleteValue } from "@ai-matrx/content-ir";
import { IR_ENVELOPE_KEY } from "@ai-matrx/content-ir";
import { applyIrKindRoute } from "../react/kind-route";
import { readAgentRunOutput } from "@/features/workflow-runtime/agent-run-output";
import AgentResultBlock from "@/components/mardown-display/blocks/agent-result/AgentResultBlock";

function dbRow(kind: string, componentKey: string): KindComponentProjection {
  return {
    kind,
    componentKey,
    isActive: true,
    platform: "web",
    role: "output",
    source: "bundled",
    config: {},
    componentSource: null,
    propsTransform: null,
    pinnedKindVersion: null,
    updatedAt: "2026-01-01T00:00:00Z",
    createdBy: null,
    createdAt: "2026-01-01T00:00:00Z",
    id: "00000000-0000-0000-0000-000000000000",
  };
}

/** A complete agent-run envelope, exactly as `AiExecutionResult` serializes. */
function envelope(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    __kind: "agent_result",
    request_id: "req_1",
    conversation_id: "11111111-1111-1111-1111-111111111111",
    iterations: 1,
    finish_reason: "stop",
    final_text: "",
    final_message: null,
    messages: [{ role: "system", content: "THE VERBATIM PROMPT" }],
    usage: { total_tokens: 100, cost_usd: 0.01 },
    metadata: {},
    duration_ms: 1200,
    tool_calls_made: 0,
    structured_output: null,
    content: [],
    ...overrides,
  };
}

/** The kinds a §6 list actually arrives with — prose plus a typed instance. */
const PROSE = { __kind: "markdown", text: "Here is what I found." };
const DECK = { __kind: "presentation_deck", title: "Q3", slides: [] };
const NOTES = { __kind: "markdown", text: "And here is the caveat." };

/** The bridge takes the parsed IR envelope, exactly as the route hands it one. */
function bridge(output: Record<string, unknown>): AgentResultData {
  return agentResultServerData(
    envelopeFromCompleteValue(output, "agent_result"),
  ) as AgentResultData;
}

function renderBlock(output: Record<string, unknown>): string {
  const serverData = bridge(output);
  return renderToStaticMarkup(
    React.createElement(AgentResultBlock, { serverData }),
  );
}

beforeAll(() => {
  // Warm arrival, the way the real loader lands it: without these rows the
  // kinds are unroutable and every entry would (correctly) take the floor —
  // which is a different test.
  componentRegistry.ingestDbRows([
    dbRow("markdown", "markdown_stream"),
    dbRow("presentation_deck", "presentation_deck"),
  ]);
  kindRegistry.upsertDefinition({
    kind: "presentation_deck",
    schema: null,
    schemaSource: "content_ir",
    tier: "warm",
  });
});

describe("the §6 content channel reaches the reader", () => {
  it("[read] carries every entry, in the server's order, with its own kind", () => {
    const produced = readAgentRunOutput(
      envelope({ content: [PROSE, DECK, NOTES], final_text: "Here is what I found." }),
    );

    expect(produced?.content.map((entry) => entry.kind)).toEqual([
      "markdown",
      "presentation_deck",
      "markdown",
    ]);
    expect(produced?.content[1].value).toEqual(DECK);
  });

  it("[read] an absent or empty channel is an EMPTY LIST, never a throw", () => {
    const missing = envelope({});
    delete missing.content;

    expect(readAgentRunOutput(missing)?.content).toEqual([]);
    expect(readAgentRunOutput(envelope({ content: [] }))?.content).toEqual([]);
    // A producer that sent something that is not a list is an absent channel.
    expect(readAgentRunOutput(envelope({ content: "nope" }))?.content).toEqual(
      [],
    );
  });

  it("[bridge] the compiled bridge carries `content` through to the component", () => {
    const serverData = bridge(envelope({ content: [PROSE, DECK] }));

    expect(serverData.content.map((entry) => entry.kind)).toEqual([
      "markdown",
      "presentation_deck",
    ]);
    // The envelope's transcript still never crosses the bridge.
    expect(serverData).not.toHaveProperty("messages");
  });

  it("[render] each entry routes to its OWN component, in the server's order", () => {
    const html = renderBlock(
      envelope({ content: [PROSE, DECK, NOTES], final_text: "Here is what I found." }),
    );

    const kinds = [...html.matchAll(/data-kind="([^"]+)"/g)].map((m) => m[1]);
    expect(kinds).toEqual(["markdown", "presentation_deck", "markdown"]);
    // The run's numbers stay secondary, below the content.
    expect(html).toContain("Run detail");
    // And the prompt is still nowhere near the reader.
    expect(html).not.toContain("THE VERBATIM PROMPT");
  });

  it("[render] an entry that named NO kind takes the platform floor, not a JSON dump", () => {
    const html = renderBlock(
      envelope({ content: [{ title: "Unnamed", body: "still content" }] }),
    );

    expect(html).toContain("still content");
    // The floor document, never a routed block for a kind nobody declared.
    expect(html).not.toContain('data-testid="routed-block"');
  });

  it("[render] the entry the readout hands the pipeline routes to the KIND's component, never a code block", () => {
    // What `KindInstanceRender` builds for one entry, taken through the REAL
    // route the (mocked-out) BlockRenderer runs: proof that "reached the
    // pipeline with kind X" means "rendered by X's component".
    const routed = applyIrKindRoute({
      type: "code",
      content: JSON.stringify(PROSE),
      serverData: { language: "json" },
      metadata: { [IR_ENVELOPE_KEY]: envelopeFromCompleteValue(PROSE, "markdown") },
    });

    expect(routed.type).toBe("markdown_stream");
    expect(routed.type).not.toBe("code");
  });

  it("[empty] a schema-bound answer with no `__kind` renders exactly as before", () => {
    const structured = { answer: 42, note: "the bound payload" };
    const html = renderBlock(
      envelope({ structured_output: structured, content: [] }),
    );

    // The floor document, same as the pre-channel behaviour.
    expect(html).toContain("the bound payload");
    expect(html).toContain("Run detail");
    expect(html).not.toContain("THE VERBATIM PROMPT");
  });

  it("[empty] a plain prose answer with no channel still renders its text", () => {
    const withoutChannel = envelope({ final_text: "Plain prose answer." });
    delete withoutChannel.content;

    expect(renderBlock(withoutChannel)).toContain("Plain prose answer.");
  });
});
