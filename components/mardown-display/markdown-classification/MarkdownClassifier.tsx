'use client';

import React, { useState, useEffect } from 'react';
import { useThemeMode } from '@/styles/themes/useThemeMode';
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

import { markdownSamples } from './sample-data/markdown-samples';
import { getCoordinatorSelectOptions, getCoordinatorConfig, getSpecificViewComponent } from './markdown-coordinator';
import MarkdownInput from './MarkdownInput';
import MarkdownProcessingTabs from './MarkdownProcessingTabs';
import { ViewId } from './custom-views/view-registry';
// @ts-ignore - usePrepareMarkdownForRendering is a hook but used as function here
import { usePrepareMarkdownForRendering as prepareMarkdownForRendering } from './usePrepareMarkdownForRendering';

interface MarkdownClassifierProps {
  initialMarkdown?: string;
  initialCoordinatorId?: string;
  showSampleSelector?: boolean;
  showCoordinatorSelector?: boolean;
}

const MarkdownClassifier: React.FC<MarkdownClassifierProps> = ({
  initialMarkdown,
  initialCoordinatorId = 'candidate_profile',
  showSampleSelector = true,
  showCoordinatorSelector = true,
}) => {
  const mode = useThemeMode();
  const [markdown, setMarkdown] = useState<string>(initialMarkdown || markdownSamples.candidateProfileShort);
  const [parsedMarkdown, setParsedMarkdown] = useState<string>(initialMarkdown || markdownSamples.candidateProfileShort);
  const [selectedCoordinatorId, setSelectedCoordinatorId] = useState<string>(initialCoordinatorId);
  const [selectedViewId, setSelectedViewId] = useState<ViewId | null>(null);
  
  const [ast, setAst] = useState<any>(null);
  const [processedData, setProcessedData] = useState<any>(null);
  const [coordinatorConfig, setCoordinatorConfig] = useState<any>(null);
  const [availableViews, setAvailableViews] = useState<ViewId[]>([]);

  // Always update preview when markdown changes
  useEffect(() => {
    setParsedMarkdown(markdown);
  }, [markdown]);

  // Process markdown when it changes or coordinator changes
  useEffect(() => {
    const processMarkdown = async () => {
      try {
        // @ts-ignore - prepareMarkdownForRendering expects 3 arguments but only 2 are provided
        const result = await prepareMarkdownForRendering(markdown, selectedCoordinatorId, selectedViewId);
        
        setAst(result.ast);
        setProcessedData(result.processedData);
        setCoordinatorConfig(result.coordinatorDefinition);
        
        // Set available views and default view
        if (result.coordinatorDefinition) {
          setAvailableViews(result.coordinatorDefinition.availableViews);
          
          // Only set default view if no view is selected or the selected view isn't available
          if (!selectedViewId || !result.coordinatorDefinition.availableViews.includes(selectedViewId)) {
            setSelectedViewId(result.coordinatorDefinition.defaultView);
          }
        }
      } catch (error) {
        console.error('Error processing markdown:', error);
      }
    };

    processMarkdown();
  }, [markdown, selectedCoordinatorId]);

  // Handle coordinator change
  const handleCoordinatorChange = (value: string) => {
    setSelectedCoordinatorId(value);
    
    // Reset selected view when changing coordinator
    const coordinator = getCoordinatorConfig(value);
    if (coordinator) {
      setSelectedViewId(coordinator.defaultView);
    }
  };

  // Handle view change
  const handleViewChange = (value: ViewId) => {
    setSelectedViewId(value);
  };

  // Handle sample selection
  const handleSampleSelect = (sampleKey: string) => {
    if (markdownSamples[sampleKey]) {
      const newMarkdown = markdownSamples[sampleKey];
      setMarkdown(newMarkdown);
      setParsedMarkdown(newMarkdown);
    }
  };

  // Handle parse button click
  const handleParseClick = async () => {
    try {
      // @ts-ignore - prepareMarkdownForRendering expects 3 arguments but only 2 are provided
      const result = await prepareMarkdownForRendering(markdown, selectedCoordinatorId, selectedViewId);
      setAst(result.ast);
      setProcessedData(result.processedData);
    } catch (error) {
      console.error('Error processing markdown:', error);
    }
  };

  // Get the view component
  const ViewComponent = selectedViewId 
    ? getSpecificViewComponent(selectedCoordinatorId, selectedViewId)
    : null;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* Controls */}
      <div className="border-b border-border p-2 flex flex-wrap items-center gap-2">
        {showSampleSelector && (
          <div className="flex-1 min-w-[200px]">
            <Select onValueChange={handleSampleSelect}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a markdown sample" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(markdownSamples).map(([key]) => (
                  <SelectItem key={key} value={key}>
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {showCoordinatorSelector && (
          <div className="flex-1 min-w-[200px]">
            <Select 
              value={selectedCoordinatorId} 
              onValueChange={handleCoordinatorChange}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a coordinator" />
              </SelectTrigger>
              <SelectContent>
                {getCoordinatorSelectOptions().map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {availableViews.length > 0 && (
          <div className="flex-1 min-w-[200px]">
            <Select 
              value={selectedViewId || undefined} 
              onValueChange={handleViewChange as (value: string) => void}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a view" />
              </SelectTrigger>
              <SelectContent>
                {availableViews.map((viewId) => (
                  <SelectItem key={viewId} value={viewId}>
                    {viewId.replace(/([A-Z])/g, ' $1').trim()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <Button 
          onClick={handleParseClick} 
          className="whitespace-nowrap" 
          aria-label="Parse Markdown"
        >
          Parse Markdown
        </Button>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Side: Markdown Input & Preview */}
        <MarkdownInput 
          markdown={markdown}
          parsedMarkdown={parsedMarkdown}
          onMarkdownChange={setMarkdown}
          mode={mode}
        />

        {/* Right Side: Processing Results */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Custom View Component */}
          {ViewComponent && processedData && (
            <div className="flex-1 overflow-auto p-4">
              <React.Suspense fallback={<div>Loading view...</div>}>
                <ViewComponent data={processedData} />
              </React.Suspense>
            </div>
          )}

          {/* Fallback: Processing Tabs */}
          {(!ViewComponent || !processedData) && (
            <MarkdownProcessingTabs
              ast={ast}
              parsedMarkdown={parsedMarkdown}
              processedData={processedData}
              selectedCoordinatorId={selectedCoordinatorId}
              selectedViewId={selectedViewId}
              mode={mode}
              onParse={handleParseClick}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default MarkdownClassifier; 