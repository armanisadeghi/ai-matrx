/**
 * A window that shows one piece of the page that opened it (catalogue
 * `closesOnNavigation`) closes on a route change; a workbench window stays.
 * Found live 2026-09-30: a flashcard opened from the deck page kept floating
 * over the Study page after the person pressed Study.
 */
import reducer, {
  closeOverlaysBoundToPage,
  openOverlay,
  selectIsOverlayOpen,
} from "@/lib/redux/slices/overlaySlice";
import { OVERLAY_CATALOGUE } from "@/features/overlays/catalogue";

const wrap = (overlays: ReturnType<typeof reducer>) => ({ overlays });

describe("page-bound overlays close on navigation", () => {
  it("the flashcard item window is declared page-bound", () => {
    expect(OVERLAY_CATALOGUE.flashcardItemWindow).toMatchObject({ closesOnNavigation: true });
  });

  it("closes the page-bound window and keeps workbench windows open", () => {
    let state = reducer(undefined, { type: "@@init" });
    state = reducer(state, openOverlay({ overlayId: "flashcardItemWindow", data: { front: "Q" } }));
    state = reducer(state, openOverlay({ overlayId: "feedbackDialog" }));
    expect(selectIsOverlayOpen(wrap(state), "flashcardItemWindow")).toBe(true);

    state = reducer(state, closeOverlaysBoundToPage());

    expect(selectIsOverlayOpen(wrap(state), "flashcardItemWindow")).toBe(false);
    expect(selectIsOverlayOpen(wrap(state), "feedbackDialog")).toBe(true);
  });
});
