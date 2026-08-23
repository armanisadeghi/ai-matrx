"use client";

/**
 * Fact Checker tab of a full-scrape result.
 *
 * 🚨 THE ONE PIPELINE. The run goes through the canonical execution system
 * (`useLiveAgentRun` → `launchAgentExecution({ mandateKey })`) and every live
 * byte is rendered by `<LiveRunDisplay>` → `MarkdownStream` → the kind
 * registry. This tab hand-renders NOTHING of the stream: it previously
 * accumulated chunks into a string and fed them to `MarkdownRenderer`, which
 * bypassed the kind registry (structured answers arrived as raw JSON code
 * blocks) and let the model's chain-of-thought leak into the panel as literal
 * `<reasoning>` tags. See CLAUDE.md § "Streaming/AI surfaces".
 *
 * The section tabs (Summary, Observations, …) are a POST-PROCESSING product
 * feature over the SETTLED answer text — never over the live stream. While the
 * run is in flight every tab shows the live output instead of a spinner
 * (THE FLOATING LAW: a spinner is never the answer while AI works).
 *
 * The mandate wiring is unchanged: the tab gates on `useMandate` and never
 * names an agent id.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Search,
  ClipboardList,
  AlertCircle,
  ListChecks,
  Table,
  FileText,
} from "lucide-react";
import { parseFactCheck } from "./fact-check-parsing-util";
import { parseMarkdownTable } from "@/components/mardown-display/markdown-classification/processors/bock-processors/parse-markdown-table";
import { PageTemplate, Card } from "@/components/official/PageTemplate";
import MarkdownRenderer from "@/components/mardown-display/MarkdownRenderer";
import MarkdownTable from "@/components/mardown-display/tables/MarkdownTable";
import { LiveRunDisplay } from "@/features/agents/components/live-run/LiveRunDisplay";
import { useLiveAgentRun } from "@/features/agents/hooks/useLiveAgentRun";
import {
  SCRAPER_ANALYSIS_CONTENT_VARIABLE,
  SCRAPER_ANALYSIS_MANDATES,
} from "@/features/scraper/constants/analysis-agents";
import { useMandate } from "@/features/agents/mandates/useMandate";
import { AnalysisMandateGate } from "./AnalysisMandateGate";

interface FactCheckerPageProps {
  value: string;
  overview?: {
    page_title?: string;
    char_count?: number;
    url?: string;
    website?: string;
  };
}

const MANDATE_KEY = SCRAPER_ANALYSIS_MANDATES.factChecker;
const SURFACE_KEY = "scraper:fact-check";

const FactCheckerPage: React.FC<FactCheckerPageProps> = ({
  value,
  overview = {},
}) => {
  const { run, isRunning, error, conversationId, hasLiveRun } =
    useLiveAgentRun();
  /** The settled answer text — the ONLY thing this tab parses. */
  const [answerText, setAnswerText] = useState<string>("");
  // Gate: the tab runs only once its mandate resolves; unresolved renders the
  // unbound state (picker + door), never a hardcoded agent.
  const {
    mandate,
    loading: mandateLoading,
    error: mandateError,
  } = useMandate(MANDATE_KEY);
  const mandateReady = Boolean(mandate);

  const pageTitle = overview?.page_title || "Content";
  const characterCount = overview?.char_count
    ? overview.char_count.toLocaleString()
    : "N/A";
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
        console.error("[FactChecker] Agent run failed:", err);
      });

    return () => {
      controller.abort();
    };
  }, [mandateReady, value]);

  const parsedContent = useMemo(
    () => (answerText ? parseFactCheck(answerText) : null),
    [answerText],
  );

  const rating = parsedContent?.ratingValue || 0;

  /** The live output — what every tab shows while the agent is still writing. */
  const liveOutput = (label: string) => (
    <LiveRunDisplay
      conversationId={conversationId}
      label={label}
      pending={isRunning}
      bodyClassName="max-h-[70vh] overflow-y-auto px-3 py-3 text-sm"
    />
  );

  /**
   * Shared posture for every tab: unbound mandate → gate; resolving → a plain
   * line; run failed with nothing to show → error; still writing → the live
   * stream. Returns null once there is settled text to section up.
   */
  const preSection = (label: string) => {
    if (mandateError) {
      return (
        <AnalysisMandateGate
          mandateKey={MANDATE_KEY}
          title="Fact Checker"
          error={mandateError}
        />
      );
    }
    if (mandateLoading) {
      return (
        <Card title={label}>
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
    if (!answerText) return liveOutput(label);
    return null;
  };

  const section = (
    label: string,
    title: string,
    body: string | undefined,
    emptyMessage: string,
  ) => {
    const pre = preSection(label);
    if (pre) return pre;

    return (
      <Card title={title}>
        {body ? (
          <MarkdownRenderer
            content={body}
            type="message"
            fontSize={18}
            role="assistant"
            className="bg-muted rounded-lg p-4 border border-border"
          />
        ) : (
          <p className="text-muted-foreground text-center py-8 text-sm">
            {emptyMessage}
          </p>
        )}
      </Card>
    );
  };

  const renderSummary = () => {
    const pre = preSection("Generating Summary");
    if (pre) return pre;

    return (
      <Card title="Fact Check Summary">
        <div className="p-4">
          {parsedContent?.summary ? (
            <MarkdownRenderer
              content={parsedContent.summary}
              type="message"
              fontSize={18}
              role="assistant"
              className="bg-muted rounded-lg p-4 mb-6 border border-border"
            />
          ) : (
            <p className="text-muted-foreground text-center py-8 text-sm">
              No summary found in this analysis.
            </p>
          )}

          {parsedContent?.overallRating && (
            <MarkdownRenderer
              content={parsedContent.overallRating}
              type="message"
              fontSize={18}
              role="assistant"
              className="bg-muted rounded-lg p-4 border border-border"
            />
          )}
        </div>
      </Card>
    );
  };

  const renderClaimsTable = () => {
    const pre = preSection("Generating Claims Table");
    if (pre) return pre;

    const tableData = parsedContent?.factCheckTable
      ? parseMarkdownTable(parsedContent.factCheckTable)
      : null;

    return (
      <Card title="Claims Assessment Table">
        {tableData?.markdown ? (
          <MarkdownTable data={tableData.markdown} />
        ) : (
          <p className="text-muted-foreground text-center py-8 text-sm">
            No table data found in the analysis.
          </p>
        )}
      </Card>
    );
  };

  /**
   * Full Report is the run itself — always the canonical display, before and
   * after settling (the pipeline keeps rendering the finished message).
   */
  const renderFullReport = () => {
    if (mandateError) {
      return (
        <AnalysisMandateGate
          mandateKey={MANDATE_KEY}
          title="Fact Checker"
          error={mandateError}
        />
      );
    }
    if (error && !hasLiveRun) {
      return (
        <Card title="Error">
          <div className="text-destructive p-4">Error: {error}</div>
        </Card>
      );
    }
    return liveOutput("Fact check");
  };

  // The band words describe the rescaled 0-5 value; the agent's OWN number and
  // scale ride alongside so the stat never restates its verdict on a scale it
  // did not use (the bound agent answers out of 10).
  const getRatingText = (ratingValue: number): string => {
    if (ratingValue <= 0) return "Pending";
    if (ratingValue === 1) return "Very Low";
    if (ratingValue === 2) return "Low";
    if (ratingValue === 3) return "Moderate";
    if (ratingValue === 4) return "High";
    return "Very High";
  };

  const trustworthiness = parsedContent?.rating
    ? `${getRatingText(rating)} (${parsedContent.rating.value}/${parsedContent.rating.outOf})`
    : getRatingText(rating);

  const statsItems = [
    { label: "Content Source", value: overview?.website || "Unknown" },
    { label: "Character Count", value: characterCount || "N/A" },
    { label: "Trustworthiness", value: trustworthiness },
  ];

  const tabs = [
    {
      id: "summary",
      label: "Summary",
      icon: AlertTriangle,
      content: renderSummary(),
    },
    {
      id: "observations",
      label: "Observations",
      icon: Search,
      content: section(
        "Analyzing Content",
        "General Observations",
        parsedContent?.generalObservations,
        "No general observations found.",
      ),
    },
    {
      id: "claims",
      label: "Claims Analysis",
      icon: ClipboardList,
      content: section(
        "Analyzing Claims",
        "Specific Claims Analysis",
        parsedContent?.specificClaimsAnalysis,
        "No claims analysis found.",
      ),
    },
    {
      id: "concerns",
      label: "Concerns",
      icon: AlertCircle,
      content: section(
        "Identifying Concerns",
        "Potential Concerns",
        parsedContent?.potentialConcerns,
        "No concerns identified.",
      ),
    },
    {
      id: "recommendations",
      label: "Recommendations",
      icon: ListChecks,
      content: section(
        "Generating Recommendations",
        "Recommendations",
        parsedContent?.recommendations,
        "No recommendations found.",
      ),
    },
    {
      id: "table",
      label: "Claims Table",
      icon: Table,
      content: renderClaimsTable(),
    },
    {
      id: "full-report",
      label: "Full Report",
      icon: FileText,
      content: renderFullReport(),
    },
  ];

  return (
    <PageTemplate
      title="Fact Checker"
      subtitle={pageTitle}
      url={pageUrl}
      statsItems={statsItems}
      tabs={tabs}
      defaultActiveTab="summary"
      heroSize="xs"
    />
  );
};

export default FactCheckerPage;
