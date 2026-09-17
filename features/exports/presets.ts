// features/exports/presets.ts
//
// THE NAMED QUERIES COME FROM THE SERVER, WITH THEIR COUNTS.
//
// A filter panel with eleven controls still asks the person to invent the
// query, which is the half Arman said is ours to do for them. So the queries
// worth running have names — "sent by me", "my longest replies", "drafts and
// abandoned", "where I pushed back" — and the person picks a name.
//
// They are fetched rather than declared here on purpose. The filters they are
// built from and the label vocabulary they match both live on the server
// (aidream/services/bring_your_export/{presets,signals}.py). A preset list
// written in TypeScript drifts from that vocabulary on the first rename, keeps
// returning zero rows, and says nothing — the same reason the adapter catalog
// on the drop screen is served rather than hardcoded.
//
// THE COUNT IS WHY THIS IS NOT JUST A LIST OF BUTTONS. There are no drafts in a
// Slack workspace export and no "pushed back" in a mailbox. Without a count the
// screen shows a control that returns nothing, which is the dead control the
// platform forbids; with one, the screen can leave it out or say why. The
// server computes it over the WHOLE export, not over the page being shown.

import { getJson } from "@/lib/python-client";

/** One named query, as the server describes it for THIS export. */
export interface ExportPreset {
  id: string;
  /** What the control says. */
  label: string;
  /** One plain sentence for the tooltip — never names a column or a filter. */
  description: string;
  /** The sort this preset means; the client does not choose it. */
  order: string;
  direction: "asc" | "desc";
  /** How many items match, across the whole export. */
  count: number;
  /** `count > 0`. Served rather than derived so the rule lives in one place. */
  available: boolean;
  /** The same sentence the send-confirmation will use, so the two cannot differ. */
  filter_description: string;
}

export interface ExportPresetList {
  presets: ExportPreset[];
  total: number;
}

export async function fetchExportPresets(
  libraryId: string,
  signal?: AbortSignal,
): Promise<ExportPresetList> {
  const { data } = await getJson<ExportPresetList>(
    `/media/libraries/${encodeURIComponent(libraryId)}/presets`,
    { signal },
  );
  return data;
}
