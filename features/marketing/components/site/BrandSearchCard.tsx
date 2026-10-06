"use client";

// What Google and Brave show for the site's own name — stored by site setup
// on web.site.metadata.brand_search (aidream services/seo/brand_search.py).
// Every line here is a fact read off real results; nothing advises.

import { AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import {
  formatDate,
  SectionCard,
} from "@/features/marketing/components/shared/MarketingUi";

interface BrandSearchRow {
  position: number;
  url: string;
  domain: string;
  title: string;
}

interface BrandSearchRun {
  engine: string;
  query: string;
  status: "ok" | "unavailable";
  error: string | null;
  rows: BrandSearchRow[];
}

interface BrandSearchSignal {
  key: string;
  severity: "high" | "med";
  statement: string;
  domains: string[];
  /** Every search the fact was read off, e.g. `Brave "AI Matrx"`. */
  searches: string[];
}

interface BrandSearchCapture {
  captured_at: string;
  own_domain: string;
  queries: string[];
  runs: BrandSearchRun[];
  signals: BrandSearchSignal[];
  profiles: string[];
}

function readCapture(metadata: unknown): BrandSearchCapture | null {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = (metadata as Record<string, unknown>).brand_search;
  if (!raw || typeof raw !== "object") return null;
  const capture = raw as Partial<BrandSearchCapture>;
  if (!Array.isArray(capture.runs) || !Array.isArray(capture.signals))
    return null;
  return {
    captured_at: String(capture.captured_at ?? ""),
    own_domain: String(capture.own_domain ?? ""),
    queries: Array.isArray(capture.queries) ? capture.queries : [],
    runs: capture.runs,
    signals: capture.signals,
    profiles: Array.isArray(capture.profiles) ? capture.profiles : [],
  };
}

function engineLabel(engine: string): string {
  return engine === "google" ? "Google" : engine === "brave" ? "Brave" : engine;
}

function ownPosition(run: BrandSearchRun, ownDomain: string): string {
  if (run.status !== "ok") return "No results received";
  const own = run.rows.find((row) => row.domain === ownDomain);
  return own ? `#${own.position}` : `Not in top ${run.rows.length}`;
}

export function BrandSearchCard({
  metadata,
  domain,
}: {
  metadata: unknown;
  domain: string;
}) {
  const capture = readCapture(metadata);
  // An all-clear is a claim about results we received; with none it is silence.
  const received = capture
    ? capture.runs.some((run) => run.status === "ok")
    : false;

  const copy = webCopy({
    kind: "web-site-brand-search",
    label: "Brand search",
    description:
      "What Google and Brave showed for this site's own name at the last capture: the site's position per search and the facts read off the results.",
    surface: `Brand search — ${domain}`,
    data: capture
      ? {
          captured_at: capture.captured_at,
          queries: capture.queries,
          signals: capture.signals,
          positions: capture.runs.map((run) => ({
            engine: run.engine,
            query: run.query,
            position: ownPosition(run, capture.own_domain),
          })),
        }
      : null,
    lines: capture
      ? capture.signals.length
        ? capture.signals.map((signal): [string, string] => [
            signal.key,
            signal.statement,
          ])
        : received
          ? [["Status", "No issues in the stored brand searches"]]
          : [["Status", "No search results were received"]]
      : [["Status", "Not searched yet"]],
    attributes: { signals: capture?.signals.length ?? 0 },
  });

  return (
    <SectionCard
      title="Brand search"
      copy={copy}
      headerExtra={
        capture ? (
          <span className="type-meta text-muted-foreground">
            {formatDate(capture.captured_at)}
          </span>
        ) : null
      }
    >
      {!capture ? (
        <p className="px-3 py-4 type-body text-muted-foreground">
          Not searched yet. Runs with site setup.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {capture.signals.length ? (
            <ul className="divide-y divide-border">
              {capture.signals.map((signal) => (
                <li
                  key={`${signal.key}-${signal.domains.join(",")}-${signal.searches.join(",")}`}
                  className="flex items-start gap-2.5 px-3 py-2"
                  title={signal.searches.join(" · ")}
                >
                  <span
                    className={
                      signal.severity === "high"
                        ? "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive-ink"
                        : "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-warning/10 text-warning-ink"
                    }
                  >
                    <AlertTriangle className="h-3 w-3" />
                  </span>
                  <span className="min-w-0 flex-1 type-body text-foreground">
                    {signal.statement}
                  </span>
                </li>
              ))}
            </ul>
          ) : received ? (
            <div className="flex items-center gap-2.5 px-3 py-3 type-body text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-success" />
              No issues in these searches.
            </div>
          ) : (
            <p className="px-3 py-3 type-body text-muted-foreground">
              No search results were received.
            </p>
          )}

          <div className="overflow-x-auto px-3 py-2">
            <table className="w-full type-secondary">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-3 font-medium">Search</th>
                  <th className="py-1 pr-3 font-medium">Engine</th>
                  <th className="py-1 font-medium">{capture.own_domain}</th>
                </tr>
              </thead>
              <tbody>
                {capture.runs.map((run) => (
                  <tr key={`${run.engine}-${run.query}`}>
                    <td className="py-1 pr-3 text-foreground">
                      <a
                        href={
                          run.engine === "brave"
                            ? `https://search.brave.com/search?q=${encodeURIComponent(run.query)}`
                            : `https://www.google.com/search?q=${encodeURIComponent(run.query)}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 hover:text-primary"
                      >
                        {run.query}
                        <ExternalLink className="h-3 w-3 opacity-50" />
                      </a>
                    </td>
                    <td className="py-1 pr-3 text-muted-foreground">
                      {engineLabel(run.engine)}
                    </td>
                    <td
                      className="py-1 tabular-nums text-foreground"
                      title={run.error ?? undefined}
                    >
                      {ownPosition(run, capture.own_domain)}
                      {run.error ? <ErrorAlchemyMenu error={run.error} /> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {capture.profiles.length ? (
            <div className="px-3 py-2">
              <p className="mb-1 type-meta font-medium text-muted-foreground">
                Listings in these results
              </p>
              <ul className="flex flex-wrap gap-x-3 gap-y-1">
                {capture.profiles.map((url) => (
                  <li key={url} className="min-w-0">
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="block max-w-[18rem] truncate type-secondary text-foreground hover:text-primary"
                    >
                      {url.replace(/^https?:\/\/(www\.)?/, "")}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </SectionCard>
  );
}
