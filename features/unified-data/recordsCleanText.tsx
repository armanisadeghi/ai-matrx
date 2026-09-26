"use client";

/**
 * THE MERGED GRID'S HOST PORTS FOR TEXT AND ICONS (records-ui merge tranches 6m and 6j).
 *
 *   cleanText   "Clean HTML" on a record-store cell runs the platform's ONE value cleaner
 *               (`lib/content-cleanup` value engine, its default operations: decode HTML, strip
 *               invisibles, collapse spaces, trim …) — the same engine the /data grid's
 *               Clean-cells button uses, never a second stripHtml.
 *   iconPicker  a row action's button icon comes from the platform's one icon picker.
 */
import { cleanValue } from "@/lib/content-cleanup/clean-cells";
import { DEFAULT_ENABLED_VALUE_OPERATIONS } from "@/lib/content-cleanup/value-operations";
import { IconInputCompact } from "@/components/official/icons/IconInputWithValidation.dynamic";

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

export const RECORDS_TEXT = { cleanText: recordsCleanText, iconPicker: recordsIconPicker };
