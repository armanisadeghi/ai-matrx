// /notes/<id> (page-pass 2026-09-27): "Save to Notes" inside a note; "Edit
// content" / "Open in full-screen editor" inside the editor. Break: any of
// these offered where the menu already is that place → red.
import { actionsAlreadyHere } from "./already-here";

describe("actionsAlreadyHere", () => {
  it("inside a note's editor: no Save to Notes, no editor doors", () => {
    expect(actionsAlreadyHere({ sourceType: "note", surfaceName: "matrx-user/notes", isEditable: true }).sort()).toEqual(
      ["edit", "open-fullscreen-editor", "save-to-notes"],
    );
  });
  it("a note's preview (raw source, notes surface): the page's Write toggle is the editor door", () => {
    expect(actionsAlreadyHere({ sourceType: "raw", surfaceName: "matrx-user/notes", isEditable: false }).sort()).toEqual(
      ["edit", "open-fullscreen-editor", "save-to-notes"],
    );
  });
  it("a note's preview on its own page (note source): the same set as the editor", () => {
    expect(actionsAlreadyHere({ sourceType: "note", surfaceName: "matrx-user/notes", isEditable: false }).sort()).toEqual(
      ["edit", "open-fullscreen-editor", "save-to-notes"],
    );
  });
  it("a note source under another surface name (live Read mode): still no editor doors", () => {
    expect(actionsAlreadyHere({ sourceType: "note", surfaceName: "matrx-user/note-preview", isEditable: false }).sort()).toEqual(
      ["edit", "open-fullscreen-editor", "save-to-notes"],
    );
  });
  it("a chat answer keeps every action", () => {
    expect(actionsAlreadyHere({ sourceType: "chat-message", surfaceName: "matrx-user/chat", isEditable: false })).toEqual([]);
  });
  it("inside the Feedback window: no Submit feedback (it would reopen itself)", () => {
    expect(actionsAlreadyHere({ sourceType: "raw", surfaceName: "matrx-user/feedback", isEditable: true })).toContain("submit-feedback");
    expect(actionsAlreadyHere({ sourceType: "raw", surfaceName: "matrx-user/notes", isEditable: false })).not.toContain("submit-feedback");
  });
});
