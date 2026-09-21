import type { PcShow } from "../../types";

/** The one local-search projection; IDs stay searchable without a second filter. */
export function podcastShowSearchText(show: PcShow): string {
  return [show.id, show.title, show.slug, show.author ?? ""].join(" ");
}
