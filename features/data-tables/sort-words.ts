/**
 * THE WORDS A SORT IS SAID IN, BY WHAT THE COLUMN HOLDS (BREAKER-2 B2-28).
 *
 * "Sort A→Z" on a Copay column or a Referral Date column means nothing to a person. The words fit
 * the column's kind — A to Z for words, smallest / largest first for numbers, oldest / newest first
 * for dates, earliest / latest first for times, unticked / ticked first for a tick box — and every
 * menu that offers a sort (the header's right-click menu, the header's own menu) reads them here.
 *
 * A choice column says A to Z: the Sheet sorts it by its words, not by the order of its options, so
 * "first to last choice" would describe a sort that does not happen.
 *
 * Pure: no React.
 */
export type SortWords = { asc: string; desc: string };

const NUMBER_FORMATS = new Set([
  "number", "decimal", "currency", "percent", "progress", "duration", "integer", "rating", "file_size", "autonumber",
]);
const DATE_FORMATS = new Set(["date", "datetime", "created_time", "modified_time", "relative_time"]);

export function sortWordsFor(column: { dataType?: string | null; formatId?: string | null }): SortWords {
  const format = column.formatId ?? "";
  const type = column.dataType ?? "";
  if (format === "time") return { asc: "earliest first", desc: "latest first" };
  if (DATE_FORMATS.has(format) || type === "date" || type === "datetime") {
    return { asc: "oldest first", desc: "newest first" };
  }
  if (NUMBER_FORMATS.has(format) || type === "number" || type === "integer") {
    return { asc: "smallest first", desc: "largest first" };
  }
  if (format === "boolean" || type === "boolean") return { asc: "unticked first", desc: "ticked first" };
  return { asc: "A to Z", desc: "Z to A" };
}
