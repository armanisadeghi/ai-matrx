'use client';

import React from 'react';
import { ComponentEntry } from '../parts/component-list';
import { ComponentDisplayWrapper } from '../component-usage';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import StructuredSectionCard from '@/components/official/StructuredSectionCard';
import { Button } from '@/components/ui/button';
import { 
  ArrowRight, 
  Plus, 
  Settings
} from 'lucide-react';

// Import the demo components
import StructuredSectionCardDemo from '../need-wrappers/section-cards/structured-section-card-demo';
import ThemedSectionCardDemo from '../need-wrappers/section-cards/themed-section-card-demo';

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

// Basic example component similar to the original implementation
const BasicExample = () => (
  <div className="w-full max-w-xl">
    <StructuredSectionCard
      title="Project Settings"
      description="Configure your project properties and options"
      headerActions={[
        <Button key="settings" size="sm" variant="outline">
          <Settings className="h-4 w-4 mr-2" />
          Settings
        </Button>,
        <Button key="new" size="sm" variant="default">
          <Plus className="h-4 w-4 mr-2" />
          New Project
        </Button>
      ]}
      footerLeft={
        <Button variant="outline" size="sm">
          Cancel
        </Button>
      }
      footerCenter={
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Last updated: Today
        </div>
      }
      footerRight={
        <Button size="sm">
          Save Changes
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      }
    >
      <div className="py-8 text-center text-gray-500 dark:text-gray-400">
        Form content would go here
      </div>
    </StructuredSectionCard>
  </div>
);

export default function StructuredSectionCardDisplay({ component }: ComponentDisplayProps) {
  if (!component) return null;
  
  // Example code with all available props and their default values
  const code = `import StructuredSectionCard from '@/components/official/StructuredSectionCard';
import { Button } from '@/components/ui/button';
import { Plus, Settings } from 'lucide-react';

<StructuredSectionCard
  title="Section Title"                  // Required: Title displayed at the top of the card
  description="Optional description"     // Optional: Additional description text under the title
  headerActions={[                       // Optional: Array of React elements for header actions
    <Button key="settings" size="sm" variant="outline">
      <Settings className="h-4 w-4 mr-2" />
      Settings
    </Button>,
    <Button key="new" size="sm" variant="default">
      <Plus className="h-4 w-4 mr-2" />
      New Item
    </Button>
  ]}
  footerLeft={                           // Optional: React element for left footer content
    <Button variant="outline" size="sm">Cancel</Button>
  }
  footerCenter={                         // Optional: React element for center footer content
    <div className="text-sm text-gray-500 dark:text-gray-400">
      Additional information
    </div>
  }
  footerRight={                          // Optional: React element for right footer content
    <Button size="sm">
      Continue
      <ArrowRight className="h-4 w-4 ml-2" />
    </Button>
  }
  className=""                           // Optional: Additional CSS classes for the card
>
  {/* Main content of the section */}
  <div className="py-6">
    Your content goes here
  </div>
</StructuredSectionCard>`;

  // For themed card example
  const themedCode = `import ThemedSectionCard from '@/components/official/themed-section-card/ThemedSectionCard';
import { Button } from '@/components/ui/button';
import { Settings, ArrowRight } from 'lucide-react';

<ThemedSectionCard
  // Theme options (choose one approach):
  theme="blue"                           // Legacy theme (rose, blue, green, purple, amber, slate)
  // OR
  mainColor="gray"                       // Main color (slate, gray, zinc, neutral, stone)
  accentColor="blue"                     // Accent color (any Tailwind color)
  // OR
  preset="primary"                       // Theme preset (default, primary, success, info, warning, danger, etc.)
  
  title="Section Title"                  // Required: Title displayed at the top of the card
  description="Optional description"     // Optional: Additional description text under the title
  headerActions={[]}                     // Optional: Same as StructuredSectionCard
  footerLeft={<Button>Cancel</Button>}   // Optional: Same as StructuredSectionCard
  footerCenter={<div>Info</div>}         // Optional: Same as StructuredSectionCard
  footerRight={<Button>Save</Button>}    // Optional: Same as StructuredSectionCard
  className=""                           // Optional: Additional CSS classes
>
  {/* Main content of the section */}
  <div className="py-6">
    Your content goes here
  </div>
</ThemedSectionCard>`;

  return (
    <ComponentDisplayWrapper
      component={component}
      code={code}
      description="A structured card layout with title, description, optional header actions, and a three-column footer. Available in standard and themed variations for different visual styles."
      className="p-0"
    >
      <Tabs defaultValue="basic" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="basic">Basic Usage</TabsTrigger>
          <TabsTrigger value="advanced">Advanced Examples</TabsTrigger>
          <TabsTrigger value="themed">Themed Cards</TabsTrigger>
        </TabsList>
        
        <TabsContent value="basic" className="mt-0">
          <div className="flex justify-center p-6">
            <BasicExample />
          </div>
        </TabsContent>
        
        <TabsContent value="advanced" className="mt-0">
          <StructuredSectionCardDemo />
        </TabsContent>
        
        <TabsContent value="themed" className="mt-0">
          <ThemedSectionCardDemo />
        </TabsContent>
      </Tabs>
    </ComponentDisplayWrapper>
  );
} 