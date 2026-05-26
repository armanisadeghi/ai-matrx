'use client';

import React from 'react';
import { ComponentEntry } from './component-list';
import { ComponentDisplayWrapper } from '../component-usage';

interface DemoWrapperProps {
  component?: ComponentEntry;
}

/**
 * Higher-order component that wraps existing demo components for the component system
 * 
 * @param OriginalDemo The original demo component to wrap
 * @param codeExample A string containing example code to show
 * @param description Optional custom description (defaults to component description)
 * @returns A component compatible with the component system
 */
export function createComponentDisplay(
  OriginalDemo: React.ComponentType<any>,
  codeExample: string,
  description?: string
) {
  // Return a new component that conforms to the ComponentDisplayProps interface
  return function WrappedDemo({ component }: DemoWrapperProps) {
    if (!component) return null;

    return (
      <ComponentDisplayWrapper
        component={component}
        code={codeExample}
        description={description || component.description || ''}
        className="p-0"
      >
        <OriginalDemo />
      </ComponentDisplayWrapper>
    );
  };
}

/**
 * Function to quickly wrap an existing demo page
 * Use this for demos that don't need any modifications
 * 
 * Example usage in [component-id].tsx:
 * 
 * ```
 * import { wrapExistingDemo } from '../demo-wrapper';
 * import OriginalDemo from '../component-displays/your-component';
 * 
 * const codeExample = `import { YourComponent } from '@/components/path/YourComponent';
 * 
 * <YourComponent prop1="value" prop2={123} />`;
 * 
 * export default wrapExistingDemo(OriginalDemo, codeExample);
 * ```
 */
export function wrapExistingDemo(
  OriginalDemo: React.ComponentType<any>, 
  codeExample: string,
  description?: string
) {
  return createComponentDisplay(OriginalDemo, codeExample, description);
} 