"use client";

import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Link2,
  MessageSquareQuote,
  Share2,
  ScanSearch,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useShare } from "@/features/sharing/hooks/useShare";
import { isJsonObject } from "@/types/json";

export interface PublicVisibilityProvider {
  engine: string;
  model_name: string | null;
  status: "completed" | "failed";
  answer_text: string;
  target_mentioned: boolean;
  target_cited: boolean;
  target_recommendation_rank: number | null;
  target_recommendation_subject: string | null;
  citation_count: number;
  analysis: Record<string, unknown>;
  error: string | null;
}

export interface PublicVisibilityResult {
  result_kind: "ai_visibility.analyze";
  site_id: string;
  brand_name: string;
  website_url: string;
  brand_aliases: string[];
  query: string;
  engines: string[];
  providers: PublicVisibilityProvider[];
  summary: Record<string, unknown>;
  share_path: string | null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parsePublicVisibilityResult(
  value: unknown,
): PublicVisibilityResult | null {
  if (!isJsonObject(value) || value.result_kind !== "ai_visibility.analyze")
    return null;
  const siteId = stringValue(value.site_id);
  const brandName = stringValue(value.brand_name);
  const websiteUrl = stringValue(value.website_url);
  const query = stringValue(value.query);
  if (!siteId || !brandName || !websiteUrl || !query) return null;
  const providers: PublicVisibilityProvider[] = [];
  if (Array.isArray(value.providers)) {
    for (const item of value.providers) {
      if (!isJsonObject(item)) continue;
      const engine = stringValue(item.engine);
      const status = item.status;
      if (!engine || (status !== "completed" && status !== "failed")) continue;
      providers.push({
        engine,
        status,
        model_name: stringValue(item.model_name),
        answer_text: stringValue(item.answer_text) ?? "",
        target_mentioned: item.target_mentioned === true,
        target_cited: item.target_cited === true,
        target_recommendation_rank: numberValue(
          item.target_recommendation_rank,
        ),
        target_recommendation_subject: stringValue(
          item.target_recommendation_subject,
        ),
        citation_count: numberValue(item.citation_count) ?? 0,
        analysis: isJsonObject(item.analysis) ? item.analysis : {},
        error: stringValue(item.error),
      });
    }
  }
  return {
    result_kind: "ai_visibility.analyze",
    site_id: siteId,
    brand_name: brandName,
    website_url: websiteUrl,
    brand_aliases: Array.isArray(value.brand_aliases)
      ? value.brand_aliases.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    query,
    engines: Array.isArray(value.engines)
      ? value.engines.filter((item): item is string => typeof item === "string")
      : [],
    providers,
    summary: isJsonObject(value.summary) ? value.summary : {},
    share_path: stringValue(value.share_path),
  };
}

const ENGINE_LABELS: Record<string, string> = {
  chat_gpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  perplexity: "Perplexity",
};

function analysisList(
  analysis: Record<string, unknown>,
  key: string,
): Record<string, unknown>[] {
  const value = analysis[key];
  return Array.isArray(value) ? value.filter(isJsonObject) : [];
}

function field(item: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function hostname(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

export function AiVisibilityReport({
  result,
  shareUrl,
  acquisition = false,
}: {
  result: PublicVisibilityResult;
  shareUrl?: string;
  acquisition?: boolean;
}) {
  const { share, copied, fallbackDialog } = useShare();
  const completed = result.providers.filter(
    (provider) => provider.status === "completed",
  );
  const mentioned = completed.filter(
    (provider) => provider.target_mentioned,
  ).length;
  const cited = completed.filter((provider) => provider.target_cited).length;
  const url = shareUrl ?? result.share_path ?? undefined;

  return (
    <article className="mx-auto w-full max-w-6xl space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-violet-500/10 p-6 shadow-xl sm:p-10">
        <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <Badge className="mb-4 gap-1.5">
              <ScanSearch className="h-3.5 w-3.5" /> AI Visibility Report
            </Badge>
            <h1 className="max-w-4xl text-3xl font-semibold tracking-tight sm:text-5xl">
              How AI recommends {result.brand_name}
            </h1>
            <blockquote className="mt-5 max-w-3xl border-l-2 border-primary pl-4 text-base text-muted-foreground sm:text-lg">
              “{result.query}”
            </blockquote>
            <a
              href={result.website_url}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              {result.website_url}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          {url ? (
            <Button
              size="lg"
              className="gap-2"
              onClick={() =>
                void share({
                  title: `${result.brand_name} AI Visibility Report`,
                  text: `See how ChatGPT, Claude, Gemini, and Perplexity recommend ${result.brand_name}.`,
                  url: url.startsWith("http")
                    ? url
                    : `${window.location.origin}${url}`,
                })
              }
            >
              {copied ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <Share2 className="h-4 w-4" />
              )}
              {copied ? "Link copied" : "Share this report"}
            </Button>
          ) : null}
        </div>
        <div className="relative mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Engines checked", completed.length],
            ["Brand mentions", mentioned],
            ["Brand citations", cited],
            [
              "Best position",
              Math.min(
                ...completed.map((p) => p.target_recommendation_rank ?? 999),
                999,
              ) === 999
                ? "—"
                : `#${Math.min(...completed.map((p) => p.target_recommendation_rank ?? 999))}`,
            ],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-2xl border border-border/70 bg-background/70 p-4 backdrop-blur"
            >
              <div className="text-2xl font-semibold tabular-nums">{value}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {result.providers.map((provider) => {
          const recommendations = analysisList(
            provider.analysis,
            "recommendations",
          );
          const signals = analysisList(provider.analysis, "decision_signals");
          const claims = analysisList(provider.analysis, "claims");
          const citations = analysisList(provider.analysis, "citations");
          return (
            <details
              key={provider.engine}
              className="group rounded-2xl border border-border bg-card shadow-sm"
              open
            >
              <summary className="cursor-pointer list-none p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="rounded-xl bg-primary/10 p-2 text-primary">
                      <MessageSquareQuote className="h-5 w-5" />
                    </span>
                    <div>
                      <h2 className="font-semibold">
                        {ENGINE_LABELS[provider.engine] ?? provider.engine}
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        {provider.model_name ?? "Answer engine"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {provider.target_recommendation_rank ? (
                      <Badge>
                        Position #{provider.target_recommendation_rank}
                      </Badge>
                    ) : null}
                    <Badge
                      variant={
                        provider.target_mentioned ? "success" : "outline"
                      }
                    >
                      {provider.target_mentioned
                        ? "Mentioned"
                        : "Not mentioned"}
                    </Badge>
                    <Badge
                      variant={provider.target_cited ? "success" : "outline"}
                    >
                      {provider.target_cited ? "Cited" : "Not cited"}
                    </Badge>
                  </div>
                </div>
              </summary>
              <div className="space-y-5 border-t border-border px-5 pb-5 pt-4">
                {provider.error ? (
                  <p className="text-sm text-destructive">{provider.error}</p>
                ) : null}
                <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {provider.answer_text}
                  </ReactMarkdown>
                </div>
                <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Recommendations
                    </p>
                    <p className="font-semibold">{recommendations.length}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Decision signals
                    </p>
                    <p className="font-semibold">{signals.length}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Claims analyzed
                    </p>
                    <p className="font-semibold">{claims.length}</p>
                  </div>
                </div>
                {recommendations.length || signals.length || claims.length ? (
                  <div className="grid gap-4 border-t border-border pt-4 lg:grid-cols-3">
                    <section>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Recommended brands
                      </h3>
                      <ol className="space-y-2">
                        {recommendations.map((item, index) => (
                          <li
                            key={`${field(item, "subject")}-${index}`}
                            className="rounded-lg bg-muted/40 p-2.5 text-sm"
                          >
                            <span className="mr-2 font-mono text-xs text-primary">
                              #
                              {typeof item["rank"] === "number"
                                ? item["rank"]
                                : index + 1}
                            </span>
                            <span className="font-medium">
                              {field(item, "subject") ||
                                "Unnamed recommendation"}
                            </span>
                            {field(item, "reason", "rationale") ? (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {field(item, "reason", "rationale")}
                              </p>
                            ) : null}
                          </li>
                        ))}
                      </ol>
                    </section>
                    <section>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Decision signals
                      </h3>
                      <ul className="space-y-2">
                        {signals.map((item, index) => (
                          <li
                            key={`${field(item, "signal")}-${index}`}
                            className="rounded-lg bg-muted/40 p-2.5 text-sm"
                          >
                            <span className="font-medium">
                              {field(item, "signal") || "Observed signal"}
                            </span>
                            {field(item, "evidence_text") ? (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {field(item, "evidence_text")}
                              </p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </section>
                    <section>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Claims that shaped the answer
                      </h3>
                      <ul className="space-y-2">
                        {claims.map((item, index) => (
                          <li
                            key={`${field(item, "claim_key")}-${index}`}
                            className="rounded-lg bg-muted/40 p-2.5 text-sm"
                          >
                            <span className="font-medium">
                              {field(item, "subject") || "Claim"}
                            </span>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {field(item, "claim_text")}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </section>
                  </div>
                ) : null}
                {citations.length ? (
                  <section className="border-t border-border pt-4">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Sources used by this answer
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {citations.map((item, index) => {
                        const sourceUrl = field(item, "url");
                        if (!sourceUrl) return null;
                        return (
                          <Button
                            key={`${sourceUrl}-${index}`}
                            asChild
                            size="sm"
                            variant="outline"
                          >
                            <a
                              href={sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {field(item, "title", "cited_for") ||
                                hostname(sourceUrl)}
                              <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                            </a>
                          </Button>
                        );
                      })}
                    </div>
                  </section>
                ) : null}
              </div>
            </details>
          );
        })}
      </section>

      {acquisition ? (
        <section className="rounded-3xl border border-primary/20 bg-primary/5 p-7 text-center sm:p-10">
          <Link2 className="mx-auto h-7 w-7 text-primary" />
          <h2 className="mt-3 text-2xl font-semibold">
            Turn this snapshot into an AI visibility strategy
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
            AI Matrx tracks the questions buyers ask, the sources assistants
            trust, and the exact evidence that changes recommendations.
          </p>
          <Button asChild size="lg" className="mt-5 gap-2">
            <Link href="/sign-up">
              Build your own visibility system
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </section>
      ) : null}
      {fallbackDialog}
    </article>
  );
}
