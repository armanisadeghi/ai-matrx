'use client';

import React from 'react';
import { ComponentEntry } from '../parts/component-list';
import { ComponentDisplayWrapper } from '../component-usage';
import { FileCode, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

export default function PlaceholderDisplay({ component }: ComponentDisplayProps) {
  if (!component) return null;
  
  return (
    <ComponentDisplayWrapper
      component={component}
      code="// No example code is available for this component yet"
      description={`This component doesn't have a display implementation yet. You can help by creating a demo for ${component.name}.`}
    >
      <div className="w-full h-full flex flex-col items-center justify-center py-10 px-4 text-center space-y-6">
        <Alert variant="default" className="max-w-lg border-amber-500 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/30">
          <AlertTriangle className="h-4 w-4 text-amber-500 dark:text-amber-400" />
          <AlertTitle>Missing Component Display</AlertTitle>
          <AlertDescription>
            This component doesn't have a display implementation yet. Create one at:
            <code className="block mt-2 text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded">
              app/(authenticated)/(admin-auth)/administration/official-components/component-displays/{component.id}.tsx
            </code>
          </AlertDescription>
        </Alert>
        
        <div className="text-gray-500 dark:text-gray-400 max-w-md text-sm">
          <p className="mb-4">
            To create a new component display, use the existing displays as a template 
            and follow the structure defined in the documentation.
          </p>
          <Button 
            variant="outline" 
            size="sm" 
            className="gap-2"
            onClick={() => {
              // This is just a placeholder, in a real app you'd navigate to documentation
              alert('Navigate to documentation');
            }}
          >
            <FileCode className="h-4 w-4" />
            View Documentation
          </Button>
        </div>
      </div>
    </ComponentDisplayWrapper>
  );
} 