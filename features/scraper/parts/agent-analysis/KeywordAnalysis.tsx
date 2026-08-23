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
 * The mandate wiring is unchanged: the tab gates on `useMandate` and never
 * names an agent id.
 */

import React, { useEffect, useRef, useState } from "react";
import { Columns2 } from "lucide-react";
import { parseMarkdownTable } from "@/components/mardown-display/markdown-classification/processors/bock-processors/parse-markdown-table";
import {
  PageTemplate,
  Card,
  FileTextIcon,
} from "@/components/official/PageTemplate";
import MarkdownTable from "@/components/mardown-display/tables/MarkdownTable";
import { LiveRunDisplay } from "@/features/agents/components/live-run/LiveRunDisplay";
import { useLiveAgentRun } from "@/features/agents/hooks/useLiveAgentRun";
import {
  SCRAPER_ANALYSIS_CONTENT_VARIABLE,
  SCRAPER_ANALYSIS_MANDATES,
} from "@/features/scraper/constants/analysis-agents";
import { useMandate } from "@/features/agents/mandates/useMandate";
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
  /** The settled answer text — the ONLY thing this tab parses (never the live stream). */
  const [answerText, setAnswerText] = useState<string>("");
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
    void runRef.current<string>({
      mandateKey: MANDATE_KEY,
      surfaceKey: SURFACE_KEY,
      sourceFeature: "scraper",
      initiation: "auto",
      expect: "text",
      variables: { [SCRAPER_ANALYSIS_CONTENT_VARIABLE]: value },
      signal: controller.signal,
      // Stale text from the previous run must never survive into this one.
      // Cleared here (a callback fired by the run, before the stream) rather
      // than in the effect body, which would cascade a render.
      onConversationCreated: () => setAnswerText(""),
    })
      .then((text) => {
        if (!controller.signal.aborted) setAnswerText(text ?? "");
      })
      .catch((err) => {
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

  const renderComparison = () => {
    const gate = renderGate();
    if (gate) return gate;

    // Parsed from the SETTLED answer only. The mandate's agent currently
    // answers with a structured `keyword_variant_set` payload rather than a
    // markdown comparison table, so this states plainly what it is waiting for
    // instead of rendering an empty card.
    const tableData = answerText ? parseMarkdownTable(answerText) : null;

    return (
      <Card title="Content Comparison">
        {tableData?.markdown ? (
          <MarkdownTable data={tableData.markdown} />
        ) : (
          <p className="text-muted-foreground text-center py-8 text-sm">
            {isRunning
              ? "Waiting for the analysis to finish…"
              : answerText
                ? "This analysis returned no comparison table. Bind a keyword agent that emits one to fill this tab."
                : "The comparison table will appear here once the analysis runs."}
          </p>
        )}
      </Card>
    );
  };

  const tabs = [
    {
      id: "analysis",
      label: "Keyword Analysis",
      icon: FileTextIcon,
      content: renderAnalysis(),
    },
    {
      id: "comparison",
      label: "Content Comparison",
      icon: Columns2,
      content: renderComparison(),
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
