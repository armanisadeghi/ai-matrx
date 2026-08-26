/**
 * CONTEXT PASSING — unit tests for `resolveApplicationScope`, the single
 * assembly point for the scope every menu launch carries.
 *
 * Certifies:
 *  - the 5 baselines (selection / text_before / text_after / content /
 *    context) are ALWAYS present;
 *  - `contextData` values pass through (and survive alongside a live
 *    `getApplicationScope` builder — underlay, live wins per key);
 *  - the shell-captured selection reaches the scope even on live-scope
 *    surfaces whose builder doesn't track selection;
 *  - an EXPLICIT empty from the live builder is respected (the Vault forces
 *    `selection: ""` as credential-leak hardening — that must never be
 *    overwritten by the DOM capture);
 *  - the DOM-text fallback only fills `content` when nothing else resolved it.
 */

// The manifests registry (used only by the dev-time audit) pulls every surface
// manifest — mock it so the module under test stays light.
// The live SurfaceRuntime registry — mocked so these tests can drive the
// runtime UNDERLAY deterministically (Phase 0, 2026-08-25).
jest.mock("@/features/surfaces/runtime/SurfaceRuntimeContext", () => ({
  getSurfaceRuntime: jest.fn(() => null),
  getSurfaceRuntimeForName: jest.fn(() => null),
}));

jest.mock("@/features/surfaces/manifests/registry", () => ({
  getManifest: () => null,
}));

import {
  resolveApplicationScope,
  resolveActionText,
} from "../value-resolution";
import type { SelectionRange } from "../utils/selection-tracking";

function editableRange(
  value: string,
  start: number,
  end: number,
): SelectionRange {
  return {
    type: "editable",
    element: { value } as unknown as HTMLTextAreaElement,
    start,
    end,
  } as unknown as SelectionRange;
}

describe("resolveApplicationScope", () => {
  it("always carries the 5 baselines (empty-floored)", () => {
    const scope = resolveApplicationScope({
      contextData: {},
      selectedText: "",
      selectionRange: null,
    });
    expect(scope.selection).toBe("");
    expect(scope.text_before).toBe("");
    expect(scope.text_after).toBe("");
    expect(scope.content).toBe("");
    expect(scope.context).toEqual({});
  });

  it("passes every contextData value through and captures the editable triad", () => {
    const scope = resolveApplicationScope({
      contextData: { note_id: "n1", note_title: "Title", content: "abcdef" },
      selectedText: "cd",
      selectionRange: editableRange("abcdef", 2, 4),
    });
    expect(scope.note_id).toBe("n1");
    expect(scope.note_title).toBe("Title");
    expect(scope.selection).toBe("cd");
    expect(scope.text_before).toBe("ab");
    expect(scope.text_after).toBe("ef");
    expect(scope.content).toBe("abcdef"); // contextData.content wins
  });

  it("merges getApplicationScope OVER contextData + capture (live wins per key, nothing wholesale-discarded)", () => {
    const scope = resolveApplicationScope({
      getApplicationScope: () => ({
        live_value: "from-live",
        content: "live content",
      }),
      contextData: { static_value: "from-static", content: "static content" },
      selectedText: "picked words",
      selectionRange: null,
    });
    // Live keys win…
    expect(scope.live_value).toBe("from-live");
    expect(scope.content).toBe("live content");
    // …but static values and the captured selection are NOT discarded.
    expect(scope.static_value).toBe("from-static");
    expect(scope.selection).toBe("picked words");
    expect(resolveActionText(scope)).toEqual({
      text: "picked words",
      source: "selection",
    });
  });

  it("respects an EXPLICIT empty from the live builder (Vault selection hardening)", () => {
    const scope = resolveApplicationScope({
      getApplicationScope: () => ({
        selection: "", // deliberate: a highlight over revealed plaintext must not leak
        content: "names + field keys inventory",
      }),
      contextData: {},
      selectedText: "sk-live-SECRET",
      selectionRange: null,
    });
    expect(scope.selection).toBe("");
    expect(resolveActionText(scope)).toEqual({
      text: "names + field keys inventory",
      source: "content",
    });
  });

  it("uses the DOM-text fallback for content only when nothing else resolved it", () => {
    const used = resolveApplicationScope({
      contextData: {},
      selectedText: "",
      selectionRange: null,
      fallbackContent: "visible page text",
    });
    expect(used.content).toBe("visible page text");

    const notUsed = resolveApplicationScope({
      getApplicationScope: () => ({ content: "surface content" }),
      contextData: {},
      selectedText: "",
      selectionRange: null,
      fallbackContent: "visible page text",
    });
    expect(notUsed.content).toBe("surface content");
  });

  it("live-scope surfaces opt OUT of the DOM-text fallback entirely (Vault contract)", () => {
    // Even with empty live content, the DOM text (which on the Vault can be
    // revealed plaintext) must never be adopted.
    const scope = resolveApplicationScope({
      getApplicationScope: () => ({ selection: "", content: "" }),
      contextData: {},
      selectedText: "",
      selectionRange: null,
      fallbackContent: "sk-live-SECRET visible in the DOM",
    });
    expect(scope.content).toBe("");
  });

  it("applies the active_text convention (selection falls back to active_text)", () => {
    const scope = resolveApplicationScope({
      contextData: { active_text: "whole body" },
      selectedText: "",
      selectionRange: null,
    });
    expect(scope.selection).toBe("whole body");
  });

  it("never leaks the internal keys (contextFilter, __entity) into the scope", () => {
    const scope = resolveApplicationScope({
      contextData: { contextFilter: "x", __entity: { id: "e" }, keep: "yes" },
      selectedText: "",
      selectionRange: null,
    });
    expect("contextFilter" in scope).toBe(false);
    expect("__entity" in scope).toBe(false);
    expect(scope.keep).toBe("yes");
  });
});


