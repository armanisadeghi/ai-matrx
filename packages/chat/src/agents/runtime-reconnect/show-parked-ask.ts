// The "Show" button on the waiting-for-you banner and the ask card it points at
// meet here: the banner announces, a folded ask card opens, then the page
// scrolls to the form (`[data-parked-ask]`).
export const SHOW_PARKED_ASK_EVENT = "matrx:show-parked-ask";

export function showParkedAsk(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SHOW_PARKED_ASK_EVENT));
  // After the card has opened and mounted its form.
  window.setTimeout(() => {
    document
      .querySelector("[data-parked-ask]")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 120);
}
