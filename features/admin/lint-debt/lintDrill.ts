import type { MatrxDataTableLocalDrillConfig } from "@ai-matrx/design-system/data-table";
import { CLASS_TITLES, type LintDebtClass } from "@/scripts/lint-debt/types";

/**
 * LEVELS of the lint findings. A class (bug, correctness, doctrine, style) is a triage tier:
 * drill it to see which rules and features carry it. A rule is one ESLint check, so its class
 * describes it and its worst features and files are the next question. A feature (or file)
 * asks which rules fire in it and, for a file, which surface it renders on.
 * The page's sweep-brief cards above stay: a group has no "copy a repair brief" action yet.
 */
export const LINT_DRILL: MatrxDataTableLocalDrillConfig = {
  local: true,
  countLabel: "Findings",
  dimensions: ["klass", "rule", "feature", "file", "route"],
  measures: ["count", "files", "rules"],
  extraDimensions: [
    {
      key: "klass",
      label: "Class",
      kind: "choice",
      cardinality: "low",
      labelFor: (v) => (v && v in CLASS_TITLES ? CLASS_TITLES[v as LintDebtClass] : (v ?? "None")),
    },
    { key: "rule", label: "Rule", kind: "choice", cardinality: "high" },
    { key: "feature", label: "Feature", kind: "choice", cardinality: "high" },
    { key: "file", label: "File", kind: "choice", cardinality: "high" },
    { key: "route", label: "Surface", kind: "choice", cardinality: "high" },
  ],
  extraMeasures: [
    { key: "files", label: "Files", additive: false, op: "count_distinct", of: "file" },
    { key: "rules", label: "Rules", additive: false, op: "count_distinct", of: "rule" },
  ],
  levels: {
    klass: { breakouts: ["rule", "feature", "file"], attributes: [], show: ["count", "files", "rules"] },
    rule: { breakouts: ["feature", "file", "route"], attributes: ["klass"], show: ["count", "files"] },
    feature: { breakouts: ["rule", "klass", "file"], attributes: [], show: ["count", "files", "rules"] },
    file: { breakouts: ["rule", "klass"], attributes: ["feature", "route"], show: ["count", "rules"] },
    route: { breakouts: ["rule", "feature", "file"], attributes: [], show: ["count", "files", "rules"] },
  },
};
