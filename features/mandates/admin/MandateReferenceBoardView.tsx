"use client";

/**
 * THE MANDATE REFERENCE FLEET BOARD — `/administration/mandates/references`.
 *
 * Cross-repo system-of-record:
 * /Users/armanisadeghi/code/common-docs/systems/intelligence/mandates/STATE.md §4.6.
 *
 * What it shows, and why each part is not optional:
 *
 *  * **Every ACTIVE repository**, with its scan state. A repo with no complete
 *    candidate scan reads **unverified** — never "clean", never absent. An
 *    inactive `platform.repo` row never appears (ruling D24).
 *  * **Open findings** — the flagged reference rows, each with a real location
 *    and the server's remedy sentence. Nothing is dropped for being orphaned,
 *    unresolved or broken (D21).
 *  * **The conversion list** (D20) — every `bypass` reference still carrying
 *    `conversion_pending`, with its count. The ratchet baseline may shrink,
 *    never grow.
 *
 * The word "unused" appears nowhere on this screen, and cannot: this board
 * reports what was measured, and names who has not been measured yet.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/matrx/buttons/CopyButton";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useServerOrganizationId } from "@/lib/api/useServerOrganizationId";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { errorRowsHref, fetchMandateReferenceBoard, formatRepoList, formatSeconds, costCell, type MandatePatrolRun, type MandatePatrolSection, type MandateReferenceBoard, type MandateReferenceBoardRepo } from "./references";
import { formatFileSize } from "@ai-matrx/kit/format";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

function ScanLine({
  label,
  scan,
}: {
  label: string;
  scan: MandateReferenceBoardRepo["last_complete_candidate"];
}) {
  return (
    <div className="flex items-baseline gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      {scan ? (
        <>
          <code className="[overflow-wrap:anywhere]">
            {scan.revision.slice(0, 12)}
          </code>
          {scan.scanned_at ? (
            <span className="text-muted-foreground">
              {new Date(scan.scanned_at).toLocaleString()}
            </span>
          ) : null}
          {scan.package_path ? (
            <span className="text-muted-foreground">{scan.package_path}</span>
          ) : null}
        </>
      ) : (
        <span className="text-muted-foreground">none</span>
      )}
    </div>
  );
}

/** How many findings a repo shows before the reader asks for the rest. The
 * cap is a DISCLOSURE, never a filter (D21): the button states the true total
 * and the repo header already carries the full count. */
const FINDINGS_PREVIEW = 10;

