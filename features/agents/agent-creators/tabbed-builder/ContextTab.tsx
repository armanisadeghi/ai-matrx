'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Label } from "@/components/ui/label";
import { TabBase } from './TabBase';
import { usePromptBuilder } from './PromptBuilderContext';
import { promptTemplateSource } from './constants';
import { ProTextarea } from "@/components/official/ProTextarea";

interface ContextContentProps {
  updateContent?: (content: string) => void;
}

// Content component that receives updateContent
const ContextContent: React.FC<ContextContentProps> = ({ updateContent }) => {
  // State for context details
  const [contextDetails, setContextDetails] = useState('');
  const { updateTabContent } = usePromptBuilder();
  
  // Generate content without side effects
  const generateContent = useCallback(() => {
    let content = '';
    
    if (contextDetails) {
      content = `${promptTemplateSource.context.prefix}${promptTemplateSource.context.template.replace("{contextDetails}", contextDetails)}`;
    }
    
    return content;
  }, [contextDetails]);
  
  // Update content when relevant props change
  useEffect(() => {
    if (!updateContent) return;
    
    const content = generateContent();
    
    // Only update if we have content to avoid unnecessary updates
    updateContent(content);
    updateTabContent(2, content); // Context is tab #2
  }, [generateContent, updateContent, updateTabContent]);
  
  return (
    <div className="space-y-4 w-full">
      <div className="grid gap-3 w-full">
        <Label htmlFor="context-details" className="text-gray-700 dark:text-gray-300">
          Context Details
        </Label>
        <ProTextarea
          id="context-details"
          placeholder="Provide relevant background information, data, or context to help the AI understand the situation better"
          value={contextDetails}
          onChange={(e) => setContextDetails(e.target.value)}
          className="w-full min-h-[200px] bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400"
        />
      </div>
    </div>
  );
};

export const ContextTab: React.FC = () => {
  const { enabledSections, toggleSection } = usePromptBuilder();
  const isEnabled = enabledSections['context'];
  
  return (
    <TabBase
      id="context"
      tabNumber={2}
      isEnabled={isEnabled}
      onToggle={toggleSection}
    >
      <ContextContent />
    </TabBase>
  );
}; 