import {
  deriveWorkingDocDiffFrame,
  STRUCTURAL_PATCH_COMMANDS,
} from "../workingDocPatchDiff";
import type { WorkingDocPatchArgs } from "@/features/tool-call-visualization/renderers/working-document/applyWorkingDocPatch";

const strReplace = (oldStr: string, newStr: string): WorkingDocPatchArgs => ({
  command: "str_replace",
  old_str: oldStr,
  new_str: newStr,
});

const append = (text: string, separator = "\n"): WorkingDocPatchArgs => ({
  command: "append",
  new_str: text,
  separator,
});

describe("deriveWorkingDocDiffFrame", () => {
  it("applies a single str_replace optimistically", () => {
    const frame = deriveWorkingDocDiffFrame({
      frozenBefore: "The quick brown fox",
      patches: [strReplace("quick", "slow")],
      serverContent: "The quick brown fox", // server hasn't caught up yet
      reconcile: false,
    });
    expect(frame.before).toBe("The quick brown fox");
    expect(frame.after).toBe("The slow brown fox");
    expect(frame.command).toBe("str_replace");
    expect(frame.isStructural).toBe(false);
  });

  it("folds MULTIPLE patches over the frozen base (cumulative turn diff)", () => {
    const frame = deriveWorkingDocDiffFrame({
      frozenBefore: "Line one",
      patches: [append("Line two"), append("Line three")],
      serverContent: "Line one",
      reconcile: false,
    });
    // Each append accumulates over the previous result, not the frozen base.
    expect(frame.after).toBe("Line one\nLine two\nLine three");
  });

  it("reconciles to server content once settled and diverged", () => {
    const frame = deriveWorkingDocDiffFrame({
      frozenBefore: "before text",
      patches: [strReplace("before", "after")],
      // The server's authoritative content differs slightly from the optimistic
      // apply — reconcile must win.
      serverContent: "AFTER text (server truth)",
      reconcile: true,
    });
    expect(frame.after).toBe("AFTER text (server truth)");
  });

  it("does not reconcile when server has not diverged from before", () => {
    const frame = deriveWorkingDocDiffFrame({
      frozenBefore: "hello world",
      patches: [strReplace("hello", "goodbye")],
      serverContent: "hello world", // unchanged → keep optimistic
      reconcile: true,
    });
    expect(frame.after).toBe("goodbye world");
  });

  it("returns after=null for an unreconciled structural patch", () => {
    const frame = deriveWorkingDocDiffFrame({
      frozenBefore: '{"a":1}',
      patches: [{ command: "json_merge", new_str: '{"b":2}' }],
      serverContent: '{"a":1}',
      reconcile: false,
    });
    expect(frame.isStructural).toBe(true);
    expect(frame.after).toBeNull();
    expect(STRUCTURAL_PATCH_COMMANDS.has("json_merge")).toBe(true);
  });

  it("shows server content for a reconciled structural patch", () => {
    const frame = deriveWorkingDocDiffFrame({
      frozenBefore: '{"a":1}',
      patches: [{ command: "json_merge", new_str: '{"b":2}' }],
      serverContent: '{"a":1,"b":2}',
      reconcile: true,
    });
    expect(frame.after).toBe('{"a":1,"b":2}');
  });

  it("returns after=null when no patch could be applied (unlocatable old_str)", () => {
    const frame = deriveWorkingDocDiffFrame({
      frozenBefore: "some content",
      patches: [strReplace("NONEXISTENT", "x")],
      serverContent: "some content",
      reconcile: false,
    });
    expect(frame.after).toBeNull();
  });
});
