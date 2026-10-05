'use client';

import React, { useEffect, useState } from 'react';
import { TabBase } from './TabBase';
import { usePromptBuilder } from './PromptBuilderContext';
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { promptTemplateSource } from './constants';

interface EvaluationContentProps {
  updateContent?: (content: string) => void;
}

const EvaluationContent: React.FC<EvaluationContentProps> = ({ updateContent }) => {
  // State for evaluation criteria
  const [evaluationCriteria, setEvaluationCriteria] = useState<string[]>([]);
  const { updateTabContent } = usePromptBuilder();
  
  // Generate the evaluation content
  useEffect(() => {
    if (!updateContent) return;
    
    let content = '';
    
    if (evaluationCriteria.length > 0) {
      const criteriaText = evaluationCriteria.map(criteriaId => {
        const option = promptTemplateSource.evaluation.options.find(opt => opt.id === criteriaId);
        return option ? option.template : '';
      }).join(", ");
      
      content = `${promptTemplateSource.evaluation.prefix}${criteriaText}.`;
    }
    
    // Update both local and global state
    updateContent(content);
    updateTabContent(9, content); // Evaluation is tab #9
  }, [evaluationCriteria, updateContent, updateTabContent]);

  // Toggle an evaluation criteria
  const toggleEvaluationCriteria = (criteriaId: string) => {
    setEvaluationCriteria(prev => {
      if (prev.includes(criteriaId)) {
        return prev.filter(id => id !== criteriaId);
      } else {
        return [...prev, criteriaId];
      }
    });
  };
  
  return (
    <div className="space-y-6 w-full">
      <div className="space-y-4">
        <Label className="text-gray-700 dark:text-gray-300">Success Metrics</Label>
        <p className="type-body text-gray-600 dark:text-gray-400 mb-2">
          Select criteria in order of importance (first selected = highest priority)
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {promptTemplateSource.evaluation.options.map((option) => (
            <div key={option.id} className="flex items-center space-x-2">
              <Switch
                id={`evaluation-${option.id}`}
                checked={evaluationCriteria.includes(option.id)}
                onCheckedChange={() => toggleEvaluationCriteria(option.id)}
              />
              <Label 
                htmlFor={`evaluation-${option.id}`} 
                className="text-gray-800 dark:text-gray-300 text-sm font-medium"
              >
                {option.text}
              </Label>
            </div>
          ))}
        </div>
      </div>
      
      {evaluationCriteria.length > 0 && (
        <div className="space-y-2">
          <Label className="text-gray-700 dark:text-gray-300">Priority Order</Label>
          <div className="mt-2 space-y-2 p-4 border rounded-md border-zinc-200 dark:border-zinc-700">
            <ol className="list-decimal list-inside">
              {evaluationCriteria.map((criteriaId, index) => {
                const option = promptTemplateSource.evaluation.options.find(opt => opt.id === criteriaId);
                return (
                  <li key={index} className="py-1 px-2 bg-zinc-50 dark:bg-zinc-800 rounded text-gray-800 dark:text-gray-200">
                    {option?.text || criteriaId}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
};

export const EvaluationTab: React.FC = () => {
  const { enabledSections, toggleSection } = usePromptBuilder();
  const isEnabled = enabledSections['evaluation'];
  
  return (
    <TabBase
      id="evaluation"
      tabNumber={9}
      isEnabled={isEnabled}
      onToggle={toggleSection}
    >
      <EvaluationContent />
    </TabBase>
  );
}; 