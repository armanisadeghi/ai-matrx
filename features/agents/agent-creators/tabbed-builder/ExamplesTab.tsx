'use client';

import React, { useEffect, useState } from 'react';
import { TabBase } from './TabBase';
import { usePromptBuilder } from './PromptBuilderContext';
import { Label } from "@/components/ui/label";
import { promptTemplateSource } from './constants';
import { ProTextarea } from "@/components/official/ProTextarea";

interface ExamplesContentProps {
  updateContent?: (content: string) => void;
}

const ExamplesContent: React.FC<ExamplesContentProps> = ({ updateContent }) => {
  const [examplesText, setExamplesText] = useState('');
  const { updateTabContent } = usePromptBuilder();
  
  // Generate the examples content
  useEffect(() => {
    if (!updateContent) return;
    
    let content = '';
    
    if (examplesText) {
      content = `${promptTemplateSource.examples.prefix}${promptTemplateSource.examples.template.replace("{examplesText}", examplesText)}`;
    }
    
    // Update both local and global state
    updateContent(content);
    updateTabContent(6, content); // Examples is tab #6
  }, [examplesText, updateContent, updateTabContent]);
  
  return (
    <div className="space-y-4 w-full">
      <div className="grid gap-3 w-full">
        <Label htmlFor="examples-text" className="text-gray-700 dark:text-gray-300">
          Example Content
        </Label>
        <ProTextarea
          id="examples-text"
          placeholder="Add examples to guide the AI's response format or content..."
          value={examplesText}
          onChange={(e) => setExamplesText(e.target.value)}
          className="w-full min-h-[200px] bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400"
        />
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Include sample inputs/outputs, good examples to follow, or examples to avoid.
        </p>
      </div>
    </div>
  );
};

export const ExamplesTab: React.FC = () => {
  const { enabledSections, toggleSection } = usePromptBuilder();
  const isEnabled = enabledSections['examples'];
  
  return (
    <TabBase
      id="examples"
      tabNumber={6}
      isEnabled={isEnabled}
      onToggle={toggleSection}
    >
      <ExamplesContent />
    </TabBase>
  );
}; 