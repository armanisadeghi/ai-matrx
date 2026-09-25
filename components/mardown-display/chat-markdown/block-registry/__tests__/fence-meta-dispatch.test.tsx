/**
 * A fence's meta reaches the block whichever language renderer takes it.
 *
 * The break this guards (verify-RC-B7 nit): ```yaml title="deploy/gateway.yaml"
 * rendered the structured YAML viewer with no title — the language
 * sub-dispatch dropped the fence meta. A titled/highlighted structured-data
 * fence now renders the code block (which draws both); JSON forwards it.
 */
import React from "react";

// Heavy chat components reached through the registry's imports pull
// next/dynamic trees (JsonInspector, players, …). The registry tests assert
// ROUTING, not component internals — stub the dynamic loader exactly like
// generic-structured-fallback.test.tsx does.
jest.mock("next/dynamic", () => ({
  __esModule: true,
  default: () => {
    const react = require("react") as typeof React;
    return function MockDynamicComponent() {
      return react.createElement("div", { "data-testid": "dynamic-stub" });
    };
  },
}));

// The component registry pulls the full markdown pipeline (remark/rehype ESM)
// — irrelevant to routing assertions. Stub every member with a component.
jest.mock("../BlockComponentRegistry", () => {
  const react = jest.requireActual("react") as typeof React;
  const stub = (name: string) => {
    function StubBlockComponent() {
      return react.createElement("div", { "data-testid": "stub-block" });
    }
    StubBlockComponent.displayName = name;
    return StubBlockComponent;
  };
  const proxy = new Proxy(
    {},
    {
      get: (_target, prop) =>
        typeof prop === "string" ? stub(prop) : undefined,
    },
  );
  return { __esModule: true, BlockComponents: proxy, LoadingComponents: proxy };
});

// Heavy leaf components block-dispatch imports directly (syntax highlighters,
// media players, redux-touching editors). Routing tests never render them.
function stubComponentModule(named?: string[]) {
  return () => {
    const react = jest.requireActual("react") as typeof React;
    const Stub = function StubLeafComponent() {
      return react.createElement("div", { "data-testid": "stub-leaf" });
    };
    const mod: Record<string, unknown> = { __esModule: true, default: Stub };
    for (const name of named ?? []) mod[name] = Stub;
    return mod;
  };
}
jest.mock(
  "@/components/mardown-display/chat-markdown/InlineCodeSnippet",
  stubComponentModule(["InlineCodeSnippet"]),
);
jest.mock(
  "@/components/mardown-display/blocks/audio/AudioOutputBlockRenderer",
  stubComponentModule(),
);
jest.mock(
  "@/components/mardown-display/blocks/videos/VideoOutputBlockRenderer",
  stubComponentModule(),
);
jest.mock(
  "@/features/canvas/materialization/CodeBlockWithContextAttach",
  stubComponentModule(["CodeBlockWithContextAttach"]),
);
jest.mock(
  "@/components/mardown-display/blocks/generic/GenericStructuredBlock",
  stubComponentModule(),
);



import { resolveBlockDispatch, type BlockDispatchContext } from "../block-dispatch";
import { FENCE_META_KEY } from "@/components/markdown-core/fence-meta";

const GATEWAY_YAML = "routes:\n  - path: /pickups\n    upstream: dispatch:8080";

function render(block: BlockDispatchContext["block"]) {
  const fn = resolveBlockDispatch(block.type);
  if (!fn) throw new Error(`no registration for ${block.type}`);
  const ctx = {
    block,
    index: 0,
    isStreamActive: false,
    renderBasicMarkdown: (content: string) => React.createElement("p", null, content),
    replaceBlockContent: () => undefined,
  } as unknown as BlockDispatchContext;
  return fn(ctx) as React.ReactElement<Record<string, unknown>> | null;
}

describe("fence meta through the language sub-dispatch", () => {
  it.each([
    ["yaml", GATEWAY_YAML, 'title="deploy/gateway.yaml"'],
    ["toml", "[route]\ncapacity = 38", 'title="dispatch.toml" {2}'],
    ["json", '{"route": 14, "capacity": 38}', 'title="route-14.json"'],
  ])("a %s fence with meta keeps it", (language, content, meta) => {
    const el = render({
      type: "code",
      language,
      content,
      metadata: { [FENCE_META_KEY]: meta },
    });
    expect(el?.props.meta).toBe(meta);
  });

  it("a yaml fence without meta keeps the structured viewer", () => {
    const el = render({ type: "code", language: "yaml", content: GATEWAY_YAML });
    expect(el?.props.meta).toBeUndefined();
    expect(el?.props.content).toBe(GATEWAY_YAML);
  });
});
