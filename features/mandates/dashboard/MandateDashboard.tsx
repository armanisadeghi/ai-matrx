// features/mandates/dashboard/MandateDashboard.tsx
//
// THE MANDATE NUMBERS PAGE — KPIs only, never beside a management table
// (UI-REGISTER item 7). Modeled on the Spend explorer: one row of tiles per
// question, every count that names a set of mandates opens the list filtered
// to that set. Four independent reads; one failing blanks only its section.
//
// Doc: common-docs/systems/intelligence/mandates/UI-REGISTER.md

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  GitBranch,
  Layers,
  Pin,
  Radar,
  RefreshCw,
  Users,
} from "lucide-react";
import { formatCount, formatRelativeTime } from "@ai-matrx/kit/format";

import { Button } from "@/components/ui/button";
import { KpiGrid, KpiTile } from "@/components/official/kpi/KpiTile";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { SYSTEM_HOME } from "@/features/mandates/list-door";
import { OrganizationRequiredNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import {
  fetchMandateCodeTruthReport,
  fetchMandateConsoleData,
  type MandateCodeTruthReport,
  type MandateConsoleData,
} from "@/features/mandates/admin/service";
import {
  fetchMandateCoverage,
  type MandateCoverageResponse,
} from "@/features/mandates/coverage";
import {
  fetchMandateReferenceBoard,
  type MandateReferenceBoard,
} from "@/features/mandates/admin/references";
import {
  bindingMetrics,
  contractMismatchKeys,
  coverageCounts,
  definitionMetrics,
  codeBackedKeys,
  driftMetrics,
  scanMetrics,
  systemKeys,
} from "./metrics";
import {
  MANDATE_LIST_COLUMN as COL,
  mandateListHref,
  unconvertedCallsHref,
} from "./list-link";
import {
  ADMIN_MANDATES_HEALTH,
  CLASSIC_ADMIN_MANDATES,
} from "@/features/mandates/admin-routes";

/** Scan freshness lives on the owner's References page (repos + patrol). */
const REFERENCES_PATH = CLASSIC_ADMIN_MANDATES.references;
const FEATURE_ROWS_COLLAPSED = 12;

type Slot<T> = { data: T | null; error: string | null; loading: boolean };
const EMPTY = { data: null, error: null, loading: true } as const;

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * One read into one slot. Each source settles on its own, so a slow or failed
 * read blanks only its own section.
 */
function runSlot<T>(
  read: () => Promise<T>,
  set: (next: Slot<T>) => void,
  isCancelled: () => boolean,
): void {
  void (async () => {
    await Promise.resolve();
    if (isCancelled()) return;
    set({ data: null, error: null, loading: true });
    try {
      const data = await read();
      if (!isCancelled()) set({ data, error: null, loading: false });
    } catch (cause) {
      if (!isCancelled()) set({ data: null, error: describe(cause), loading: false });
    }
  })();
}

function Section({
  icon: Icon,
  title,
  error,
  children,
}: {
  icon: typeof Activity;
  title: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <header className="flex min-w-0 items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </header>
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 [overflow-wrap:anywhere]">
            Not measured: {error}
          </span>
        </div>
      ) : null}
      {children}
    </section>
  );
}

const n = (value: number | null | undefined) =>
  value === null || value === undefined ? null : formatCount(value);

const ago = (iso: string | null | undefined) =>
  iso ? formatRelativeTime(iso) : null;

