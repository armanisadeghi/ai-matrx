import type { PcShow } from "../../types";

/** MatrxDataTable names its interactive row group; generic `group-hover` cannot reveal row actions. */
export const PODCAST_TABLE_ROW_ACTION_REVEAL_CLASS =
  "opacity-0 transition-opacity group-hover/matrx-row:opacity-100 focus-visible:opacity-100";

/** The one local-search projection; IDs stay searchable without a second filter. */
export function podcastShowSearchText(show: PcShow): string {
  return [show.id, show.title, show.slug, show.author ?? ""].join(" ");
}
