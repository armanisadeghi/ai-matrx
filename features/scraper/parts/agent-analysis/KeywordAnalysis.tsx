"use client";

/**
 * Keyword Analysis tab of a full-scrape result.
 *
 * 🚨 THE ONE PIPELINE. This tab renders NOTHING of the agent's stream itself.
 * The run goes through the canonical execution system
 * (`useLiveAgentRun` → `launchAgentExecution({ mandateKey })`) and its output
 * is rendered by `<LiveRunDisplay>` → `MarkdownStream` → the kind registry, so
 * the agent's structured answer (`__kind: "keyword_variant_set"`) lands on its
 * registered kind component instead of a raw JSON code block, and the model's
 * chain-of-thought is consumed by the pipeline instead of leaking into the
 * panel as literal `<reasoning>` tags. Before this, the tab accumulated chunks
 * into a string and hand-rendered it — the exact defect the streaming law bans
 * (CLAUDE.md § "Streaming/AI surfaces").
 *
 * THE PRODUCT IS THE SHAPE (2026-09-08). `scraper.keyword_analysis` declares
 * `output_kind: keyword_variant_set`, so the run is `expect: "json"` typed
 * against the generated `KeywordVariantSet` — never `expect: "text"` plus a
 * regex over the answer string (the flattening disease: the shape's
 * component never rendered and the system said nothing). The former
 * "Content Comparison" tab parsed a markdown table out of that string; the
 * shape carries no table, so the tab could only ever say "bind a different
 * agent" — a dead control. It is gone; the kind component IS the analysis.
 *
 * The mandate wiring is unchanged: the tab gates on `useMandate` and never
 * names an agent id.
 */

import React, { useEffect, useRef } from "react";
import {
  PageTemplate,
  Card,
  FileTextIcon,
} from "@/components/official/PageTemplate";
import type { KeywordVariantSet } from "@/features/content-ir/kinds/generated/kinds.generated";
import { LiveRunDisplay } from "@/features/agents/components/live-run/LiveRunDisplay";
import { useLiveAgentRun } from "@/features/agents/hooks/useLiveAgentRun";
import {
  SCRAPER_ANALYSIS_CONTENT_VARIABLE,
  SCRAPER_ANALYSIS_MANDATES,
} from "@/features/scraper/constants/analysis-agents";
import { useMandate } from "@/features/mandates/useMandate";
import { AnalysisMandateGate } from "./AnalysisMandateGate";

interface KeywordAnalysisPageProps {
  value: string;
  overview?: {
    page_title?: string;
    char_count?: number;
    url?: string;
    website?: string;
  };
}

const MANDATE_KEY = SCRAPER_ANALYSIS_MANDATES.keywordAnalysis;
const SURFACE_KEY = "scraper:keyword-analysis";

const KeywordAnalysisPage: React.FC<KeywordAnalysisPageProps> = ({
  value,
  overview,
}) => {
  const { run, isRunning, error, conversationId, hasLiveRun } =
    useLiveAgentRun();
  // Gate: the tab runs only once its mandate resolves; unresolved renders the
  // unbound state (picker + door), never a hardcoded agent.
  const {
    mandate,
    loading: mandateLoading,
    error: mandateError,
  } = useMandate(MANDATE_KEY);
  const mandateReady = Boolean(mandate);

  const pageTitle = overview?.page_title;
  const characterCount = overview?.char_count?.toLocaleString();
  const pageUrl = overview?.url;

  // `run` is a fresh closure every render, so it can never be an effect dep —
  // the auto-run would re-fire forever. The launch effect keys on the mandate
  // + the content only, and reaches the current launcher through this ref.
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });

  useEffect(() => {
    if (!mandateReady || !value || value.trim().length === 0) {
      return undefined;
    }

    // Cancel-on-unmount: aborting HARVESTS whatever the run produced and stops
    // the wait; `useLiveAgentRun` destroys the instance on unmount.
    const controller = new AbortController();
    // The extracted `keyword_variant_set` object is the run's product; the
    // pipeline renders it through the kind's registered component inside
    // `<LiveRunDisplay>` below, so nothing here reads the answer string.
    void runRef.current<KeywordVariantSet>({
      mandateKey: MANDATE_KEY,
      surfaceKey: SURFACE_KEY,
      sourceFeature: "scraper",
      initiation: "auto",
      expect: "json",
      variables: { [SCRAPER_ANALYSIS_CONTENT_VARIABLE]: value },
      signal: controller.signal,
      failureMessages: {
        noJson:
          "The keyword analysis finished without a keyword variant set. Run it again.",
      },
    }).catch((err) => {
      console.error("[KeywordAnalysis] Agent run failed:", err);
    });

    return () => {
      controller.abort();
    };
  }, [mandateReady, value]);

  const renderGate = () =>
    mandateError ? (
      <AnalysisMandateGate
        mandateKey={MANDATE_KEY}
        title="Keyword Analysis"
        error={mandateError}
      />
    ) : null;

  const renderAnalysis = () => {
    const gate = renderGate();
    if (gate) return gate;

    if (mandateLoading) {
      return (
        <Card title="Keyword Analysis">
          <p className="text-sm text-muted-foreground">
            Resolving the agent assigned to this tab…
          </p>
        </Card>
      );
    }

    if (error && !hasLiveRun) {
      return (
        <Card title="Error">
          <div className="text-destructive p-4">Error: {error}</div>
        </Card>
      );
    }

    // The display IS the frame (no Card around it — a bordered card around a
    // bordered display is the nested-chrome defect) and it renders nothing
    // until there is a run to show.
    return (
      <LiveRunDisplay
        conversationId={conversationId}
        label="Keyword analysis"
        pending={isRunning}
        bodyClassName="max-h-[70vh] overflow-y-auto px-3 py-3 text-sm"
      />
    );
  };

  const tabs = [
    {
      id: "analysis",
      label: "Keyword Analysis",
      icon: FileTextIcon,
      content: renderAnalysis(),
    },
  ];

  const statsItems = [
    { label: "Website", value: overview?.website || "Unknown" },
    { label: "Character Count", value: characterCount || "N/A" },
  ];

  return (
    <PageTemplate
      title="Keyword Analysis"
      subtitle={pageTitle}
      url={pageUrl}
      statsItems={statsItems}
      tabs={tabs}
      defaultActiveTab="analysis"
      heroSize="xs"
    />
  );
};

export default KeywordAnalysisPage;
