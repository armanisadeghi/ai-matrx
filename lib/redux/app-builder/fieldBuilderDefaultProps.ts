/**
 * Default field component props and partial FieldBuilder (leaf: no import from app-builder slice/thunks).
 * Kept in sync with the former in-slice exports for behavior parity.
 */
import type { ComponentProps } from "@/types/customAppTypes";
import { FieldBuilder } from "@/lib/redux/app-builder/types";

export const FIELD_DEFAULT_COMPONENT_PROPS: ComponentProps = {
  min: 0,
  max: 100,
  step: 1,
  rows: 3,
  minDate: "",
  maxDate: "",
  onLabel: "Yes",
  offLabel: "No",
  multiSelect: false,
  maxItems: 99999,
  minItems: 0,
  gridCols: "grid-cols-1",
  autoComplete: "off",
  direction: "vertical",
  customContent: "",
  showSelectAll: false,
  width: "w-full",
  valuePrefix: "",
  valueSuffix: "",
  maxLength: 999999,
  spellCheck: false,
  tableRules: {
    canAddRows: true,
    canSortRows: true,
    canEditCells: true,
    canAddColumns: true,
    canDeleteRows: true,
    canSortColumns: true,
    canDeleteColumns: true,
    canRenameColumns: true,
  },
};

export const DEFAULT_FIELD: Partial<FieldBuilder> = {
  label: "",
  description: "",
  helpText: "",
  group: "default",
  iconName: "",
  component: "textarea",
  required: false,
  placeholder: "",
  defaultValue: "",
  options: [],
  componentProps: FIELD_DEFAULT_COMPONENT_PROPS,
  includeOther: false,
  isPublic: false,
  isDirty: false,
  isLocal: true,
};
