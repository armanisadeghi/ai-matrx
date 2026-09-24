import { MARKDOWN_AUTOSAVE_SLOTS } from "./useMarkdownAutosave";

describe("markdown scratch autosave slots (RC-B1 verify D6)", () => {
  it("gives every surface its own record, so one never overwrites another's draft", () => {
    const ids = Object.values(MARKDOWN_AUTOSAVE_SLOTS);
    expect(new Set(ids).size).toBe(ids.length);
    expect(MARKDOWN_AUTOSAVE_SLOTS["markdown-studio"]).not.toBe(
      MARKDOWN_AUTOSAVE_SLOTS["admin-tester"],
    );
  });

  it("keeps the admin tester on its original record so its saved draft survives", () => {
    expect(MARKDOWN_AUTOSAVE_SLOTS["admin-tester"]).toBe("__autosave__");
  });
});
