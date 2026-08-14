'use client';

import React, { lazy, Suspense } from 'react';
import SuspenseLoader from '@/components/loaders/SuspenseLoader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PromptBuilderProvider, usePromptBuilder } from './PromptBuilderContext';

// Import all tab components
import { TaskTab } from './TaskTab';
import { ContextTab } from './ContextTab';
import { ToneTab } from './ToneTab';
import { FormatTab } from './FormatTab';
import { KnowledgeTab } from './KnowledgeTab';
import { ExamplesTab } from './ExamplesTab';
import { ConstraintsTab } from './ConstraintsTab';
import { AudienceTab } from './AudienceTab';
import { EvaluationTab } from './EvaluationTab';
import { MotivationTab } from './MotivationTab';
import { EmphasisTab } from './EmphasisTab';
import { GenericTextareaTab } from './GenericTextareaTab';
import { PreviewTab } from './PreviewTab';

// Placeholder tab for unimplemented tabs
const PlaceholderTab: React.FC<{ tabId: string }> = ({ tabId }) => (
  <div className="p-4 text-gray-600 dark:text-gray-400 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm rounded-md">
    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Coming Soon</h3>
    <p>The "{tabId}" tab is not yet implemented. It will be available in a future update.</p>
  </div>
);

// This component is wrapped by the provider in the parent
const PromptBuilderContent: React.FC = () => {
  const { activeTab, setActiveTab, allTabs } = usePromptBuilder();
  
  // Function to render the structure and specialInstructions tabs
  const renderGenericTab = (id: string, tabNumber: number) => {
    return (
      <GenericTextareaTab 
        id={id} 
        tabNumber={tabNumber}
        placeholder={`Enter ${id} details here...`}
        label={id.charAt(0).toUpperCase() + id.slice(1).replace(/([A-Z])/g, ' $1')}
      />
    );
  };
  
  // Function to render the appropriate tab based on the ID
  const renderTabContent = (tab: any) => {
    const { id, tabNumber } = tab;
    
    switch (id) {
      case 'task':
        return <TaskTab />;
      case 'context': 
        return <ContextTab />;
      case 'tone':
        return <ToneTab />;
      case 'format':
        return <FormatTab />;
      case 'knowledge':
        return <KnowledgeTab />;
      case 'examples':
        return <ExamplesTab />;
      case 'constraints': 
        return <ConstraintsTab />;
      case 'audience':
        return <AudienceTab />;
      case 'evaluation':
        return <EvaluationTab />;
      case 'motivation':
        return <MotivationTab />;
      case 'emphasis':
        return <EmphasisTab />;
      case 'structure':
        return renderGenericTab('structure', tabNumber);
      case 'specialInstructions':
        return renderGenericTab('specialInstructions', tabNumber);
      case 'preview':
        return <PreviewTab />;
      default:
        return <PlaceholderTab tabId={id} />;
    }
  };
  
  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="mb-8 border-b border-zinc-200 dark:border-zinc-800 pb-1">
          <TabsList className="flex flex-wrap h-auto justify-start bg-transparent">
            {allTabs.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="flex items-center px-4 py-2 mx-1 my-1 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-900 data-[state=active]:text-indigo-600 dark:data-[state=active]:text-indigo-400 text-gray-700 dark:text-gray-300 rounded-md data-[state=active]:shadow-sm"
              >
                <span className="mr-2">{tab.icon}</span>
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
                    message="Loading prompt builder section…"
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
  );
};

// Main component that wraps everything with the provider
export const MainPromptBuilder: React.FC = () => {
  return (
    <PromptBuilderProvider>
      <div className="w-full py-6 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">AI Prompt Builder</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Build effective prompts by customizing each section
            </p>
          </div>
          <PromptBuilderContent />
        </div>
      </div>
    </PromptBuilderProvider>
  );
};
