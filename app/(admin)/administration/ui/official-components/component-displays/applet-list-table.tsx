'use client';

import React, { useState } from 'react';
import { ComponentEntry } from '../parts/component-list';
import { ComponentDisplayWrapper } from '../component-usage';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AppletListTable from '@/features/applet/builder/modules/applet-builder/AppletListTable';
import { Check, LayoutGrid } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { AppletBuilder } from '@/lib/redux/app-builder/types';

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

export default function AppletListTableDisplay({ component }: ComponentDisplayProps) {
  if (!component) return null;

  // Standard usage example
  const StandardExample = () => {
    const handleViewApplet = (id: string) => {
      console.log(`View applet: ${id}`);
    };

    const handleEditApplet = (id: string) => {
      console.log(`Edit applet: ${id}`);
    };
    
    const handleCreateApplet = () => {
      console.log('Create new applet');
    };
    
    const handleDeleteApplet = async (id: string) => {
      console.log(`Delete applet: ${id}`);
    };

    return (
      <AppletListTable 
        onAppletView={handleViewApplet} 
        onAppletEdit={handleEditApplet}
        onAppletCreate={handleCreateApplet}
        onAppletDelete={handleDeleteApplet}
        internalFetch={true}
      />
    );
  };

  // Compact example
  const CompactExample = () => {
    const handleSelectApplet = (id: string) => {
      console.log(`Selected applet: ${id}`);
    };

    return (
      <div className="max-w-3xl mx-auto">
        <AppletListTable 
          onAppletSelect={handleSelectApplet}
          hiddenColumns={["description", "slug"]}
          defaultPageSize={5}
          title="Select an Applet"
          hideStatusColumn={true}
          customSettings={{
            tableClassName: "rounded-lg border-border",
            tableHeaderClassName: "bg-gray-50 dark:bg-gray-800"
          }}
          selectLabel="Use"
          internalFetch={true}
        />
      </div>
    );
  };

  // Minimal example
  const MinimalExample = () => {
    const handleSelectApplet = (id: string) => {
      console.log(`Selected applet: ${id}`);
    };

    // Custom render for the select action
    const customSelectRender = (applet: AppletBuilder, onClick: (e: React.MouseEvent) => void) => (
      <Badge 
        className="bg-green-100 text-green-800 hover:bg-green-200 cursor-pointer dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/50"
        onClick={onClick}
      >
        <Check className="h-3 w-3" />
        Use
      </Badge>
    );

    // Now using the enhanced hideEntriesInfo option to save space in the footer
    return (
      <div className="max-w-lg mx-auto">
        <AppletListTable 
          onAppletSelect={handleSelectApplet}
          hiddenColumns={["description", "slug", "containers"]}
          defaultPageSize={3}
          title="Quick Applet Selector"
          hideStatusColumn={true}
          allowSelectAction={true}
          customSelectActionRender={customSelectRender}
          createButtonText="New Applet"
          searchPlaceholder="Find applet..."
          customSettings={{
            tableClassName: "text-sm",
            hideEntriesInfo: true
          }}
        />
      </div>
    );
  };

  // Related applets example
  const RelatedExample = () => {
    return (
      <div className="max-w-2xl mx-auto">
        <AppletListTable 
          hiddenColumns={["description"]}
          defaultPageSize={5}
          title="Related Applets"
          hideActionsColumn={true}
          hideStatusColumn={true}
          customSettings={{
            useZebraStripes: true,
            tableClassName: "text-sm",
            tableHeaderClassName: "bg-blue-50 dark:bg-blue-900/10 text-blue-800 dark:text-blue-300"
          }}
          onAppletSelect={(id) => {
            console.log(`Clicked on applet: ${id}`);
          }}
        />
      </div>
    );
  };

  // Usage examples with code
  const standardCode = `import AppletListTable from '@/features/applet/builder/modules/applet-builder/AppletListTable';

// Standard usage with full features
<AppletListTable 
  onAppletView={(id) => console.log(\`View applet: \${id}\`)} 
  onAppletEdit={(id) => console.log(\`Edit applet: \${id}\`)}
  onAppletCreate={() => console.log('Create new applet')}
  onAppletDelete={(id) => console.log(\`Delete applet: \${id}\`)}
/>`;

  const compactCode = `import AppletListTable from '@/features/applet/builder/modules/applet-builder/AppletListTable';

// Compact version with fewer columns
<AppletListTable 
  onAppletSelect={(id) => console.log(\`Selected applet: \${id}\`)}
  hiddenColumns={["description", "slug"]}
  defaultPageSize={5}
  title="Select an Applet"
  hideStatusColumn={true}
  customSettings={{
    tableClassName: "rounded-lg border-border",
    tableHeaderClassName: "bg-gray-50 dark:bg-gray-800"
  }}
  selectLabel="Use"
/>`;

  const minimalCode = `import AppletListTable from '@/features/applet/builder/modules/applet-builder/AppletListTable';
import { Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { AppletBuilder } from '@/lib/redux/app-builder/types';

// Custom render function for the select action
const customSelectRender = (applet: AppletBuilder, onClick: (e: React.MouseEvent) => void) => (
  <Badge 
    className="bg-green-100 text-green-800 hover:bg-green-200 cursor-pointer dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/50"
    onClick={onClick}
  >
    <Check className="h-3 w-3" />
    Use
  </Badge>
);

// Minimal selector with custom action rendering
<AppletListTable 
  onAppletSelect={(id) => console.log(\`Selected applet: \${id}\`)}
  hiddenColumns={["description", "slug", "containers"]}
  defaultPageSize={3}
  title="Quick Applet Selector"
  hideStatusColumn={true}
  allowSelectAction={true}
  customSelectActionRender={customSelectRender}
  createButtonText="New Applet"
  searchPlaceholder="Find applet..."
  customSettings={{
    tableClassName: "text-sm",
    hideEntriesInfo: true
  }}
  internalFetch={true}
/>`;

  const relatedCode = `import AppletListTable from '@/features/applet/builder/modules/applet-builder/AppletListTable';

// Read-only related applets list
<AppletListTable 
  hiddenColumns={["description"]}
  defaultPageSize={5}
  title="Related Applets"
  hideActionsColumn={true}
  hideStatusColumn={true}
  customSettings={{
    useZebraStripes: true,
    tableClassName: "text-sm",
    tableHeaderClassName: "bg-blue-50 dark:bg-blue-900/10 text-blue-800 dark:text-blue-300"
  }}
  onAppletSelect={(id) => console.log(\`Clicked on applet: \${id}\`)}
/>`;

  const [activeTab, setActiveTab] = useState('standard');
  
  // Get the appropriate code example based on the active tab
  const getActiveCode = () => {
    switch(activeTab) {
      case 'standard': return standardCode;
      case 'compact': return compactCode;
      case 'minimal': return minimalCode;
      case 'related': return relatedCode;
      default: return standardCode;
    }
  };

  return (
    <ComponentDisplayWrapper
      component={component}
      code={getActiveCode()}
      description="A flexible and customizable table component for displaying and interacting with applets. Supports multiple configurations from full-featured to minimal."
    >
      <div className="w-full">
        <Tabs defaultValue="standard" className="w-full" onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-4 mb-6">
            <TabsTrigger value="standard">Standard</TabsTrigger>
            <TabsTrigger value="compact">Compact</TabsTrigger>
            <TabsTrigger value="minimal">Minimal</TabsTrigger>
            <TabsTrigger value="related">Related</TabsTrigger>
          </TabsList>
          
          <TabsContent value="standard" className="w-full">
            <StandardExample />
          </TabsContent>
          
          <TabsContent value="compact" className="w-full">
            <CompactExample />
          </TabsContent>
          
          <TabsContent value="minimal" className="w-full">
            <MinimalExample />
          </TabsContent>
          
          <TabsContent value="related" className="w-full">
            <RelatedExample />
          </TabsContent>
        </Tabs>
      </div>
    </ComponentDisplayWrapper>
  );
} 