'use client';

import React from 'react';
import { ComponentEntry } from '../parts/component-list';
import { ComponentDisplayWrapper } from '../component-usage';
import IconButton from '@/components/official/IconButton';
import { Copy } from 'lucide-react';

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

export default function IconButtonDisplay({ component }: ComponentDisplayProps) {
  if (!component) return null;
  
  // Example code with all available props and their default values
  const code = `import IconButton from '@/components/official/IconButton';
import { Copy } from 'lucide-react';

<IconButton
  icon={Copy}
  tooltip="Copy to clipboard" 
  size="md"                   // Options: 'xs' | 'sm' | 'md' | 'lg' | 'xl' (default: 'sm')
  variant="outline"           // Options: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  tooltipSide="bottom"        // Options: 'top' | 'right' | 'bottom' | 'left' (default: 'bottom')
  tooltipAlign="center"       // Options: 'start' | 'center' | 'end' (default: 'center')
  tooltipOffset={5}           // Number (default: 5)
  iconClassName=""            // Additional classes for the icon
  onClick={() => {}}
  // Any other button props are also supported (disabled, etc.)
/>`;

  return (
    <ComponentDisplayWrapper
      component={component}
      code={code}
      description="A button component that displays an icon with an optional tooltip. Perfect for toolbar actions and compact UI elements."
    >
      <IconButton
        icon={Copy}
        tooltip="Copy to clipboard"
        size="md"
        variant="outline"
        onClick={() => {}}
      />
    </ComponentDisplayWrapper>
  );
} 