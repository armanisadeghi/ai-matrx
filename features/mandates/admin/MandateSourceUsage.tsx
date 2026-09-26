"use client";

import { normalizeTransferJson } from "@ai-matrx/kit/content-transfer";
import { useMandateAlchemyTabCapture } from "../workspace/MandateAlchemy";

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
import { SINGLE_SITE_SENTENCE, fetchMandateReferences, formatRepoList, unreportedSentence, type MandateReferenceReport, type MandateReferenceRow } from "./references";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export interface SourceUsageFallback {
  /** The code-truth declaration string, when discovery found one. */
  declaration: string | null;
  /** Discovery failed to import the declaring module. */
  importFailed: boolean;
}

/**
 * What each reference type MEANS, in words a person reads — never the
 * scanner's snake_case vocabulary (UX punch list 2026-09-26: "seed holder",
 * "constant" were jargon). Unknown types fall back to spaced words so a new
 * scanner type is still shown, never hidden.
 */
const REFERENCE_TYPE_WORDS: Record<string, string> = {
  declaration: "Declared here",
  family_declaration: "Declared as a family",
  resolution: "Resolved here",
  execution: "Runs here",
  constant: "Key named in code",
  dynamic_family: "Key built at runtime",
  passthrough: "Passed through",
  db_authored: "Authored in the database",
  user_selected_agent: "Person picks the agent",
  seed_holder: "Sets the default Mandate Holder",
  bypass: "Bypasses the mandate",
  unclassified: "Not yet classified",
};

export function referenceTypeWords(type: string): string {
  return REFERENCE_TYPE_WORDS[type] ?? type.replaceAll("_", " ");
}

/**
 * `repo/dir/file.py:3716` → the file name first (what a person scans for),
 * the repository and folder muted beside it. The full path stays one click
 * away on the copy button.
 */
export function splitLocation(location: string): {
  file: string;
  line: string | null;
  where: string;
} {
  const match = /^(.*?)(?::(\d+))?$/.exec(location);
  const path = match?.[1] ?? location;
  const line = match?.[2] ?? null;
  const parts = path.split("/");
  const file = parts.pop() ?? path;
  const repo = parts.shift() ?? "";
  const folder = parts.join("/");
  return {
    file,
    line,
    where: [repo, folder].filter(Boolean).join(" · "),
  };
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
        <LocationText location={row.location} />
        <span className="shrink-0 text-xs text-muted-foreground">
          {referenceTypeWords(row.reference_type)}
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

function LocationText({ location }: { location: string }) {
  const { file, line, where } = splitLocation(location);
  return (
    <span className="min-w-0 flex-1" title={location}>
      <span className="font-medium [overflow-wrap:anywhere]">{file}</span>
      {line ? (
        <span className="text-muted-foreground"> · line {line}</span>
      ) : null}
      {where ? (
        <span className="block truncate text-xs text-muted-foreground">
          {where}
        </span>
      ) : null}
    </span>
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
  // 🚨 READING NEVER WAITS ON AN ORGANIZATION (Arman, 2026-09-23 — access
  // belongs to the person). This key's references are one record read by key;
  // callApi sends a GET with no organization after its bounded restore wait.
  // The id stays a dependency only so the read refreshes when one arrives.
  const organizationId = useAppSelector(selectOrganizationId);
  const [report, setReport] = useState<MandateReferenceReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(true);
  const loading = reading;

  const load = useCallback(() => {
    let cancelled = false;
    setReading(true);
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
        if (!cancelled) setReading(false);
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

  useMandateAlchemyTabCapture("source", loading
    ? { status: "loading" }
    : { status: "ready", data: normalizeTransferJson({
        mandate_key: mandateKey,
        report,
        error,
        fallback_declaration: usesFallbackDeclaration ? fallback : null,
      }) }, "references");

  return (
    <div className="min-w-0 space-y-4">
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
            <strong>The reference report failed.</strong> This list is not
            empty — it is unknown. {error}
          </div>
          <ErrorAlchemyMenu className="ml-auto" />
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
                <LocationText location={fallback.declaration ?? ""} />
                <CopyButton
                  content={fallback.declaration ?? ""}
                  label="Copy declaration location"
                  size="sm"
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Found by the older, partial discovery — no code scan has
                reported a declaration for this job yet.
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
