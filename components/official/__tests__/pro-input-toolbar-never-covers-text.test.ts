/**
 * THE TOOLBAR NEVER COVERS TEXT. On the message-template name field at 375px the
 * mic + "…" cluster sat on top of the typed name (a tap on a phone is a lasting
 * hover). The field now reserves the width its visible right-hand controls take.
 */
import {
  PRO_INPUT_MIN_RIGHT_PADDING_PX,
  PRO_INPUT_TEXT_GAP_PX,
  reservedRightPaddingPx,
} from "@/components/official/proInputReservedPadding";

describe("ProInput reserves the width of the controls it shows", () => {
  it("reserves the whole cluster while the mic and the menu are showing", () => {
    // mic + device chevron (60px) + "…" (44px) + clear (44px)
    expect(
      reservedRightPaddingPx({ clusterWidth: 148, auxWidth: 104, auxVisible: true }),
    ).toBe(148 + PRO_INPUT_TEXT_GAP_PX);
  });

  it("reserves only clear/submit while the mic and the menu are faded out", () => {
    expect(
      reservedRightPaddingPx({ clusterWidth: 148, auxWidth: 104, auxVisible: false }),
    ).toBe(44 + PRO_INPUT_TEXT_GAP_PX);
  });

  it("keeps the ordinary inset when nothing on the right is visible", () => {
    expect(
      reservedRightPaddingPx({ clusterWidth: 104, auxWidth: 104, auxVisible: false }),
    ).toBe(PRO_INPUT_MIN_RIGHT_PADDING_PX);
  });

  it("rounds a fractional measurement up, so a half pixel of text is never under a button", () => {
    expect(
      reservedRightPaddingPx({ clusterWidth: 103.2, auxWidth: 0, auxVisible: true }),
    ).toBe(104 + PRO_INPUT_TEXT_GAP_PX);
  });

  it("answers null before anything is measured, so the class fallback stays in charge", () => {
    expect(
      reservedRightPaddingPx({ clusterWidth: 0, auxWidth: 0, auxVisible: true }),
    ).toBeNull();
  });
});
