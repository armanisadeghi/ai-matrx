/**
 * A STREAMING DIRECTIVE IS NEVER A WALL OF RAW JSON — a forcing function.
 *
 * Found live 2026-09-25 (admin@admin.com, kits "Run it once" → agent run
 * window, a fork of "Agent Structure Builder"): the agent streams its answer
 * as one `directive_v1_action_create_agent_definition` document. The splitter
 * types it as a `matrx` block from its first bytes, but `DirectiveRender`
 * could only honour a COMPLETE shell, so for the whole stream the person
 * watched the JSON grow in a `<pre>` and snap into the card at the last byte.
 *
 * The fix lives in `@ai-matrx/content-ir-react` 0.11.11 (THE PROVISIONAL
 * TIER). What only this repo can prove is that the production dispatch
 * (`resolveBlockDispatch("matrx")` → `MatrxEnvelopeBlock`) hands the package
 * the stream state — so mid-stream is "Writing…", and a document that never
 * finished reads as cut off once the stream has ended.
 *
 * The fixture is the REAL agent-definition item the kind carries.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

import apiConfigReducer from "@/lib/redux/slices/apiConfigSlice";
import overlayReducer from "@/lib/redux/slices/overlaySlice";
import { setStoreSingleton } from "@/lib/redux/store-singleton";

import {
  resolveBlockDispatch,
  type BlockDispatchContext,
} from "@/components/mardown-display/chat-markdown/block-registry/block-dispatch";
import AGENT_DEFINITION_ITEM from "@/app/(dev)/demos/kind-directives/agent-definition-item.json";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const AGENT_SLUG = "directive_v1_action_create_agent_definition";
const WHOLE = JSON.stringify({ __kind: AGENT_SLUG, items: [AGENT_DEFINITION_ITEM] });
const PARTIAL = WHOLE.slice(0, 600);

function renderMatrxBlock(content: string, isStreamActive: boolean): {
  host: HTMLDivElement;
  root: Root;
} {
  const store = configureStore({
    reducer: { apiConfig: apiConfigReducer, overlays: overlayReducer },
  });
  setStoreSingleton(store);
  const render = resolveBlockDispatch("matrx");
  if (!render) throw new Error("the matrx block type has no dispatch");
  const ctx: BlockDispatchContext = {
    block: { type: "matrx", content, language: "json" },
    index: 0,
    isStreamActive,
    hideReasoning: false,
    hideToolResults: false,
    replaceBlockContent: () => {},
    renderBasicMarkdown: (text) => <div>{text}</div>,
  };
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<Provider store={store}>{render(ctx)}</Provider>));
  return { host, root };
}

function cleanup(host: HTMLDivElement, root: Root) {
  act(() => root.unmount());
  host.remove();
}

describe("a directive that is still arriving", () => {
  it("renders a named provisional card mid-stream — never the growing JSON", () => {
    const { host, root } = renderMatrxBlock(PARTIAL, true);
    try {
      expect(host.querySelector("pre")).toBeNull();
      expect(host.textContent).not.toContain('"__kind"');
      expect(host.textContent).toContain("Writing…");
      const card = host.querySelector("[data-directive-state]");
      expect(card?.getAttribute("data-directive-state")).toBe("streaming");
      expect(card?.getAttribute("data-directive")).toBe(AGENT_SLUG);
    } finally {
      cleanup(host, root);
    }
  });

  it("reads as CUT OFF once the stream has ended without the document finishing", () => {
    const { host, root } = renderMatrxBlock(PARTIAL, false);
    try {
      expect(host.textContent).not.toContain("Writing…");
      expect(host.textContent).toContain("Cut off before it finished");
      expect(
        host.querySelector("[data-directive-state]")?.getAttribute(
          "data-directive-state",
        ),
      ).toBe("incomplete");
    } finally {
      cleanup(host, root);
    }
  });

  it("the finished document renders the real side-effect card", () => {
    const { host, root } = renderMatrxBlock(WHOLE, false);
    try {
      expect(host.querySelector("[data-directive-state]")).toBeNull();
      expect(host.querySelector(`[data-directive="${AGENT_SLUG}"]`)).not.toBeNull();
      expect(host.textContent).toContain("Apply");
    } finally {
      cleanup(host, root);
    }
  });
});
