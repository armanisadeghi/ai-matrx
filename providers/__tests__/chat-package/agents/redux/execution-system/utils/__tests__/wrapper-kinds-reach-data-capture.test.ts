import { StreamBlockAccumulator } from "@ai-matrx/chat/agents/redux/execution-system/utils/stream-block-accumulator";
import {
  deriveAnswerDataText,
  deriveAnswerText,
} from "@ai-matrx/chat/agents/redux/execution-system/active-requests/active-requests.selectors";
import { extractFirstJson } from "@ai-matrx/kit/json-extract";
import type { RenderBlockPayload } from "@ai-matrx/agents/generated/stream-events";

jest.mock("@ai-matrx/chat/host/diagnostics", () => ({
  ...jest.requireActual("@ai-matrx/chat/host/diagnostics"),
  captureError: jest.fn(),
}));

// THE DATA KEEPS ITS KINDS (2026-10-07). The Applet Builder answered
// {"note", "applet": {…, "sources": [{"__kind":"applet_source", …}, …]}}. The
// display split that JSON into its kinds plus a residual with the kinds
// REMOVED (A7), JSON extraction read the residual, and the Applet was saved
// with `sources: []` — every page then said `no data source called "tasks"`.
describe("a JSON wrapper holding kinds reaches data capture whole", () => {
  const answer = JSON.stringify({
    note: "Built it.",
    applet: {
      name: "Follow-up Calls",
      slug: "follow-up-calls",
      entry: "App.tsx",
      files: [{ name: "App.tsx", source: "export default function App() { return null; }" }],
      pages: [{ path: "/", title: "Owed", file: "App.tsx" }],
      sources: [
        { __kind: "applet_source", alias: "tasks", entity: "", table_id: "t-1", organization_id: "o-1" },
        { __kind: "applet_source", alias: "clients", entity: "", table_id: "t-2", organization_id: "o-1" },
      ],
      mandates: [],
      description: "Calls owed this week.",
    },
  });

  function stream(text: string) {
    const blocks = new Map<string, RenderBlockPayload>();
    const order: string[] = [];
    const accumulator = new StreamBlockAccumulator("wrapper-kinds", ((payload: {
      requestId: string;
      block: RenderBlockPayload;
    }) => ({ type: "test/upsert", payload })) as never);
    const dispatch = (action: unknown) => {
      const block = (action as { payload?: { block?: RenderBlockPayload } }).payload?.block;
      if (block) {
        if (!blocks.has(block.blockId)) order.push(block.blockId);
        blocks.set(block.blockId, block);
      }
      return action;
    };
    for (let offset = 0; offset < text.length; offset += 23) {
      accumulator.ingest(text.slice(offset, offset + 23), dispatch);
    }
    accumulator.finalize(dispatch);
    const request = {
      renderBlockOrder: order,
      renderBlocks: Object.fromEntries(blocks) as never,
      editedText: null,
    };
    return { accumulator, request };
  }

  it("the display projection drops the kinds (why the data path must not read it)", () => {
    const { request } = stream(answer);
    const display = extractFirstJson(deriveAnswerText(request)) as {
      value?: { applet?: { sources?: unknown[] } };
    } | null;
    expect(display?.value?.applet?.sources ?? []).toHaveLength(0);
  });

  it("deriveAnswerDataText returns the sources the model wrote", () => {
    const { accumulator, request } = stream(answer);
    const text = deriveAnswerDataText(request, accumulator.getWrapperSplitSources());
    const parsed = JSON.parse(text) as { applet: { sources: Array<{ alias: string; table_id: string }> } };
    expect(parsed.applet.sources.map((s) => [s.alias, s.table_id])).toEqual([
      ["tasks", "t-1"],
      ["clients", "t-2"],
    ]);
  });

  it("a rewind past the split forgets it", () => {
    const { accumulator } = stream(answer);
    expect(accumulator.getWrapperSplitSources()).toHaveLength(1);
    accumulator.rewindToBlockCount(0);
    expect(accumulator.getWrapperSplitSources()).toHaveLength(0);
  });
});
