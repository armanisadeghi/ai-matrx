'use client';

import React from 'react';
import { ComponentEntry } from '../parts/component-list';
import { ComponentDisplayWrapper } from '../component-usage';
import AccordionWrapper from '@/components/matrx/matrx-collapsible/AccordionWrapper';
import { Button } from '@/components/ui/button';
import { Settings } from 'lucide-react';

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

export default function AccordionWrapperDisplay({ component }: ComponentDisplayProps) {
  if (!component) return null;
  
  // Example code with all available props and their default values
  const code = `import AccordionWrapper from '@/components/matrx/matrx-collapsible/AccordionWrapper';
import { Button } from '@/components/ui/button';
import { Settings } from 'lucide-react';

<AccordionWrapper
  title="Settings"           // The title text displayed in the accordion header
  value="settings-section"   // Unique value for the accordion (used for state)
  defaultOpen={false}        // Whether the accordion is open by default
  className=""               // Additional classes for the accordion
  rightElement={
    <Button size="sm" variant="ghost">
      <Settings className="h-4 w-4" />
    </Button>
  }
>
  <div className="p-2">
    This is the accordion content. You can put any components here.
  </div>
</AccordionWrapper>`;

  return (
    <ComponentDisplayWrapper
      component={component}
      code={code}
      description="A collapsible accordion component with customizable header and content sections."
    >
      <div className="w-full max-w-md">
        <AccordionWrapper
          title="Settings"
          value="settings-section"
          defaultOpen={true}
          rightElement={
            <Button size="sm" variant="ghost">
              <Settings className="h-4 w-4" />
            </Button>
          }
        >
          <div className="p-2 text-gray-700 dark:text-gray-300">
            This is the accordion content. You can put any components here.
          </div>
        </AccordionWrapper>
      </div>
    </ComponentDisplayWrapper>
  );
} 