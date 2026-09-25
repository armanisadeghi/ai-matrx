// features/mandates/admin-list/rows.ts
//
// PURE: every source the admin list reads → one `MandateAdminRow` per mandate.
// No fetching here (see ./store.ts), so the derivations are testable and a
// source that failed stays visibly UNKNOWN instead of reading as "none".

import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";
import { buildRow } from "@/features/mandates/admin/mandate-health";
import type {
  MandateCodeTruth,
  MandateConsoleData,
} from "@/features/mandates/admin/service";
import {
  blockerKeyOf,
  groupImpactByMandate,
  type StandingImpact,
} from "@/features/mandates/admin/impact";
import type { UngradedReason } from "@/features/mandates/admin/impact-cells";
import type { MandateCatalogue } from "@/features/mandates/catalogue";
import {
  buildCoverageIndex,
  type MandateCoverageResponse,
} from "@/features/mandates/coverage";
import { resolveMandateGoal } from "@/features/mandates/goal";
import { mandateDisplayName } from "@/features/mandates/mandate-words";
import { splitMandateKey } from "@/features/mandates/mandate-key";
import { holderOfMandate } from "@/lib/supabase/mandateStorage";
import type {
  MandateAdminRow,
  MandateCodeState,
  MandateDefaultState,
  MandateServes,
} from "./types";

/** One place a mandate is served from, read from its own table. */
export interface MandateServeLink {
  mandateKey: string;
  kind: Exclude<MandateServes, "Feature code" | "Nothing found">;
  detail: string;
}

export interface MandateAdminSources {
  console: MandateConsoleData;
  /** null = the read failed or has not answered. */
  codeTruth: Record<string, MandateCodeTruth> | null;
  coverage: MandateCoverageResponse | null;
  catalogue: MandateCatalogue | null;
  impact: StandingImpact | null;
  impactFailed: boolean;
  serveLinks: MandateServeLink[] | null;
  organizationNames: Record<string, string>;
}

const ACRONYMS = new Set([
  "ai",
  "crm",
  "seo",
  "ner",
  "pdf",
  "sms",
  "rag",
  "kg",
  "ir",
  "cx",
  "hr",
  "api",
  "ui",
]);

