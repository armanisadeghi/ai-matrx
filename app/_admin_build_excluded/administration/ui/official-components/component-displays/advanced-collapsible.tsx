'use client';

import React, { useState } from 'react';
import { ComponentEntry } from '../parts/component-list';
import { ComponentDisplayWrapper } from '../component-usage';
import AdvancedCollapsible from '@/components/official/AdvancedCollapsible';
import { FileText } from 'lucide-react';

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

export default function AdvancedCollapsibleDisplay({ component }: ComponentDisplayProps) {
  if (!component) return null;
  
  const [content, setContent] = useState<string>("This is some example content that can be saved, reset, copied, or viewed in fullscreen mode.\n\nTry out the action buttons below!\n\nThe component includes modern visual feedback for actions:\n- Save button shows a green checkmark when clicked\n- Reset button shows a green checkmark when clicked\n- Copy button has built-in success animation\n- Fullscreen button expands the content while maintaining state");
  const [savedContent, setSavedContent] = useState<string>(content);
  
  // Example handlers
  const handleSave = () => {
    setSavedContent(content);
  };
  
  const handleReset = () => {
    setContent(savedContent);
  };
  
  // Example code with all available props and their default values
  const code = `import AdvancedCollapsible from '@/components/official/AdvancedCollapsible';
import { FileText } from 'lucide-react';

// State for content manipulation (if needed)
const [content, setContent] = useState<string>("Initial content");
const [savedContent, setSavedContent] = useState<string>(content);

// Example handlers
const handleSave = () => {
  setSavedContent(content);
  // Your save logic here
};

const handleReset = () => {
  setContent(savedContent);
  // Your reset logic here
};

<AdvancedCollapsible
  icon={<FileText className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />}
  title="Advanced Collapsible Example"
  initialOpen={true}         // Whether the collapsible is open by default (true by default)
  onStateChange={(open) => {
    console.log('Collapsible state changed:', open);
  }}
  className=""               // Additional classes for the collapsible
  contentClassName=""        // Additional classes for the content area
  
  // Action handlers - if not provided, the button won't show (except for Copy and Fullscreen)
  onSave={handleSave}
  onReset={handleReset}
  
  // Custom tooltips (optional)
  saveTooltip="Save changes"
  resetTooltip="Reset to saved version"
  copyTooltip="Copy to clipboard"
  fullscreenTooltip="Expand to full screen"
  fullscreenExitTooltip="Exit full screen"
  
  // Full screen options (optional)
  fullScreenTitle="Content in Full Screen"
  fullScreenDescription="Viewing content in full screen mode"
>
  <div className="p-3 text-gray-700 dark:text-gray-300">
    {/* Your content here */}
    <p>Content that can be saved, reset, copied, or viewed in fullscreen.</p>
    <textarea
      value={content}
      onChange={(e) => setContent(e.target.value)}
      className="w-full mt-2 p-2 border border-zinc-300 dark:border-zinc-700 rounded-md"
      rows={8}
    />
  </div>
</AdvancedCollapsible>`;

  return (
    <ComponentDisplayWrapper
      component={component}
      code={code}
      description="An advanced collapsible component with action buttons for save, reset, copy, and fullscreen functionality. It can also expand to a full-screen overlay while maintaining state."
    >
      <div className="w-full max-w-3xl">
        <AdvancedCollapsible
          icon={<FileText className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />}
          title="Advanced Collapsible Example"
          initialOpen={true}
          onSave={handleSave}
          onReset={handleReset}
          saveTooltip="Save changes"
          resetTooltip="Reset to saved version"
          fullScreenTitle="Advanced Collapsible Demo"
        >
          <div className="p-3 text-gray-700 dark:text-gray-300">
            <p>This component includes action buttons with modern visual feedback:</p>
            <ul className="list-disc ml-6 mt-2 mb-3">
              <li>Save - shows success indicator when clicked</li>
              <li>Reset - shows success indicator when clicked</li>
              <li>Copy - has built-in success animation</li>
              <li>Fullscreen - expands while maintaining state</li>
            </ul>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full mt-3 p-3 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 rounded-md"
              rows={8}
            />
          </div>
        </AdvancedCollapsible>
      </div>
    </ComponentDisplayWrapper>
  );
} 