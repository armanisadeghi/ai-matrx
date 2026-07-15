import { FieldOption } from "@/types/customAppTypes";

export interface SelectedOptionValue extends FieldOption {
  selected: boolean;
  otherText?: string;
}

export function isSelectedOptionValue(value: unknown): value is SelectedOptionValue {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "label" in value &&
    typeof value.label === "string" &&
    "selected" in value &&
    typeof value.selected === "boolean"
  );
}

export function selectedOptionValues(value: unknown): SelectedOptionValue[] {
  return Array.isArray(value) ? value.filter(isSelectedOptionValue) : [];
}
