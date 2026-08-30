'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TabBase } from './TabBase';
import { usePromptBuilder } from './PromptBuilderContext';
import { promptTemplateSource } from './constants';
import { ProTextarea } from "@/components/official/ProTextarea";

interface TaskTabProps {
  updateContent?: (content: string) => void;
}

// Content component that receives updateContent
const TaskContent: React.FC<TaskTabProps> = ({ updateContent }) => {
  // State for task options
  const [taskType, setTaskType] = useState('');
  const [subject, setSubject] = useState('');
  const [specificTask, setSpecificTask] = useState('');
  const [creativeType, setCreativeType] = useState('');
  const [showCreativeOptions, setShowCreativeOptions] = useState(false);
  
  const { updateTabContent } = usePromptBuilder();
  
  // Update dependencies based on selections
  useEffect(() => {
    setShowCreativeOptions(taskType === 'create');
  }, [taskType]);
  
  // Generate the task content without side effects
  const generateContent = useCallback(() => {
    let content = '';
    
    if (taskType) {
      let taskTemplate = promptTemplateSource.task.options.find(opt => opt.id === taskType)?.template || '';
      
      // Handle creative type for creative tasks
      if (taskType === 'create' && creativeType) {
        taskTemplate = taskTemplate.replace("{creativeType}", creativeType);
      }
      
      const taskText = `${promptTemplateSource.task.prefix}${taskTemplate.replace("{subject}", subject)}`;
      content += taskText;
      
      if (specificTask) {
        content += `\nSpecifically, you should ${specificTask}.`;
      }
    }
    
    return content;
  }, [taskType, subject, specificTask, creativeType]);
  
  // Update content when relevant props change
  useEffect(() => {
    if (!updateContent) return;
    
    const content = generateContent();
    
    // Only update if we have content to avoid unnecessary updates
    if (content) {
      updateContent(content);
      updateTabContent(1, content); // Task is tab #1
    }
  }, [generateContent, updateContent, updateTabContent]);

  return (
    <div className="space-y-4 w-full">
      <div className="grid gap-3 w-full">
        <Label htmlFor="task-type" className="text-gray-700 dark:text-gray-300">
          Task Type
        </Label>
        <Select
          value={taskType}
          onValueChange={setTaskType}
        >
          <SelectTrigger id="task-type" className="w-full bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700">
            <SelectValue placeholder="Select the primary task" />
          </SelectTrigger>
          <SelectContent className="bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700">
            {promptTemplateSource.task.options.map((option) => (
              <SelectItem key={option.id} value={option.id} className="text-gray-800 dark:text-gray-200">
                {option.text}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      <div className="grid gap-3 w-full">
        <Label htmlFor="subject" className="text-gray-700 dark:text-gray-300">
          Subject
        </Label>
        <Input
          id="subject"
          placeholder="Enter the subject matter"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400"
        />
      </div>
      
      {showCreativeOptions && (
        <div className="grid gap-3 w-full">
          <Label htmlFor="creative-type" className="text-gray-700 dark:text-gray-300">
            Creative Work Type
          </Label>
          <Input
            id="creative-type"
            placeholder="e.g., poem, story, song, article"
            value={creativeType}
            onChange={(e) => setCreativeType(e.target.value)}
            className="w-full bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400"
          />
        </div>
      )}
      
      <div className="grid gap-3 w-full">
        <Label htmlFor="specific-task" className="text-gray-700 dark:text-gray-300">
          Specific Instructions (Optional)
        </Label>
        <ProTextarea
          id="specific-task"
          placeholder="Add more specific instructions about the task"
          value={specificTask}
          onChange={(e) => setSpecificTask(e.target.value)}
          className="w-full min-h-[120px] bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400"
        />
      </div>
    </div>
  );
};

export const TaskTab: React.FC = () => {
  const { enabledSections, toggleSection } = usePromptBuilder();
  const isEnabled = enabledSections['task'];
  
  return (
    <TabBase
      id="task"
      tabNumber={1}
      alwaysEnabled={true}
      isEnabled={isEnabled}
      onToggle={toggleSection}
    >
      <TaskContent />
    </TabBase>
  );
}; 