/** `content_plan` → "Content Plan", `seo` → "SEO". */
export function prettySegment(segment: string): string {
  return segment
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((word) =>
      ACRONYMS.has(word.toLowerCase())
        ? word.toUpperCase()
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

/**
 * The part of the app a mandate belongs to. The key's namespace is the feature;
 * when the code declaration lives one module deeper under that same feature
 * (`aidream.services.seo.ai_visibility`) the sub-area is added.
 */
export function featureLabelOf(
  mandateKey: string,
  sourceModule: string | null | undefined,
): string {
  const { feature } = splitMandateKey(mandateKey);
  if (feature === "shortcut") return "Shortcuts";
  if (feature === "app") return "Agent apps";
  const top = prettySegment(feature);
  if (!sourceModule) return top;
  const parts = sourceModule.split(".");
  const at = parts.indexOf(feature);
  const sub = at >= 0 ? parts[at + 1] : undefined;
  if (!sub || sub === "mandates" || sub === feature) return top;
  return `${top} › ${prettySegment(sub)}`;
}

/** The repo + language of a code declaration, from its module path. */
export function declaredInOf(truth: MandateCodeTruth | undefined): {
  declaredIn: string | null;
  declaredFile: string | null;
} {
  const source = truth?.source;
  if (!truth || truth.resolution === "no_code_declaration_found") {
    return { declaredIn: null, declaredFile: null };
  }
  const file = source?.source_file ?? truth.call_sites?.[0]?.source_file ?? null;
  const line = source?.line ?? truth.call_sites?.[0]?.line ?? null;
  const repo = (source?.module ?? file ?? "").startsWith("aidream")
    ? "aidream"
    : (file?.split("/")[0] ?? "aidream");
  const language = file?.endsWith(".ts") || file?.endsWith(".tsx")
    ? "TypeScript"
    : "Python";
  return {
    declaredIn: `${language} · ${repo}`,
    declaredFile: file ? `${file}${line ? `:${line}` : ""}` : null,
  };
}

function codeStateOf(
  truth: MandateCodeTruth | undefined,
  known: boolean,
): MandateCodeState {
  if (!known) return "unknown";
  if (!truth) return "not_in_code";
  switch (truth.resolution) {
    case "code_declaration_found":
      return "declared";
    case "code_exists_but_import_failed":
      return "import_failed";
    default:
      return "not_in_code";
  }
}

/**
 * Who customized this job: "Default" when nobody did, else one entry per
 * binding kind — the organization names, "Personal", "Global".
 */
export function customizedByOf(
  bindings: readonly { principal_type: string; organization_id: string | null }[],
  organizationNames: Record<string, string>,
): string[] {
  const orgs = new Set<string>();
  let personal = false;
  let global = false;
  for (const binding of bindings) {
    if (binding.principal_type === "org") {
      orgs.add(
        (binding.organization_id &&
          organizationNames[binding.organization_id]) ||
          "Organization",
      );
    } else if (binding.principal_type === "user") personal = true;
    else if (binding.principal_type === "global") global = true;
  }
  const out = [...[...orgs].sort()];
  if (personal) out.push("Personal");
  if (global) out.push("Global");
  return out.length > 0 ? out : ["Default"];
}

export function buildAdminRows(sources: MandateAdminSources): MandateAdminRow[] {
  const {
    console: data,
    codeTruth,
    catalogue,
    coverage,
    impact,
    impactFailed,
    serveLinks,
    organizationNames,
  } = sources;

  const coverageIndex = coverage ? buildCoverageIndex(coverage) : null;
  const impactByMandate = impact ? groupImpactByMandate(impact.verdicts) : null;
  const newestSnapshotByAgent: Record<string, number | null> = {};
  for (const verdict of impact?.verdicts ?? []) {
    if (verdict.latest_version_number != null) {
      newestSnapshotByAgent[verdict.agent_id] = verdict.latest_version_number;
    }
  }

  const backs = new Map<string, number>();
  for (const mandate of data.mandates) {
    const fallback = mandate.fallback_mandate_key;
    if (fallback) backs.set(fallback, (backs.get(fallback) ?? 0) + 1);
  }

  const linksByKey = new Map<string, MandateServeLink[]>();
  for (const link of serveLinks ?? []) {
    const list = linksByKey.get(link.mandateKey) ?? [];
    list.push(link);
    linksByKey.set(link.mandateKey, list);
  }

  return data.mandates.map((mandate): MandateAdminRow => {
    const truth = codeTruth?.[mandate.mandate_key];
    const base = buildRow(
      mandate,
      data,
      truth,
      undefined,
      impact ? newestSnapshotByAgent : undefined,
    );
    const grouped = impactByMandate?.get(base.mandateKey);
    const defaultVerdict = grouped?.defaultVerdict ?? null;
    const ungraded: UngradedReason | null = defaultVerdict
      ? null
      : !base.agentId
        ? "no_agent"
        : impactFailed
          ? "read_failed"
          : impactByMandate
            ? "not_returned"
            : "loading";

    const coverageEntry = coverageIndex?.[base.mandateKey];
    const holder = holderOfMandate(mandate);
    const hasHolder = Boolean(holder.holderId || holder.versionId);
    const fallbackKey = mandate.fallback_mandate_key ?? null;
    const defaultState: MandateDefaultState = hasHolder
      ? "Own default"
      : fallbackKey || coverageEntry?.bucket === "orange"
        ? "Fallback"
        : "No default";

    const links = linksByKey.get(base.mandateKey) ?? [];
    const serveKinds = new Set<MandateServes>(links.map((link) => link.kind));
    const origin = mandate.origin === "code" ? "code" : "soft";
    if (serveKinds.size === 0 && serveLinks) {
      serveKinds.add(origin === "code" ? "Feature code" : "Nothing found");
    }

    const isSystem = mandate.organization_id === SYSTEM_ORGANIZATION_ID;
    const { declaredIn, declaredFile } = declaredInOf(truth);
    const bindings = data.bindingsByMandateId[mandate.id] ?? [];

    return {
      ...base,
      name: mandateDisplayName(base.mandateKey, mandate.label),
      featureLabel: featureLabelOf(base.mandateKey, truth?.source?.module),
      goal: resolveMandateGoal({
        stored: mandate.goal,
        catalogue: catalogue?.[base.mandateKey]?.goal,
      }).goal,
      coverage: coverageIndex
        ? (coverageEntry?.bucket ?? "green")
        : null,
      coverageDetail: coverageEntry
        ? coverageEntry.bucket === "orange"
          ? (coverageEntry.leaderKey ?? coverageEntry.reason)
          : coverageEntry.reason
        : null,
      defaultVerdict,
      bindingVerdicts: grouped?.bindingVerdicts ?? [],
      ungraded,
      impactGrade: defaultVerdict ? defaultVerdict.grade : "ungraded",
      impactBlocker: defaultVerdict ? blockerKeyOf(defaultVerdict) : "ungraded",
      holderType: holder.holderType,
      pinText: !hasHolder
        ? "None"
        : holder.versionId
          ? base.pinLabel
          : "Latest",
      customizedBy: customizedByOf(bindings, organizationNames),
      createdBy: mandate.created_by ?? null,
      organizationId: mandate.organization_id ?? null,
      homeLabel: isSystem
        ? "System"
        : (mandate.organization_id &&
            organizationNames[mandate.organization_id]) ||
          "Organization",
      isSystem,
      createdAt: mandate.created_at ?? null,
      origin,
      codeState: codeStateOf(truth, codeTruth !== null),
      declaredIn: codeTruth === null ? null : declaredIn,
      declaredFile,
      serves: [...serveKinds],
      servesDetail: [...new Set(links.map((link) => link.detail))],
      defaultState,
      fallbackKey,
      backsCount: backs.get(base.mandateKey) ?? 0,
    };
  });
}
