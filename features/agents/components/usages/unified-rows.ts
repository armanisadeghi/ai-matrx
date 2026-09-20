/**
 * ONE row shape for the Find Usages table, whatever the source.
 *
 * Two graders feed the surface — the `agx_usage_scan` RPC (shortcuts, apps,
 * derived agents, …) and the server's mandate impact read (`POST
 * /mandates/impact`). They speak different severities. This module puts both
 * on Arman's ONE risk ladder (MANDATE.md, 2026-09-11):
 *
 *   red     — variables or context slots changed: the most common way a usage
 *             breaks. (Old scan: `breaking`, `silent_breaking`.)
 *   orange  — the output shape / contract moved; can break whatever reads the
 *             result. (Old scan: `warning` — pinned behind with the contract
 *             changed.)
 *   green   — only the model, the prompt, or settings moved; almost never
 *             breaks. (Old scan: `info`.)
 *   clean   — nothing that affects a run changed, or the usage follows the
 *             active version.
 *
 * Nothing here re-grades: every risk is a MAPPING of a grader's verdict, and
 * the detail pane shows the grader's own findings verbatim.
 */

import type {
  AgentUsageAggregate,
  AgentUsageRow,
  DriftSeverity,
  UsageDriftFinding,
} from "@/features/agents/redux/usages/usages.types";
import {
  changeFindingsOf,
  isBehindLatest,
  newestLabelOf,
  pinnedLabelOf,
  settingsSignalOf,
  type ImpactGrade,
  type ImpactVerdict,
} from "@/features/mandates/admin/impact";
import type { UsageDimension } from "./dimensions";

export type UsageRisk = "red" | "orange" | "green" | "clean";

export const RISK_ORDER: readonly UsageRisk[] = ["red", "orange", "green", "clean"];

export interface RiskMeta {
  label: string;
  /** One sentence a person reads on the badge tooltip and the legend. */
  meaning: string;
  badgeClassName: string;
  dotClassName: string;
}

export const RISK_META: Record<UsageRisk, RiskMeta> = {
  red: {
    label: "Red",
    meaning:
      "Variables or context slots changed, or something this usage stores no longer exists — the most common way a usage breaks. Look before you move it.",
    badgeClassName:
      "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400",
    dotClassName: "bg-rose-500",
  },
  orange: {
    label: "Orange",
    meaning:
      "The output shape, tools, or provider moved — can break whatever reads the result.",
    badgeClassName:
      "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    dotClassName: "bg-amber-500",
  },
  green: {
    label: "Green",
    meaning:
      "Only the model, the instructions, or settings moved — almost never breaks anything.",
    badgeClassName:
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    dotClassName: "bg-emerald-500",
  },
  clean: {
    label: "Clean",
    meaning: "Nothing that affects a run changed between what this usage runs and the newest version.",
    badgeClassName: "border-border bg-muted text-muted-foreground",
    dotClassName: "bg-muted-foreground/40",
  },
};

/** The old scan's four severities on the one ladder. */
export const SEVERITY_TO_RISK: Record<DriftSeverity, UsageRisk> = {
  breaking: "red",
  silent_breaking: "red",
  warning: "orange",
  info: "green",
};

export const GRADE_TO_RISK: Record<ImpactGrade, UsageRisk> = {
  red: "red",
  orange: "orange",
  green: "green",
  identical: "clean",
};

/** The old scan's drift classes, in words — the "what changed" phrase. */
export const DRIFT_CLASS_LABEL: Record<string, string> = {
  missing_variable: "a variable it stores was removed",
  unmet_required_variable: "a required variable is not supplied",
  missing_context_slot: "a context policy it stores was renamed or removed",
  stale_pin: "pinned behind the active version",
  source_snapshot_stale: "behind its source agent",
  agent_unavailable: "the agent is archived or disabled",
};

