import { isReadOnlyEditorTab } from "./editor-tab-access";

describe("isReadOnlyEditorTab", () => {
  it("honors explicit read-only tabs", () => {
    expect(isReadOnlyEditorTab({ id: "library:one", readOnly: true })).toBe(
      true,
    );
  });

  it("protects Git virtual tabs even if old state omitted the field", () => {
    expect(isReadOnlyEditorTab({ id: "git-diff:sandbox:one" })).toBe(true);
    expect(isReadOnlyEditorTab({ id: "auto-stash-diff:sandbox:one" })).toBe(
      true,
    );
  });

  it("leaves ordinary persisted and sandbox files editable", () => {
    expect(isReadOnlyEditorTab({ id: "library:one" })).toBe(false);
    expect(isReadOnlyEditorTab({ id: "sandbox:one:/home/agent/a.ts" })).toBe(
      false,
    );
  });
});
