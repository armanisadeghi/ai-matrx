'use client';

import React, { useState } from 'react';
import { ComponentEntry } from '../parts/component-list';
import { ComponentDisplayWrapper } from '../component-usage';
import ActionFeedbackButton from '@/components/official/ActionFeedbackButton';
import { Save, Trash, Send, Check, Bookmark, Download } from 'lucide-react';

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

export default function ActionFeedbackButtonDisplay({ component }: ComponentDisplayProps) {
  if (!component) return null;
  
  // Example state
  const [isLoading, setIsLoading] = useState(false);
  
  // Example handlers
  const handleAction = (action: string) => {
    console.log(`${action} action triggered`);
    // In a real scenario, this would perform the actual action
  };
  
  const handleLoadingAction = () => {
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 2000);
  };
  
  // Example code with all available props and their default values
  const code = `import ActionFeedbackButton from '@/components/official/ActionFeedbackButton';
import { Save, Check } from 'lucide-react';

// Example usage
<ActionFeedbackButton
  // Required props
  icon={<Save className="h-4 w-4 text-blue-500 dark:text-blue-400" />}
  tooltip="Save changes"
  onClick={() => handleSave()}
  
  // ActionFeedbackButton specific props
  successIcon={<Check className="h-4 w-4 text-green-500 dark:text-green-400" />} // Optional - defaults to CheckCircle2
  successTooltip="Saved successfully!" // Optional - defaults to "Success!"
  feedbackDuration={2000} // Optional - time in ms to show success state (default: 2000)
  
  // Props inherited from IconButton
  variant="ghost" // Optional - defaults to 'ghost' (options: 'default', 'destructive', 'outline', 'secondary', 'ghost', 'link')
  size="sm" // Optional - defaults to 'sm' (options: 'default', 'sm', 'lg')
  className="" // Optional - additional classes
  disabled={false} // Optional - whether the button is disabled
  showTooltipOnDisabled={true} // Optional - whether to show tooltip when disabled
  disabledTooltip="Cannot save at this time" // Optional - different tooltip text for disabled state
/>`;

  return (
    <ComponentDisplayWrapper
      component={component}
      code={code}
      description="A button component that shows visual feedback after an action is triggered. It extends IconButton to inherit all tooltip functionality and styling options."
    >
      <div className="w-full flex flex-col space-y-8">
        <div className="flex flex-wrap gap-6 justify-center">
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm text-gray-600 dark:text-gray-400">Basic</p>
            <ActionFeedbackButton
              icon={<Save className="h-5 w-5 text-blue-500 dark:text-blue-400" />}
              tooltip="Save changes"
              successTooltip="Saved successfully!"
              onClick={() => handleAction('save')}
            />
          </div>
          
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm text-gray-600 dark:text-gray-400">Destructive</p>
            <ActionFeedbackButton
              icon={<Trash className="h-5 w-5 text-white dark:text-white" />}
              tooltip="Delete item"
              successTooltip="Deleted!"
              onClick={() => handleAction('delete')}
              variant="destructive"
            />
          </div>
          
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm text-gray-600 dark:text-gray-400">Disabled</p>
            <ActionFeedbackButton
              icon={<Send className="h-5 w-5 text-indigo-500 dark:text-indigo-400" />}
              tooltip="Send message"
              disabledTooltip="Cannot send at this time"
              onClick={() => handleAction('send')}
              variant="secondary"
              disabled={true}
            />
          </div>
          
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm text-gray-600 dark:text-gray-400">Loading</p>
            <ActionFeedbackButton
              icon={<Download className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />}
              tooltip={isLoading ? "Downloading..." : "Download file"}
              onClick={handleLoadingAction}
              disabled={isLoading}
              variant="outline"
            />
          </div>
          
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm text-gray-600 dark:text-gray-400">Large Size</p>
            <ActionFeedbackButton
              icon={<Bookmark className="h-6 w-6 text-amber-500 dark:text-amber-400" />}
              tooltip="Bookmark page"
              successTooltip="Bookmarked!"
              onClick={() => handleAction('bookmark')}
              size="lg"
              className="aspect-square"
            />
          </div>
        </div>
        
        <div className="text-center text-gray-600 dark:text-gray-400 text-sm">
          Hover over buttons to see tooltips. Click any button to see the success feedback animation.
          <br />
          This component extends IconButton to inherit all tooltip functionality and styling options.
        </div>
      </div>
    </ComponentDisplayWrapper>
  );
} 