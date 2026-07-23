// features/scopes/utils/__tests__/scopeMismatch.test.ts
//
// Unit coverage for the pure chat↔scope mismatch decision logic that
// drives the pre-send gate (conversationScopeGate.ts). The four gate
// cases + choice→target routing, in isolation from Redux and the dialog.

import type { OrgNode } from "@/features/scopes/types";
import {
  buildScopeDisplayItems,
  evaluateScopeMismatchGate,
  resolveScopeMismatchTarget,
  sameScopeIdSet,
  scopeSetPairKey,
} from "../scopeMismatch";

describe("sameScopeIdSet", () => {
  it("treats order and duplicates as irrelevant", () => {
    expect(sameScopeIdSet(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameScopeIdSet(["a", "a", "b"], ["b", "a"])).toBe(true);
    expect(sameScopeIdSet([], [])).toBe(true);
  });

  it("detects inequality in both directions", () => {
    expect(sameScopeIdSet(["a"], ["a", "b"])).toBe(false);
    expect(sameScopeIdSet(["a", "b"], ["a"])).toBe(false);
    expect(sameScopeIdSet(["a"], ["b"])).toBe(false);
  });
});

describe("evaluateScopeMismatchGate", () => {
  it("case 1 — untagged chat (C = ∅): proceed, regardless of A", () => {
    expect(evaluateScopeMismatchGate(["a"], [])).toEqual({ kind: "proceed" });
    expect(evaluateScopeMismatchGate([], [])).toEqual({ kind: "proceed" });
  });

  it("case 2 — empty sidebar (A = ∅, C ≠ ∅): use the chat's own scopes", () => {
    expect(evaluateScopeMismatchGate([], ["c1", "c2"])).toEqual({
      kind: "use-chat",
      scopeIds: ["c1", "c2"],
    });
  });

  it("case 3 — both non-empty and different: ask", () => {
    expect(evaluateScopeMismatchGate(["a"], ["c"])).toEqual({ kind: "ask" });
    // Subset/superset is still set inequality → ask.
    expect(evaluateScopeMismatchGate(["a"], ["a", "c"])).toEqual({
      kind: "ask",
    });
    expect(evaluateScopeMismatchGate(["a", "c"], ["a"])).toEqual({
      kind: "ask",
    });
  });

  it("case 4 — equal sets: proceed with no ask", () => {
    expect(evaluateScopeMismatchGate(["a", "b"], ["b", "a"])).toEqual({
      kind: "proceed",
    });
  });
});

describe("resolveScopeMismatchTarget", () => {
  const A = ["a1", "a2"];
  const C = ["a1", "c1"];

  it("update → the current selection (A)", () => {
    expect(resolveScopeMismatchTarget("update", A, C)).toEqual(["a1", "a2"]);
  });

  it("combine → A ∪ C, deduplicated", () => {
    expect(resolveScopeMismatchTarget("combine", A, C).sort()).toEqual([
      "a1",
      "a2",
      "c1",
    ]);
  });

  it("keep → the chat's context (C)", () => {
    expect(resolveScopeMismatchTarget("keep", A, C)).toEqual(["a1", "c1"]);
  });

  it("target sets converge: after any choice, re-running the gate asks nothing", () => {
    for (const choice of ["update", "combine", "keep"] as const) {
      const target = resolveScopeMismatchTarget(choice, A, C);
      // target becomes both the send's scope_ids and the chat's tags —
      // active selection vs new tags must not re-trigger an ask unless
      // the user changes something.
      expect(
        evaluateScopeMismatchGate(target, target),
      ).toEqual({ kind: "proceed" });
    }
  });
});

describe("scopeSetPairKey", () => {
  const A = ["a1", "a2"];
  const C = ["a1", "c1"];

  it("is order- and duplicate-insensitive per set, but side-sensitive", () => {
    expect(scopeSetPairKey(["a", "b"], ["c"])).toBe(
      scopeSetPairKey(["b", "a", "a"], ["c"]),
    );
    expect(scopeSetPairKey(["a"], ["c"])).not.toBe(
      scopeSetPairKey(["c"], ["a"]),
    );
  });

  it("no-re-ask memory: the post-choice pair matches an unchanged next send", () => {
    for (const choice of ["combine", "keep"] as const) {
      const target = resolveScopeMismatchTarget(choice, A, C);
      const recorded = scopeSetPairKey(A, target);
      // Next send: A unchanged, chat tags = target → same key → no re-ask.
      expect(scopeSetPairKey(A, target)).toBe(recorded);
      // Changing either side re-asks.
      expect(scopeSetPairKey([...A, "new"], target)).not.toBe(recorded);
      expect(scopeSetPairKey(A, [...target, "new"])).not.toBe(recorded);
    }
  });
});

describe("buildScopeDisplayItems", () => {
  const organizations: Record<string, OrgNode> = {
    org1: {
      id: "org1",
      name: "Org",
      abbreviation: "ORG",
      slug: "org",
      is_personal: false,
      role: "owner",
      projects: [],
      scope_types: [
        {
          id: "t1",
          organization_id: "org1",
          label_singular: "Client",
          label_plural: "Clients",
          icon: "",
          color: "",
          max_assignments_per_entity: null,
          sort_order: 0,
          parent_type_id: null,
          default_variable_keys: [],
          scopes: [
            {
              id: "s1",
              scope_type_id: "t1",
              organization_id: "org1",
              name: "Rejuvina",
              description: "",
              parent_scope_id: null,
              settings: null,
            },
          ],
        },
      ],
    },
  };

  it("resolves names and scope-type labels from the tree", () => {
    expect(buildScopeDisplayItems(["s1"], organizations)).toEqual([
      { id: "s1", name: "Rejuvina", typeLabel: "Client" },
    ]);
  });

  it("never drops an unresolvable id — labelled fallback instead", () => {
    expect(buildScopeDisplayItems(["ghost"], organizations)).toEqual([
      { id: "ghost", name: "Unknown scope", typeLabel: "Scope" },
    ]);
  });
});