function findingKeys(finding: UsageDriftFinding): string[] {
  const keys = (finding.detail as { keys?: unknown })?.keys;
  return Array.isArray(keys)
    ? keys.filter((key): key is string => typeof key === "string")
    : [];
}

export function usageFindingSentence(finding: UsageDriftFinding): string {
  const base = DRIFT_CLASS_LABEL[finding.driftClass] ?? finding.driftClass;
  const keys = findingKeys(finding);
  return keys.length > 0 ? `${base} (${keys.join(", ")})` : base;
}

export interface UnifiedUsageRow {
  /** Stable table id: `<kind>:<source id>`. */
  id: string;
  kind: "usage" | "mandate" | "aggregate";
  dimension: UsageDimension;
  name: string;
  /** Holder / scope — its own column, never stacked under the name. */
  holderLabel: string | null;
  /** Search-only extras (lineage, inactive). Not rendered in the name cell. */
  subtitle: string | null;
  pinnedLabel: string;
  newestLabel: string;
  /** Pinned to something older than the newest version. */
  behind: boolean;
  risk: UsageRisk;
  /** ONE short fact: what changed. Detail pane carries the sentences. */
  whatChanged: string;
  ownerText: string | null;
  organizationName: string | null;
  /** The signed-in person may move this pin. */
  managedByCaller: boolean;
  /** Sort helper: red first. */
  riskRank: number;
  usage?: AgentUsageRow;
  aggregate?: AgentUsageAggregate;
  verdict?: ImpactVerdict;
}

export function rowFromUsage(usage: AgentUsageRow): UnifiedUsageRow {
  const risk: UsageRisk = usage.worstSeverity
    ? SEVERITY_TO_RISK[usage.worstSeverity]
    : "clean";
  const findings = usage.findings
    .filter((finding) => finding.driftClass !== "stale_pin")
    .map(usageFindingSentence);
  const whatChanged =
    findings.length > 0
      ? capitalize(findings[0]) + (findings.length > 1 ? ` +${findings.length - 1}` : "")
      : usage.stalePin
        ? "Behind"
        : usage.pinMode === "follow_active"
          ? "Follows latest"
          : "—";
  return {
    id: `usage:${usage.usageType}:${usage.usageId}:${usage.nodeId ?? ""}`,
    kind: "usage",
    dimension: usage.usageType,
    name: usage.label,
    holderLabel: usage.organizationName,
    subtitle: usage.isUsageActive === false ? "inactive" : null,
    pinnedLabel:
      usage.pinMode === "follow_active"
        ? "active"
        : usage.pinnedVersionNumber != null
          ? `v${usage.pinnedVersionNumber}`
          : "pinned",
    newestLabel: `v${usage.currentVersion}`,
    behind: usage.stalePin,
    risk,
    whatChanged,
    ownerText: usage.ownerUserId ? usage.ownerUserId.slice(0, 8) : null,
    organizationName: usage.organizationName,
    managedByCaller: usage.managedByCaller,
    riskRank: RISK_ORDER.indexOf(risk),
    usage,
  };
}

export function rowFromAggregate(aggregate: AgentUsageAggregate): UnifiedUsageRow {
  const risk: UsageRisk = aggregate.worstSeverity
    ? SEVERITY_TO_RISK[aggregate.worstSeverity]
    : "clean";
  const parts: string[] = [];
  if (aggregate.breaking > 0) parts.push(`${aggregate.breaking} breaking`);
  if (aggregate.silentBreaking > 0) parts.push(`${aggregate.silentBreaking} silent break`);
  if (aggregate.warning > 0) parts.push(`${aggregate.warning} behind`);
  return {
    id: `aggregate:${aggregate.usageType}:${aggregate.organizationId ?? "none"}`,
    kind: "aggregate",
    dimension: aggregate.usageType,
    name: `${aggregate.count} owned by other people`,
    holderLabel: aggregate.organizationName,
    subtitle: null,
    whatChanged: parts.length > 0 ? capitalize(parts.join(", ")) : "—",
    pinnedLabel: aggregate.stalePins > 0 ? `${aggregate.stalePins} behind` : "—",
    newestLabel: `v${aggregate.currentVersion}`,
    behind: aggregate.stalePins > 0,
    risk,
    ownerText: null,
    organizationName: aggregate.organizationName,
    managedByCaller: false,
    riskRank: RISK_ORDER.indexOf(risk),
    aggregate,
  };
}

