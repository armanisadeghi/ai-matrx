'use client';

import React, { useEffect, useState } from 'react';
import { TabBase } from './TabBase';
import { usePromptBuilder } from './PromptBuilderContext';
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { promptTemplateSource } from './constants';

interface GenericTextareaContentProps {
  updateContent?: (content: string) => void;
  id: string;
  label?: string;
  placeholder?: string;
  tabNumber: number;
}

// Reusable content component for generic textarea tabs
const GenericTextareaContent: React.FC<GenericTextareaContentProps> = ({ 
  updateContent, 
  id, 
  label = "Content",
  placeholder = "Enter your content here...",
  tabNumber
}) => {
  const [content, setContent] = useState('');
  const { updateTabContent } = usePromptBuilder();
  
  // Generate the content
  useEffect(() => {
    if (!updateContent) return;
    
    let formattedContent = '';

    const templateEntry = id in promptTemplateSource ? promptTemplateSource[id as keyof typeof promptTemplateSource] : undefined;

    if (content && templateEntry) {
      // Get the template from constants if available
      const entryRecord = templateEntry as Record<string, unknown>;
      const prefix = typeof entryRecord.prefix === 'string' ? entryRecord.prefix : '';
      const template = typeof entryRecord.template === 'string' ? entryRecord.template : '';

      // Replace placeholder with actual content
      const paramName = Object.keys(entryRecord).find(
        key => entryRecord[key] && typeof entryRecord[key] === 'string' &&
        (entryRecord[key] as string).includes('{')
      );

      const paramMatch = paramName ?
        (entryRecord[paramName] as string).match(/{([^}]+)}/) :
        null;
      
      const paramPlaceholder = paramMatch ? paramMatch[0] : '';
      const paramValue = paramMatch ? paramMatch[1] : '';
      
      if (paramPlaceholder && paramValue) {
        formattedContent = `${prefix}${template.replace(paramPlaceholder, content)}`;
      } else {
        formattedContent = `${prefix} ${content}`;
      }
    } else if (content) {
      // If no template is available, just use the content as is
      formattedContent = content;
    }
    
    // Update both local and global state
    updateContent(formattedContent);
    updateTabContent(tabNumber, formattedContent);
  }, [content, id, updateContent, tabNumber, updateTabContent]);
  
  return (
    <div className="space-y-4 w-full">
      <div className="grid gap-3 w-full">
        <Label htmlFor={`${id}-content`} className="text-gray-700 dark:text-gray-300">
          {label}
        </Label>
        <Textarea
          id={`${id}-content`}
          placeholder={placeholder}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full min-h-[150px] bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400"
        />
      </div>
    </div>
  );
};

interface GenericTextareaTabProps {
  id: string;
  tabNumber: number;
  alwaysEnabled?: boolean;
  label?: string;
  placeholder?: string;
}

export const GenericTextareaTab: React.FC<GenericTextareaTabProps> = ({ 
  id, 
  tabNumber,
  alwaysEnabled = false,
  label,
  placeholder 
}) => {
  const { enabledSections, toggleSection } = usePromptBuilder();
  const isEnabled = enabledSections[id];
  
  return (
    <TabBase
      id={id}
      tabNumber={tabNumber}
      isEnabled={isEnabled}
      onToggle={toggleSection}
      alwaysEnabled={alwaysEnabled}
    >
      <GenericTextareaContent 
        id={id} 
        label={label} 
        placeholder={placeholder}
        tabNumber={tabNumber}
      />
    </TabBase>
  );
}; 