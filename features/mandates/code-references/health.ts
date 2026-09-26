"use client";

// features/mandates/code-references/health.ts
//
// Mandate health — every open way a mandate is broken, as ONE list of
// findings. Two real sources, merged:
//
//   * the code scan's open findings on mandate references
//     (`mandate.v_reference_latest`, via ./data.ts)
//   * code ↔ database drift from aidream's live declarations
//     (`GET /mandates/code-truth`) joined to `mandate.definition`
//
// Each finding says what is wrong in plain words, where, and what fixes it.

import { readAllRows } from "@ai-matrx/data/db";
import type { AppDispatch } from "@/lib/redux/store";
import { supabase } from "@/utils/supabase/client";
import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";
import { runWithSessionRetry } from "@/lib/supabase/authRetry";
import {
  fetchMandateCodeTruthReport,
  type MandateCodeTruth,
} from "@/features/mandates/admin/service";
import { adminMandateRecordHref as adminMandateHref } from "@/features/mandates/admin-routes";
import { mandateDisplayName } from "@/features/mandates/mandate-words";
import {
  FLAG_WORDS,
  fetchReferenceFindings,
  githubLineUrl,
  repoGithubNames,
} from "./data";

export { ADMIN_MANDATES_UNCONVERTED as UNCONVERTED_PATH, ADMIN_MANDATES_HEALTH as HEALTH_PATH } from "@/features/mandates/admin-routes";
import { ADMIN_MANDATES_UNCONVERTED as UNCONVERTED_PATH } from "@/features/mandates/admin-routes";

export type HealthSeverity = "high" | "medium" | "low";

export const SEVERITY_LABEL: Record<HealthSeverity, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};
export const SEVERITY_RANK: Record<HealthSeverity, number> = { high: 3, medium: 2, low: 1 };

export type HealthKind =
  | "broken"
  | "unresolved"
  | "orphaned"
  | "absent"
  | "outside_mandate"
  | "import_failed"
  | "undelivered"
  | "inputs_differ"
  | "code_only"
  | "code_missing";

export const KIND_LABEL: Record<HealthKind, string> = {
  broken: "Broken reference",
  unresolved: "Unreadable call",
  orphaned: "Orphaned reference",
  absent: "Missing reference",
  outside_mandate: "AI outside a mandate",
  import_failed: "Code fails to load",
  undelivered: "Inputs never delivered",
  inputs_differ: "Inputs differ",
  code_only: "Not in database",
  code_missing: "Code declaration missing",
};

export type HealthSource = "scan" | "drift";
export const SOURCE_LABEL: Record<HealthSource, string> = {
  scan: "Code scan",
  drift: "Code vs database",
};

export interface HealthFinding {
  id: string;
  severity: HealthSeverity;
  kind: HealthKind;
  source: HealthSource;
  /** "" when the scan could not read which mandate the line calls. */
  mandateKey: string;
  mandateName: string;
  /** What is wrong, in one plain sentence. */
  problem: string;
  /** Optional specifics (input names), shown muted after the sentence. */
  detail: string;
  repo: string;
  /** Copyable `repo/path:line`, or "" when there is no code location. */
  location: string;
  codeUrl: string | null;
  /** What fixes it, in a few words. */
  fix: string;
  /** Where the fix is done (the mandate's page), when there is one. */
  fixHref: string | null;
}

interface DefinitionFacts {
  label: string | null;
  origin: string | null;
}

async function readDefinitions(): Promise<Map<string, DefinitionFacts>> {
  const rows = await readAllRows<{ mandate_key: string; label: string | null; origin: string | null; id: string }>(
    ({ from, to }) =>
      runWithSessionRetry(() =>
        supabase
          .schema("mandate")
          .from("definition")
          .select("id,mandate_key,label,origin", { count: "exact" })
          .is("deleted_at", null)
          // The admin management pages name SYSTEM mandates only (Arman,
          // 2026-09-26): a finding's label and its Fix link never resolve to
          // an organization's or a person's copy of the key.
          .eq("organization_id", SYSTEM_ORGANIZATION_ID)
          .order("id", { ascending: true })
          .range(from, to),
      ).then((result) => ({
        data: (result.data ?? null) as { mandate_key: string; label: string | null; origin: string | null; id: string }[] | null,
        count: "count" in result && typeof result.count === "number" ? result.count : null,
        error: result.error ? { message: result.error.message ?? "read failed" } : null,
      })),
    { label: "mandate.definition" },
  );
  // One system row per key; any "code" origin wins.
  const out = new Map<string, DefinitionFacts>();
  for (const row of rows) {
    const prev = out.get(row.mandate_key);
    out.set(row.mandate_key, {
      label: prev?.label ?? row.label,
      origin: prev?.origin === "code" ? "code" : row.origin,
    });
  }
  return out;
}

/** aidream's code-truth source paths are container paths; keep from the package root. */
function aidreamRelativePath(sourceFile: string): string {
  const marker = sourceFile.lastIndexOf("/aidream/");
  return marker >= 0 ? sourceFile.slice(marker + 1) : sourceFile.replace(/^\/+/, "");
}

function list(names: readonly string[] | undefined): string {
  return (names ?? []).join(", ");
}

