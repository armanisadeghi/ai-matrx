import { prependTemplateToDraft } from "./prepend-template-to-draft";

describe("prependTemplateToDraft", () => {
  it("uses only the template when the draft is empty", () => {
    expect(prependTemplateToDraft("  Template body  ", "")).toBe(
      "Template body",
    );
  });

  it("prepends the template, one blank line, then the byte-identical draft", () => {
    const draft = "  Keep my spacing\nAnd every line  ";
    expect(prependTemplateToDraft("Template body", draft)).toBe(
      `Template body\n\n${draft}`,
    );
  });
});
