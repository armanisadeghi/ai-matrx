/**
 * The Sheet's toolbar row at 1280 (DATA-V2-BASICS-2): its tools' words needed ~1300 px in a ~930 px
 * row, and Reorder, Clean, Colors and Get reference were past the edge. The row shows icons alone
 * when the words do not fit, and the words come back only at the width they need — never a flicker.
 */
import { nextSheetToolbarFit } from "../sheet-toolbar-fit";

describe("the Sheet's toolbar row fits its width", () => {
  const words = { compact: false, wordsNeed: 0 };

  it("keeps the words while they fit", () => {
    expect(nextSheetToolbarFit(words, { clientWidth: 1300, scrollWidth: 1298 })).toEqual(words);
  });

  it("shows icons alone when the words run past the row, and remembers what they needed", () => {
    expect(nextSheetToolbarFit(words, { clientWidth: 934, scrollWidth: 1298 })).toEqual({ compact: true, wordsNeed: 1298 });
  });

  it("stays icons at the same width, so the row never flips back and forth", () => {
    const icons = { compact: true, wordsNeed: 1298 };
    // With icons the row now fits easily — that alone must not bring the words back.
    expect(nextSheetToolbarFit(icons, { clientWidth: 934, scrollWidth: 720 })).toEqual(icons);
    expect(nextSheetToolbarFit(icons, { clientWidth: 1297, scrollWidth: 720 })).toEqual(icons);
  });

  it("brings the words back once the row is as wide as they needed", () => {
    expect(nextSheetToolbarFit({ compact: true, wordsNeed: 1298 }, { clientWidth: 1298, scrollWidth: 720 })).toEqual(words);
  });
});
