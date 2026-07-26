'use client';

import React from 'react';
import { ComponentEntry } from '../parts/component-list';
import { ComponentDisplayWrapper } from '../component-usage';
import StatePersistingAccordionWrapper from '@/components/matrx/matrx-collapsible/StatePersistingAccordionWrapper';
import { Button } from '@/components/ui/button';
import { Info } from 'lucide-react';

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

export default function StatePersistingAccordionDisplay({ component }: ComponentDisplayProps) {
  if (!component) return null;
  
  // Example code with all available props and their default values
  const code = `import StatePersistingAccordionWrapper from '@/components/matrx/matrx-collapsible/StatePersistingAccordionWrapper';
import { Button } from '@/components/ui/button';
import { Info } from 'lucide-react';

<StatePersistingAccordionWrapper
  title="Information"         // The title text displayed in the accordion header
  value="info-section"        // Unique value for the accordion (used for state)
  defaultOpen={true}          // Whether the accordion is open by default (false by default)
  rightElement={
    <Button size="sm" variant="ghost">
      <Info className="h-4 w-4" />
    </Button>
  }
>
  <div className="p-2">
    This accordion remembers its state when it's toggled.
  </div>
</StatePersistingAccordionWrapper>`;

  return (
    <ComponentDisplayWrapper
      component={component}
      code={code}
      description="A state-persisting accordion component that maintains its open/closed state when toggled."
    >
      <div className="w-full max-w-md">
        <StatePersistingAccordionWrapper
          title="Information"
          value="info-section"
          defaultOpen={true}
          rightElement={
            <Button size="sm" variant="ghost">
              <Info className="h-4 w-4" />
            </Button>
          }
        >
          <div className="p-2 text-gray-700 dark:text-gray-300">
            This accordion remembers its state when it's toggled.
          </div>
        </StatePersistingAccordionWrapper>
      </div>
    </ComponentDisplayWrapper>
  );
} 