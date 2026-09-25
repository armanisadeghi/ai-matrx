/**
 * THE VIEW AS THE PERSON SEES IT, in the table page's capture (lane V24-TAILS, VERIFIER-24 item 6).
 *
 * The capture said `Board grouped by: not chosen` while the page showed admin's own Kanban look
 * grouped by Trade: it read only the address (`?group=`), never the merged view + look the page
 * draws. `@ai-matrx/records-ui` TablePage reports that merged state (`onShownViewChange`); this
 * turns the report into the capture's words. Pure; the suite drives it.
 */

/** The shape `TablePage.onShownViewChange` reports (records-ui `ShownViewReport`). */
export interface ShownViewLike {
  viewId: string | null;
  viewName: string | null;
  showing: string;
  groupField: string | null;
  dateField: string | null;
  swimlaneField: string | null;
  fromLook: string[];
  fromAddress: string[];
  lookDiffers: boolean;
}

function whose(key: string, shown: ShownViewLike): string {
  if (shown.fromAddress.includes(key)) return "the address, for this visit";
  if (shown.fromLook.includes(key)) return "your own look";
  return "the saved view";
}

/** The capture's selection lines for the view as drawn. `null` report: the page has not said yet. */
export function shownViewSelection(
  shown: ShownViewLike | null,
  addressGroupField: string | null,
): Record<string, string | { id: string | null; name: string | null } | null> {
  if (!shown) {
    return {
      "Board grouped by": addressGroupField
        ? `${addressGroupField} (the address, for this visit)`
        : "the view is still opening; its grouping is not known yet",
    };
  }
  const out: Record<string, string | { id: string | null; name: string | null } | null> = {
    "Saved view": { id: shown.viewId, name: shown.viewName },
    Showing: `${shown.showing} (${whose("layout", shown)})`,
    "Board grouped by": shown.groupField
      ? `${shown.groupField} (${whose("groupField", shown)})`
      : "none: the board is not grouped",
  };
  if (shown.dateField) out["Dates from"] = `${shown.dateField} (${whose("dateField", shown)})`;
  if (shown.swimlaneField) out["Swimlanes by"] = `${shown.swimlaneField} (${whose("swimlaneField", shown)})`;
  out["Your look"] = shown.lookDiffers
    ? "differs from the saved view; only you see it"
    : "matches the saved view";
  return out;
}
