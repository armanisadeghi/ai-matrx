"use client";

/**
 * SOURCE & USAGE — Defined in / Used by, one copyable location per row.
 *
 * The shape is the one ruled 2026-09-09 (`features/mandates/FEATURE.md`) and
 * it has NOT changed: two sections, one copyable location per row, technical
 * paths system-admin-only. What changed is where the rows come from —
 * `GET /mandates/{key}/references` over `mandate.reference`, the reported
 * truth, instead of the partial import-time discovery in
 * `GET /mandates/code-truth`.
 *
 * THE THREE HONESTY RULES THIS COMPONENT EXISTS TO KEEP (D21):
 *
 *  1. **A flagged row is shown, never filtered.** Orphaned, unresolved,
 *     broken and conversion-pending rows sit in the list with a red glyph and
 *     the server's own sentence, because "unreachable is a flag, never a
 *     filter".
 *  2. **The empty state names who has not looked.** It says
 *     "No references reported yet for <repos>" — never "unused". Until every
 *     active repository has a complete scan, an empty list means nobody
 *     finished measuring.
 *  3. **The fallback announces itself.** When the reported inventory carries no
 *     declaration for this key, the old code-truth declaration is shown AND
 *     labelled as the older, partial source. A stand-in that looks like the
 *     real thing is the defect this rule prevents.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, OctagonAlert } from "lucide-react";

import { CopyButton } from "@/components/matrx/buttons/CopyButton";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import {
  SINGLE_SITE_SENTENCE,
  fetchMandateReferences,
  formatRepoList,
  unreportedSentence,
  type MandateReferenceReport,
  type MandateReferenceRow,
} from "./references";

export interface SourceUsageFallback {
  /** The code-truth declaration string, when discovery found one. */
  declaration: string | null;
  /** Discovery failed to import the declaring module. */
  importFailed: boolean;
}

function RowLine({
  row,
  singleSiteByDesign,
  copyLabel,
}: {
  row: MandateReferenceRow;
  singleSiteByDesign: boolean;
  copyLabel: string;
}) {
  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-3">
        {row.flag_sentence ? (
          <OctagonAlert
            className="size-4 shrink-0 text-destructive"
            aria-label="Problem reported"
          />
        ) : null}
        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          {row.location}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {row.reference_type.replaceAll("_", " ")}
        </span>
        <CopyButton content={row.location} label={copyLabel} size="sm" />
      </div>
      {row.flag_sentence ? (
        <p className="mt-1 text-xs text-destructive">
          {row.flag_sentence}
          {row.remedy ? ` ${row.remedy}` : ""}
        </p>
      ) : null}
      {singleSiteByDesign ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {SINGLE_SITE_SENTENCE}
        </p>
      ) : null}
    </div>
  );
}

export function MandateSourceUsage({
  mandateKey,
  fallback,
}: {
  mandateKey: string;
  fallback: SourceUsageFallback;
}) {
  const dispatch = useAppDispatch();
  // See the same note on MandateReferenceBoardView: `callApi` needs an
  // explicitly selected organization, and the app context hydrates async.
  const organizationId = useAppSelector(selectOrganizationId);
  const [report, setReport] = useState<MandateReferenceReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!organizationId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchMandateReferences(dispatch, mandateKey)
      .then((next) => {
        if (cancelled) return;
        setReport(next);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        // A failed read is SAID. A silent catch here would render the honest
        // empty state over a report nobody actually got — the exact lie.
        setError(cause instanceof Error ? cause.message : String(cause));
        setReport(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, mandateKey, organizationId]);

  useEffect(() => load(), [load]);

  const singleSite = report?.single_consumption_site_by_design ?? false;
  const definedIn = report?.defined_in ?? [];
  const usedBy = report?.used_by ?? [];
  const usesFallbackDeclaration =
    report !== null && definedIn.length === 0 && fallback.declaration !== null;

  return (
    <div className="min-w-0 space-y-4">
      {!organizationId ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-md border border-border p-3 text-sm text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Waiting for your organization to load.
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
            <strong>The reference report failed.</strong> This list is not
            empty — it is unknown. {error}
          </div>
        </div>
      ) : null}

      {report && report.unscanned_repos.length > 0 ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-md border border-warning p-3 text-sm"
        >
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0 text-warning"
            aria-hidden="true"
          />
          <div>
            <strong>Incomplete coverage.</strong> No complete scan yet for{" "}
            {formatRepoList(report.unscanned_repos)}. Nothing here establishes
            that a job is unused.
          </div>
        </div>
      ) : null}

      <section className="space-y-2" aria-label="Defined in">
        <h3 className="text-sm font-semibold">Defined in</h3>
        <div className="divide-y divide-border rounded-md border border-border text-sm">
          {definedIn.length > 0 ? (
            definedIn.map((row, index) => (
              <RowLine
                key={`${row.identity_hash}:${index}`}
                row={row}
                singleSiteByDesign={false}
                copyLabel="Copy declaration location"
              />
            ))
          ) : usesFallbackDeclaration ? (
            <div className="px-3 py-2">
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  {fallback.declaration}
                </span>
                <CopyButton
                  content={fallback.declaration ?? ""}
                  label="Copy declaration location"
                  size="sm"
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                From the older import-time discovery (
                <code>GET /mandates/code-truth</code>), not from a reported
                scan — no scanner has reported a declaration for this key yet.
              </p>
            </div>
          ) : (
            <div className="px-3 py-2 text-muted-foreground">
              {error
                ? "Unknown — the report failed."
                : loading
                  ? "Reading…"
                  : fallback.importFailed
                    ? "No declaration reported, and import-time discovery failed too."
                    : report
                      ? unreportedSentence(report)
                      : "No declaration reported yet."}
            </div>
          )}
        </div>
      </section>

      <section className="space-y-2" aria-label="Used by">
        <h3 className="text-sm font-semibold">Used by</h3>
        <div className="divide-y divide-border rounded-md border border-border text-sm">
          {usedBy.length > 0 ? (
            usedBy.map((row, index) => (
              <RowLine
                key={`${row.identity_hash}:${index}`}
                row={row}
                singleSiteByDesign={singleSite}
                copyLabel="Copy usage location"
              />
            ))
          ) : (
            <div className="px-3 py-2 text-muted-foreground">
              {error
                ? "Unknown — the report failed."
                : loading
                  ? "Reading…"
                  : singleSite
                    ? `No consumption site reported yet — ${SINGLE_SITE_SENTENCE}.`
                    : report
                      ? unreportedSentence(report)
                      : "No references reported yet."}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
