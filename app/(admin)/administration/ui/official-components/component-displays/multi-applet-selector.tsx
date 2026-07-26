"use client";

import React from "react";
import { ComponentEntry } from "../parts/component-list";
import { ComponentDisplayWrapper } from "../component-usage";
import SmartAppListsDemo from "@/features/applet/demo/SmartAppListsDemo";

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

export default function MultiAppletSelectorDemo({
  component,
}: ComponentDisplayProps) {
  if (!component) return null;

  // Example code to show how to use the various components
  const usageCode = `// 1. SmartAppList - For displaying and selecting a single app
import SmartAppList from '@/features/applet/builder/modules/smart-parts/apps/SmartAppList';
import { CustomAppConfig } from "@/features/applet/builder/builder.types";

<SmartAppList 
  onSelect={(app: CustomAppConfig) => handleAppSelect(app)}
  onCreate={handleCreateApp}
  onRefreshComplete={handleAppRefreshComplete}
  ref={appListRef}
/>

// 2. SmartAppletList - For displaying and selecting a single applet
import SmartAppletList from '@/features/applet/builder/modules/smart-parts/applets/SmartAppletList';
import { CustomAppletConfig } from '@/features/applet/builder/builder.types';

<SmartAppletList
  onSelect={(applet: CustomAppletConfig) => handleAppletSelect(applet)}
  onCreate={handleCreateApplet}
  onRefreshComplete={handleAppletRefreshComplete}
  ref={appletListRef}
/>

// 3. MultiAppletSelector - For selecting multiple applets
import MultiAppletSelector from '@/features/applet/builder/modules/smart-parts/applets/MultiAppletSelector';

<MultiAppletSelector
  selectedApplets={selectedApplets}
  onAppletsChange={handleAppletsChange}
  onCreateApplet={handleCreateApplet}
  buttonLabel="Choose Applets"
  buttonVariant="outline"
  emptySelectionText="No applets selected"
  maxSelections={3}
/>

// 4. SmartGroupList - For displaying and selecting a single component group
import SmartGroupList from '@/features/applet/builder/modules/smart-parts/containers/SmartContainerList';
import { ComponentGroup } from '@/features/applet/builder/builder.types';

<SmartGroupList
  onSelect={(group: ComponentGroup) => handleGroupSelect(group)}
  onEdit={handleEditGroup}
  onRefresh={handleRefreshGroup}
  onDelete={handleDeleteGroup}
  onCreate={handleCreateGroup}
  onRefreshComplete={handleGroupRefreshComplete}
  ref={groupListRef}
/>

// 5. MultiGroupSelector - For selecting multiple component groups
import MultiGroupSelector from '@/features/applet/builder/modules/smart-parts/containers/MultiGroupSelector';

<MultiGroupSelector
  selectedGroups={selectedGroups}
  onGroupsChange={handleGroupsChange}
  onCreateGroup={handleCreateGroup}
  buttonLabel="Choose Groups"
  buttonVariant="outline"
  emptySelectionText="No groups selected"
/>

// 6. MultiFieldSelector - For selecting multiple fields
import MultiFieldSelector from '@/features/applet/builder/modules/smart-parts/fields/MultiFieldSelector';
import { FieldDefinition } from '@/features/applet/builder/builder.types';

<MultiFieldSelector
  selectedFields={selectedFields}
  onFieldsChange={handleFieldsChange}
  onCreateField={handleCreateField}
  buttonLabel="Choose Fields"
  buttonVariant="outline"
  emptySelectionText="No fields selected"
/>`;

  return (
    <ComponentDisplayWrapper
      component={component}
      code={usageCode}
      description="A suite of components for handling app, applet, group, and field selection and management. Includes single-selection lists, multi-selection interfaces, and wrappers with refresh and create capabilities."
    >
      <div className="w-full">
        <SmartAppListsDemo />
      </div>
    </ComponentDisplayWrapper>
  );
}
