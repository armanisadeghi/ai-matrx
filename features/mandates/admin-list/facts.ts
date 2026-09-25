// features/mandates/admin-list/facts.ts
//
// PURE: the aidream-classified facts the server read (`public.mnd_admin_list`)
// cannot compute from the database — coverage, impact grade/blocker, the code
// declaration and the code-truth health overlays — packed into the compact
// `p_facts` shape the function reads, and ONLY the sections a query needs.
//
// The server classifies; the database only narrows (the coverage_keys pattern
// of `mnd_list_scoped`). An absent section reads as the column's
// unknown/not-graded value there — never as a verdict.

import { ALL_MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { MandateCodeTruth } from "@/features/mandates/admin/service";
import {
  IMPACT_GRADE_ORDER,
  blockerKeyOf,
  groupImpactByMandate,
  type StandingImpact,
} from "@/features/mandates/admin/impact";
import type { MandateCoverageResponse } from "@/features/mandates/coverage";
import type { EntityListQuery } from "@/lib/entity-list/types";
import { declaredInOf, featureLabelOf } from "./rows";

export type FactSection =
  | "coverage"
  | "grade"
  | "blocker"
  | "codeState"
  | "declaredIn"
  | "featureLabel"
  | "health";

/** Which fact section each column's filter or sort reads. */
const SECTIONS_BY_COLUMN: Record<string, FactSection[]> = {
  coverage: ["coverage"],
  defaultState: ["coverage"],
  impactGrade: ["grade"],
  impactBlocker: ["blocker"],
  codeState: ["codeState"],
  declaredIn: ["declaredIn"],
  featureLabel: ["featureLabel"],
  health: ["health"],
};

export const ALL_FACT_SECTIONS: FactSection[] = [
  "coverage",
  "grade",
  "blocker",
  "codeState",
  "declaredIn",
  "featureLabel",
  "health",
];

/**
 * The sections a query needs: every filtered column's, the sort column's, and
 * the feature label while searching (the relevance scorer reads it).
 */
export function sectionsFor(
  query: Pick<EntityListQuery, "filters" | "search">,
  sortColumn?: string | null,
): FactSection[] {
  const out = new Set<FactSection>();
  for (const id of Object.keys(query.filters)) {
    for (const section of SECTIONS_BY_COLUMN[id] ?? []) out.add(section);
  }
  if (sortColumn) {
    for (const section of SECTIONS_BY_COLUMN[sortColumn] ?? []) out.add(section);
  }
  if (query.search.trim()) out.add("featureLabel");
  return [...out];
}

export interface MandateAdminReports {
  /** null = that read failed or has not answered. */
  codeTruth: Record<string, MandateCodeTruth> | null;
  coverage: MandateCoverageResponse | null;
  impact: StandingImpact | null;
}

type KeyLists = Record<string, string[]>;

function push(lists: KeyLists, value: string, key: string) {
  (lists[value] ??= []).push(key);
}

/** The `p_facts` payload for these sections. */
export function buildFacts(
  reports: MandateAdminReports,
  sections: readonly FactSection[],
): Record<string, unknown> {
  const want = new Set(sections);
  const facts: Record<string, unknown> = {};

  if (want.has("coverage") && reports.coverage) {
    facts.coverage = {
      known: true,
      red: reports.coverage.red.map((row) => row.mandate_key),
      orange: reports.coverage.orange.map((row) => row.mandate_key),
    };
  }

  if ((want.has("grade") || want.has("blocker")) && reports.impact) {
    const grade: KeyLists = {};
    const blocker: KeyLists = {};
    for (const [key, grouped] of groupImpactByMandate(reports.impact.verdicts)) {
      const verdict = grouped.defaultVerdict;
      if (!verdict) continue;
      push(grade, verdict.grade, key);
      push(blocker, blockerKeyOf(verdict), key);
    }
    if (want.has("grade")) {
      facts.grade = grade;
      facts.gradeOrder = [...IMPACT_GRADE_ORDER];
    }
    if (want.has("blocker")) facts.blocker = blocker;
  }

  const needsCode =
    want.has("codeState") || want.has("declaredIn") || want.has("featureLabel") || want.has("health");
  if (needsCode) {
    const truth = reports.codeTruth ?? {};
    const codeState: KeyLists = {};
    const declaredIn: KeyLists = {};
    const featureLabel: Record<string, string> = {};
    const health = { agentDrift: [] as string[], importFailed: [] as string[], contractDrift: [] as string[] };
    const keys = new Set<string>([...ALL_MANDATE_KEYS, ...Object.keys(truth)]);
    for (const key of keys) {
      const entry = truth[key];
      const declared = declaredInOf(key, entry);
      if (declared.codeState !== "not_in_code") push(codeState, declared.codeState, key);
      if (declared.declaredIn) push(declaredIn, declared.declaredIn, key);
      if (entry?.source?.module) {
        const withSub = featureLabelOf(key, entry.source.module);
        if (withSub !== featureLabelOf(key, null)) featureLabel[key] = withSub;
      }
      if (entry?.resolution === "code_declaration_found") {
        if (entry.bound_agent_drift != null && entry.bound_agent_drift !== "match") {
          health.agentDrift.push(key);
        }
        if (entry.drift !== "match") health.contractDrift.push(key);
      } else if (entry?.resolution === "code_exists_but_import_failed") {
        health.importFailed.push(key);
      }
    }
    // Without the code-truth report, only the generated key set is known —
    // which is exactly what the client list showed in that state.
    if (want.has("codeState")) facts.codeState = codeState;
    if (want.has("declaredIn")) facts.declaredIn = declaredIn;
    if (want.has("featureLabel")) facts.featureLabel = featureLabel;
    if (want.has("health")) facts.health = health;
  }

  return facts;
}
