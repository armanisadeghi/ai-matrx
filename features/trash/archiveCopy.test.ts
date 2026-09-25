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

  it("points at the one trash route", () => {
    expect(TRASH_HREF).toBe("/trash");
  });
});
