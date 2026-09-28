/**
 * WHAT A COLUMN STORES, IN A PERSON'S WORDS — ONE LIST FOR EVERY PICKER (DATA-V2-BASICS-2 T3).
 *
 * The Sheet had three pickers for the same choice and three vocabularies: Add column said
 * "String · Json · Array · Datetime", Configure Table "Integer · Boolean · DateTime · JSON · Array",
 * the column's own settings "Whole number · Yes / No · Date & time · Structured data · List". And the
 * two change pickers offered kinds a record-store column cannot be changed into, so Save did nothing.
 * Every picker reads this list; a change picker on a record-store table offers only what the store
 * can change a column into (the column's current kind always stays listed).
 */
import type { FieldDataType } from "./types";

export type ColumnStorageType = { value: FieldDataType; label: string; description: string };

export const COLUMN_STORAGE_TYPES: readonly ColumnStorageType[] = [
  { value: "string", label: "Text", description: "Words and anything typed" },
  { value: "number", label: "Number", description: "Amounts, with decimals" },
  { value: "integer", label: "Whole number", description: "Counts, no decimals" },
  { value: "boolean", label: "Yes / No", description: "A tick box" },
  { value: "date", label: "Date", description: "A day on the calendar" },
  { value: "datetime", label: "Date & time", description: "A day and a time of day" },
  { value: "json", label: "Structured data", description: "Nested values, for integrations" },
  { value: "array", label: "List", description: "Several values in one cell" },
];

/** The words for a storage type, never the storage word itself. */
export function storageTypeLabel(value: string | null | undefined): string {
  return COLUMN_STORAGE_TYPES.find((t) => t.value === value)?.label ?? "Text";
}

/**
 * The kinds a column may be CHANGED into. On a record-store table only those the store can convert
 * to (`changeInto`), plus the column's current kind; anywhere else, all of them.
 */
export function storageTypesToChangeInto(args: {
  onTheRecordStore: boolean;
  changeInto: readonly string[];
  current: string;
}): readonly ColumnStorageType[] {
  if (!args.onTheRecordStore) return COLUMN_STORAGE_TYPES;
  return COLUMN_STORAGE_TYPES.filter((t) => args.changeInto.includes(t.value) || t.value === args.current);
}
