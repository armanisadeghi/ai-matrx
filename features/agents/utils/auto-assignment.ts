import type {
  AutoAssignValue,
  VariableCustomComponent,
} from "@/features/agents/types/agent-definition.types";
import { readOptions, readStructuredList } from "./variable-customcomponent";

export const RANDOM_AUTO_ASSIGN_VALUE: AutoAssignValue = Object.freeze({
  type: "auto_assign",
  strategy: "random",
});

export function isAutoAssignValue(value: unknown): value is AutoAssignValue {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 2 &&
    record.type === "auto_assign" &&
    record.strategy === "random"
  );
}

export function hasRandomOptionSource(
  customComponent: VariableCustomComponent | undefined,
): boolean {
  return (
    !!readStructuredList(customComponent)?.listId ||
    readOptions(customComponent).some((option) => option.length > 0)
  );
}

export function supportsRandomAssignment(
  customComponent: VariableCustomComponent | undefined,
): boolean {
  return (
    customComponent?.assignment?.random === true &&
    hasRandomOptionSource(customComponent)
  );
}
