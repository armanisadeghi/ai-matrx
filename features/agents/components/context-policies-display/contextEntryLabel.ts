/**
 * THE WORDS A CONTEXT ENTRY IS SHOWN BY — one function for every chip, rail, popover and preview
 * (lane HANDOVER, 2026-09-28).
 *
 * A table's agent button (Cedar Ridge Physical Therapy's "Draft a home-exercise reminder") hands
 * the agent its table and row as context entries keyed `table_id`, `table_name`, `table_columns`,
 * `row_id`. Seven surfaces fell back to the raw key when an entry carried no label, so the composer
 * under the run read "table_id  table_name  table_colu…". A label someone wrote wins; otherwise
 * the key is read aloud ("Table ID", "Table Columns") by the platform's one text-case reader.
 */
import { formatText } from "@ai-matrx/kit/text-case";

export function contextEntryLabel(
  entry: { key: string; label?: string | null },
  policyLabel?: string | null,
): string {
  const written = policyLabel?.trim() || entry.label?.trim();
  if (written) return written;
  return formatText(entry.key) || entry.key;
}
