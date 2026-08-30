'use client';

import React, { useEffect, useState } from 'react';
import { TabBase } from './TabBase';
import { usePromptBuilder } from './PromptBuilderContext';
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { promptTemplateSource } from './constants';
import { ProTextarea } from "@/components/official/ProTextarea";

interface KnowledgeContentProps {
  updateContent?: (content: string) => void;
}

const KnowledgeContent: React.FC<KnowledgeContentProps> = ({ updateContent }) => {
  // State for knowledge options
  const [knowledgeOptions, setKnowledgeOptions] = useState<string[]>([]);
  const [limitationsText, setLimitationsText] = useState('');
  
  const { updateTabContent } = usePromptBuilder();
  
  // Generate the knowledge content
  useEffect(() => {
    if (!updateContent) return;
    
    let content = '';
    
    if (knowledgeOptions.length > 0) {
      const knowledgeTemplates = knowledgeOptions.map(optionId => {
        const option = promptTemplateSource.knowledge.options.find(opt => opt.id === optionId);
        return option ? option.template : '';
      });
      
      const knowledgeText = `${promptTemplateSource.knowledge.prefix}${knowledgeTemplates.join(", ")}`;
      content = knowledgeText;
      
      if (limitationsText) {
        content += `${promptTemplateSource.knowledge.limitations.template.replace("{limitationsText}", limitationsText)}`;
      }
    }
    
    // Update both local and global state
    updateContent(content);
    updateTabContent(5, content); // Knowledge is tab #5
  }, [knowledgeOptions, limitationsText, updateContent, updateTabContent]);

  // Toggle a knowledge option
  const toggleKnowledgeOption = (optionId: string) => {
    setKnowledgeOptions(prev => {
      if (prev.includes(optionId)) {
        return prev.filter(id => id !== optionId);
      } else {
        return [...prev, optionId];
      }
    });
  };
  
  return (
    <div className="space-y-6 w-full">
      <div className="space-y-4">
        <Label className="text-gray-700 dark:text-gray-300">Knowledge Source Options</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {promptTemplateSource.knowledge.options.map((option) => (
            <div key={option.id} className="flex items-center space-x-2">
              <Switch
                id={`knowledge-${option.id}`}
                checked={knowledgeOptions.includes(option.id)}
                onCheckedChange={() => toggleKnowledgeOption(option.id)}
                className="data-[state=checked]:bg-indigo-600 dark:data-[state=checked]:bg-indigo-500"
              />
              <Label 
                htmlFor={`knowledge-${option.id}`} 
                className="text-gray-800 dark:text-gray-300 text-sm font-medium"
              >
                {option.text}
              </Label>
            </div>
          ))}
        </div>
      </div>
      
      <div className="grid gap-3 w-full">
        <Label htmlFor="limitations-text" className="text-gray-700 dark:text-gray-300">
          Specific Limitations (Optional)
        </Label>
        <ProTextarea
          id="limitations-text"
          placeholder="Define any specific knowledge limitations..."
          value={limitationsText}
          onChange={(e) => setLimitationsText(e.target.value)}
          className="w-full bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400"
        />
      </div>
    </div>
  );
};

export const KnowledgeTab: React.FC = () => {
  const { enabledSections, toggleSection } = usePromptBuilder();
  const isEnabled = enabledSections['knowledge'];
  
  return (
    <TabBase
      id="knowledge"
      tabNumber={5}
      isEnabled={isEnabled}
      onToggle={toggleSection}
    >
      <KnowledgeContent />
    </TabBase>
  );
}; 