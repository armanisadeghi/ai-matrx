"use client";

import React, { useState, useEffect, useMemo } from "react";
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
import MarkdownStream from "@/components/MarkdownStream";
import {
  SCRAPER_ANALYSIS_CONTENT_VARIABLE,
  SCRAPER_ANALYSIS_MANDATES,
} from "@/features/scraper/constants/analysis-agents";
import { useScraperAgentAnalysis } from "@/features/scraper/hooks/useScraperAgentAnalysis";
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

const FactCheckerPage: React.FC<FactCheckerPageProps> = ({
  value,
  overview = {},
}) => {
  const { runAnalysis, cancel, isLoading, error, streamingResponse } =
    useScraperAgentAnalysis();
  // Gate: the tab runs only once its mandate resolves; unresolved renders the
  // unbound state (picker + door), never a hardcoded agent.
  const {
    mandate,
    loading: mandateLoading,
    error: mandateError,
  } = useMandate(MANDATE_KEY);
  const mandateReady = Boolean(mandate);
  const [pageText, setPageText] = useState<string>(value);

  const pageTitle = overview?.page_title || "Content";
  const characterCount = overview?.char_count
    ? overview.char_count.toLocaleString()
    : "N/A";
  const pageUrl = overview?.url;

  useEffect(() => {
    if (value && value.trim().length > 0) {
      setPageText(value);
    }
  }, [value]);

  useEffect(() => {
    if (!mandateReady || !pageText || pageText.trim().length === 0) {
      return undefined;
    }

    void runAnalysis({
      mandateKey: MANDATE_KEY,
      variables: { [SCRAPER_ANALYSIS_CONTENT_VARIABLE]: pageText },
    }).catch((err) => {
      console.error("[FactChecker] Agent run failed:", err);
    });

    return () => {
      cancel();
    };
  }, [mandateReady, pageText, runAnalysis, cancel]);

  const parsedContent = useMemo(() => {
    if (!streamingResponse) return null;
    return parseFactCheck(streamingResponse);
  }, [streamingResponse]);

  const rating = parsedContent?.ratingValue || 0;

  const LoadingState = ({ title }: { title: string }) => (
    <Card title={title}>
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
      </div>
    </Card>
  );

  const ErrorState = () => (
    <Card title="Error">
      <div className="text-destructive p-4">Error: {error}</div>
    </Card>
  );

  /** Mandate posture shared by every tab: unbound → gate; resolving → loading. */
  const mandateGate = (title: string) => {
    if (mandateError) {
      return (
        <AnalysisMandateGate
          mandateKey={MANDATE_KEY}
          title="Fact Checker"
          error={mandateError}
        />
      );
    }
    if (mandateLoading) return <LoadingState title={title} />;
    return null;
  };

  const EmptyState = ({ message }: { message: string }) => (
    <p className="text-muted-foreground text-center py-8">{message}</p>
  );

  const FullAnalysisContent = () => {
    const gate = mandateGate("Checking Facts");
    if (gate) return gate;
    if (error) return <ErrorState />;
    if (isLoading && !streamingResponse)
      return <LoadingState title="Checking Facts" />;

    return (
      <Card title="Complete Fact Check Analysis">
        <MarkdownStream
          content={streamingResponse || "Analysis will appear here..."}
        />
      </Card>
    );
  };

  const SummaryContent = () => {
    const gate = mandateGate("Generating Summary");
    if (gate) return gate;
    if (error) return <ErrorState />;
    if (isLoading && !streamingResponse)
      return <LoadingState title="Generating Summary" />;

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
            <EmptyState
              message={
                streamingResponse
                  ? "No summary found"
                  : "Summary will appear here..."
              }
            />
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

  const GeneralObservationsContent = () => {
    const gate = mandateGate("Analyzing Content");
    if (gate) return gate;
    if (error) return <ErrorState />;
    if (isLoading && !streamingResponse)
      return <LoadingState title="Analyzing Content" />;

    return (
      <Card title="General Observations">
        {parsedContent?.generalObservations ? (
          <MarkdownRenderer
            content={parsedContent.generalObservations}
            type="message"
            fontSize={18}
            role="assistant"
            className="bg-muted rounded-lg p-4 border border-border"
          />
        ) : (
          <EmptyState
            message={
              streamingResponse
                ? "No general observations found"
                : "Observations will appear here..."
            }
          />
        )}
      </Card>
    );
  };

  const SpecificClaimsContent = () => {
    const gate = mandateGate("Analyzing Claims");
    if (gate) return gate;
    if (error) return <ErrorState />;
    if (isLoading && !streamingResponse)
      return <LoadingState title="Analyzing Claims" />;

    return (
      <Card title="Specific Claims Analysis">
        {parsedContent?.specificClaimsAnalysis ? (
          <MarkdownRenderer
            content={parsedContent.specificClaimsAnalysis}
            type="message"
            fontSize={18}
            role="assistant"
            className="bg-muted rounded-lg p-4 border border-border"
          />
        ) : (
          <EmptyState
            message={
              streamingResponse
                ? "No claims analysis found"
                : "Claims analysis will appear here..."
            }
          />
        )}
      </Card>
    );
  };

  const ConcernsContent = () => {
    const gate = mandateGate("Identifying Concerns");
    if (gate) return gate;
    if (error) return <ErrorState />;
    if (isLoading && !streamingResponse)
      return <LoadingState title="Identifying Concerns" />;

    return (
      <Card title="Potential Concerns">
        {parsedContent?.potentialConcerns ? (
          <MarkdownRenderer
            content={parsedContent.potentialConcerns}
            type="message"
            fontSize={18}
            role="assistant"
            className="bg-muted rounded-lg p-4 border border-border"
          />
        ) : (
          <EmptyState
            message={
              streamingResponse
                ? "No concerns identified"
                : "Concerns will appear here..."
            }
          />
        )}
      </Card>
    );
  };

  const RecommendationsContent = () => {
    const gate = mandateGate("Generating Recommendations");
    if (gate) return gate;
    if (error) return <ErrorState />;
    if (isLoading && !streamingResponse)
      return <LoadingState title="Generating Recommendations" />;

    return (
      <Card title="Recommendations">
        {parsedContent?.recommendations ? (
          <MarkdownRenderer
            content={parsedContent.recommendations}
            type="message"
            fontSize={18}
            role="assistant"
            className="bg-muted rounded-lg p-4 border border-border"
          />
        ) : (
          <EmptyState
            message={
              streamingResponse
                ? "No recommendations found"
                : "Recommendations will appear here..."
            }
          />
        )}
      </Card>
    );
  };

  const ClaimsTableContent = () => {
    const gate = mandateGate("Generating Claims Table");
    if (gate) return gate;
    if (error) return <ErrorState />;
    if (isLoading && !streamingResponse)
      return <LoadingState title="Generating Claims Table" />;

    const tableData = parsedContent?.factCheckTable
      ? parseMarkdownTable(parsedContent.factCheckTable)
      : null;

    return (
      <Card title="Claims Assessment Table">
        {tableData?.markdown ? (
          <MarkdownTable data={tableData.markdown} />
        ) : (
          <EmptyState
            message={
              streamingResponse
                ? "No table data found in the analysis"
                : "Claims table will appear here..."
            }
          />
        )}
      </Card>
    );
  };

  const getRatingText = (ratingValue: number): string => {
    if (ratingValue === 0) return "Pending";
    if (ratingValue === 1) return "Very Low";
    if (ratingValue === 2) return "Low";
    if (ratingValue === 3) return "Moderate";
    if (ratingValue === 4) return "High";
    if (ratingValue === 5) return "Very High";
    return "Unknown";
  };

  const statsItems = [
    { label: "Content Source", value: overview?.website || "Unknown" },
    { label: "Character Count", value: characterCount || "N/A" },
    { label: "Trustworthiness", value: getRatingText(rating) },
  ];

  const tabs = [
    {
      id: "summary",
      label: "Summary",
      icon: AlertTriangle,
      content: <SummaryContent />,
    },
    {
      id: "observations",
      label: "Observations",
      icon: Search,
      content: <GeneralObservationsContent />,
    },
    {
      id: "claims",
      label: "Claims Analysis",
      icon: ClipboardList,
      content: <SpecificClaimsContent />,
    },
    {
      id: "concerns",
      label: "Concerns",
      icon: AlertCircle,
      content: <ConcernsContent />,
    },
    {
      id: "recommendations",
      label: "Recommendations",
      icon: ListChecks,
      content: <RecommendationsContent />,
    },
    {
      id: "table",
      label: "Claims Table",
      icon: Table,
      content: <ClaimsTableContent />,
    },
    {
      id: "full-report",
      label: "Full Report",
      icon: FileText,
      content: <FullAnalysisContent />,
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

export default React.memo(FactCheckerPage);
