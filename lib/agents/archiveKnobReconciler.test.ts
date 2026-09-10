/**
 * THE ARCHIVED-ITEMS LAW, catalog knob (register row A2b).
 *
 * These are forcing tests: each one fails on the naive wiring it exists to
 * prevent. "The knob is read at mount" fails case 1. "Re-seed whatever does not
 * match the knob" fails cases 2 and 4. "Record after writing" fails case 3 —
 * the exact re-entrancy the catalog's synchronous publish creates.
 */

import type { AgentArchFilter } from "@ai-matrx/agents/catalog";

import { createArchiveKnobReconciler } from "./archiveKnobReconciler";
import { toCatalogArchiveFilter } from "./catalog";

interface Harness {
  consumers: Record<string, { archFilter: AgentArchFilter }>;
  applied: { consumerId: string; archFilter: AgentArchFilter }[];
}

/**
 * A stand-in for the catalog's consumer registry. `publishesSynchronously`
 * reproduces the real thing: `setConsumerFilter` publishes, every subscriber
 * runs, and this host's subscriber is the reconciler itself.
 */
function harness(
  creationDefault: AgentArchFilter,
  options: { publishesSynchronously?: boolean } = {},
) {
  const state: Harness = { consumers: {}, applied: [] };
  let knob: AgentArchFilter = creationDefault;
  const reconciler = createArchiveKnobReconciler({
    creationDefault,
    getConsumers: () => state.consumers,
    apply: (consumerId, archFilter) => {
      state.applied.push({ consumerId, archFilter });
      state.consumers[consumerId] = { archFilter };
      if (options.publishesSynchronously) reconciler.reconcile(knob);
    },
  });
  return {
    state,
    /** A picker mounts. Without an override it takes the creation default. */
    register: (consumerId: string, initial?: AgentArchFilter) => {
      state.consumers[consumerId] = { archFilter: initial ?? creationDefault };
    },
    unregister: (consumerId: string) => {
      delete state.consumers[consumerId];
    },
    /** A person moves the control on that picker. */
    touch: (consumerId: string, archFilter: AgentArchFilter) => {
      state.consumers[consumerId] = { archFilter };
    },
    reconcile: (next: AgentArchFilter) => {
      knob = next;
      reconciler.reconcile(next);
    },
    owned: () => reconciler.ownedConsumerIds(),
  };
}

describe("toCatalogArchiveFilter", () => {
  it("speaks the package's three-state vocabulary", () => {
    expect(toCatalogArchiveFilter("active")).toBe("active");
    expect(toCatalogArchiveFilter("all")).toBe("both");
  });
});

describe("createArchiveKnobReconciler", () => {
  it("moves a picker that mounted before the knob rehydrated", () => {
    const h = harness("active");
    h.register("chat-picker");
    h.reconcile("active"); // first paint: the preference has not landed yet

    h.reconcile("both"); // the preference rehydrates: "Shown by default"

    expect(h.state.consumers["chat-picker"]?.archFilter).toBe("both");
    expect(h.state.applied).toEqual([
      { consumerId: "chat-picker", archFilter: "both" },
    ]);
  });

  it("seeds a picker that registers after the knob landed", () => {
    const h = harness("active");
    h.reconcile("both");

    h.register("late-picker");
    h.reconcile("both");

    expect(h.state.consumers["late-picker"]?.archFilter).toBe("both");
  });

  it("never takes an axis back from the person who moved it", () => {
    const h = harness("active");
    h.register("chat-picker");
    h.reconcile("active");

    h.touch("chat-picker", "archived"); // the person clicks the control
    h.reconcile("both"); // and only then flips the global preference

    expect(h.state.consumers["chat-picker"]?.archFilter).toBe("archived");
    expect(h.owned()).toEqual(["chat-picker"]);
  });

  it("does not read its own write as a person's touch", () => {
    // The catalog publishes synchronously inside setConsumerFilter, so the
    // reconciler is called back mid-write. Recording after the write instead of
    // before would mark every consumer it just moved as owned.
    const h = harness("active", { publishesSynchronously: true });
    h.register("chat-picker");
    h.reconcile("both");

    expect(h.owned()).toEqual([]);
    expect(h.state.applied).toHaveLength(1);
    expect(h.state.consumers["chat-picker"]?.archFilter).toBe("both");
  });

  it("leaves a per-consumer initialArchFilter override alone", () => {
    const h = harness("active");
    h.register("admin-system-picker", "archived");
    h.reconcile("both");

    expect(h.state.consumers["admin-system-picker"]?.archFilter).toBe(
      "archived",
    );
    expect(h.owned()).toEqual(["admin-system-picker"]);
  });

  it("forgets a slot that was unregistered, so a recycled id starts fresh", () => {
    const h = harness("active");
    h.register("panel");
    h.reconcile("active");
    h.touch("panel", "archived");
    h.reconcile("active");
    expect(h.owned()).toEqual(["panel"]);

    h.unregister("panel");
    h.reconcile("active");
    h.register("panel");
    h.reconcile("both");

    expect(h.owned()).toEqual([]);
    expect(h.state.consumers["panel"]?.archFilter).toBe("both");
  });
});
