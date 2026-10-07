/**
 * A block whose stream STOPPED (finish_reason max_tokens, provider stop) is
 * settled: the parser stamps its cut-off region `error`. It must never sit on
 * the loading skeleton ("Initializing Matrx...") — it renders what it has.
 * Live regression: /chat/ef4d060d-… news_opportunity_report, 2026-10-06.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { IR_ENVELOPE_KEY, IR_VERSION } from "@ai-matrx/content-ir";

jest.mock("next/dynamic", () => ({
  __esModule: true,
  default: () => function MockDynamicComponent() { return null; },
}));
jest.mock("../BlockComponentRegistry", () => {
  const react = jest.requireActual("react") as typeof React;
  const stub = (name: string) => {
    function Stub() { return react.createElement("div", { "data-stub": name }); }
    return Stub;
  };
  const proxy = new Proxy({}, { get: (_t, p) => (typeof p === "string" ? stub(p) : undefined) });
  return { __esModule: true, BlockComponents: proxy, LoadingComponents: proxy };
});
jest.mock("@/components/loaders/MatrxMiniLoader", () => ({
  __esModule: true,
  default: () => React.createElement("div", { "data-loader": "initializing" }),
}));
function stubModule(named?: string[]) {
  return () => {
    const react = jest.requireActual("react") as typeof React;
    const Stub = () => react.createElement("div");
    const mod: Record<string, unknown> = { __esModule: true, default: Stub };
    for (const n of named ?? []) mod[n] = Stub;
    return mod;
  };
}
jest.mock("@/components/mardown-display/chat-markdown/InlineCodeSnippet", stubModule(["InlineCodeSnippet"]));
jest.mock("@/components/mardown-display/blocks/audio/AudioOutputBlockRenderer", stubModule());
jest.mock("@/components/mardown-display/blocks/videos/VideoOutputBlockRenderer", stubModule());
jest.mock("@/features/canvas/materialization/CodeBlockWithContextAttach", stubModule(["CodeBlockWithContextAttach"]));
jest.mock("@/components/mardown-display/blocks/generic/GenericStructuredBlock", stubModule());

import { isBlockLoading, resolveBlockDispatch } from "../block-dispatch";

function block(status: "streaming" | "complete" | "error") {
  return {
    type: "news_monitor_kind",
    content: '{"__kind":"news_opportunity_report","headline":"Cut o',
    metadata: {
      [IR_ENVELOPE_KEY]: {
        v: IR_VERSION,
        engine: "test",
        fingerprint: "test",
        root: { role: "structured", kind: "news_opportunity_report", status, value: {} },
      },
    },
  };
}

describe("a stopped (error) block is settled, never loading", () => {
  it("isBlockLoading: streaming loads; error and complete do not", () => {
    expect(isBlockLoading(block("streaming"))).toBe(true);
    expect(isBlockLoading(block("error"))).toBe(false);
    expect(isBlockLoading(block("complete"))).toBe(false);
  });

  it("a complete-only kind block with no serverData renders content, not the loader, once stopped", () => {
    const dispatch = resolveBlockDispatch("news_monitor_kind")!;
    const ctx = (b: ReturnType<typeof block>) =>
      ({ block: b, index: 0, isStreamActive: false }) as never;
    const stopped = renderToStaticMarkup(<>{dispatch(ctx(block("error")))}</>);
    expect(stopped).not.toContain("data-loader");
    expect(stopped).toContain('data-stub="JsonBlock"'); // the readable fallback, not a spinner
    // control: a genuinely streaming one still shows the loader
    const live = renderToStaticMarkup(<>{dispatch(ctx(block("streaming")))}</>);
    expect(live).toContain("data-loader");
  });
});
