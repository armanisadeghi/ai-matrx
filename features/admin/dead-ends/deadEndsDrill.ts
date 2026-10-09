import type { MatrxDataTableLocalDrillConfig } from "@ai-matrx/design-system/data-table";
import { RULE_TITLES, type DeadEndRuleId } from "@/scripts/dead-ends/types";

/**
 * LEVELS of the dead-end findings. A rule (what kind of dead end) is read by the entities it
 * names, the features that carry it and its severity. An entity asks which rule left it
 * without a door and where; a feature or file, which rules and entities fire there.
 * The page's sweep-brief cards stay: a group has no "copy a repair brief" action yet.
 */
export const DEAD_ENDS_DRILL: MatrxDataTableLocalDrillConfig = {
  local: true,
  countLabel: "Findings",
  dimensions: ["severity", "rule", "entity", "feature", "file"],
  measures: ["count", "files", "entities"],
  extraDimensions: [
    { key: "severity", label: "Severity", kind: "choice", cardinality: "low" },
    {
      key: "rule",
      label: "Rule",
      kind: "choice",
      cardinality: "low",
      labelFor: (v) => (v && v in RULE_TITLES ? RULE_TITLES[v as DeadEndRuleId] : (v ?? "None")),
    },
    { key: "entity", label: "Entity", kind: "choice", cardinality: "high" },
    { key: "feature", label: "Feature", kind: "choice", cardinality: "high" },
    { key: "file", label: "File", kind: "choice", cardinality: "high" },
  ],
  extraMeasures: [
    { key: "files", label: "Files", additive: false, op: "count_distinct", of: "file" },
    { key: "entities", label: "Entities", additive: false, op: "count_distinct", of: "entity" },
  ],
  levels: {
    severity: { breakouts: ["rule", "entity", "feature"], attributes: [], show: ["count", "files", "entities"] },
    rule: { breakouts: ["entity", "feature", "severity", "file"], attributes: [], show: ["count", "files", "entities"] },
    entity: { breakouts: ["rule", "feature", "file"], attributes: [], show: ["count", "files"] },
    feature: { breakouts: ["rule", "entity", "file"], attributes: [], show: ["count", "files", "entities"] },
    file: { breakouts: ["rule", "entity"], attributes: ["feature", "severity"], show: ["count", "entities"] },
  },
};
