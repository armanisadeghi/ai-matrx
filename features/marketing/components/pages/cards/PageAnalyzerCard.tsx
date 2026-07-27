"use client";

import { BrainCircuit, Loader2, RefreshCw } from "lucide-react";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import { Badge } from "@/components/ui/badge";
import { type PageAnalyzerState } from "@/features/marketing/components/pages/usePageAnalyzer";
import type { MarketingPage } from "@/features/marketing/types";
import { marketingPageManifest } from "@/features/surfaces/manifests/marketing-page.manifest";
import { surfaceValueLabels } from "@/features/surfaces/utils/surface-display";
import {
  CondensedFieldGrid,
  SectionCard,
} from "@/features/marketing/components/shared/MarketingUi";

// THE NAMING LAW: canonical labels for every declared surface value + group —
// section titles and field labels below render these byte-identically.
const L = surfaceValueLabels(marketingPageManifest);

/**
 * Page Analyzer (WS-11 / M-53) — runs the registered Page Analyzer system
 * agent for this canonical page (POST /seo/pages/analyze, durable streamed
 * command) and renders its keyword picture: inferred primary keyword,
 * supporting/discovered keywords, content role, funnel position, and
 * content gaps. Replaces the former "Matrx Analysis" / "Matrx Suggestions"
 * placeholders.
 */
export function PageAnalyzerCard({
  page,
  state,
  run,
}: {
  page: MarketingPage;
  /** Lifted analyzer state (PageWorkspace owns the hook so the surface scope
   * emits the same artifact this card renders — `page_analyzer`). */
  state: PageAnalyzerState;
  run: (forceRefresh: boolean) => Promise<void>;
}) {
  const artifact = state.result?.artifact;

  const copy = webCopy({
    kind: "web-page-analyzer",
    label: "Page Analyzer",
    description:
      "AI-derived keyword picture for this page: inferred primary keyword, supporting/discovered keywords, content role, and content gaps.",
    surface: `Page Analyzer — ${page.url}`,
    data: artifact ?? { status: state.status },
    lines: artifact
      ? [
          ["URL", page.url],
          ["Inferred primary keyword", artifact.inferred_primary_keyword.phrase],
          ["Content role", artifact.content_role],
          ["Funnel position", artifact.funnel_position],
          ["Declared vs actual", artifact.declared_vs_actual.status],
          ...artifact.gaps.map((g): [string, string] => ["Gap", `${g.severity}: ${g.gap}`]),
        ]
      : [["URL", page.url], ["Status", "Not yet analyzed"]],
    attributes: { page_id: page.id },
  });

  return (
    <SectionCard
      title={L.page_analyzer}
      copy={copy}
      collapsible
      anchor="page_analyzer"
      headerExtra={
        <button
          type="button"
          onClick={() => void run(state.status === "done")}
          disabled={state.status === "running"}
          aria-label="Run Page Analyzer"
          title="Run the Page Analyzer agent for this page"
          className="flex h-6 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          {state.status === "running" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </button>
      }
    >
      <div className="grid gap-3 p-3">
        {state.status === "idle" ? (
          <div className="flex min-h-28 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BrainCircuit className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs font-medium text-foreground">Not yet analyzed</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Run the Page Analyzer to infer this page&apos;s keyword picture from its
                stored content, GSC queries, and site context.
              </p>
            </div>
          </div>
        ) : null}
        {state.status === "running" ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {state.stage ?? "Running…"}
          </p>
        ) : null}
        {state.status === "error" ? (
          <p className="text-xs text-destructive">{state.error}</p>
        ) : null}
        {artifact ? (
          <>
            <CondensedFieldGrid
              fields={[
                { label: "Primary keyword", value: artifact.inferred_primary_keyword.phrase, span: 2 },
                { label: "Content role", value: artifact.content_role },
                { label: "Funnel position", value: artifact.funnel_position },
                {
                  label: "Declared vs actual",
                  value: artifact.declared_vs_actual.status,
                  tone: artifact.declared_vs_actual.status === "aligned" ? "good" : "warning",
                },
              ]}
            />
            {artifact.supported_keywords.length ? (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Supporting keywords
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {artifact.supported_keywords.map((k) => (
                    <Badge key={k.phrase} variant="outline" className="text-[10px]">
                      {k.phrase}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
            {artifact.discovered_keywords.length ? (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Discovered keywords
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {artifact.discovered_keywords.map((k) => (
                    <Badge key={k.phrase} variant="secondary" className="text-[10px]">
                      {k.phrase}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
            {artifact.gaps.length ? (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Content gaps
                </p>
                <ul className="mt-1 grid gap-1">
                  {artifact.gaps.map((gap) => (
                    <li key={gap.gap} className="flex items-start gap-1.5 text-xs">
                      <Badge
                        variant={gap.severity === "high" ? "warning" : "outline"}
                        className="mt-0.5 shrink-0 text-[9px]"
                      >
                        {gap.severity}
                      </Badge>
                      <span className="text-foreground/90">{gap.gap}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </SectionCard>
  );
}