function RepoCard({ repo }: { repo: MandateReferenceBoardRepo }) {
  const [showAllFindings, setShowAllFindings] = useState(false);
  const findingCodes = Object.entries(repo.finding_counts);
  const visibleFindings = showAllFindings
    ? repo.open_findings
    : repo.open_findings.slice(0, FINDINGS_PREVIEW);
  return (
    <div className="rounded-md border border-border">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-3 py-2">
        <span className="font-semibold">{repo.repo_slug}</span>
        {repo.scan_state === "verified" ? (
          <Badge variant="outline">verified</Badge>
        ) : (
          <Badge variant="destructive">unverified — no complete scan</Badge>
        )}
        <span className="text-xs text-muted-foreground">
          {repo.reference_count} references
        </span>
        {repo.open_finding_count > 0 ? (
          <span className="text-xs text-destructive">
            {repo.open_finding_count} open
          </span>
        ) : null}
        {repo.conversion_count > 0 ? (
          <span className="text-xs text-warning">
            {repo.conversion_count} to convert
          </span>
        ) : null}
        {repo.github_full_name ? (
          <span className="ml-auto text-xs text-muted-foreground">
            {repo.github_full_name}
          </span>
        ) : null}
      </div>
      <div className="space-y-1 px-3 py-2">
        <ScanLine label="Last complete candidate" scan={repo.last_complete_candidate} />
        <ScanLine label="Last complete deployed" scan={repo.last_complete_deployed} />
        {findingCodes.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-1 text-xs">
            {findingCodes.map(([code, count]) => (
              <span key={code} className="rounded border border-border px-1.5 py-0.5">
                {code} {count}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {repo.open_findings.length > 0 ? (
        <div className="divide-y divide-border border-t border-border text-sm">
          {visibleFindings.map((finding, index) => (
            <div key={`${finding.location}:${index}`} className="px-3 py-2">
              <div className="flex items-center gap-3">
                <AlertTriangle
                  className="size-4 shrink-0 text-destructive"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  {finding.location}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {finding.mandate_key}
                </span>
                <CopyButton
                  content={finding.location}
                  label="Copy finding location"
                  size="sm"
                />
              </div>
              <p className="mt-1 text-xs text-destructive">
                {finding.sentence} {finding.remedy}
              </p>
            </div>
          ))}
          {repo.open_findings.length > visibleFindings.length ? (
            <div className="px-3 py-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAllFindings(true)}
              >
                Show all {repo.open_findings.length} findings
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * THE PATROL TABLE — the top of the board, and the answer to Arman's one
 * instruction when he turned the 4-hourly schedule on (2026-09-17): *"if there
 * is a cost, make sure it's tracked and easy for me to see."*
 *
 * Data, no prose. Every number is READ off `scheduler.sch_run` — the patrol
 * records its own cost there — so this table and the run ledger cannot disagree.
 *
 * The three things it must never do:
 *  * print **$0.00** for a run nobody priced. Container time has no configured
 *    rate; `no rate set` is the truth and `costCell` owns that decision.
 *  * present a duration the BOARD derived from two timestamps as one the patrol
 *    measured — a derived cell is marked.
 *  * show an empty table when the numbers are simply unreadable. A scheduler
 *    outage says so in red.
 */
function PatrolRunsTable({ patrol }: { patrol: MandatePatrolSection }) {
  return (
    <section className="space-y-2" aria-label="Scheduled patrol">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold">Scheduled patrol</h2>
        {patrol.enabled && patrol.trigger_enabled ? (
          <Badge variant="outline">enabled</Badge>
        ) : (
          <Badge variant="destructive">
            {patrol.enabled ? "trigger disabled" : "disabled — nothing re-scans"}
          </Badge>
        )}
        <code className="text-xs">{patrol.tool_name}</code>
        {patrol.schedule ? (
          <span className="text-xs text-muted-foreground">{patrol.schedule}</span>
        ) : (
          <span className="text-xs text-destructive">
            no trigger — this task has no schedule
          </span>
        )}
        {(patrol.failing_streak ?? 0) > 0 ? (
          <span className="text-xs text-destructive">
            failing — the last {patrol.failing_streak} run
            {patrol.failing_streak === 1 ? "" : "s"} failed
            <ErrorAlchemyMenu />
          </span>
        ) : (patrol.recent_runs_failed ?? 0) > 0 ? (
          <span className="text-xs text-amber-700 dark:text-amber-400">
            passing now — {patrol.recent_runs_failed} of the last{" "}
            {patrol.recent_runs_counted} failed
            <ErrorAlchemyMenu />
          </span>
        ) : null}
        {patrol.runs_failed > 0 ? (
          <span className="text-xs text-muted-foreground">
            all time: {patrol.runs_failed} of {patrol.runs_counted} failed
          </span>
        ) : null}
      </div>

      {patrol.read_error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive p-3 text-sm"
        >
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0 text-destructive"
            aria-hidden="true"
          />
          <span>{patrol.read_error}</span>
          <ErrorAlchemyMenu className="ml-auto" />
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-xs">
          <tbody className="divide-y divide-border">
            <tr>
              <th scope="row" className="px-3 py-1.5 text-left font-medium">
                Next due
              </th>
              <td className="px-3 py-1.5">
                {patrol.next_due_at
                  ? new Date(patrol.next_due_at).toLocaleString()
                  : "not scheduled"}
              </td>
              <th scope="row" className="px-3 py-1.5 text-left font-medium">
                Last run
              </th>
              <td className="px-3 py-1.5">
                {patrol.last_run_at
                  ? new Date(patrol.last_run_at).toLocaleString()
                  : "never"}
              </td>
              <th scope="row" className="px-3 py-1.5 text-left font-medium">
                Enabled
              </th>
              <td className="px-3 py-1.5">
                {patrol.enabled_at
                  ? new Date(patrol.enabled_at).toLocaleString()
                  : "—"}
              </td>
            </tr>
            <tr>
              <th scope="row" className="px-3 py-1.5 text-left font-medium">
                Total runtime
              </th>
              <td className="px-3 py-1.5">
                {formatSeconds(patrol.cumulative_wall_seconds)}
              </td>
              <th scope="row" className="px-3 py-1.5 text-left font-medium">
                Total compute
              </th>
              <td className="px-3 py-1.5">
                {costCell(patrol.cumulative_compute_cost_usd)}
                <span className="ml-1 text-muted-foreground">
                  ({patrol.cumulative_vcpu_seconds} vCPU-s)
                </span>
              </td>
              <th scope="row" className="px-3 py-1.5 text-left font-medium">
                Total model spend
              </th>
              <td className="px-3 py-1.5">
                ${patrol.cumulative_model_spend_usd.toFixed(2)}
                <span className="ml-1 text-muted-foreground">
                  over {patrol.runs_counted} run
                  {patrol.runs_counted === 1 ? "" : "s"}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* The one sentence on this table, and it is load-bearing: it is what
          stops "no rate set" being read as "broken" or as "$0.00". */}
      <p className="text-xs text-muted-foreground">{patrol.cost_note}</p>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-xs">
          <thead className="border-b border-border text-left text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Started</th>
              <th scope="col" className="px-3 py-2 font-medium">Status</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Wall</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">CPU</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Compute</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Model</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Rows</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Filed</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Resolved</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Clone</th>
              <th scope="col" className="px-3 py-2 font-medium">Revision</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {patrol.runs.length > 0 ? (
              patrol.runs.map((run: MandatePatrolRun) => {
                const href = errorRowsHref(run);
                const broken = run.failed_legs.length > 0;
                return (
                  <tr key={run.run_id} className={broken ? "bg-destructive/5" : undefined}>
                    <td className="whitespace-nowrap px-3 py-2">
                      {run.started_at
                        ? new Date(run.started_at).toLocaleString()
                        : run.due_at
                          ? `due ${new Date(run.due_at).toLocaleString()}`
                          : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {broken ? (
                        <span className="text-destructive">
                          {run.status} — {run.failed_legs.join(", ")}
                        </span>
                      ) : (
                        run.status
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {formatSeconds(run.wall_seconds)}
                      {run.seconds_source === "derived_from_timestamps" ? (
                        <span
                          className="ml-1 text-muted-foreground"
                          title="Derived from this run's own start and finish times — the patrol did not record its duration on this run."
                        >
                          ~
                        </span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {formatSeconds(run.cpu_seconds)}
                    </td>
                    <td
                      className="whitespace-nowrap px-3 py-2 text-right"
                      title={[
                        run.compute_cost_note,
                        run.vcpu_seconds === null || run.vcpu_seconds === undefined
                          ? null
                          : `${run.vcpu_seconds} vCPU-seconds (${run.cpu_count_source ?? "source unrecorded"})`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    >
                      {costCell(run.compute_cost_usd)}
                    </td>
                    <td
                      className="whitespace-nowrap px-3 py-2 text-right"
                      title={run.model_spend_evidence ?? undefined}
                    >
                      {run.model_spend_usd === null || run.model_spend_usd === undefined
                        ? "—"
                        : `$${run.model_spend_usd.toFixed(2)}`}
                    </td>
                    <td className="px-3 py-2 text-right">{run.rows_submitted ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      {/* The link from a run to the defects IT filed. */}
                      {run.error_rows_filed !== null &&
                      run.error_rows_filed !== undefined &&
                      href ? (
                        <Link
                          href={href}
                          className="underline underline-offset-2"
                          title={`Open the ${run.error_rows_filed} error row(s) this run filed`}
                        >
                          {run.error_rows_filed}
                          <ErrorAlchemyMenu error={run.error_rows_filed} />
                        </Link>
                      ) : (
                        (run.error_rows_filed ?? "—")
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {run.error_rows_resolved ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {formatFileSize(run.git_clone_bytes)}
                    </td>
                    <td className="px-3 py-2">
                      {run.revision ? (
                        <code className="[overflow-wrap:anywhere]">
                          {run.revision.slice(0, 12)}
                        </code>
                      ) : (
                        <span className="text-muted-foreground">nothing scanned</span>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={11} className="px-3 py-2 text-muted-foreground">
                  {patrol.read_error
                    ? "The runs could not be read — see the message above."
                    : patrol.enabled
                      ? "No run recorded yet. The first one appears here after the next due time."
                      : "The patrol is disabled, so there are no runs and nothing re-scans on its own."}
                  <ErrorAlchemyMenu />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function MandateReferenceBoardView() {
  const dispatch = useAppDispatch();
  // 🚨 `callApi` refuses to send without an explicitly SELECTED organization,
  // and the app context hydrates asynchronously — firing at mount raced it and
  // painted "Select an organization" over a session that HAS one. Waiting for
  // the id is the honest fix; the screen says it is waiting rather than
  // reporting a failure that is really a timing artefact.
  const organizationId = useServerOrganizationId();
  // 🚨 "NO ORG YET" IS NOT "STILL READING" — the same class MandatesConsole and
  // useMandateInputSurface already fixed. `loading` starts `true`, so a bare
  // early return on a missing organization left "Waiting for your organization
  // to load" spinning FOREVER on a session that has none, with no remedy.
  // Before the bootstrap resolves, waiting is the truth. Once it HAS resolved
  // and there is still no organization, that is a settled fact: stop loading
  // and say what fixes it.
  // 🚨 THE FOURTH STATE (R37). `orgBootstrapResolved && !organizationId` used
  // to be this refusal's whole reading — and `setOrgBootstrapFailure` sets
  // resolved TRUE, so a failed read told a member of thirteen organizations to
  // pick one. The gate's discriminant separates the two terminal answers and
  // `OrganizationContextNotice` renders each, Retry included.
  const { organizationState } = useOrganizationRequired();
  const organizationUnanswered =
    organizationState === "required" || organizationState === "unavailable";
  const [board, setBoard] = useState<MandateReferenceBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(true);
  const [reloads, setReloads] = useState(0);
  // Derived at render, never set in the effect (react-hooks/set-state-in-effect).
  const loading = reading && !organizationUnanswered;

  const reload = useCallback(() => setReloads((n) => n + 1), []);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    setReading(true);
    setError(null);
    fetchMandateReferenceBoard(dispatch)
      .then((next) => {
        if (!cancelled) setBoard(next);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setBoard(null);
      })
      .finally(() => {
        if (!cancelled) setReading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, organizationId, reloads]);

  return (
    <div className="min-w-0 space-y-4 p-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">Mandate references</h1>
        <p className="text-sm text-muted-foreground">
          What every repository reported about where mandates are declared and
          called. A repository nobody has finished scanning reads unverified —
          it never reads clean.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={reload}
          disabled={loading}
        >
          <RefreshCw className="mr-2 size-4" aria-hidden="true" />
          Refresh
        </Button>
      </header>

      {organizationUnanswered ? (
        <OrganizationContextNotice
          state={organizationState}
          compact
          className="rounded-md border border-border"
          description="No organization is selected, so the reference board cannot read anything — choose one from the organization picker in the header and this fills in."
        />
      ) : !organizationId ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-md border border-border p-3 text-sm text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Waiting for your organization to load — the board reads nothing until
          the request can carry it.
        </div>
      ) : loading ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-md border border-border p-3 text-sm text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Reading the reported references…
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive p-3 text-sm"
        >
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0 text-destructive"
            aria-hidden="true"
          />
          <div>
            <strong>The board failed to load. <ErrorAlchemyMenu /></strong> Nothing below is a
            report of health — it is unknown. {error}
          </div>
        </div>
      ) : null}

      {board ? (
        <>
          {/* TOP OF THE BOARD, deliberately: the patrol is what keeps everything
              below it true, and its cost is what Arman asked to be able to see.
              A server that does not report the section says so — it never
              silently renders a board with no patrol on it. */}
          {board.patrol ? (
            <PatrolRunsTable patrol={board.patrol} />
          ) : (
            <div
              role="status"
              className="flex items-start gap-2 rounded-md border border-border p-3 text-sm"
            >
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span>
                This server did not report the scheduled patrol, so its state and
                cost are unknown here — not zero. Everything below is still the
                measured reference data.
              </span>
            </div>
          )}

          <div
            role="status"
            className="rounded-md border border-border p-3 text-sm"
          >
            {board.unverified_repos.length > 0 ? (
              <>
                <strong>Coverage is incomplete.</strong> No complete scan yet
                for {formatRepoList(board.unverified_repos)}. Nothing on this
                board says a mandate is unused.
              </>
            ) : (
              <>
                <strong>Every active repository has a complete scan.</strong>{" "}
                {board.open_finding_count} open finding
                {board.open_finding_count === 1 ? "" : "s"}.
              </>
            )}
          </div>

          <section className="space-y-3" aria-label="Repositories">
            <h2 className="text-sm font-semibold">
              Repositories ({board.repos.length})
            </h2>
            {board.repos.length > 0 ? (
              board.repos.map((repo) => (
                <RepoCard key={repo.repo_slug} repo={repo} />
              ))
            ) : (
              <div className="rounded-md border border-destructive p-3 text-sm">
                No active repository is registered in{" "}
                <code>platform.repo</code>. That is a registry defect, not an
                empty fleet.
              </div>
            )}
          </section>

          <section className="space-y-2" aria-label="Conversion list">
            <h2 className="text-sm font-semibold">
              Conversion list ({board.conversion_count})
            </h2>
            <p className="text-sm text-muted-foreground">
              Work that runs outside a mandate today. This is the ratchet
              baseline: it may shrink, never grow.
            </p>
            <div className="divide-y divide-border rounded-md border border-border text-sm">
              {board.conversion_list.length > 0 ? (
                board.conversion_list.map((row, index) => (
                  <div
                    key={`${row.location}:${index}`}
                    className="flex items-center gap-3 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                      {row.location}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {row.mandate_key}
                    </span>
                    <CopyButton
                      content={row.location}
                      label="Copy conversion location"
                      size="sm"
                    />
                  </div>
                ))
              ) : (
                <div className="px-3 py-2 text-muted-foreground">
                  {board.unverified_repos.length > 0
                    ? `Nothing reported yet — ${formatRepoList(board.unverified_repos)} ${board.unverified_repos.length === 1 ? "has" : "have"} no complete scan, so this list is not yet a count of anything.`
                    : "Nothing on the conversion list — every reported reference runs through a mandate."}
                </div>
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
