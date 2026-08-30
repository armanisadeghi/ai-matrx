'use client';

import React, { useEffect, useState } from 'react';
import { Label } from "@/components/ui/label";
import { TabBase } from './TabBase';
import { usePromptBuilder } from './PromptBuilderContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProTextarea } from "@/components/official/ProTextarea";

interface MotivationContentProps {
  updateContent?: (content: string) => void;
}

const MotivationContent: React.FC<MotivationContentProps> = ({ updateContent }) => {
  // State for motivation
  const [motivationType, setMotivationType] = useState('');
  const [motivationDetails, setMotivationDetails] = useState('');
  const { updateTabContent } = usePromptBuilder();
  
  // Motivation type options
  const motivationOptions = [
    { id: 'problem-solving', text: 'Problem Solving' },
    { id: 'educational', text: 'Educational' },
    { id: 'informative', text: 'Informative' },
    { id: 'persuasive', text: 'Persuasive' },
    { id: 'entertainment', text: 'Entertainment' },
    { id: 'personal-growth', text: 'Personal Growth' },
    { id: 'commercial', text: 'Commercial' },
    { id: 'research', text: 'Research' },
  ];
  
  // Generate the motivation content
  useEffect(() => {
    if (!updateContent) return;
    
    let content = '';
    
    if (motivationType || motivationDetails) {
      content = 'The motivation behind this request is ';
      
      if (motivationType) {
        const selectedOption = motivationOptions.find(opt => opt.id === motivationType);
        content += selectedOption ? `${selectedOption.text.toLowerCase()}` : '';
      }
      
      if (motivationDetails) {
        content += motivationType ? `: ${motivationDetails}` : motivationDetails;
      }
    }
    
    // Update both local and global state
    updateContent(content);
    updateTabContent(11, content); // Motivation is tab #11
  }, [motivationType, motivationDetails, updateContent, motivationOptions, updateTabContent]);
  
  return (
    <div className="space-y-4 w-full">
      <div className="grid gap-3 w-full">
        <Label htmlFor="motivation-type" className="text-gray-700 dark:text-gray-300">
          Motivation Type
        </Label>
        <Select
          value={motivationType}
          onValueChange={setMotivationType}
        >
          <SelectTrigger id="motivation-type" className="w-full bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700">
            <SelectValue placeholder="Select the motivation type" />
          </SelectTrigger>
          <SelectContent className="bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700">
            {motivationOptions.map((option) => (
              <SelectItem key={option.id} value={option.id} className="text-gray-800 dark:text-gray-200">
                {option.text}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      <div className="grid gap-3 w-full">
        <Label htmlFor="motivation-details" className="text-gray-700 dark:text-gray-300">
          Motivation Details
        </Label>
        <ProTextarea
          id="motivation-details"
          placeholder="Explain why this request is important or what problem it's trying to solve"
          value={motivationDetails}
          onChange={(e) => setMotivationDetails(e.target.value)}
          className="w-full min-h-[150px] bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400"
        />
      </div>
    </div>
  );
};

export const MotivationTab: React.FC = () => {
  const { enabledSections, toggleSection } = usePromptBuilder();
  const isEnabled = enabledSections['motivation'];
  
  return (
    <TabBase
      id="motivation"
      tabNumber={11}
      isEnabled={isEnabled}
      onToggle={toggleSection}
    >
      <MotivationContent />
    </TabBase>
  );
}; 