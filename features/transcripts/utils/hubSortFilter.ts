import type { TranscriptSortKey } from "@/features/transcripts/components/TranscriptsSortMenu";
import type { TranscriptHubItem } from "@/features/transcripts/types/hub";

export function hubItemMatchesQuery(
  item: TranscriptHubItem,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (item.title.toLowerCase().includes(q)) return true;
  if (item.kind === "processor") {
    if (item.description.toLowerCase().includes(q)) return true;
    if (item.folderName.toLowerCase().includes(q)) return true;
    if (item.tags.some((t) => t.toLowerCase().includes(q))) return true;
  }
  if (item.kind === "session" || item.kind === "cleanup") {
    if (item.status.toLowerCase().includes(q)) return true;
  }
  return false;
}

function durationSortValue(item: TranscriptHubItem): number {
  if (item.kind === "processor") return item.durationSeconds ?? 0;
  if (item.kind === "unsorted") return (item.durationMs ?? 0) / 1000;
  return item.durationMs / 1000;
}

function wordSortValue(item: TranscriptHubItem): number {
  return item.kind === "processor" ? (item.wordCount ?? 0) : 0;
}

export function sortHubItems(
  items: TranscriptHubItem[],
  sortKey: TranscriptSortKey,
): TranscriptHubItem[] {
  const list = [...items];
  switch (sortKey) {
    case "title":
      list.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case "created":
      list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      break;
    case "duration":
      list.sort((a, b) => durationSortValue(b) - durationSortValue(a));
      break;
    case "words":
      list.sort((a, b) => wordSortValue(b) - wordSortValue(a));
      break;
    case "updated":
    default:
      list.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }
  return list;
}
