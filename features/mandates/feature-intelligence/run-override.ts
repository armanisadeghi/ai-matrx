import type { FeatureIntelligenceRow } from "./types";
import type { RunOverride } from "./IntelligenceJobCard";

/** Research collapses a topic pin to the currently resolved agent master. */
export function effectiveRunOverride(
  row: FeatureIntelligenceRow,
  topicChoice: RunOverride | undefined,
): RunOverride | null {
  if (!topicChoice) return null;
  if (row.holderType === "agent" && row.holderId === topicChoice.holderId) {
    return null;
  }
  return topicChoice;
}
