'use client';

import React from 'react';
import { ComponentEntry } from '../parts/component-list';
import { ComponentDisplayWrapper } from '../component-usage';
import HelpIcon from '@/components/official/HelpIcon';

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

export default function HelpIconDisplay({ component }: ComponentDisplayProps) {
  if (!component) return null;
  
  // Example code with all available props and their default values
  const code = `import HelpIcon from '@/components/official/HelpIcon';

<div className="flex items-center">
  <span className="mr-1">User ID</span>
  <HelpIcon 
    text="This is the unique identifier for the user.\nImportant: This ID cannot be changed after creation."
  />
</div>`;

  return (
    <ComponentDisplayWrapper
      component={component}
      code={code}
      description="A tooltip help icon that displays informational text when hovered. Includes copy to clipboard functionality and proper handling of line breaks."
    >
      <div className="flex items-center gap-8">
        <div className="flex items-center">
          <span className="mr-1">User ID</span>
          <HelpIcon 
            text="This is the unique identifier for the user.\nImportant: This ID cannot be changed after creation."
          />
        </div>

        <div className="flex items-center">
          <span className="mr-1">API Key</span>
          <HelpIcon 
            text="The API key is used for authentication.\nStore this securely and never share it.\nYou can regenerate this key if it's compromised."
          />
        </div>
      </div>
    </ComponentDisplayWrapper>
  );
} 