import type { VocabularyDraftRow } from "../types";
import {
  findDraftIssues,
  RESERVED_NEGATIVE,
  type DraftIssue,
} from "../vocabulary/lib";
import type { SettingsScope, ValueLevel } from "./data";

export function isReservedValueLevel(level: Pick<ValueLevel, "value">): boolean {
  return level.value === RESERVED_NEGATIVE;
}

export function mayRemoveValueLevel(
  scope: SettingsScope,
  level: Pick<ValueLevel, "value">,
): boolean {
  return scope !== "platform" && !isReservedValueLevel(level);
}

function toVocabularyRows(levels: ValueLevel[]): VocabularyDraftRow[] {
  return levels.map((level, index) => ({
    value: level.value,
    label: level.label ?? level.value,
    description: null,
    sort: index,
    config: isReservedValueLevel(level)
      ? {}
      : { min_score: level.min_score },
  }));
}

export function findValueLevelIssues(levels: ValueLevel[]): DraftIssue[] {
  return findDraftIssues("value_band", toVocabularyRows(levels));
}
