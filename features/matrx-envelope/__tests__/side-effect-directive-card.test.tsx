/**
 * THE SIDE-EFFECT CARD — a person is never asked to approve a write they
 * cannot identify.
 *
 * Arman, 2026-08-26: the previous floor gave "a name and then an apply button,
 * which essentially tells the user to click apply and conduct a potentially
 * destructive action without any clue as to what this thing is."
 *
 * These tests pin the promises that fix, using the REAL 22KB Masterwork
 * Conductor item (the same canonical example the `agent_definition` kind
 * carries) — not a two-line toy that makes everything look fine.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

import apiConfigReducer from "@/lib/redux/slices/apiConfigSlice";
import overlayReducer from "@/lib/redux/slices/overlaySlice";

import { decodeDirective } from "@/features/content-ir/directives/decode";
import {
  asKindInstance,
  directiveItemKind,
} from "@/features/content-ir/directives/itemKind";
import {
  itemFacts,
  itemTitle,
} from "@/features/content-ir/directives/itemSummary";
import { SideEffectDirectiveCard } from "@/features/matrx-envelope/directives/sideEffect/SideEffectDirectiveCard";
import { getDirectiveRenderer } from "@/features/matrx-envelope/registry";
import AGENT_DEFINITION_ITEM from "@/app/(dev)/demos/kind-directives/agent-definition-item.json";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const AGENT_SLUG = "directive_v1_action_create_agent_definition";

function shell(kind: string, items: unknown[]) {
  return { __kind: kind, items };
}

/** The card wires the REAL ApplyDirectiveButton (which reads the API base URL)
 *  and the REAL window opener (which dispatches an overlay), so the test mounts
 *  a real store rather than mocking either away — mocking them would stop the
 *  test proving the two things that matter most: that Apply is wired, and that
 *  the item can be opened. */
function render(node: React.ReactElement): {
  host: HTMLDivElement;
  root: Root;
} {
  const store = configureStore({
    reducer: { apiConfig: apiConfigReducer, overlays: overlayReducer },
  });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<Provider store={store}>{node}</Provider>));
  return { host, root };
}

function cleanup(host: HTMLDivElement, root: Root) {
  act(() => root.unmount());
  host.remove();
}

describe("THE DIRECTIVE⇄KIND SEAM", () => {
  it("resolves a kind-backed shape's item kind from the server-derived map", () => {
    expect(directiveItemKind(AGENT_SLUG)).toBe("agent_definition");
  });

  it("reports null for a shape with no item kind — honest, never invented", () => {
    expect(directiveItemKind("directive_v1_create_task")).toBeNull();
    expect(asKindInstance("directive_v1_create_task", { title: "x" })).toBeNull();
  });

  it("stamps __kind FIRST so a consumer types the item from its own first key", () => {
    const stamped = asKindInstance(AGENT_SLUG, { name: "X" });
    expect(stamped).not.toBeNull();
    expect(Object.keys(stamped!)[0]).toBe("__kind");
    expect(stamped!.__kind).toBe("agent_definition");
  });

  it("never overwrites a marker the item was emitted with", () => {
    const stamped = asKindInstance(AGENT_SLUG, { __kind: "already_set", name: "X" });
    expect(stamped!.__kind).toBe("already_set");
  });
});

describe("the card is registered for every side-effect class", () => {
  it.each(["create", "update", "delete", "action"] as const)(
    "%s resolves a renderer through the prefix rule",
    (directiveClass) => {
      const renderer = getDirectiveRenderer({
        slug: `directive_v1_${directiveClass}_anything_at_all`,
        directiveClass,
      });
      expect(renderer).not.toBeNull();
    },
  );

  it("does not steal a shape that registered by exact slug", () => {
    const generic = getDirectiveRenderer({
      slug: "directive_v1_action_unregistered_probe",
      directiveClass: "action",
    });
    const bespoke = getDirectiveRenderer({
      slug: "directive_v1_action_plan_tree",
      directiveClass: "action",
    });
    expect(bespoke).not.toBe(generic);
  });
});

describe("naming an item — from authority, never a guess", () => {
  it("uses the item's own identity field", () => {
    expect(itemTitle(AGENT_DEFINITION_ITEM as Record<string, unknown>, "create_agent_definition", 0, 1)).toBe(
      "Masterwork Conductor",
    );
  });

  it("falls back to a POSITIONAL label, never a blank and never a slug", () => {
    expect(itemTitle({ some: "payload" }, "unknown_noun", 1, 3)).toBe("Item 2 of 3");
  });

  it("summarizes collections as counts and skips nested objects", () => {
    const facts = itemFacts(AGENT_DEFINITION_ITEM as Record<string, unknown>);
    const keys = facts.map((f) => f.key);
    // Collections become counts...
    expect(keys).toContain("messages");
    // ...identity/prose never becomes a chip...
    expect(keys).not.toContain("name");
    expect(keys).not.toContain("description");
    // ...and every value is a scalar string, never "[object Object]".
    for (const fact of facts) {
      expect(fact.value).not.toContain("[object");
    }
  });
});

describe("the card renders the real thing", () => {
  it("names the write, counts the items, and offers Apply", () => {
    const directive = decodeDirective(shell(AGENT_SLUG, [AGENT_DEFINITION_ITEM]));
    expect(directive).not.toBeNull();
    const { host, root } = render(<SideEffectDirectiveCard directive={directive!} />);
    const text = host.textContent ?? "";

    expect(text).toContain("Masterwork Conductor"); // WHAT it is
    expect(text).toContain("1 item"); // HOW MUCH
    expect(text.toLowerCase()).toContain("apply"); // the action
    // Facts, not novels: the 800-char description must not be in the card.
    expect(text).not.toContain("The ONE canonical Masterwork system");
    cleanup(host, root);
  });

  it("folds a long batch instead of dumping every row", () => {
    const items = Array.from({ length: 7 }, (_, i) => ({ title: `Task ${i + 1}` }));
    const directive = decodeDirective(shell("directive_v1_create_task", items));
    const { host, root } = render(<SideEffectDirectiveCard directive={directive!} />);
    const text = host.textContent ?? "";

    expect(text).toContain("Task 1");
    expect(text).toContain("Task 3");
    expect(text).not.toContain("Task 7");
    expect(text).toContain("Show 4 more");
    cleanup(host, root);
  });

  it("NEVER returns null — an empty batch is stated, not silent", () => {
    const directive = decodeDirective(shell("directive_v1_create_task", []));
    const { host, root } = render(<SideEffectDirectiveCard directive={directive!} />);
    expect(host.textContent).toContain("nothing would be written");
    expect(host.innerHTML.length).toBeGreaterThan(0);
    cleanup(host, root);
  });
});
