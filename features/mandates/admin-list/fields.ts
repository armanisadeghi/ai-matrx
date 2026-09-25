// features/mandates/admin-list/fields.ts
//
// THE ONE VALUE READER per column: what a column filters on (its facet
// values), and what it sorts by. The service (filters, facets, sort) and the
// column cells read the same function, so a filter option can never name a
// value the cell does not show.

import { COVERAGE_META } from "@/features/mandates/coverage";
import { BLOCKER_META, GRADE_META, IMPACT_GRADE_ORDER } from "@/features/mandates/admin/impact";
import type { MandateAdminRow, MandateCodeState } from "./types";

/** A key the code scan has no reference to — nobody looked, never "unused". */
export const NONE_FOUND = "None found";

export const CODE_STATE_LABEL: Record<MandateCodeState, string> = {
  declared: "Declared",
  import_failed: "Import failed",
  not_in_code: "Not in code",
};

/** Relative-age bucket for date filters — the DATE_FILTER_OPTIONS values. */
export function ageBucketsOf(iso: string | null, now = Date.now()): string[] {
  if (!iso) return [];
  const age = now - new Date(iso).getTime();
  const hour = 3_600_000;
  const day = 24 * hour;
  const out: string[] = [];
  if (age <= hour) out.push("1h");
  if (age <= day) out.push("24h");
  if (age <= 7 * day) out.push("7d");
  if (age <= 30 * day) out.push("30d");
  if (age <= 90 * day) out.push("90d");
  if (age <= 365 * day) out.push("1y");
  return out;
}

export interface FieldReader {
  /** Values this row matches in a select filter (multi-valued allowed). */
  values: (row: MandateAdminRow) => string[];
  /** Sort key. */
  sort: (row: MandateAdminRow) => string | number;
  /** Label for a raw facet value, when it is not what a person reads. */
  label?: (value: string) => string;
  /** Date columns filter by age bucket instead of their raw values. */
  date?: boolean;
}

const text = (pick: (row: MandateAdminRow) => string | null | undefined): FieldReader => ({
  values: (row) => {
    const value = pick(row);
    return value ? [value] : [];
  },
  sort: (row) => (pick(row) ?? "").toLowerCase(),
});

export const FIELDS: Record<string, FieldReader> = {
  name: text((r) => r.name),
  featureLabel: text((r) => r.featureLabel),
  mandateKey: text((r) => r.mandateKey),
  agentName: {
    values: (r) => [r.holderType === "agent" ? r.agentName : `Workflow`],
    sort: (r) => r.agentName.toLowerCase(),
  },
  pinText: text((r) => r.pinText),
  coverage: {
    values: (r) => [r.coverage ?? "unknown"],
    sort: (r) => ({ red: 0, orange: 1, green: 2 })[r.coverage ?? "green"] ?? 3,
    label: (v) =>
      v === "unknown"
        ? "Unknown"
        : v === "orange"
          ? "Fallback"
          : (COVERAGE_META[v as keyof typeof COVERAGE_META]?.label ?? v),
  },
  impactGrade: {
    values: (r) => [r.impactGrade],
    sort: (r) =>
      r.impactGrade === "ungraded" ? -1 : IMPACT_GRADE_ORDER.indexOf(r.impactGrade),
    label: (v) =>
      v === "ungraded"
        ? "Not graded"
        : (GRADE_META[v as keyof typeof GRADE_META]?.label ?? v),
  },
  impactBlocker: {
    values: (r) => [r.impactBlocker],
    sort: (r) => r.impactBlocker,
    label: (v) =>
      v === "ungraded"
        ? "Not graded"
        : (BLOCKER_META[v as keyof typeof BLOCKER_META]?.label ?? v),
  },
  health: text((r) => r.health),
  inputSummary: text((r) => r.inputSummary),
  outputSummary: text((r) => r.outputSummary),
  overridesCount: {
    values: (r) => [String(r.overridesCount)],
    sort: (r) => r.overridesCount,
  },
  customizedBy: {
    values: (r) => r.customizedBy,
    sort: (r) => r.customizedBy.join(", ").toLowerCase(),
  },
  isEnabled: {
    values: (r) => [r.isEnabled ? "true" : "false"],
    sort: (r) => (r.isEnabled ? 1 : 0),
  },
  updatedAt: {
    values: (r) => ageBucketsOf(r.updatedAt),
    sort: (r) => r.updatedAt ?? "",
    date: true,
  },
  id: text((r) => r.id),
  origin: {
    values: (r) => [r.origin],
    sort: (r) => r.origin,
    label: (v) => (v === "code" ? "Code" : v === "soft" ? "Soft" : v),
  },
  codeState: {
    values: (r) => [r.codeState],
    sort: (r) => r.codeState,
    label: (v) => CODE_STATE_LABEL[v as MandateCodeState] ?? v,
  },
  declaredIn: {
    values: (r) => [r.declaredIn ?? "None"],
    sort: (r) => r.declaredIn ?? "",
  },
  serves: {
    values: (r) => (r.serves.length > 0 ? r.serves : ["Unknown"]),
    sort: (r) => r.serves.join(", "),
  },
  defaultState: text((r) => r.defaultState),
  backsCount: {
    values: (r) => [String(r.backsCount)],
    sort: (r) => r.backsCount,
  },
  fallbackKey: text((r) => r.fallbackKey ?? "None"),
  homeLabel: text((r) => r.homeLabel),
  goal: text((r) => r.goal),
  createdAt: {
    values: (r) => ageBucketsOf(r.createdAt),
    sort: (r) => r.createdAt ?? "",
    date: true,
  },
  contractCheck: {
    values: (r) => [r.contractCheck],
    sort: (r) => ({ Mismatch: 0, "Not checked": 1, Matches: 2 })[r.contractCheck],
  },
  // The code-scan columns — the same words the database facets them by
  // (migrations/mnd_admin_list_sources_contract_page_rows_2026_09_25.sql).
  declaredRepos: listOf((r) => r.sources?.declaredIn),
  calledFrom: listOf((r) => r.sources?.calledFrom),
  callSites: {
    values: (r) => [String(r.sources?.callSites ?? 0)],
    sort: (r) => r.sources?.callSites ?? 0,
  },
  languages: listOf((r) => r.sources?.languages),
};

/** A multi-valued scan fact; no value reads "None found", never blank. */
function listOf(pick: (row: MandateAdminRow) => string[] | undefined): FieldReader {
  return {
    values: (row) => {
      const list = pick(row) ?? [];
      return list.length > 0 ? list : [NONE_FOUND];
    },
    sort: (row) => (pick(row) ?? []).join(", ").toLowerCase(),
  };
}

/** Text used by search besides the visible columns. */
export function searchTextOf(row: MandateAdminRow): string {
  return [
    row.name,
    row.mandateKey,
    row.featureLabel,
    row.agentName,
    row.customizedBy.join(" "),
    row.servesDetail.join(" "),
    row.goal ?? "",
  ].join(" ");
}
