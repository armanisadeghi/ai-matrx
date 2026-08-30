'use client';

import React, { useEffect, useState } from 'react';
import { TabBase } from './TabBase';
import { usePromptBuilder } from './PromptBuilderContext';
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { promptTemplateSource } from './constants';
import { ProTextarea } from "@/components/official/ProTextarea";

interface ConstraintsContentProps {
  updateContent?: (content: string) => void;
}

const ConstraintsContent: React.FC<ConstraintsContentProps> = ({ updateContent }) => {
  // State for constraints options
  const [constraintOptions, setConstraintOptions] = useState<string[]>([]);
  const [specificConstraints, setSpecificConstraints] = useState('');
  const { updateTabContent } = usePromptBuilder();
  
  // Generate the constraints content
  useEffect(() => {
    if (!updateContent) return;
    
    let content = '';
    
    if (constraintOptions.length > 0 || specificConstraints) {
      content = promptTemplateSource.constraints.prefix;
      
      if (constraintOptions.length > 0) {
        const constraintTemplates = constraintOptions.map(optionId => {
          const option = promptTemplateSource.constraints.options.find(opt => opt.id === optionId);
          return option ? option.template : '';
        });
        
        content += constraintTemplates.join(", ");
      }
      
      if (specificConstraints) {
        content += `${promptTemplateSource.constraints.specific.template.replace("{specificConstraints}", specificConstraints)}`;
      }
    }
    
    // Update both local and global state
    updateContent(content);
    updateTabContent(7, content); // Constraints is tab #7
  }, [constraintOptions, specificConstraints, updateContent, updateTabContent]);

  // Toggle a constraint option
  const toggleConstraintOption = (optionId: string) => {
    setConstraintOptions(prev => {
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
        <Label className="text-gray-700 dark:text-gray-300">Constraint Types</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {promptTemplateSource.constraints.options.map((option) => (
            <div key={option.id} className="flex items-center space-x-2">
              <Switch
                id={`constraint-${option.id}`}
                checked={constraintOptions.includes(option.id)}
                onCheckedChange={() => toggleConstraintOption(option.id)}
                className="data-[state=checked]:bg-indigo-600 dark:data-[state=checked]:bg-indigo-500"
              />
              <Label 
                htmlFor={`constraint-${option.id}`} 
                className="text-gray-800 dark:text-gray-300 text-sm font-medium"
              >
                {option.text}
              </Label>
            </div>
          ))}
        </div>
      </div>
      
      <div className="grid gap-3 w-full">
        <Label htmlFor="specific-constraints" className="text-gray-700 dark:text-gray-300">
          Specific Constraints (Optional)
        </Label>
        <ProTextarea
          id="specific-constraints"
          placeholder="Describe specific constraints in detail..."
          value={specificConstraints}
          onChange={(e) => setSpecificConstraints(e.target.value)}
          className="w-full bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400"
        />
      </div>
    </div>
  );
};

export const ConstraintsTab: React.FC = () => {
  const { enabledSections, toggleSection } = usePromptBuilder();
  const isEnabled = enabledSections['constraints'];
  
  return (
    <TabBase
      id="constraints"
      tabNumber={7}
      isEnabled={isEnabled}
      onToggle={toggleSection}
    >
      <ConstraintsContent />
    </TabBase>
  );
}; 