"use client";

import React, { useEffect } from "react";
import { Columns2 } from "lucide-react";
import { parseMarkdownTable } from "@/components/mardown-display/markdown-classification/processors/bock-processors/parse-markdown-table";
import {
  PageTemplate,
  Card,
  FileTextIcon,
} from "@/components/official/PageTemplate";
import MarkdownRenderer from "@/components/mardown-display/MarkdownRenderer";
import MarkdownTable from "@/components/mardown-display/tables/MarkdownTable";
import { SCRAPER_ANALYSIS_AGENTS } from "@/features/scraper/constants/analysis-agents";
import { useScraperAgentAnalysis } from "@/features/scraper/hooks/useScraperAgentAnalysis";

interface KeywordAnalysisPageProps {
  value: string;
  overview?: {
    page_title?: string;
    char_count?: number;
    url?: string;
    website?: string;
  };
}

const { agentId, contentVariableId } = SCRAPER_ANALYSIS_AGENTS.keywordAnalysis;

const KeywordAnalysisPage: React.FC<KeywordAnalysisPageProps> = ({
  value,
  overview,
}) => {
  const { runAnalysis, cancel, isLoading, error, streamingResponse } =
    useScraperAgentAnalysis();

  const pageTitle = overview?.page_title;
  const characterCount = overview?.char_count?.toLocaleString();
  const pageUrl = overview?.url;

  useEffect(() => {
    if (!value || value.trim().length === 0) {
      return undefined;
    }

    void runAnalysis({
      agentId,
      variables: { [contentVariableId]: value },
    }).catch((err) => {
      console.error("[KeywordAnalysis] Agent run failed:", err);
    });

    return () => {
      cancel();
    };
  }, [value, runAnalysis, cancel]);

  const KeywordAnalysisContent = () => {
    if (error) {
      return (
        <Card title="Error">
          <div className="text-destructive p-4">Error: {error}</div>
        </Card>
      );
    }

    if (isLoading && !streamingResponse) {
      return (
        <Card title="Analyzing Keywords">
          <div className="flex items-center justify-center p-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
          </div>
        </Card>
      );
    }

    return (
      <Card title="Keyword Analysis Results">
        <MarkdownRenderer
          content={streamingResponse || "Analysis will appear here..."}
          type="message"
          fontSize={18}
          role="assistant"
          className="bg-muted rounded-lg p-4 border border-border"
        />
      </Card>
    );
  };

  const ContentComparisonTable = () => {
    const tableData = parseMarkdownTable(streamingResponse);

    return (
      <Card title="Content Comparison">
        {tableData?.markdown && <MarkdownTable data={tableData.markdown} />}
      </Card>
    );
  };

  const tabs = [
    {
      id: "analysis",
      label: "Keyword Analysis",
      icon: FileTextIcon,
      content: <KeywordAnalysisContent />,
    },
    {
      id: "comparison",
      label: "Content Comparison",
      icon: Columns2,
      content: <ContentComparisonTable />,
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
