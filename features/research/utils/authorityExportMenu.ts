import { copyText } from "@ai-matrx/kit/clipboard";

import { getCurationData } from "../service";

/** Chunk-size choices. `"0"` = all in one. */
export const AUTHORITY_EXPORT_CHUNK_SIZES = [
  { value: "25", label: "25" },
  { value: "50", label: "50" },
  { value: "0", label: "All" },
] as const;

/** Tighter radio row — default pl-8 leaves a big dead zone before the label. */
export const EXPORT_MENU_RADIO_CLASS =
  "text-xs pl-5 pr-2 [&>span]:left-1.5 [&>span]:size-3 [&_svg]:size-3";

export async function fetchTopicSourceCount(topicId: string): Promise<number> {
  const { rows } = await getCurationData(topicId);
  return rows.length;
}

/** Short batch-size label. Total lives in the section header. */
export function authorityExportBatchLabel(
  value: string,
  totalSources: number | null,
): string {
  const opt = AUTHORITY_EXPORT_CHUNK_SIZES.find((o) => o.value === value);
  if (!opt) return value;
  if (totalSources == null) return opt.label;
  if (value === "0") return opt.label;
  const size = parseInt(value, 10);
  const batches = Math.max(1, Math.ceil(totalSources / size));
  return `${opt.label} × ${batches}`;
}

/** Throws when the copy did not land, so a caller's catch never reports a batch as copied. */
export async function writeExportClipboard(text: string): Promise<void> {
  if (!(await copyText(text))) throw new Error("Could not copy to the clipboard");
}
