import type { FeatureIntelligenceRow } from "./types";
import type { RunOverride } from "./IntelligenceJobCard";

/**
 * The topic's recorded choice for one job, as the page shows it.
 *
 * The server (`research/agents.py` `resolve_stage`) collapses a topic pin that
 * names the agent the mandate already picks — so today it changes nothing. It
 * is still RECORDED on the topic, and the moment the mandate choice changes
 * (someone uses their own, an org admin sets one) that pin becomes a genuine
 * override and wins. Hiding it would let "Use my own" look like it worked while
 * the topic kept running the old agent, so it is always returned — marked
 * `matchesMandate` when it is dormant.
 */
export function effectiveRunOverride(
  row: FeatureIntelligenceRow,
  topicChoice: RunOverride | undefined,
): RunOverride | null {
  if (!topicChoice) return null;
  if (row.holderType === "agent" && row.holderId === topicChoice.holderId) {
    return { ...topicChoice, matchesMandate: true };
  }
  return topicChoice;
}
