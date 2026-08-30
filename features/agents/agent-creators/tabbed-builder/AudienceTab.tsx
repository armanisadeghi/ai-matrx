'use client';

import React, { useEffect, useState } from 'react';
import { TabBase } from './TabBase';
import { usePromptBuilder } from './PromptBuilderContext';
import { Label } from "@/components/ui/label";
import { Input } from "@ai-matrx/design-system";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { promptTemplateSource } from './constants';

interface AudienceContentProps {
  updateContent?: (content: string) => void;
}

const AudienceContent: React.FC<AudienceContentProps> = ({ updateContent }) => {
  // State for audience options
  const [audienceType, setAudienceType] = useState('');
  const [specificAudience, setSpecificAudience] = useState('');
  const [audienceKnowledgeLevel, setAudienceKnowledgeLevel] = useState(50);
  const [showSpecificAudience, setShowSpecificAudience] = useState(false);
  const { updateTabContent } = usePromptBuilder();
  
  // Update UI based on selections
  useEffect(() => {
    setShowSpecificAudience(audienceType === 'specific');
  }, [audienceType]);
  
  // Generate the audience content
  useEffect(() => {
    if (!updateContent) return;
    
    let content = '';
    
    if (audienceType) {
      let audienceTemplate = promptTemplateSource.audience.options.find(opt => opt.id === audienceType)?.template || '';
      
      if (audienceType === 'specific' && specificAudience) {
        audienceTemplate = audienceTemplate.replace("{specificAudience}", specificAudience);
      }
      
      const audienceText = `${promptTemplateSource.audience.prefix}${audienceTemplate}`;
      
      // Add knowledge level
      const knowledgeLevelMap = {
        0: "novice",
        50: "intermediate",
        100: "expert",
      };
      
      const closestValue = Object.keys(knowledgeLevelMap).reduce((prev, curr) => {
        return Math.abs(Number(curr) - audienceKnowledgeLevel) < Math.abs(Number(prev) - audienceKnowledgeLevel) ? curr : prev;
      }, "50");
      
      const knowledgeLevel = knowledgeLevelMap[Number(closestValue) as keyof typeof knowledgeLevelMap];
      
      const knowledgeLevelText = `${promptTemplateSource.audience.knowledge.prefix}${promptTemplateSource.audience.knowledge.template.replace(
        "{knowledgeLevel}",
        knowledgeLevel
      )}`;
      
      content = `${audienceText}${knowledgeLevelText}`;
    }
    
    // Update both local and global state
    updateContent(content);
    updateTabContent(8, content); // Audience is tab #8
  }, [audienceType, specificAudience, audienceKnowledgeLevel, updateContent, updateTabContent]);
  
  return (
    <div className="space-y-6 w-full">
      <div className="grid gap-3 w-full">
        <Label htmlFor="audience-type" className="text-gray-700 dark:text-gray-300">
          Target Audience
        </Label>
        <Select
          value={audienceType}
          onValueChange={setAudienceType}
        >
          <SelectTrigger id="audience-type" className="w-full bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700">
            <SelectValue placeholder="Select target audience" />
          </SelectTrigger>
          <SelectContent className="bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700">
            {promptTemplateSource.audience.options.map((option) => (
              <SelectItem key={option.id} value={option.id} className="text-gray-800 dark:text-gray-200">
                {option.text}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      {showSpecificAudience && (
        <div className="grid gap-3 w-full">
          <Label htmlFor="specific-audience" className="text-gray-700 dark:text-gray-300">
            Specific Demographic
          </Label>
          <Input
            id="specific-audience"
            placeholder="Describe your specific audience..."
            value={specificAudience}
            onChange={(e) => setSpecificAudience(e.target.value)}
            className="w-full bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400"
          />
        </div>
      )}
      
      <div className="space-y-4 w-full">
        <div>
          <Label className="text-gray-700 dark:text-gray-300 mb-2 block">
            Audience Knowledge Level
          </Label>
          <div className="px-1">
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-2">
              <span>Novice</span>
              <span>Intermediate</span>
              <span>Expert</span>
            </div>
            <Slider
              value={[audienceKnowledgeLevel]}
              onValueChange={(values) => setAudienceKnowledgeLevel(values[0])}
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

export const AudienceTab: React.FC = () => {
  const { enabledSections, toggleSection } = usePromptBuilder();
  const isEnabled = enabledSections['audience'];
  
  return (
    <TabBase
      id="audience"
      tabNumber={8}
      isEnabled={isEnabled}
      onToggle={toggleSection}
    >
      <AudienceContent />
    </TabBase>
  );
}; 