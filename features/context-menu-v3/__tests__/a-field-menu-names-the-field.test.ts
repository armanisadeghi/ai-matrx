/**
 * @jest-environment jsdom
 */
/**
 * THE MENU OPENED IN A FIELD NAMES THE FIELD (page-pass 2026-09-27). The Body
 * box of a message template headed its menu "Content: {{reply.body}}".
 */
import { menuHeader } from "../alchemy-provider";
import { fieldLabelOf, fieldPreview, mergeFieldName } from "../utils/field-menu-header";

describe("a field's menu header", () => {
  it("is the field's name, with no preview when the text is only merge fields", () => {
    expect(menuHeader({ source: "content", text: "{{reply.body}}" }, "Body")).toEqual({ content: "", contentLabel: "Body" });
  });

  it("adds a short plain preview with merge fields named", () => {
    expect(menuHeader({ source: "content", text: "Hi {{reply.first_name}}, thanks for **writing** in." }, "Body")).toEqual({
      content: "Hi Reply first name, thanks for writing in.",
      contentLabel: "Body",
    });
    expect(fieldPreview("x".repeat(90))).toHaveLength(60);
    expect(mergeFieldName("reply.body")).toBe("Reply body");
  });

  it("keeps the selection header when text is selected, and the content header outside a field", () => {
    expect(menuHeader({ source: "selection", text: "thanks" }, "Body").contentLabel).toBeNull();
    expect(menuHeader({ source: "content", text: "# Clinic intake" }, null)).toEqual({ content: "Clinic intake", contentLabel: null });
  });

  it("names a chat message by its role instead of dumping the answer", () => {
    expect(menuHeader({ source: "content", text: "Stop 1 is Oakwood HOA; the chlorine check is at 11:30." }, null, { role: "assistant" })).toEqual({
      content: "",
      contentLabel: "AI answer",
    });
    expect(menuHeader({ source: "content", text: "When is stop 1?" }, null, { role: "user" }).contentLabel).toBe("Your message");
    expect(menuHeader({ source: "selection", text: "Oakwood" }, null, { role: "assistant" }).contentLabel).toBeNull();
    const withTime = menuHeader({ source: "content", text: "Stop 1" }, null, { role: "assistant", createdAt: "2026-09-27T15:42:00Z" }).contentLabel;
    expect(withTime).toMatch(/^AI answer · Sep 27, /);
  });

  it("reads a field's name from aria-label, a <label for>, or aria-labelledby", () => {
    document.body.innerHTML = `
      <label for="subject">Subject *</label><input id="subject" />
      <div id="bl">Body</div><div contenteditable="true" aria-labelledby="bl"></div>
      <textarea aria-label="Notes"></textarea>
      <input id="nameless" />`;
    expect(fieldLabelOf(document.getElementById("subject"))).toBe("Subject");
    expect(fieldLabelOf(document.querySelector('[contenteditable]'))).toBe("Body");
    expect(fieldLabelOf(document.querySelector("textarea"))).toBe("Notes");
    expect(fieldLabelOf(document.getElementById("nameless"))).toBeNull();
  });
});
