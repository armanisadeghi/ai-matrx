"use client";

/** Canonical renderer for `keyword_serp_intent_analysis_v1`. */

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  SearchCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { isJsonObject } from "@/types/json";
import { cn } from "@/lib/utils";

export interface KeywordSerpIntentAnalysisBlockProps {
  serverData?: unknown;
}

interface ProviderFinding {
  provider: "google" | "brave";
  apparentIntent: string;
  confidence: number | null;
  dominantFormats: string[];
  evidenceSummary: string;
}

interface ChangeFinding {
  dimension: string;
  originalValue: string;
  enhancedValue: string;
  confidenceDelta: number | null;
  rationale: string;
  citations: string[];
}

interface AnalysisData {
  phrase: string | null;
  intentSummary: string | null;
  consensus: string | null;
  difficulty: string | null;
  originalIntent: string | null;
  enhancedIntent: string | null;
  enhancedConfidence: number | null;
  providers: ProviderFinding[];
  changes: ChangeFinding[];
  expectations: Array<{ label: string; values: string[] }>;
  limitations: string[];
  isComplete: boolean;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function number(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function humanize(value: string): string {
  return value.replaceAll("_", " ");
}

export function readKeywordSerpIntentAnalysis(
  serverData: unknown,
): AnalysisData | null {
  if (!isJsonObject(serverData)) return null;
  const original = isJsonObject(serverData.original_classification)
    ? serverData.original_classification
    : {};
  const enhanced = isJsonObject(serverData.enhanced_classification)
    ? serverData.enhanced_classification
    : {};
  const providers: ProviderFinding[] = [];
  if (Array.isArray(serverData.provider_findings)) {
    for (const item of serverData.provider_findings) {
      if (!isJsonObject(item)) continue;
      const provider = item.provider;
      if (provider !== "google" && provider !== "brave") continue;
      providers.push({
        provider,
        apparentIntent: text(item.apparent_intent) ?? "Unclear",
        confidence: number(item.confidence),
        dominantFormats: strings(item.dominant_formats),
        evidenceSummary: text(item.evidence_summary) ?? "",
      });
    }
  }
  const changes: ChangeFinding[] = [];
  if (Array.isArray(serverData.changes)) {
    for (const item of serverData.changes) {
      if (!isJsonObject(item)) continue;
      const dimension = text(item.dimension);
      if (!dimension) continue;
      const citations: string[] = [];
      if (Array.isArray(item.evidence)) {
        for (const evidence of item.evidence) {
          if (!isJsonObject(evidence)) continue;
          const provider = text(evidence.provider);
          const position = number(evidence.position);
          const domain = text(evidence.domain);
          if (provider && position !== null) {
            citations.push(
              `${humanize(provider)} #${position}${domain ? ` · ${domain}` : ""}`,
            );
          }
        }
      }
      changes.push({
        dimension,
        originalValue: text(item.original_value) ?? "Unknown",
        enhancedValue: text(item.enhanced_value) ?? "Unknown",
        confidenceDelta: number(item.confidence_delta),
        rationale: text(item.rationale) ?? "",
        citations,
      });
    }
  }
  const content = isJsonObject(serverData.content_expectations)
    ? serverData.content_expectations
    : {};
  return {
    phrase: text(serverData.phrase),
    intentSummary: text(serverData.intent_summary),
    consensus: text(serverData.serp_consensus),
    difficulty: text(serverData.difficulty_signal),
    originalIntent: text(original.intent_class),
    enhancedIntent: text(enhanced.intent_class),
    enhancedConfidence: number(enhanced.overall_confidence),
    providers,
    changes,
    expectations: [
      { label: "Dominant formats", values: strings(content.dominant_formats) },
      {
        label: "What strong results cover",
        values: strings(content.must_cover),
      },
      {
        label: "What differentiates leaders",
        values: strings(content.differentiators),
      },
      { label: "Likely weak fit", values: strings(content.likely_weak_fit) },
    ],
    limitations: strings(serverData.limitations),
    isComplete: serverData.isComplete !== false,
  };
}

export default function KeywordSerpIntentAnalysisBlock({
  serverData,
}: KeywordSerpIntentAnalysisBlockProps) {
  const data = readKeywordSerpIntentAnalysis(serverData);
  if (!data) return null;

  return (
    <div className="my-2 grid gap-4">
      <header className="grid gap-2 border-b border-border pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchCheck className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">
            Search-informed intent{data.phrase ? ` · ${data.phrase}` : ""}
          </h3>
          {!data.isComplete ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Comparing results
            </span>
          ) : null}
          {data.consensus ? (
            <Badge variant="outline" className="ml-auto capitalize">
              Providers {humanize(data.consensus)}
            </Badge>
          ) : null}
          {data.difficulty ? (
            <Badge variant="secondary" className="capitalize">
              {humanize(data.difficulty)} difficulty
            </Badge>
          ) : null}
        </div>
        {data.intentSummary ? (
          <p className="text-xs leading-5 text-muted-foreground">
            {data.intentSummary}
          </p>
        ) : null}
        {data.enhancedIntent ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="capitalize text-muted-foreground">
              {humanize(data.originalIntent ?? "unclassified")}
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-semibold capitalize text-foreground">
              {humanize(data.enhancedIntent)}
            </span>
            {data.enhancedConfidence !== null ? (
              <span className="text-muted-foreground">
                {data.enhancedConfidence}% confidence
              </span>
            ) : null}
          </div>
        ) : null}
      </header>

      {data.providers.length > 0 ? (
        <section className="grid gap-2 sm:grid-cols-2">
          {data.providers.map((provider) => (
            <div
              key={provider.provider}
              className="grid gap-2 rounded-lg border border-border p-3"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold capitalize text-foreground">
                  {provider.provider}
                </span>
                <Badge variant="outline" className="capitalize">
                  {humanize(provider.apparentIntent)}
                </Badge>
                {provider.confidence !== null ? (
                  <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
                    {provider.confidence}%
                  </span>
                ) : null}
              </div>
              {provider.evidenceSummary ? (
                <p className="text-[11px] leading-4 text-muted-foreground">
                  {provider.evidenceSummary}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-1">
                {provider.dominantFormats.map((format) => (
                  <Badge
                    key={format}
                    variant="secondary"
                    className="text-[10px]"
                  >
                    {format}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <section className="grid gap-2">
        <h4 className="text-xs font-semibold text-foreground">
          Classification review
        </h4>
        {data.changes.length === 0 && data.isComplete ? (
          <div className="flex items-center gap-2 rounded-lg border border-border p-3 text-xs text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-success" />
            The observed result pages support the existing classification; no
            material changes were proposed.
          </div>
        ) : (
          data.changes.map((change) => (
            <div
              key={change.dimension}
              className="grid gap-1.5 rounded-lg border border-border p-3"
            >
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="font-medium capitalize text-foreground">
                  {humanize(change.dimension)}
                </span>
                <span className="capitalize text-muted-foreground">
                  {humanize(change.originalValue)}
                </span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span className="font-medium capitalize text-foreground">
                  {humanize(change.enhancedValue)}
                </span>
                {change.confidenceDelta !== null ? (
                  <Badge
                    variant="outline"
                    className={cn(
                      "ml-auto tabular-nums",
                      change.confidenceDelta > 0 && "text-success",
                    )}
                  >
                    {change.confidenceDelta > 0 ? "+" : ""}
                    {change.confidenceDelta} confidence
                  </Badge>
                ) : null}
              </div>
              {change.rationale ? (
                <p className="text-[11px] leading-4 text-muted-foreground">
                  {change.rationale}
                </p>
              ) : null}
              {change.citations.length > 0 ? (
                <p className="text-[10px] capitalize text-muted-foreground">
                  Evidence: {change.citations.join(" · ")}
                </p>
              ) : null}
            </div>
          ))
        )}
      </section>

      <section className="grid gap-2 sm:grid-cols-2">
        {data.expectations
          .filter((section) => section.values.length > 0)
          .map((section) => (
            <div key={section.label} className="rounded-lg bg-muted/35 p-3">
              <h4 className="text-[11px] font-semibold text-foreground">
                {section.label}
              </h4>
              <ul className="mt-1.5 grid gap-1 text-[11px] leading-4 text-muted-foreground">
                {section.values.map((value) => (
                  <li key={value}>• {value}</li>
                ))}
              </ul>
            </div>
          ))}
      </section>

      {data.limitations.length > 0 ? (
        <section className="flex items-start gap-2 border-t border-border pt-3">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <div className="text-[10px] leading-4 text-muted-foreground">
            {data.limitations.join(" ")}
          </div>
        </section>
      ) : null}
    </div>
  );
}
