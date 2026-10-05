'use client';

import React, { useEffect, useState } from 'react';
import { TabBase } from './TabBase';
import { usePromptBuilder } from './PromptBuilderContext';
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { promptTemplateSource } from './constants';

interface FormatContentProps {
  updateContent?: (content: string) => void;
}

const FormatContent: React.FC<FormatContentProps> = ({ updateContent }) => {
  // State for format options
  const [formatType, setFormatType] = useState('');
  const [formatLength, setFormatLength] = useState('');
  
  const { updateTabContent } = usePromptBuilder();
  
  // Generate the format content
  useEffect(() => {
    if (!updateContent) return;
    
    let content = '';
    
    if (formatType) {
      const formatTemplate = promptTemplateSource.format.options.find(opt => opt.id === formatType)?.template || '';
      const formatText = `${promptTemplateSource.format.prefix}${formatTemplate}`;
      
      content = formatText;
      
      // Add length if selected
      if (formatLength) {
        const lengthTemplate = promptTemplateSource.format.length.options.find(opt => opt.id === formatLength)?.template || '';
        content += `${promptTemplateSource.format.length.prefix}${lengthTemplate}${promptTemplateSource.format.length.suffix}`;
      }
    }
    
    // Update both local and global state
    updateContent(content);
    updateTabContent(4, content); // Format is tab #4
  }, [formatType, formatLength, updateContent, updateTabContent]);
  
  return (
    <div className="space-y-6 w-full">
      <div className="grid gap-3 w-full">
        <Label htmlFor="format-type" className="text-gray-700 dark:text-gray-300">
          Format Type
        </Label>
        <Select
          value={formatType}
          onValueChange={setFormatType}
        >
          <SelectTrigger id="format-type" className="w-full">
            <SelectValue placeholder="Select the response format" />
          </SelectTrigger>
          <SelectContent className="bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700">
            {promptTemplateSource.format.options.map((option) => (
              <SelectItem key={option.id} value={option.id} className="text-gray-800 dark:text-gray-200">
                {option.text}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      <div className="grid gap-3 w-full">
        <Label htmlFor="format-length" className="text-gray-700 dark:text-gray-300">
          Length
        </Label>
        <Select
          value={formatLength}
          onValueChange={setFormatLength}
        >
          <SelectTrigger id="format-length" className="w-full">
            <SelectValue placeholder="Select the desired length" />
          </SelectTrigger>
          <SelectContent className="bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700">
            {promptTemplateSource.format.length.options.map((option) => (
              <SelectItem key={option.id} value={option.id} className="text-gray-800 dark:text-gray-200">
                {option.text}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

export const FormatTab: React.FC = () => {
  const { enabledSections, toggleSection } = usePromptBuilder();
  const isEnabled = enabledSections['format'];
  
  return (
    <TabBase
      id="format"
      tabNumber={4}
      isEnabled={isEnabled}
      onToggle={toggleSection}
    >
      <FormatContent />
    </TabBase>
  );
}; 