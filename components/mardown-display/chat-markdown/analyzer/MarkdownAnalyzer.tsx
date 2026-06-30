import React, { useState } from "react";
import { createChatSelectors } from "@/lib/redux/entity/custom-selectors/chatSelectors";
import { useAppSelector } from "@/lib/redux/hooks";
import { MarkdownAnalysisData } from "./types";
import AnalysisTab from "./AnalysisTab";
import SectionGroupTab from "./analyzer-options/SectionGroupTab";

interface MarkdownAnalyzerProps {
  messageId?: string;
}

const MarkdownAnalyzer: React.FC<MarkdownAnalyzerProps> = ({ messageId }) => {
  const chatSelectors = createChatSelectors();
  const markdownAnalysis = useAppSelector((state) =>
    messageId
      ? chatSelectors.selectMarkdownAnalysisData(state, messageId)
      : undefined,
  ) as MarkdownAnalysisData | undefined;

  const [activeTab, setActiveTab] = useState<number>(0); // 0-based index, last tab is analysis

  if (
    !markdownAnalysis?.section_groups?.length ||
    !Object.keys(markdownAnalysis?.analysis || {}).length
  ) {
    return (
      <div className="w-full p-6 text-center text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg border-border">
        <h1 className="text-lg font-medium">
          Markdown Analysis Data is only available for messages that were just
          streamed.
        </h1>
      </div>
    );
  }

  const totalTabs = markdownAnalysis.section_groups.length + 1; // +1 for Analysis tab

  return (
    <div className="w-full bg-textured rounded-lg border-border shadow-sm">
      {/* Tab Navigation */}
      <div className="flex border-b border-border">
        {markdownAnalysis.section_groups.map((_, index) => (
          <button
            key={index}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === index
                ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            }`}
            onClick={() => setActiveTab(index)}
          >
            Group {index + 1}
          </button>
        ))}
        <button
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === markdownAnalysis.section_groups.length
              ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400"
              : "text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          }`}
          onClick={() => setActiveTab(markdownAnalysis.section_groups.length)}
        >
          Analysis
        </button>
      </div>

      {/* Tab Content */}
      <div className="p-4">
        {activeTab < markdownAnalysis.section_groups.length ? (
          <SectionGroupTab data={markdownAnalysis.section_groups[activeTab]} />
        ) : (
          <AnalysisTab analysis={markdownAnalysis.analysis} />
        )}
      </div>
    </div>
  );
};

export default MarkdownAnalyzer;
