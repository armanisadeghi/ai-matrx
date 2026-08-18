'use client';

import React, { useState } from 'react';
import { ComponentEntry } from './component-list';
import { ComponentDisplayWrapper } from '../component-usage';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface TabbedDemoWrapperProps {
  component?: ComponentEntry;
}

export interface TabbedComponentConfig {
  id: string;
  label: string;
  component: React.ComponentType;
  codeExample: string;
  description?: string;
}

/**
 * Creates a tabbed demo wrapper that can display multiple related components
 * 
 * @param components Array of component configurations
 * @returns A component compatible with the component system
 */
export function createTabbedComponentDisplay(
  components: TabbedComponentConfig[]
) {
  // Return a component that conforms to the ComponentDisplayProps interface
  return function TabbedDemo({ component }: TabbedDemoWrapperProps) {
    const [activeTab, setActiveTab] = useState<string>(components[0].id);

    // Find the active component config
    const activeConfig = components.find(c => c.id === activeTab) || components[0];

    // The guard sits BELOW the hook: an early return above it makes useState
    // conditional (react-hooks/rules-of-hooks) and React throws the moment
    // `component` flips from undefined to defined.
    if (!component) return null;

    return (
      <ComponentDisplayWrapper
        component={component}
        code={activeConfig.codeExample}
        description={activeConfig.description || component.description || ''}
        className="p-0"
      >
        <div className="w-full flex flex-col">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="mb-4">
              {components.map(comp => (
                <TabsTrigger key={comp.id} value={comp.id}>
                  {comp.label}
                </TabsTrigger>
              ))}
            </TabsList>
            
            {components.map(comp => (
              <TabsContent key={comp.id} value={comp.id} className="mt-0">
                <comp.component />
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </ComponentDisplayWrapper>
    );
  };
}

/**
 * Helper function to quickly create a tabbed demo
 * 
 * Example usage:
 * 
 * ```
 * import { createTabbedDemo } from '../tabbed-demo-wrapper';
 * import Component1 from '../need-wrappers/component1';
 * import Component2 from '../need-wrappers/component2';
 * 
 * export default createTabbedDemo([
 *   {
 *     id: 'basic',
 *     label: 'Basic Usage',
 *     component: Component1,
 *     codeExample: `<Component prop="value" />`,
 *     description: 'Basic component usage'
 *   },
 *   {
 *     id: 'advanced',
 *     label: 'Advanced Features',
 *     component: Component2,
 *     codeExample: `<Component advanced={true} />`,
 *     description: 'Advanced component usage'
 *   }
 * ]);
 * ```
 */
export function createTabbedDemo(
  components: TabbedComponentConfig[]
) {
  return createTabbedComponentDisplay(components);
} 