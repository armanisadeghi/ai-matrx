import { composeTemplateContent } from "./template-save";

describe("composeTemplateContent", () => {
  it("appends with one blank line", () => {
    expect(composeTemplateContent("Existing", "Incoming", "append")).toBe(
      "Existing\n\nIncoming",
    );
  });

  it("does not add leading whitespace when the existing template is empty", () => {
    expect(composeTemplateContent(null, " Incoming ", "append")).toBe(
      "Incoming",
    );
  });

  it("replaces content when overwriting", () => {
    expect(composeTemplateContent("Existing", " Incoming ", "overwrite")).toBe(
      "Incoming",
    );
  });
});
