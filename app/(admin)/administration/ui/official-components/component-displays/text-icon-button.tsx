'use client';

import React from 'react';
import { ComponentEntry } from '../parts/component-list';
import { ComponentDisplayWrapper } from '../component-usage';
import { TextIconButton } from '@/components/official/TextIconButton';
import { ArrowRight } from 'lucide-react';

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

export default function TextIconButtonDisplay({ component }: ComponentDisplayProps) {
  if (!component) return null;
  
  // Example code with all available props and their default values
  const code = `import { TextIconButton } from '@/components/official/TextIconButton';
import { ArrowRight } from 'lucide-react';

<TextIconButton
  variant="default"           // Options: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  size="default"              // Options: 'default' | 'sm' | 'lg'
  icon={<ArrowRight />}       // Any React node
  iconPosition="right"        // Options: 'left' | 'right' (default: 'left')
  tooltip="Continue to next step"  // Optional tooltip text
  showTooltipOnDisabled={true}     // Show tooltip when button is disabled (default: true)
  disabledTooltip="Cannot proceed"  // Different tooltip for disabled state
  onClick={() => {}}
  // Any other button props are also supported (disabled, className, etc.)
>
  Continue
</TextIconButton>`;

  return (
    <ComponentDisplayWrapper
      component={component}
      code={code}
      description="A button component that displays text with an optional icon and tooltip. Supports multiple variants and sizes."
    >
      <TextIconButton
        variant="default"
        size="default"
        icon={<ArrowRight className="h-4 w-4" />}
        iconPosition="right"
        tooltip="Continue to next step"
        onClick={() => {}}
      >
        Continue
      </TextIconButton>
    </ComponentDisplayWrapper>
  );
} 