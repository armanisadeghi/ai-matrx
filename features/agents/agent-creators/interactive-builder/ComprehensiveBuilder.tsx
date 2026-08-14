"use client";

import React, { useState, Suspense } from "react";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { Button } from "@/components/ui/button";
import { Loader2, Check } from "lucide-react";
import { useAgentBuilder } from "../services/agentBuilderService";
import {
  PromptBuilderProvider,
  usePromptBuilder as useBuilderContext,
} from "../tabbed-builder/PromptBuilderContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TaskTab } from "../tabbed-builder/TaskTab";
import { ContextTab } from "../tabbed-builder/ContextTab";
import { ToneTab } from "../tabbed-builder/ToneTab";
import { FormatTab } from "../tabbed-builder/FormatTab";
import { KnowledgeTab } from "../tabbed-builder/KnowledgeTab";
import { ExamplesTab } from "../tabbed-builder/ExamplesTab";
import { ConstraintsTab } from "../tabbed-builder/ConstraintsTab";
import { AudienceTab } from "../tabbed-builder/AudienceTab";
import { EvaluationTab } from "../tabbed-builder/EvaluationTab";
import { MotivationTab } from "../tabbed-builder/MotivationTab";
import { EmphasisTab } from "../tabbed-builder/EmphasisTab";
import { GenericTextareaTab } from "../tabbed-builder/GenericTextareaTab";
import { PreviewTab } from "../tabbed-builder/PreviewTab";

interface ComprehensiveBuilderProps {
  onComplete?: () => void;
}

const PlaceholderTab: React.FC<{ tabId: string }> = ({ tabId }) => (
  <div className="p-4 text-gray-600 dark:text-gray-400 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm rounded-md">
    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
      Coming Soon
    </h3>
    <p>The &ldquo;{tabId}&rdquo; tab is not yet implemented.</p>
  </div>
);

function BuilderContent({ onComplete }: ComprehensiveBuilderProps) {
  const { createAgent } = useAgentBuilder(onComplete);
  const { generateFinalPrompt, activeTab, setActiveTab, allTabs } =
    useBuilderContext();
  const [isSaving, setIsSaving] = useState(false);

  const handleCreate = async () => {
    setIsSaving(true);
    try {
      const systemMessage = generateFinalPrompt();
      await createAgent({
        name: "Tab-Built Agent",
        systemMessage,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const renderGenericTab = (id: string, tabNumber: number) => (
    <GenericTextareaTab
      id={id}
      tabNumber={tabNumber}
      placeholder={`Enter ${id} details here...`}
      label={
        id.charAt(0).toUpperCase() + id.slice(1).replace(/([A-Z])/g, " $1")
      }
    />
  );

  const renderTabContent = (tab: { id: string; tabNumber: number }) => {
    switch (tab.id) {
      case "task":
        return <TaskTab />;
      case "context":
        return <ContextTab />;
      case "tone":
        return <ToneTab />;
      case "format":
        return <FormatTab />;
      case "knowledge":
        return <KnowledgeTab />;
      case "examples":
        return <ExamplesTab />;
      case "constraints":
        return <ConstraintsTab />;
      case "audience":
        return <AudienceTab />;
      case "evaluation":
        return <EvaluationTab />;
      case "motivation":
        return <MotivationTab />;
      case "emphasis":
        return <EmphasisTab />;
      case "structure":
        return renderGenericTab("structure", tab.tabNumber);
      case "specialInstructions":
        return renderGenericTab("specialInstructions", tab.tabNumber);
      case "preview":
        return <PreviewTab />;
      default:
        return <PlaceholderTab tabId={tab.id} />;
    }
  };

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-1 overflow-auto p-3">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="mb-4 border-b border-zinc-200 dark:border-zinc-800 pb-1">
            <TabsList className="flex flex-wrap h-auto justify-start bg-transparent">
              {allTabs.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="flex items-center px-3 py-1.5 mx-1 my-1 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-900 data-[state=active]:text-indigo-600 dark:data-[state=active]:text-indigo-400 text-gray-700 dark:text-gray-300 rounded-md data-[state=active]:shadow-sm text-xs"
                >
                  <span className="mr-1.5 text-sm">{tab.icon}</span>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {allTabs.map((tab) => (
            <TabsContent key={tab.id} value={tab.id} className="mt-0">
              <Suspense
                fallback={
                  <div className="p-4 animate-pulse">
                    <SuspenseLoader
                      centered={false}
                      message="Loading agent builder section…"
                    />
                  </div>
                }
              >
                {renderTabContent(tab)}
              </Suspense>
            </TabsContent>
          ))}
        </Tabs>
      </div>

      <div className="flex-shrink-0 p-3 border-t bg-muted/30">
        <Button
          onClick={handleCreate}
          disabled={isSaving}
          className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <Check className="h-4 w-4 mr-2" />
              Create Agent
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export function ComprehensiveBuilder({
  onComplete,
}: ComprehensiveBuilderProps) {
  return (
    <PromptBuilderProvider>
      <BuilderContent onComplete={onComplete} />
    </PromptBuilderProvider>
  );
}
