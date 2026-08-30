'use client';

import React, { useEffect, useState } from 'react';
import { TabBase } from './TabBase';
import { usePromptBuilder } from './PromptBuilderContext';
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { PlusIcon, XIcon } from "lucide-react";
import { promptTemplateSource } from './constants';
import { ProTextarea } from "@/components/official/ProTextarea";

interface EmphasisContentProps {
  updateContent?: (content: string) => void;
}

const EmphasisContent: React.FC<EmphasisContentProps> = ({ updateContent }) => {
  // State for emphasis metrics
  const [metrics, setMetrics] = useState<string[]>(['']);
  const [emphasisDetails, setEmphasisDetails] = useState('');
  const { updateTabContent } = usePromptBuilder();
  
  // Add a new metric field
  const addMetric = () => {
    setMetrics([...metrics, '']);
  };
  
  // Remove a metric field
  const removeMetric = (index: number) => {
    const newMetrics = [...metrics];
    newMetrics.splice(index, 1);
    setMetrics(newMetrics.length ? newMetrics : ['']);
  };
  
  // Update a metric field
  const updateMetric = (index: number, value: string) => {
    const newMetrics = [...metrics];
    newMetrics[index] = value;
    setMetrics(newMetrics);
  };
  
  // Generate the emphasis content
  useEffect(() => {
    if (!updateContent) return;
    
    let content = promptTemplateSource.emphasis.prefix;
    
    // Add the metrics as bullet points
    const filledMetrics = metrics.filter(m => m.trim().length > 0);
    if (filledMetrics.length > 0) {
      content += '\n';
      filledMetrics.forEach(metric => {
        content += `\n• ${metric}`;
      });
    }
    
    // Add additional emphasis details if provided
    if (emphasisDetails) {
      content += `\n\nAdditional emphasis: ${emphasisDetails}`;
    }
    
    // Update both local and global state
    updateContent(content);
    updateTabContent(12, content); // Emphasis is tab #12
  }, [metrics, emphasisDetails, updateContent, updateTabContent]);
  
  return (
    <div className="space-y-4 w-full">
      <div className="w-full">
        <Label className="text-gray-700 dark:text-gray-300 mb-2 block">
          Key Metrics or Aspects to Emphasize
        </Label>
        
        {metrics.map((metric, index) => (
          <div key={index} className="flex items-center gap-2 mb-2 w-full">
            <ProTextarea
              value={metric}
              onChange={(e) => updateMetric(index, e.target.value)}
              placeholder={`Metric ${index + 1}`}
              className="w-full min-h-[60px] bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeMetric(index)}
              className="flex-shrink-0 h-9 w-9 text-gray-500 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-600 dark:hover:text-red-400"
            >
              <XIcon className="h-4 w-4" />
            </Button>
          </div>
        ))}
        
        <Button
          type="button"
          variant="outline"
          onClick={addMetric}
          className="mt-2 bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-gray-700 dark:text-gray-300 hover:bg-zinc-100 dark:hover:bg-zinc-700"
        >
          <PlusIcon className="h-4 w-4 mr-2" />
          Add Metric
        </Button>
      </div>
      
      <div className="grid gap-3 w-full">
        <Label htmlFor="emphasis-details" className="text-gray-700 dark:text-gray-300">
          Additional Emphasis (Optional)
        </Label>
        <ProTextarea
          id="emphasis-details"
          placeholder="Provide any additional details about what should be emphasized"
          value={emphasisDetails}
          onChange={(e) => setEmphasisDetails(e.target.value)}
          className="w-full min-h-[150px] bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400"
        />
      </div>
    </div>
  );
};

export const EmphasisTab: React.FC = () => {
  const { enabledSections, toggleSection } = usePromptBuilder();
  const isEnabled = enabledSections['emphasis'];
  
  return (
    <TabBase
      id="emphasis"
      tabNumber={12}
      isEnabled={isEnabled}
      onToggle={toggleSection}
    >
      <EmphasisContent />
    </TabBase>
  );
}; 