/** One short fact per blocker. Sentences live in the detail pane. */
const BLOCKER_PHRASE: Record<NonNullable<ImpactVerdict["blocker"]>, string> = {
  tracks_latest: "Follows latest",
  unreachable: "No version",
  set_aside: "Set aside",
  unsupported_holder: "Unsupported holder",
};

function holderLabelOf(verdict: ImpactVerdict): string {
  if (verdict.holder_kind !== "binding") return "Default";
  return verdict.principal.kind === "user" ? "User" : "Org";
}

export function rowFromVerdict(
  verdict: ImpactVerdict,
  focusAgentId: string,
): UnifiedUsageRow {
  const risk = GRADE_TO_RISK[verdict.grade];
  const findings = changeFindingsOf(verdict);
  const settings = settingsSignalOf(verdict);
  const changeFindings = verdict.blocker
    ? findings.filter((finding) => !finding.rule_id.startsWith("blocker."))
    : findings;
  let whatChanged: string;
  if (verdict.blocker) {
    whatChanged = BLOCKER_PHRASE[verdict.blocker];
  } else if (changeFindings.length > 0) {
    whatChanged = capitalize(changeFindings[0].message);
    if (changeFindings.length > 1) whatChanged += ` +${changeFindings.length - 1}`;
  } else if (settings.state === "changed") {
    whatChanged = "Settings";
  } else if (settings.state === "unmeasured") {
    whatChanged = "Unmeasured";
  } else {
    whatChanged = "—";
  }
  const viaDuplicate =
    verdict.agent_id !== focusAgentId ? `via ${verdict.agent_name}` : null;
  return {
    id: `mandate:${verdict.holder_kind}:${verdict.row_id}`,
    kind: "mandate",
    dimension: "mandate",
    name: verdict.mandate_key,
    holderLabel: holderLabelOf(verdict),
    subtitle: viaDuplicate,
    pinnedLabel: pinnedLabelOf(verdict),
    newestLabel: newestLabelOf(verdict),
    behind: isBehindLatest(verdict),
    risk,
    whatChanged,
    ownerText:
      verdict.principal.kind === "user" && verdict.principal.subject_user_id
        ? verdict.principal.subject_user_id.slice(0, 8)
        : null,
    organizationName: null,
    managedByCaller: true,
    riskRank: RISK_ORDER.indexOf(risk),
    verdict,
  };
}

function capitalize(text: string): string {
  return text.length > 0 ? text[0].toUpperCase() + text.slice(1) : text;
}

/** Per-dimension counts, every dimension present (zero included). */
export interface DimensionCount {
  total: number;
  flagged: number;
  behind: number;
}

export function countByDimension(
  rows: readonly UnifiedUsageRow[],
  dimensions: readonly UsageDimension[],
): Record<UsageDimension, DimensionCount> {
  const counts = {} as Record<UsageDimension, DimensionCount>;
  for (const dimension of dimensions) counts[dimension] = { total: 0, flagged: 0, behind: 0 };
  for (const row of rows) {
    const count = counts[row.dimension];
    if (!count) continue;
    const n = row.aggregate ? row.aggregate.count : 1;
    count.total += n;
    if (row.risk === "red" || row.risk === "orange") {
      count.flagged += row.aggregate
        ? row.aggregate.breaking + row.aggregate.silentBreaking + row.aggregate.warning
        : 1;
    }
    if (row.behind) count.behind += row.aggregate ? row.aggregate.stalePins : 1;
  }
  return counts;
}
