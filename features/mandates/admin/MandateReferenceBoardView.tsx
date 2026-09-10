"use client";

/**
 * THE MANDATE REFERENCE FLEET BOARD — `/administration/mandates/references`.
 *
 * Cross-repo system-of-record:
 * /Users/armanisadeghi/code/common-docs/projects/mandate-declaration-reporting/DESIGN.md §4.6.
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
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/matrx/buttons/CopyButton";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  fetchMandateReferenceBoard,
  formatRepoList,
  type MandateReferenceBoard,
  type MandateReferenceBoardRepo,
} from "./references";

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

function RepoCard({ repo }: { repo: MandateReferenceBoardRepo }) {
  const findingCodes = Object.entries(repo.finding_counts);
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
          {repo.open_findings.map((finding, index) => (
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
        </div>
      ) : null}
    </div>
  );
}

export function MandateReferenceBoardView() {
  const dispatch = useAppDispatch();
  const [board, setBoard] = useState<MandateReferenceBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloads, setReloads] = useState(0);

  const reload = useCallback(() => setReloads((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
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
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, reloads]);

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

      {loading ? (
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
            <strong>The board failed to load.</strong> Nothing below is a
            report of health — it is unknown. {error}
          </div>
        </div>
      ) : null}

      {board ? (
        <>
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
