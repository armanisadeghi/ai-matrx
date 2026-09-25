/**
 * A media block never renders as an empty gap.
 *
 * The break this guards (verify-RC-B7): the `image` registration returned
 * null whenever `block.src` was missing — live /chat images vanished until a
 * reload. Now a block without `src` re-reads its own markdown line, and a
 * line with no readable URL shows as its text.
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

const PHOTO_LINE =
  "![Curbside e-waste pile on Bay Street](https://images.greenroutehauling.com/pickup/curbside-pile.jpg)";

function ctxFor(block: BlockDispatchContext["block"]): BlockDispatchContext {
  return {
    block,
    index: 0,
    isStreamActive: false,
    renderBasicMarkdown: (content: string) =>
      React.createElement("p", { "data-prose": true }, content),
    replaceBlockContent: () => undefined,
  } as unknown as BlockDispatchContext;
}

function render(block: BlockDispatchContext["block"]) {
  const fn = resolveBlockDispatch(block.type);
  if (!fn) throw new Error(`no registration for ${block.type}`);
  return fn(ctxFor(block)) as React.ReactElement<Record<string, unknown>> | null;
}

describe("media blocks without src", () => {
  beforeEach(() => jest.spyOn(console, "warn").mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it("an image block re-reads its URL from its own line", () => {
    const el = render({ type: "image", content: PHOTO_LINE });
    expect(el?.props.src).toBe(
      "https://images.greenroutehauling.com/pickup/curbside-pile.jpg",
    );
    expect(el?.props.alt).toBe("Curbside e-waste pile on Bay Street");
  });

  it("a video block re-reads its URL from its own line", () => {
    const el = render({
      type: "video",
      content: "[Video URL: https://media.greenroutehauling.com/training/loading-walkthrough.mp4]",
    });
    expect((el?.props.data as { url: string }).url).toBe(
      "https://media.greenroutehauling.com/training/loading-walkthrough.mp4",
    );
  });

  it.each([
    ["image", "![Curbside pile](not a url)"],
    ["audio", "Dispatch voice note (link missing)"],
  ])("a %s block with no readable URL shows its text", (type, content) => {
    const el = render({ type, content });
    expect(el?.props["data-prose"]).toBe(true);
    expect(el?.props.children).toBe(content);
  });
});