// ---------------------------------------------------------------------------
// THE RUNTIME UNDERLAY (Phase 0, 2026-08-25)
// ---------------------------------------------------------------------------

import {
  getSurfaceRuntime,
  getSurfaceRuntimeForName,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";

const mockRuntimeForName = getSurfaceRuntimeForName as jest.Mock;
const mockRuntimeGlobal = getSurfaceRuntime as jest.Mock;

function mountRuntime(surfaceName: string, scope: Record<string, unknown>) {
  const value = { surfaceName, getScope: () => scope };
  mockRuntimeForName.mockImplementation((n: string) =>
    n === surfaceName ? value : null,
  );
  mockRuntimeGlobal.mockImplementation(() => value);
}

describe("the mounted-SurfaceRuntime underlay", () => {
  afterEach(() => {
    mockRuntimeForName.mockImplementation(() => null);
    mockRuntimeGlobal.mockImplementation(() => null);
  });

  it("fills a silence — a rich page no longer yields an inert menu", () => {
    mountRuntime("matrx-user/rulebook", { rules_visible: "42 rules" });
    const scope = resolveApplicationScope({
      contextData: {},
      selectedText: "",
      selectionRange: null,
      surfaceName: "matrx-user/rulebook",
    });
    expect(scope.rules_visible).toBe("42 rules");
  });

  it("never overrides a value the surface's static payload provided", () => {
    mountRuntime("matrx-user/rulebook", { rules_visible: "from runtime" });
    const scope = resolveApplicationScope({
      contextData: { rules_visible: "from the surface" },
      selectedText: "",
      selectionRange: null,
      surfaceName: "matrx-user/rulebook",
    });
    expect(scope.rules_visible).toBe("from the surface");
  });

  it("🚨 respects an EXPLICIT empty from a live builder (the Vault contract)", () => {
    // The Vault forces `selection: ""` as credential-leak hardening. An empty
    // that the surface CHOSE is an answer, and the page it sits on must never
    // refill it.
    mountRuntime("matrx-user/vault", { selection: "sk-live-leaked-secret" });
    const scope = resolveApplicationScope({
      getApplicationScope: () => ({ selection: "", content: "" }),
      contextData: {},
      selectedText: "whatever the DOM saw",
      selectionRange: null,
      surfaceName: "matrx-user/vault",
    });
    expect(scope.selection).toBe("");
    expect(scope.content).toBe("");
  });

  it("skips an ASYNC getScope rather than resolving a promise into the scope", () => {
    const value = {
      surfaceName: "matrx-user/slow",
      getScope: () => Promise.resolve({ late: "value" }),
    };
    mockRuntimeForName.mockImplementation(() => value);
    const scope = resolveApplicationScope({
      contextData: {},
      selectedText: "",
      selectionRange: null,
      surfaceName: "matrx-user/slow",
    });
    expect(scope.late).toBeUndefined();
    expect(typeof (scope as Record<string, unknown>).then).toBe("undefined");
  });

  it("survives a runtime that throws, without taking the menu down", () => {
    mockRuntimeForName.mockImplementation(() => ({
      surfaceName: "matrx-user/broken",
      getScope: () => {
        throw new Error("boom");
      },
    }));
    jest.spyOn(console, "error").mockImplementation(() => {});
    const scope = resolveApplicationScope({
      contextData: { content: "still here" },
      selectedText: "",
      selectionRange: null,
      surfaceName: "matrx-user/broken",
    });
    expect(scope.content).toBe("still here");
  });
});


// ---------------------------------------------------------------------------
// THE AMBIENT LAYER (Phase 1, 2026-08-25)
// ---------------------------------------------------------------------------

describe("the ambient layer", () => {
  const ambient = {
    active_organization_id: "org-1",
    active_scope_ids: ["scope-a"],
    surface_name: "matrx-user/rulebook",
  };

  it("lands on ONE namespaced key, never spread across the scope", () => {
    const scope = resolveApplicationScope({
      contextData: {},
      selectedText: "",
      selectionRange: null,
      ambient,
    });
    expect(scope.ambient).toEqual(ambient);
    // The individual facts must NOT leak in as top-level values — that would
    // collide with surface value names and flood Context Admin.
    expect(scope.active_organization_id).toBeUndefined();
    expect(scope.surface_name).toBeUndefined();
  });

  it("never overrides a surface that emits its own `ambient`", () => {
    const scope = resolveApplicationScope({
      contextData: { ambient: { mine: true } },
      selectedText: "",
      selectionRange: null,
      ambient,
    });
    expect(scope.ambient).toEqual({ mine: true });
  });

  it("never overrides a live builder's `ambient`", () => {
    const scope = resolveApplicationScope({
      getApplicationScope: () => ({ ambient: { fromBuilder: true } }),
      contextData: {},
      selectedText: "",
      selectionRange: null,
      ambient,
    });
    expect(scope.ambient).toEqual({ fromBuilder: true });
  });

  it("is absent when the engine passes nothing", () => {
    const scope = resolveApplicationScope({
      contextData: {},
      selectedText: "",
      selectionRange: null,
    });
    expect(scope.ambient).toBeUndefined();
  });
});
