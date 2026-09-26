"use client";

/**
 * THE MERGED GRID'S HOST PORTS FOR TEXT AND ICONS (records-ui merge tranches 6m and 6j).
 *
 *   cleanText   "Clean HTML" on a record-store cell runs the platform's ONE value cleaner
 *               (`lib/content-cleanup` value engine, its default operations: decode HTML, strip
 *               invisibles, collapse spaces, trim …) — the same engine the /data grid's
 *               Clean-cells button uses, never a second stripHtml.
 *   iconPicker  a row action's button icon comes from the platform's one icon picker.
 *   renderText  (below) markdown cells read formatted.
 */
import { cleanValue } from "@/lib/content-cleanup/clean-cells";
import { DEFAULT_ENABLED_VALUE_OPERATIONS } from "@/lib/content-cleanup/value-operations";
import { IconInputCompact } from "@/components/official/icons/IconInputWithValidation.dynamic";
import { RichContent } from "@/components/rich-content/RichContent";
import type { ReactNode } from "react";

export function recordsCleanText(text: string): string {
  return cleanValue(text, DEFAULT_ENABLED_VALUE_OPERATIONS).after;
}

export function recordsIconPicker({ value, label, onChange }: { value: string; label: string; onChange: (name: string) => void }) {
  return (
    <div className="w-[160px]">
      <IconInputCompact id="records-row-action-icon" value={value} placeholder="zap" aria-label={label} onChange={(name: string) => onChange(name)} />
    </div>
  );
}

/**
 * renderText    a long-text cell of the merged grid and its whole-text Preview (slot "cell") read
 *               through the platform's ONE rich-text renderer, inline level — the same one the
 *               older /data grid's markdown cells used. The form slots are left as written here.
 */
export function recordsRenderText(text: string, where: string): ReactNode {
  if (where !== "cell") return text;
  return <RichContent level="inline" source={text} isStreaming={false} />;
}

export const RECORDS_TEXT = { cleanText: recordsCleanText, iconPicker: recordsIconPicker, renderText: recordsRenderText };
