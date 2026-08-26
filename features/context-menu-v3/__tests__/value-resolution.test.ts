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
