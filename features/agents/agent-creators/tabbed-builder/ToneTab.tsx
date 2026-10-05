'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { TabBase } from './TabBase';
import { usePromptBuilder } from './PromptBuilderContext';
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { promptTemplateSource } from './constants';

interface ToneContentProps {
  updateContent?: (content: string) => void;
}

const ToneContent: React.FC<ToneContentProps> = ({ updateContent }) => {
  // State for tone options
  const [toneSelection, setToneSelection] = useState('');
  const [detailLevel, setDetailLevel] = useState(50);
  
  const { updateTabContent } = usePromptBuilder();
  
  // Create the content string without side effects
  const generateContent = useCallback(() => {
    let content = '';
    
    if (toneSelection) {
      const toneTemplate = promptTemplateSource.tone.options.find(opt => opt.id === toneSelection)?.template || '';
      const toneText = `${promptTemplateSource.tone.prefix}${toneTemplate}${promptTemplateSource.tone.suffix}`;
      
      // Add detail level
      const detailLevelMap = {
        0: "concise",
        50: "balanced",
        100: "comprehensive",
      };
      
      const closestValue = Object.keys(detailLevelMap).reduce((prev, curr) => {
        return Math.abs(Number(curr) - detailLevel) < Math.abs(Number(prev) - detailLevel) ? curr : prev;
      }, "50");
      
      const detailText = `${promptTemplateSource.tone.detail.prefix}${promptTemplateSource.tone.detail.template.replace(
        "{detailLevel}",
        detailLevelMap[Number(closestValue) as keyof typeof detailLevelMap]
      )}`;
      
      content = `${toneText} ${detailText}`;
    }
    
    return content;
  }, [toneSelection, detailLevel]);
  
  // Update content when relevant props change
  useEffect(() => {
    if (!updateContent) return;
    
    const content = generateContent();
    
    // Only update if we have actual content to avoid unnecessary updates
    if (content) {
      updateContent(content);
      updateTabContent(3, content); // Tone is tab #3
    }
  }, [generateContent, updateContent, updateTabContent]);
  
  return (
    <div className="space-y-6 w-full">
      <div className="grid gap-3 w-full">
        <Label htmlFor="tone-selection" className="text-gray-700 dark:text-gray-300">
          Tone
        </Label>
        <Select
          value={toneSelection}
          onValueChange={setToneSelection}
        >
          <SelectTrigger id="tone-selection" className="w-full">
            <SelectValue placeholder="Select the tone for the response" />
          </SelectTrigger>
          <SelectContent className="bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700">
            {promptTemplateSource.tone.options.map((option) => (
              <SelectItem key={option.id} value={option.id} className="text-gray-800 dark:text-gray-200">
                {option.text}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      <div className="space-y-4 w-full">
        <div>
          <Label className="text-gray-700 dark:text-gray-300 mb-2 block">
            Level of Detail
          </Label>
          <div className="px-1">
            <div className="flex justify-between type-secondary text-gray-500 dark:text-gray-400 mb-2">
              <span>Concise</span>
              <span>Balanced</span>
              <span>Comprehensive</span>
            </div>
            <Slider
              value={[detailLevel]}
              onValueChange={(values) => setDetailLevel(values[0])}
              min={0}
              max={100}
              step={1}
              className="w-full"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export const ToneTab: React.FC = () => {
  const { enabledSections, toggleSection } = usePromptBuilder();
  const isEnabled = enabledSections['tone'];
  
  return (
    <TabBase
      id="tone"
      tabNumber={3}
      isEnabled={isEnabled}
      onToggle={toggleSection}
    >
      <ToneContent />
    </TabBase>
  );
};