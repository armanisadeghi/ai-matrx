'use client';

// This is a template file for creating new tab components
// To create a new tab:
// 1. Copy this file and rename it to match your tab (e.g., ToneTab.tsx)
// 2. Update the component name and interfaces
// 3. Add your tab-specific form elements and logic
// 4. Register your component in the tabComponents map in MainPromptBuilder.tsx

import React, { useEffect, useState } from 'react';
import { TabBase } from './TabBase';
import { usePromptBuilder } from './PromptBuilderContext';
import { Label } from "@/components/ui/label";
import { Input } from "@ai-matrx/design-system";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProTextarea } from "@/components/official/ProTextarea";

interface NewTabProps {
  updateContent?: (content: string) => void;
}

export const NewTab: React.FC<NewTabProps> = ({ updateContent }) => {
  const { enabledSections, toggleSection, updateTabContent } = usePromptBuilder();
  const isEnabled = enabledSections['newTabId']; // ← Change this to your tab ID
  
  // State for your tab's form elements
  const [content, setContent] = useState('');
  
  // Generate the content for the prompt
  useEffect(() => {
    if (!updateContent || !isEnabled) return;
    
    // Format your tab's contribution to the prompt here
    let formattedContent = '';
    
    if (content) {
      formattedContent = `Your tab's prefix: ${content}`;
    }
    
    // Update both local and global state
    updateContent(formattedContent);
    updateTabContent(99, formattedContent); // ← Change 99 to your tab number
  }, [content, isEnabled, updateContent, updateTabContent]);
  
  return (
    <TabBase
      id="newTabId" // ← Change this to your tab ID
      tabNumber={99} // ← Change this to your tab number
      isEnabled={isEnabled}
      onToggle={toggleSection}
    >
      <div className="space-y-4 w-full">
        {/* Add your tab's form elements here */}
        <div className="grid gap-3 w-full">
          <Label htmlFor="content" className="text-gray-700 dark:text-gray-300">
            Your Field Label
          </Label>
          <ProTextarea
            id="content"
            placeholder="Enter content here..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full min-h-[100px] bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400"
          />
        </div>
        
        {/* Example of a select field - remove if not needed */}
        <div className="grid gap-3 w-full">
          <Label htmlFor="select-example" className="text-gray-700 dark:text-gray-300">
            Example Select
          </Label>
          <Select>
            <SelectTrigger id="select-example" className="w-full bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700">
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700">
              <SelectItem value="option1" className="text-gray-800 dark:text-gray-200">Option 1</SelectItem>
              <SelectItem value="option2" className="text-gray-800 dark:text-gray-200">Option 2</SelectItem>
              <SelectItem value="option3" className="text-gray-800 dark:text-gray-200">Option 3</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </TabBase>
  );
}; 