function driftFindings(
  truth: MandateCodeTruth,
  definition: DefinitionFacts | undefined,
  aidreamGithub: string | null,
): HealthFinding[] {
  const key = truth.mandate_key;
  const name = mandateDisplayName(key, definition?.label);
  const src = truth.source;
  const file = src ? aidreamRelativePath(src.source_file) : "";
  const location = src ? `aidream/${file}:${src.line}` : "";
  const base = {
    source: "drift" as const,
    mandateKey: key,
    mandateName: name,
    repo: src ? "aidream" : "",
    location,
    codeUrl: src ? githubLineUrl(aidreamGithub, "main", file, src.line) : null,
    fixHref: definition ? adminMandateHref(key) : null,
  };
  const out: HealthFinding[] = [];
  if (truth.resolution === "code_exists_but_import_failed") {
    out.push({
      ...base,
      id: `drift:${key}:import`,
      severity: "high",
      kind: "import_failed",
      problem: "Its code declaration fails to load",
      detail: truth.import_error ?? "",
      fix: "Fix the import error in the code",
    });
  }
  const spilled = new Set(truth.bound_agent_spilled_variables ?? []);
  const undelivered = (truth.bound_agent_missing_variables ?? []).filter((n) => !spilled.has(n));
  if (undelivered.length > 0) {
    out.push({
      ...base,
      id: `drift:${key}:undelivered`,
      severity: "high",
      kind: "undelivered",
      problem: "The agent never receives some inputs",
      detail: list(undelivered),
      fix: "Map these inputs on the agent",
    });
  }
  const isCode = definition?.origin === "code";
  if (truth.drift === "diff" && isCode) {
    const parts = [
      truth.code_only_variables.length ? `code only: ${list(truth.code_only_variables)}` : "",
      truth.db_only_variables.length ? `database only: ${list(truth.db_only_variables)}` : "",
    ].filter(Boolean);
    out.push({
      ...base,
      id: `drift:${key}:diff`,
      severity: "medium",
      kind: "inputs_differ",
      problem: "Code and database disagree on its inputs",
      detail: parts.join(" · "),
      fix: "Resync inputs from code",
    });
  } else if (truth.drift === "code_only") {
    out.push({
      ...base,
      id: `drift:${key}:code-only`,
      severity: "medium",
      kind: "code_only",
      problem: "Declared in code but has no database record",
      detail: "",
      fix: "Deploy the server so it seeds the record",
    });
  } else if (truth.drift === "db_only" && isCode) {
    out.push({
      ...base,
      id: `drift:${key}:code-missing`,
      severity: "medium",
      kind: "code_missing",
      problem: "Marked as code-backed, but no code declares it",
      detail: "",
      fix: "Restore the declaration, or mark it as not code-backed",
    });
  }
  return out;
}

export interface HealthLoad {
  findings: HealthFinding[];
  /** Sources that could not be read; the page names each one. */
  failures: { source: HealthSource; message: string }[];
}

/**
 * Both sources, independently: one failing never hides the other's findings,
 * and the page says which one failed.
 */
export async function fetchMandateHealth(dispatch: AppDispatch): Promise<HealthLoad> {
  const [scan, truth, definitions, repos] = await Promise.allSettled([
    fetchReferenceFindings(),
    fetchMandateCodeTruthReport(dispatch),
    readDefinitions(),
    repoGithubNames(),
  ]);
  const findings: HealthFinding[] = [];
  const failures: HealthLoad["failures"] = [];
  const defs = definitions.status === "fulfilled" ? definitions.value : new Map<string, DefinitionFacts>();

  if (scan.status === "fulfilled") {
    for (const row of scan.value) {
      const words = FLAG_WORDS[row.flag] ?? FLAG_WORDS.broken;
      const kind: HealthKind = row.flag === "conversion_pending"
        ? "outside_mandate"
        : ((row.flag in FLAG_WORDS ? row.flag : "broken") as HealthKind);
      const mandateFix = row.mandateKey && defs.has(row.mandateKey) ? adminMandateHref(row.mandateKey) : null;
      findings.push({
        id: `scan:${row.id}`,
        severity: words.severity,
        kind,
        source: "scan",
        mandateKey: row.mandateKey,
        mandateName: row.mandateKey ? mandateDisplayName(row.mandateKey, defs.get(row.mandateKey)?.label) : "",
        problem: row.outsideMandate && row.flag === "broken" ? "Broken AI call outside any mandate" : words.problem,
        detail: "",
        repo: row.repo,
        location: row.location,
        codeUrl: row.codeUrl,
        fix: row.outsideMandate && row.flag === "broken" ? "Repair it, then convert to a mandate" : words.fix,
        fixHref: row.outsideMandate ? UNCONVERTED_PATH : mandateFix,
      });
    }
  } else {
    failures.push({ source: "scan", message: String((scan.reason as Error)?.message ?? scan.reason) });
  }

  if (truth.status === "fulfilled") {
    if (definitions.status === "rejected") {
      failures.push({
        source: "drift",
        message: `Mandate records unreadable, so code-backed drift is not judged: ${String((definitions.reason as Error)?.message ?? definitions.reason)}`,
      });
    }
    const aidreamGithub = repos.status === "fulfilled" ? (repos.value.get("aidream") ?? null) : null;
    for (const item of truth.value.mandates) {
      findings.push(...driftFindings(item, defs.get(item.mandate_key), aidreamGithub));
    }
  } else {
    failures.push({ source: "drift", message: String((truth.reason as Error)?.message ?? truth.reason) });
  }

  return { findings, failures };
}
