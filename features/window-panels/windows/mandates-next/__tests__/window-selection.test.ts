/**
 * The mandate window's open mandate changes ONLY when the person picks one.
 *
 * Defect (review, 2026-09-24): selection fell back to the first VISIBLE row,
 * so switching the scope tab or typing in search switched the open mandate,
 * rewrote the URL and re-read the record; an unknown key silently opened a
 * different mandate.
 */
import { windowSelectionOf } from "../window-selection";

const rows = [
  { id: "a", mandate_key: "seo.alpha" },
  { id: "b", mandate_key: "shortcut.beta" },
];

describe("windowSelectionOf", () => {
  it("never picks a mandate the person did not choose", () => {
    expect(windowSelectionOf(rows, null)).toEqual({ status: "unchosen" });
  });

  it("an unknown key is 'not found', never another mandate", () => {
    expect(windowSelectionOf(rows, "seo.gone")).toEqual({
      status: "not-found",
      key: "seo.gone",
    });
  });

  it("keeps the chosen key while the list is still loading (or failed)", () => {
    expect(windowSelectionOf(null, "shortcut.beta")).toEqual({
      status: "pending",
      key: "shortcut.beta",
    });
  });

  it("filtering the list does not move the open mandate", () => {
    // The chosen row is filtered OUT of what the sidebar shows; the selection
    // reads the whole list, so it is still the one open.
    const chosen = windowSelectionOf(rows, "shortcut.beta");
    expect(chosen.status === "found" && chosen.row.id).toBe("b");
  });

  it("opens by row id too", () => {
    const byId = windowSelectionOf(rows, "a");
    expect(byId.status === "found" && byId.row.mandate_key).toBe("seo.alpha");
  });
});
