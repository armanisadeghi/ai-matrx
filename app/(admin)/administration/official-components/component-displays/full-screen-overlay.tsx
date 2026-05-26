'use client';

import React, { useState } from 'react';
import { ComponentEntry } from '../parts/component-list';
import { ComponentDisplayWrapper } from '../component-usage';
import FullScreenOverlay, { TabDefinition } from '@/components/official/FullScreenOverlay';
import { Button } from '@/components/ui/button';
import { Save } from 'lucide-react';

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

export default function FullScreenOverlayDisplay({ component }: ComponentDisplayProps) {
  if (!component) return null;
  
  const [isOpen, setIsOpen] = useState(false);
  
  const tabs: TabDefinition[] = [
    {
      id: 'tab1',
      label: 'General',
      content: (
        <div className="p-6">
          <p className="text-gray-700 dark:text-gray-300">This is the content for the general tab.</p>
        </div>
      )
    },
    {
      id: 'tab2',
      label: 'Advanced',
      content: (
        <div className="p-6">
          <p className="text-gray-700 dark:text-gray-300">This is the content for the advanced tab.</p>
        </div>
      )
    }
  ];
  
  // Example code with all available props and their default values
  const code = `import FullScreenOverlay, { TabDefinition } from '@/components/official/FullScreenOverlay';
import { Save } from 'lucide-react';

// Define tab content
const tabs: TabDefinition[] = [
  {
    id: 'tab1',
    label: 'General',
    content: (
      <div className="p-6">
        <p className="text-gray-700 dark:text-gray-300">This is the content for the general tab.</p>
      </div>
    )
  },
  {
    id: 'tab2',
    label: 'Advanced',
    content: (
      <div className="p-6">
        <p className="text-gray-700 dark:text-gray-300">This is the content for the advanced tab.</p>
      </div>
    )
  }
];

// Control the overlay state
const [isOpen, setIsOpen] = useState(false);

// Render component
<>
  <Button onClick={() => setIsOpen(true)}>Open Overlay</Button>
  
  <FullScreenOverlay
    isOpen={isOpen}
    onClose={() => setIsOpen(false)}
    title="Settings"
    description="Configure application settings"  // Optional description
    tabs={tabs}
    initialTab="tab1"                 // Initial active tab
    onTabChange={(tab) => console.log('Tab changed:', tab)}
    footerContent={<span>Additional footer content</span>}
    showSaveButton={true}             // Show save button in footer
    onSave={() => console.log('Saved')}
    saveButtonLabel="Save Changes"    // Custom save button text
    showCancelButton={true}           // Show cancel button in footer
    onCancel={() => setIsOpen(false)}
    cancelButtonLabel="Cancel"        // Custom cancel button text
    width="90vw"                      // Custom width (default: 90vw)
    height="95vh"                     // Custom height (default: 95vh)
  />
</>`;

  return (
    <>
      <ComponentDisplayWrapper
        component={component}
        code={code}
        description="A full-screen overlay with tabbed interface, perfect for modal dialogs, settings panels, or any content that requires focused attention."
      >
        <div className="flex justify-center p-4">
          <Button onClick={() => setIsOpen(true)}>Open Overlay</Button>
        </div>
      </ComponentDisplayWrapper>
      
      {/* Render the overlay outside of the container */}
      <FullScreenOverlay
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Settings"
        tabs={tabs}
        initialTab="tab1"
        showSaveButton={true}
        onSave={() => setIsOpen(false)}
        saveButtonLabel="Save Changes"
        showCancelButton={true}
        onCancel={() => setIsOpen(false)}
        cancelButtonLabel="Cancel"
        width="90vw"
        height="95vh"
      />
    </>
  );
} 