export function MandateDashboard() {
  const dispatch = useAppDispatch();
  const organizationId = useAppSelector(selectOrganizationId);
  // The code-scan read is a server request, and every signed-in server request
  // is filed under an organization. With none selected the section shows the
  // organization picker in place of its tiles — never a skeleton that waits
  // for a choice nobody was asked to make. Every other section reads the
  // database directly and never waits on an organization.
  // Three states, never a refusal spelled from a nullable id (check:org-three-states): the notice
  // shows only once boot settled with none; while it resolves the tiles read as loading.
  const { organizationState } = useOrganizationRequired();
  const needsOrganization = organizationState === "required";
  const [reloads, setReloads] = useState(0);
  const [showAllFeatures, setShowAllFeatures] = useState(false);

  const [consoleSlot, setConsoleSlot] = useState<Slot<MandateConsoleData>>(EMPTY);
  const [coverageSlot, setCoverageSlot] = useState<Slot<MandateCoverageResponse>>(EMPTY);
  const [truthSlot, setTruthSlot] = useState<Slot<MandateCodeTruthReport>>(EMPTY);
  const [boardSlot, setBoardSlot] = useState<Slot<MandateReferenceBoard>>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;
    runSlot(() => fetchMandateConsoleData({ home: SYSTEM_HOME }), setConsoleSlot, isCancelled);
    runSlot(() => fetchMandateCoverage(dispatch), setCoverageSlot, isCancelled);
    runSlot(() => fetchMandateCodeTruthReport(dispatch), setTruthSlot, isCancelled);
    return () => {
      cancelled = true;
    };
  }, [dispatch, reloads]);

  // The board's request carries the active organization; it waits for one.
  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    runSlot(() => fetchMandateReferenceBoard(dispatch), setBoardSlot, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [dispatch, organizationId, reloads]);

  const keys = systemKeys(consoleSlot.data);
  const defs = definitionMetrics(consoleSlot.data, truthSlot.data);
  const binds = bindingMetrics(consoleSlot.data);
  const mismatchKeys = contractMismatchKeys(consoleSlot.data);
  const cov = coverageCounts(coverageSlot.data, keys);
  const drift = driftMetrics(truthSlot.data, keys, codeBackedKeys(consoleSlot.data));
  const scan = scanMetrics(boardSlot.data);
  const boardLoading = (boardSlot.loading || !organizationId) && !needsOrganization;
  const boardError = needsOrganization ? null : boardSlot.error;

  const anyLoading =
    consoleSlot.loading || coverageSlot.loading || truthSlot.loading || boardLoading;
  const features = defs?.features ?? [];
  const shownFeatures = showAllFeatures
    ? features
    : features.slice(0, FEATURE_ROWS_COLLAPSED);
  const maxFeature = features[0]?.total ?? 1;

  return (
    <div className="flex min-w-0 flex-col gap-5 p-4">
      <header className="flex min-w-0 items-center gap-3">
        <h1 className="text-lg font-semibold">Mandate numbers</h1>
        <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
          System
        </span>
        {coverageSlot.data ? (
          <span className="text-xs text-muted-foreground">
            {ago(coverageSlot.data.computed_at)}
          </span>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => setReloads((value) => value + 1)}
          disabled={anyLoading}
        >
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
          Refresh
        </Button>
      </header>

      <Section icon={Layers} title="Mandates" error={consoleSlot.error}>
        <KpiGrid>
          <KpiTile
            label="Total"
            value={n(defs?.total)}
            loading={consoleSlot.loading}
            hint={defs ? `${formatCount(defs.features.length)} features` : undefined}
            href={mandateListHref()}
          />
          <KpiTile
            label="Code-backed"
            value={n(defs?.codeBacked)}
            loading={consoleSlot.loading}
            href={mandateListHref({ [COL.origin]: "code" })}
            title="Declared in our codebase (origin = code)"
          />
          <KpiTile
            label="Soft"
            value={n(defs?.soft)}
            loading={consoleSlot.loading}
            href={mandateListHref({ [COL.origin]: "soft" })}
            title="No code in our app"
          />
          <KpiTile
            label="Disabled"
            value={n(defs?.disabled)}
            tone={defs && defs.disabled > 0 ? "warn" : "neutral"}
            loading={consoleSlot.loading}
            href={mandateListHref({ [COL.enabled]: false })}
          />
          <KpiTile
            label="Held by workflow"
            value={n(defs?.workflowHeld)}
            loading={consoleSlot.loading}
            href={mandateListHref({ [COL.holder]: "Workflow" })}
          />
          <KpiTile
            label="No default Mandate Holder"
            value={n(defs?.defaultsNone)}
            tone={defs && defs.defaultsNone > 0 ? "warn" : "neutral"}
            loading={consoleSlot.loading}
            href={mandateListHref({ [COL.pin]: "None" })}
          />
          <KpiTile
            label="Contract mismatches"
            value={mismatchKeys ? mismatchKeys.length : null}
            tone={mismatchKeys && mismatchKeys.length > 0 ? "bad" : "neutral"}
            loading={consoleSlot.loading}
            href={mandateListHref({ [COL.contract]: "Mismatch" })}
            title={
              mismatchKeys && mismatchKeys.length > 0
                ? `A Mandate Holder was saved that does not match its job's contract (red in the list's Health column): ${mismatchKeys.join(", ")}`
                : "Every saved Mandate Holder matches its job's contract."
            }
          />
        </KpiGrid>

        {features.length > 0 ? (
          <div className="rounded-md border border-border bg-card">
            <div className="grid grid-cols-1 gap-x-6 px-3 py-2 sm:grid-cols-2 lg:grid-cols-3">
              {shownFeatures.map((row) => (
                <Link
                  key={row.feature}
                  href={mandateListHref({ [COL.feature]: row.feature })}
                  className="group flex min-w-0 items-center gap-2 rounded px-1 py-1 text-xs hover:bg-accent/40"
                >
                  <span className="w-28 shrink-0 truncate font-medium text-foreground group-hover:text-primary">
                    {row.feature}
                  </span>
                  <span className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full bg-chart-2"
                      style={{ width: `${(row.total / maxFeature) * 100}%` }}
                    />
                    <span
                      className="absolute inset-y-0 left-0 rounded-full bg-chart-1"
                      style={{ width: `${(row.codeBacked / maxFeature) * 100}%` }}
                    />
                  </span>
                  <span className="w-8 shrink-0 text-right tabular-nums text-muted-foreground">
                    {row.total}
                  </span>
                </Link>
              ))}
            </div>
            <div className="flex items-center gap-3 border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm bg-chart-1" aria-hidden />
                Code-backed
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm bg-chart-2" aria-hidden />
                Soft
              </span>
              {features.length > FEATURE_ROWS_COLLAPSED ? (
                <button
                  type="button"
                  className="ml-auto font-medium text-primary hover:underline"
                  onClick={() => setShowAllFeatures((value) => !value)}
                >
                  {showAllFeatures
                    ? "Fewer"
                    : `All ${features.length} features`}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </Section>

      <Section icon={Activity} title="Binding coverage" error={coverageSlot.error}>
        <KpiGrid className="lg:grid-cols-3">
          <KpiTile
            label="Bound"
            value={n(cov?.green)}
            tone="good"
            loading={coverageSlot.loading}
            href={mandateListHref({ [COL.coverage]: "green" })}
          />
          <KpiTile
            label="Running on fallback"
            value={n(cov?.orange)}
            tone={cov && cov.orange > 0 ? "warn" : "neutral"}
            loading={coverageSlot.loading}
            href={mandateListHref({ [COL.coverage]: "orange" })}
          />
          <KpiTile
            label="Binding needed"
            value={n(cov?.red)}
            tone={cov && cov.red > 0 ? "bad" : "neutral"}
            loading={coverageSlot.loading}
            href={mandateListHref({ [COL.coverage]: "red" })}
          />
        </KpiGrid>
      </Section>

      <Section icon={Pin} title="Pinned vs latest" error={consoleSlot.error}>
        <KpiGrid className="lg:grid-cols-4">
          <KpiTile
            label="Defaults pinned"
            value={n(defs?.defaultsPinned)}
            loading={consoleSlot.loading}
          />
          <KpiTile
            label="Defaults on latest"
            value={n(defs?.defaultsLatest)}
            tone={defs && defs.defaultsLatest > 0 ? "warn" : "neutral"}
            loading={consoleSlot.loading}
            href={mandateListHref({ [COL.pin]: "Latest" })}
          />
          <KpiTile
            label="Customizations pinned"
            value={n(binds?.pinned)}
            loading={consoleSlot.loading}
          />
          <KpiTile
            label="Customizations on latest"
            value={n(binds?.latest)}
            tone={binds && binds.latest > 0 ? "warn" : "neutral"}
            loading={consoleSlot.loading}
          />
        </KpiGrid>
      </Section>

      <Section icon={Users} title="Customized" error={consoleSlot.error}>
        <KpiGrid className="lg:grid-cols-4">
          <KpiTile
            label="By organizations"
            value={n(binds?.orgMandates)}
            loading={consoleSlot.loading}
            hint={
              binds
                ? `${formatCount(binds.org)} bindings · ${formatCount(binds.orgCount)} orgs`
                : undefined
            }
          />
          <KpiTile
            label="Personal"
            value={n(binds?.personalMandates)}
            loading={consoleSlot.loading}
            hint={
              binds
                ? `${formatCount(binds.personal)} bindings · ${formatCount(binds.personalUsers)} ${binds.personalUsers === 1 ? "person" : "people"}`
                : undefined
            }
            href={mandateListHref({ [COL.customizedBy]: "Personal" })}
          />
          <KpiTile
            label="Disabled bindings"
            value={n(binds?.disabled)}
            loading={consoleSlot.loading}
          />
        </KpiGrid>
      </Section>

      <Section icon={GitBranch} title="Code vs database" error={truthSlot.error}>
        <KpiGrid>
          <KpiTile
            label="Code matches DB"
            value={n(drift?.match)}
            tone="good"
            loading={truthSlot.loading || consoleSlot.loading}
            hint={drift ? `of ${formatCount(drift.codeBacked)} code-backed` : undefined}
          />
          <KpiTile
            label="Inputs differ"
            value={n(drift?.diff)}
            tone={drift && drift.diff > 0 ? "warn" : "neutral"}
            loading={truthSlot.loading || consoleSlot.loading}
          />
          <KpiTile
            label="Code only"
            value={n(drift?.codeOnly)}
            tone={drift && drift.codeOnly > 0 ? "warn" : "neutral"}
            loading={truthSlot.loading}
          />
          <KpiTile
            label="DB only"
            value={n(drift?.dbOnly)}
            loading={truthSlot.loading}
          />
          <KpiTile
            label="Inputs not delivered"
            value={n(drift?.undelivered)}
            tone={drift && drift.undelivered > 0 ? "bad" : "neutral"}
            loading={truthSlot.loading}
            hint={drift ? `${formatCount(drift.spilled)} spilled to text` : undefined}
          />
          <KpiTile
            label="Import failures"
            value={n(drift?.importFailed)}
            tone={drift && drift.importFailed > 0 ? "bad" : "neutral"}
            loading={truthSlot.loading}
            href={mandateListHref({ [COL.codeState]: "import_failed" })}
          />
        </KpiGrid>
      </Section>

      <Section icon={Radar} title="Code scan" error={boardError}>
        {needsOrganization ? (
          <OrganizationRequiredNotice
            compact
            what="The code scan"
            className="rounded-md border border-border"
          />
        ) : (
        <KpiGrid>
          <KpiTile
            label="Last complete scan"
            value={scan ? (ago(scan.lastCompleteScanAt) ?? "Never") : null}
            tone={scan && !scan.lastCompleteScanAt ? "bad" : "neutral"}
            loading={boardLoading}
            href={REFERENCES_PATH}
          />
          <KpiTile
            label="Repos unscanned"
            value={n(scan?.unverified)}
            tone={scan && scan.unverified > 0 ? "bad" : "good"}
            loading={boardLoading}
            hint={scan ? `of ${formatCount(scan.repos)}` : undefined}
            href={REFERENCES_PATH}
          />
          <KpiTile
            label="Open findings"
            value={n(scan?.openFindings)}
            tone={scan && scan.openFindings > 0 ? "warn" : "neutral"}
            loading={boardLoading}
            href={ADMIN_MANDATES_HEALTH}
          />
          <KpiTile
            label="AI outside mandates"
            value={n(scan?.bypass)}
            tone={scan && (scan.bypass ?? 0) > 0 ? "warn" : "neutral"}
            loading={boardLoading}
            href={unconvertedCallsHref()}
            hint={
              scan
                ? scan.bypass === null
                  ? "not reported by this server yet"
                  : `${formatCount(scan.conversion)} on the list · ${formatCount(scan.bypass - scan.conversion)} new`
                : undefined
            }
            title="Every scanned repository. The server's raw-client guard checks aidream alone, so it can read 0 while other repositories still count here."
          />
          <KpiTile
            label="Patrol last run"
            value={scan ? (ago(scan.patrolLastRunAt) ?? "Never") : null}
            tone={scan && scan.patrolEnabled === false ? "warn" : "neutral"}
            loading={boardLoading}
            hint={
              scan
                ? scan.patrolEnabled === null
                  ? "not reported"
                  : scan.patrolEnabled
                    ? `next ${scan.patrolNextDueAt ? formatRelativeTime(scan.patrolNextDueAt) : "—"}`
                    : "off"
                : undefined
            }
          />
          <KpiTile
            label="Patrol health"
            value={
              scan && scan.patrolFailingStreak !== null
                ? scan.patrolFailingStreak > 0
                  ? `Failing ×${formatCount(scan.patrolFailingStreak)}`
                  : "Passing"
                : null
            }
            tone={
              scan && (scan.patrolFailingStreak ?? 0) > 0
                ? "bad"
                : scan && (scan.patrolRecentFailed ?? 0) > 0
                  ? "warn"
                  : "neutral"
            }
            loading={boardLoading}
            href={REFERENCES_PATH}
            hint={
              scan
                ? scan.patrolRecentCounted !== null
                  ? `${formatCount(scan.patrolRecentFailed ?? 0)} of last ${formatCount(scan.patrolRecentCounted)} failed · last success ${ago(scan.patrolLastSuccessAt) ?? "never"}`
                  : "not reported by this server yet"
                : undefined
            }
            title={
              scan && scan.patrolRunsCounted !== null
                ? `All time: ${formatCount(scan.patrolRunsFailed ?? 0)} of ${formatCount(scan.patrolRunsCounted)} runs failed. The headline is the newest runs, so a fixed outage never reads as current.`
                : undefined
            }
          />
        </KpiGrid>
        )}
      </Section>
    </div>
  );
}
