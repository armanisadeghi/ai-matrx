/**
 * THE HOST WIRING for the side-effect card — a person is never asked to approve
 * a write they cannot identify, IN THIS APP.
 *
 * Arman, 2026-08-26: the previous floor gave "a name and then an apply button,
 * which essentially tells the user to click apply and conduct a potentially
 * destructive action without any clue as to what this thing is."
 *
 * The CARD is now `@ai-matrx/content-ir-react`'s (0.11.0) and the package's own
 * tests pin its behaviour. What only this repo can prove is that the four seams
 * it refuses to own are actually plugged in here: rendering a real ```matrx
 * fence through `MatrxEnvelopeBlock` — the production entry point, nothing
 * mocked — must name the write, offer Apply (the `confirm` seam), open the item
 * into the real overlay (the `openItem` seam), and resolve the item's kind from
 * the server-derived map (THE DIRECTIVE⇄KIND SEAM).
 *
 * The fixture is the REAL 22KB Masterwork Conductor item (the same canonical
 * example the `agent_definition` kind carries) — not a two-line toy that makes
 * everything look fine.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { asKindInstance } from "@ai-matrx/content-ir";

import apiConfigReducer from "@/lib/redux/slices/apiConfigSlice";
import overlayReducer from "@/lib/redux/slices/overlaySlice";
import { setStoreSingleton } from "@/lib/redux/store-singleton";

import MatrxEnvelopeBlock from "@/features/matrx-envelope/MatrxEnvelopeBlock";
import { matrxDirectiveItemKind } from "@/features/matrx-envelope/directiveHost";
import AGENT_DEFINITION_ITEM from "@/app/(dev)/demos/kind-directives/agent-definition-item.json";
import { KIND_KEY } from "@ai-matrx/content-ir";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const AGENT_SLUG = "directive_v1_action_create_agent_definition";

function shell(kind: string, items: unknown[]) {
  return { __kind: kind, items };
}

type TestStore = ReturnType<typeof makeStore>;

function makeStore() {
  return configureStore({
    reducer: { apiConfig: apiConfigReducer, overlays: overlayReducer },
  });
}

/**
 * The block wires the REAL host: the Apply control reads the API base URL out
 * of the store and the item row dispatches a real overlay action. So the test
 * mounts a real store AND registers it as the singleton the host reads —
 * mocking either away would stop the test proving the two things that matter
 * most: that Apply is wired, and that the item can be opened.
 */
function render(node: React.ReactElement): {
  host: HTMLDivElement;
  root: Root;
  store: TestStore;
} {
  const store = makeStore();
  setStoreSingleton(store);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<Provider store={store}>{node}</Provider>));
  return { host, root, store };
}

function cleanup(host: HTMLDivElement, root: Root) {
  act(() => root.unmount());
  host.remove();
}

describe("THE DIRECTIVE⇄KIND SEAM, as this host supplies it", () => {
  it("resolves a kind-backed shape's item kind from the server-derived map", () => {
    expect(matrxDirectiveItemKind(AGENT_SLUG)).toBe("agent_definition");
  });

  it("reports null for a shape with no item kind — honest, never invented", () => {
    expect(matrxDirectiveItemKind("directive_v1_create_task")).toBeNull();
    expect(
      asKindInstance({ title: "x" }, matrxDirectiveItemKind("directive_v1_create_task")),
    ).toBeNull();
  });

  it("stamps __kind FIRST so a consumer types the item from its own first key", () => {
    const stamped = asKindInstance({ name: "X" }, matrxDirectiveItemKind(AGENT_SLUG));
    expect(stamped).not.toBeNull();
    expect(Object.keys(stamped!)[0]).toBe(KIND_KEY);
    expect(stamped!.__kind).toBe("agent_definition");
  });

  it("never overwrites a marker the item was emitted with", () => {
    const stamped = asKindInstance(
      { __kind: "already_set", name: "X" },
      matrxDirectiveItemKind(AGENT_SLUG),
    );
    expect(stamped!.__kind).toBe("already_set");
  });
});

describe("the production entry point draws the real card", () => {
  it("names the write, counts the items, and offers Apply (the confirm seam)", () => {
    const { host, root } = render(
      <MatrxEnvelopeBlock content={shell(AGENT_SLUG, [AGENT_DEFINITION_ITEM])} />,
    );
    const text = host.textContent ?? "";

    expect(text).toContain("Masterwork Conductor"); // WHAT it is
    expect(text).toContain("1 item"); // HOW MUCH
    expect(text.toLowerCase()).toContain("apply"); // the confirm seam is wired
    // Facts, not novels: the 800-char description must not be in the card.
    expect(text).not.toContain("The ONE canonical Masterwork system");
    cleanup(host, root);
  });

  it("opens the item into the REAL overlay, kind-stamped (the openItem seam)", () => {
    const { host, root, store } = render(
      <MatrxEnvelopeBlock content={shell(AGENT_SLUG, [AGENT_DEFINITION_ITEM])} />,
    );
    const row = Array.from(host.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("Masterwork Conductor"),
    );
    expect(row).toBeDefined();
    act(() => {
      row!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const overlays = store.getState().overlays;
    const open = JSON.stringify(overlays);
    expect(open).toContain("directiveItemWindow");
    expect(open).toContain("agent_definition"); // itemKind travelled through
    expect(open).toContain("Masterwork Conductor"); // the same title the card shows
    cleanup(host, root);
  });

  it("folds a long batch instead of dumping every row", () => {
    const items = Array.from({ length: 7 }, (_, i) => ({ title: `Task ${i + 1}` }));
    const { host, root } = render(
      <MatrxEnvelopeBlock content={shell("directive_v1_create_task", items)} />,
    );
    const text = host.textContent ?? "";

    expect(text).toContain("Task 1");
    expect(text).toContain("Task 3");
    expect(text).not.toContain("Task 7");
    expect(text).toContain("Show 4 more");
    cleanup(host, root);
  });

  it("NEVER returns null — an empty batch is stated, not silent", () => {
    const { host, root } = render(
      <MatrxEnvelopeBlock content={shell("directive_v1_create_task", [])} />,
    );
    expect(host.textContent).toContain("nothing would be written");
    expect(host.innerHTML.length).toBeGreaterThan(0);
    cleanup(host, root);
  });

  it("names an unknown noun from the catalog seam, never as a raw token", () => {
    // THE AUTO-VIEW: `matrxDirectiveHost.nouns` mirrors platform.entity_types,
    // so a shape this app has never heard of still reads as a sentence.
    const { host, root } = render(
      <MatrxEnvelopeBlock content={shell("directive_v1_create_agent", [{ name: "Zed" }])} />,
    );
    expect(host.textContent).toContain("Create Agent");
    cleanup(host, root);
  });
});
