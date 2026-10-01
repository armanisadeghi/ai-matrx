import { archiveConfirmSentence, TRASH_HREF } from "./archiveCopy";

describe("archiveConfirmSentence", () => {
  it("names the thing, says it is archived, and names Trash as the way back", () => {
    const s = archiveConfirmSentence("the show");
    expect(s).toBe(
      "This archives the show. It leaves this list, and you can restore it from Trash.",
    );
  });

  it("never claims permanence", () => {
    const s = archiveConfirmSentence('"Harborview Garage Talk"');
    expect(s).not.toMatch(/cannot be undone|can't be undone|permanent/i);
    expect(s).toMatch(/restore it from Trash/);
  });

  it("reads as English when nothing is named", () => {
    expect(archiveConfirmSentence("  ")).toBe(
      "This archives it. It leaves this list, and you can restore it from Trash.",
    );
  });

  it("speaks of several things in the plural (V6-B: 'restore it' for 2 Sources)", () => {
    expect(archiveConfirmSentence("these Sources", { count: 2 })).toBe(
      "This archives these Sources. They leave this list, and you can restore them from Trash.",
    );
  });

  it("names the page's archive filter when that is where restore lives (V6-B)", () => {
    expect(archiveConfirmSentence("these Sources", { count: 2, restoreFrom: "archive_filter" })).toBe(
      "This archives these Sources. They leave this list, and you can restore them from Archived only.",
    );
  });

  it("points at the one trash route", () => {
    expect(TRASH_HREF).toBe("/trash");
  });
});
