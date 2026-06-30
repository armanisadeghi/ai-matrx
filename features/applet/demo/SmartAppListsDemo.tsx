"use client";
import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BoxIcon,
  FilePlus,
  Code,
  Search,
  Settings,
  PlayIcon,
  LayoutGrid,
  FormInput,
} from "lucide-react";

import SmartAppList, {
  type SmartAppListRefType,
} from "@/features/applet/builder/modules/smart-parts/apps/SmartAppList";
import SmartAppListWrapper from "@/features/applet/builder/modules/smart-parts/apps/SmartAppListWrapper";
import AppSelectorOverlay from "@/features/applet/builder/modules/smart-parts/apps/AppSelectorOverlay";
import SmartAppletList, {
  type SmartAppletListRefType,
} from "@/features/applet/builder/modules/smart-parts/applets/SmartAppletList";
import SmartAppletListWrapper from "@/features/applet/builder/modules/smart-parts/applets/SmartAppletListWrapper";
import AppletSelectorOverlay from "@/features/applet/builder/modules/smart-parts/applets/AppletSelectorOverlay";
import MultiAppletSelector from "@/features/applet/builder/modules/smart-parts/applets/MultiAppletSelector";
import MultiGroupSelector from "@/features/applet/builder/modules/smart-parts/containers/MultiGroupSelector";
import MultiFieldSelector from "@/features/applet/builder/modules/smart-parts/fields/MultiFieldSelector";
import GroupSelectorOverlay from "@/features/applet/builder/modules/smart-parts/containers/GroupSelectorOverlay";
import FieldSelectorOverlay from "@/features/applet/builder/modules/smart-parts/fields/FieldSelectorOverlay";
import SmartGroupList, {
  type SmartContainerListRefType,
} from "@/features/applet/builder/modules/smart-parts/containers/SmartContainerList";
import SmartGroupListWrapper from "@/features/applet/builder/modules/smart-parts/containers/SmartGroupListWrapper";
import SmartFieldsList, {
  type SmartFieldsListRefType,
} from "@/features/applet/builder/modules/smart-parts/fields/SmartFieldsList";
import SmartFieldsListWrapper from "@/features/applet/builder/modules/smart-parts/fields/SmartFieldsListWrapper";

// Import types
import {
  ComponentGroup,
  CustomAppConfig,
  CustomAppletConfig,
  FieldDefinition,
} from "@/types/customAppTypes";

/**
 * A comprehensive demo that showcases both App and Applet components:
 * - SmartAppList and SmartAppletList
 * - Wrapper components for both
 * - Selector overlays for both
 * - Comparison views
 */
const SmartAppListsDemo = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("comparison");
  const [isAppWrapperOpen, setIsAppWrapperOpen] = useState(false);
  const [isAppletWrapperOpen, setIsAppletWrapperOpen] = useState(false);
  const [isGroupWrapperOpen, setIsGroupWrapperOpen] = useState(false);
  const [isFieldWrapperOpen, setIsFieldWrapperOpen] = useState(false);
  const [showComparison, setShowComparison] = useState(true);

  // Refs for programmatic refresh
  const appListRef = useRef<SmartAppListRefType | null>(null);
  const appletListRef = useRef<SmartAppletListRefType | null>(null);
  const groupListRef = useRef<SmartContainerListRefType | null>(null);
  const fieldListRef = useRef<SmartFieldsListRefType | null>(null);

  // MultiAppletSelector state
  const [selectedApplets, setSelectedApplets] = useState<CustomAppletConfig[]>(
    [],
  );
  const [buttonVariant, setButtonVariant] = useState<string>("outline");
  const [buttonLabel, setButtonLabel] = useState<string>("Choose Applets");
  const [customEmptyText, setCustomEmptyText] = useState<string>(
    "No applets selected",
  );
  const [maxSelections, setMaxSelections] = useState<number | undefined>(
    undefined,
  );
  const [workflowSelectedApplets, setWorkflowSelectedApplets] = useState<
    CustomAppletConfig[]
  >([]);
  const [dashboardSelectedApplets, setDashboardSelectedApplets] = useState<
    CustomAppletConfig[]
  >([]);

  // MultiGroupSelector state
  const [selectedGroups, setSelectedGroups] = useState<ComponentGroup[]>([]);

  // MultiFieldSelector state
  const [selectedFields, setSelectedFields] = useState<FieldDefinition[]>([]);

  // Handle app selection
  const handleAppSelect = (app: CustomAppConfig) => {
    toast({
      title: "App Selected",
      description: `You selected "${app.name}"`,
      duration: 3000,
    });
  };

  // Handle applet selection
  const handleAppletSelect = (applet: CustomAppletConfig) => {
    toast({
      title: "Applet Selected",
      description: `You selected "${applet.name}"`,
      duration: 3000,
    });
  };

  // Handle multiple applet selection
  const handleAppletsChange = (applets: CustomAppletConfig[]) => {
    setSelectedApplets(applets);
    toast({
      title: "Selection Updated",
      description: `Selected ${applets.length} applet${applets.length !== 1 ? "s" : ""}`,
      duration: 1500,
    });
  };

  // Handle creation
  const handleCreateApp = () => {
    toast({
      title: "Create New App",
      description: "Opening app creation flow...",
      duration: 3000,
    });
  };

  const handleCreateApplet = () => {
    toast({
      title: "Create New Applet",
      description: "Opening applet creation flow...",
      duration: 3000,
    });
  };

  // Handle refresh completion
  const handleAppRefreshComplete = (apps: CustomAppConfig[]) => {
    toast({
      title: "App Refresh Complete",
      description: `Loaded ${apps.length} apps`,
      duration: 3000,
    });
  };

  const handleAppletRefreshComplete = (applets: CustomAppletConfig[]) => {
    toast({
      title: "Applet Refresh Complete",
      description: `Loaded ${applets.length} applets`,
      duration: 3000,
    });
  };

  // Handle manual refresh button click
  const handleAppManualRefresh = () => {
    if (
      appListRef.current &&
      typeof appListRef.current.refresh === "function"
    ) {
      appListRef.current.refresh();
    }
  };

  const handleAppletManualRefresh = () => {
    if (
      appletListRef.current &&
      typeof appletListRef.current.refresh === "function"
    ) {
      appletListRef.current.refresh();
    }
  };

  // Reset selections for multi-select
  const handleReset = () => {
    setSelectedApplets([]);
    toast({
      title: "Selection Reset",
      description: "All selections have been cleared",
      duration: 1500,
    });
  };

  // Handle group selection
  const handleGroupSelect = (group: ComponentGroup) => {
    toast({
      title: "Group Selected",
      description: `You selected "${group.label}"`,
      duration: 3000,
    });
    console.log("Selected group:", group);
  };

  // Handle field selection
  const handleFieldSelect = (field: FieldDefinition) => {
    toast({
      title: "Field Selected",
      description: `You selected "${field.label}"`,
      duration: 3000,
    });
    console.log("Selected field:", field);
  };

  // Handle edit actions
  const handleEditGroup = (group: ComponentGroup) => {
    toast({
      title: "Edit Group",
      description: `Editing group "${group.label}"`,
      duration: 3000,
    });
  };

  const handleEditField = (field: FieldDefinition) => {
    toast({
      title: "Edit Field",
      description: `Editing field "${field.label}"`,
      duration: 3000,
    });
  };

  // Handle refresh actions for individual items
  const handleRefreshGroup = (group: ComponentGroup) => {
    toast({
      title: "Group Refresh Triggered",
      description: `Refreshing fields for "${group.label}"`,
      duration: 2000,
    });
  };

  const handleRefreshField = (field: FieldDefinition) => {
    toast({
      title: "Field Refresh Triggered",
      description: `Refreshing field "${field.label}"`,
      duration: 2000,
    });
  };

  // Handle delete actions
  const handleDeleteGroup = (group: ComponentGroup) => {
    toast({
      title: "Delete Confirmation",
      description: `Delete group "${group.label}"?`,
      duration: 2000,
    });
  };

  const handleDeleteField = (field: FieldDefinition) => {
    toast({
      title: "Delete Confirmation",
      description: `Delete field "${field.label}"?`,
      duration: 2000,
    });
  };

  // Handle multiple group selection
  const handleGroupsChange = (groups: ComponentGroup[]) => {
    setSelectedGroups(groups);
    toast({
      title: "Groups Selection Updated",
      description: `Selected ${groups.length} group${groups.length !== 1 ? "s" : ""}`,
      duration: 1500,
    });
    console.log("Selected groups:", groups);
  };

  // Handle multiple field selection
  const handleFieldsChange = (fields: FieldDefinition[]) => {
    setSelectedFields(fields);
    toast({
      title: "Fields Selection Updated",
      description: `Selected ${fields.length} field${fields.length !== 1 ? "s" : ""}`,
      duration: 1500,
    });
    console.log("Selected fields:", fields);
  };

  // Handle group creation
  const handleCreateGroup = () => {
    toast({
      title: "Create New Group",
      description: "Opening group creation flow...",
      duration: 3000,
    });
  };

  // Handle field creation
  const handleCreateField = () => {
    toast({
      title: "Create New Field",
      description: "Opening field creation flow...",
      duration: 3000,
    });
  };

  // Handle group refresh completion
  const handleGroupRefreshComplete = (groups: ComponentGroup[]) => {
    toast({
      title: "Group Refresh Complete",
      description: `Loaded ${groups.length} groups`,
      duration: 3000,
    });
  };

  // Handle field refresh completion
  const handleFieldRefreshComplete = (fields: FieldDefinition[]) => {
    toast({
      title: "Field Refresh Complete",
      description: `Loaded ${fields.length} fields`,
      duration: 3000,
    });
  };

  // Reset selections for groups
  const handleResetGroups = () => {
    setSelectedGroups([]);
    toast({
      title: "Groups Reset",
      description: "All group selections have been cleared",
      duration: 1500,
    });
  };

  // Reset selections for fields
  const handleResetFields = () => {
    setSelectedFields([]);
    toast({
      title: "Fields Reset",
      description: "All field selections have been cleared",
      duration: 1500,
    });
  };

  return (
    <div className="h-full w-full bg-gray-100 dark:bg-gray-800">
      <Card className="border-gray-200 dark:border-gray-700 shadow-lg p-0">
        <CardHeader>
          <CardTitle className="text-2xl bg-gradient-to-r from-blue-600 to-emerald-600 bg-clip-text text-transparent dark:from-blue-400 dark:to-emerald-400 p-4">
            Smart Components Demo
          </CardTitle>
          <CardDescription>
            Explore our comprehensive suite of App and Applet components
          </CardDescription>
        </CardHeader>

        <CardContent className="p-6">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-10 mb-6">
              <TabsTrigger value="comparison">Comparison</TabsTrigger>
              <TabsTrigger value="apps">Apps</TabsTrigger>
              <TabsTrigger value="applets">Applets</TabsTrigger>
              <TabsTrigger value="containers">Containers</TabsTrigger>
              <TabsTrigger value="fields">Fields</TabsTrigger>
              <TabsTrigger value="multi-applets">Multi Applets</TabsTrigger>
              <TabsTrigger value="multi-groups">Multi Groups</TabsTrigger>
              <TabsTrigger value="multi-fields">Multi Fields</TabsTrigger>
              <TabsTrigger value="wrappers">Wrappers</TabsTrigger>
              <TabsTrigger value="overlays">Overlays</TabsTrigger>
            </TabsList>

            {/* Tab 1: Comparison View */}
            <TabsContent value="comparison" className="rounded-lg">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-medium">Side-by-Side Comparison</h3>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="side-by-side"
                    checked={showComparison}
                    onCheckedChange={setShowComparison}
                  />
                  <Label htmlFor="side-by-side">
                    {showComparison ? "Side by Side" : "Stacked"}
                  </Label>
                </div>
              </div>

              <div
                className={`grid ${showComparison ? "grid-cols-1 md:grid-cols-2 gap-6" : "grid-cols-1 gap-8"}`}
              >
                {/* Apps */}
                <div className="space-y-4">
                  <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                    <h4 className="text-blue-600 dark:text-blue-400 font-medium mb-4 flex items-center">
                      <BoxIcon className="mr-2 h-5 w-5" />
                      Apps
                    </h4>
                    <SmartAppList
                      ref={appListRef}
                      onSelectApp={handleAppSelect}
                      showCreateButton={true}
                      onCreateApp={handleCreateApp}
                      onRefreshComplete={handleAppRefreshComplete}
                      appIds={[]}
                    />
                  </div>
                </div>

                {/* Applets */}
                <div className="space-y-4">
                  <div className="p-4 bg-emerald-50 dark:bg-emerald-950 rounded-lg border border-emerald-200 dark:border-emerald-800">
                    <h4 className="text-emerald-600 dark:text-emerald-400 font-medium mb-4 flex items-center">
                      <PlayIcon className="mr-2 h-5 w-5" />
                      Applets
                    </h4>
                    <SmartAppletList
                      ref={appletListRef}
                      onSelectApplet={handleAppletSelect}
                      showCreateButton={true}
                      onCreateApplet={handleCreateApplet}
                      onRefreshComplete={handleAppletRefreshComplete}
                    />
                  </div>
                </div>

                {/* Containers */}
                <div className="space-y-4">
                  <div className="p-4 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200 dark:border-amber-800">
                    <h4 className="text-amber-600 dark:text-amber-400 font-medium mb-4 flex items-center">
                      <LayoutGrid className="mr-2 h-5 w-5" />
                      Containers
                    </h4>
                    <SmartGroupList
                      ref={groupListRef}
                      onSelectGroup={handleGroupSelect}
                      onCreateGroup={handleCreateGroup}
                      onRefreshGroup={handleRefreshGroup}
                      onDeleteGroup={handleDeleteGroup}
                      onEditGroup={handleEditGroup}
                      onRefreshComplete={handleGroupRefreshComplete}
                      showCreateButton={true}
                      className="grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                      groupIds={[]}
                    />
                  </div>
                </div>

                {/* Fields */}
                <div className="space-y-4">
                  <div className="p-4 bg-purple-50 dark:bg-purple-950 rounded-lg border border-purple-200 dark:border-purple-800">
                    <h4 className="text-purple-600 dark:text-purple-400 font-medium mb-4 flex items-center">
                      <FormInput className="mr-2 h-5 w-5" />
                      Fields
                    </h4>
                    <SmartFieldsList
                      ref={fieldListRef}
                      onSelectField={handleFieldSelect}
                      onCreateField={handleCreateField}
                      onDeleteField={handleDeleteField}
                      onEditField={handleEditField}
                      onDuplicateField={() => {}}
                      onRefreshComplete={handleFieldRefreshComplete}
                      showCreateButton={true}
                      className="grid-cols-1 md:grid-cols-2 lg:grid-cols-2"
                      fieldIds={[]}
                      onSelectionChange={() => {}}
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Tab 2: Apps */}
            <TabsContent value="apps" className="rounded-lg">
              <div className="flex justify-between mb-6">
                <h3 className="text-lg font-medium text-blue-600 dark:text-blue-400">
                  SmartAppList Component
                </h3>
                <Button
                  onClick={handleAppManualRefresh}
                  className="bg-blue-500 hover:bg-blue-600"
                >
                  Refresh Apps
                </Button>
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <SmartAppList
                  ref={appListRef}
                  onSelectApp={handleAppSelect}
                  onCreateApp={handleCreateApp}
                  onRefreshComplete={handleAppRefreshComplete}
                  appIds={[]}
                />
              </div>

              <div className="mt-6 text-sm text-gray-500 dark:text-gray-400">
                <p>
                  This component displays apps with search, sorting, and
                  filtering capabilities.
                </p>
              </div>
            </TabsContent>

            {/* Tab 3: Applets */}
            <TabsContent value="applets" className="rounded-lg">
              <div className="flex justify-between mb-6">
                <h3 className="text-lg font-medium text-emerald-600 dark:text-emerald-400">
                  SmartAppletList Component
                </h3>
                <Button
                  onClick={handleAppletManualRefresh}
                  className="bg-emerald-500 hover:bg-emerald-600"
                >
                  Refresh Applets
                </Button>
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <SmartAppletList
                  ref={appletListRef}
                  onSelectApplet={handleAppletSelect}
                  onCreateApplet={handleCreateApplet}
                  onRefreshComplete={handleAppletRefreshComplete}
                />
              </div>
            </TabsContent>

            {/* Tab 4: Containers */}
            <TabsContent value="containers" className="rounded-lg">
              <div className="flex justify-between mb-6">
                <h3 className="text-lg font-medium text-amber-600 dark:text-amber-400 flex items-center">
                  <LayoutGrid className="mr-2 h-5 w-5" />
                  SmartGroupList Component
                </h3>
                <Button
                  onClick={() => groupListRef.current?.refresh?.()}
                  className="bg-amber-500 hover:bg-amber-600"
                >
                  Refresh Groups
                </Button>
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <SmartGroupList
                  ref={groupListRef}
                  onSelectGroup={handleGroupSelect}
                  onCreateGroup={handleCreateGroup}
                  onRefreshGroup={handleRefreshGroup}
                  onDeleteGroup={handleDeleteGroup}
                  onEditGroup={handleEditGroup}
                  onRefreshComplete={handleGroupRefreshComplete}
                  showCreateButton={true}
                  className="grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                  groupIds={[]}
                />
              </div>

              <div className="mt-6 text-sm text-gray-500 dark:text-gray-400">
                <p>
                  This component displays field groups with search, sorting, and
                  filtering capabilities.
                </p>
              </div>
            </TabsContent>

            {/* Tab 5: Fields */}
            <TabsContent value="fields" className="rounded-lg">
              <div className="flex justify-between mb-6">
                <h3 className="text-lg font-medium text-purple-600 dark:text-purple-400 flex items-center">
                  <FormInput className="mr-2 h-5 w-5" />
                  SmartFieldsList Component
                </h3>
                <Button
                  onClick={() => fieldListRef.current?.refresh?.()}
                  className="bg-purple-500 hover:bg-purple-600"
                >
                  Refresh Fields
                </Button>
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <SmartFieldsList
                  ref={fieldListRef}
                  onSelectField={handleFieldSelect}
                  onCreateField={handleCreateField}
                  onDeleteField={handleDeleteField}
                  onEditField={handleEditField}
                  onDuplicateField={() => {}}
                  onRefreshComplete={handleFieldRefreshComplete}
                  showCreateButton={true}
                  className="grid-cols-1 md:grid-cols-2 lg:grid-cols-2"
                  fieldIds={[]}
                  onSelectionChange={() => {}}
                />
              </div>

              <div className="mt-6 text-sm text-gray-500 dark:text-gray-400">
                <p>
                  This component displays form fields with search, sorting, and
                  filtering capabilities.
                </p>
              </div>
            </TabsContent>

            {/* Tab 6: Multi Applets */}
            <TabsContent value="multi-applets" className="rounded-lg">
              <Tabs defaultValue="basic" className="w-full">
                <TabsList className="grid w-full grid-cols-3 mb-6">
                  <TabsTrigger value="basic">Basic Usage</TabsTrigger>
                  <TabsTrigger value="advanced">Configuration</TabsTrigger>
                  <TabsTrigger value="examples">
                    Real-World Examples
                  </TabsTrigger>
                </TabsList>

                {/* Basic Usage */}
                <TabsContent value="basic" className="space-y-6">
                  <div className="border rounded-lg p-6 bg-gray-50 dark:bg-gray-900">
                    <h3 className="text-lg font-medium mb-4">
                      Basic MultiAppletSelector
                    </h3>

                    <div className="mb-6">
                      <MultiAppletSelector
                        selectedApplets={selectedApplets}
                        onAppletsChange={handleAppletsChange}
                        onCreateApplet={handleCreateApplet}
                      />
                    </div>

                    <div className="p-4 bg-textured rounded-lg border-border">
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="font-medium text-sm">
                          Selected Applets ({selectedApplets.length})
                        </h4>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleReset}
                          disabled={selectedApplets.length === 0}
                        >
                          Reset Selection
                        </Button>
                      </div>

                      {selectedApplets.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                          No applets selected. Click the button above to select
                          applets.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {selectedApplets.map((applet) => (
                            <li
                              key={applet.id}
                              className="text-sm p-2 bg-gray-50 dark:bg-gray-700 rounded-md"
                            >
                              <span className="font-medium">{applet.name}</span>
                              {applet.description && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  {applet.description}
                                </p>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </TabsContent>

                {/* Advanced Configuration */}
                <TabsContent value="advanced" className="space-y-6">
                  <div className="border rounded-lg p-6">
                    <h3 className="text-lg font-medium mb-4">
                      Configurable Options
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="buttonLabel">Button Label</Label>
                          <Input
                            id="buttonLabel"
                            value={buttonLabel}
                            onChange={(e) => setButtonLabel(e.target.value)}
                            className="mt-1"
                          />
                        </div>

                        <div>
                          <Label htmlFor="buttonVariant">Button Variant</Label>
                          <Select
                            value={buttonVariant}
                            onValueChange={setButtonVariant}
                          >
                            <SelectTrigger id="buttonVariant" className="mt-1">
                              <SelectValue placeholder="Select variant" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="default">Default</SelectItem>
                              <SelectItem value="outline">Outline</SelectItem>
                              <SelectItem value="secondary">
                                Secondary
                              </SelectItem>
                              <SelectItem value="ghost">Ghost</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label htmlFor="emptyText">
                            Empty Selection Text
                          </Label>
                          <Input
                            id="emptyText"
                            value={customEmptyText}
                            onChange={(e) => setCustomEmptyText(e.target.value)}
                            className="mt-1"
                          />
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="maxSelections">Max Selections</Label>
                          <div className="flex items-center space-x-2 mt-1">
                            <Input
                              id="maxSelections"
                              type="number"
                              value={maxSelections || ""}
                              onChange={(e) => {
                                const val = e.target.value
                                  ? parseInt(e.target.value)
                                  : undefined;
                                setMaxSelections(val);
                              }}
                            />
                            <div className="flex items-center space-x-1">
                              <Switch
                                id="limitToggle"
                                checked={maxSelections !== undefined}
                                onCheckedChange={(checked) => {
                                  setMaxSelections(checked ? 3 : undefined);
                                }}
                              />
                              <Label htmlFor="limitToggle" className="text-sm">
                                Limit
                              </Label>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <Separator className="my-6" />

                    <div className="mt-6">
                      <h4 className="font-medium mb-3">Configured Component</h4>
                      <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border-border">
                        <MultiAppletSelector
                          selectedApplets={selectedApplets}
                          onAppletsChange={handleAppletsChange}
                          onCreateApplet={handleCreateApplet}
                          buttonLabel={buttonLabel}
                          buttonVariant={buttonVariant as any}
                          maxSelections={maxSelections}
                          emptySelectionText={customEmptyText}
                        />
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* Examples */}
                <TabsContent value="examples" className="space-y-6">
                  <div className="border rounded-lg p-6">
                    <h3 className="text-lg font-medium mb-4">
                      Real-World Examples
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
                      Here are some practical implementations showing how the
                      MultiAppletSelector can be used in different scenarios.
                    </p>

                    {/* Example 1: Workflow Builder */}
                    <div className="bg-textured rounded-lg border-border p-4 mb-6">
                      <div className="flex items-center mb-3">
                        <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-md mr-3">
                          <PlayIcon className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />
                        </div>
                        <h4 className="font-medium">Workflow Builder</h4>
                      </div>

                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                        Create automated workflows by selecting applets that
                        will run in sequence.
                      </p>

                      <div className="space-y-4">
                        <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                          <MultiAppletSelector
                            selectedApplets={workflowSelectedApplets}
                            onAppletsChange={setWorkflowSelectedApplets}
                            buttonLabel="Add Workflow Step"
                            buttonVariant="outline"
                            buttonClassName="border-emerald-500 text-emerald-500"
                            emptySelectionText="No workflow steps defined"
                            dialogTitle="Select Workflow Steps"
                            onCreateApplet={handleCreateApplet}
                          />
                        </div>

                        {workflowSelectedApplets.length > 0 && (
                          <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                            <h5 className="text-sm font-medium mb-2">
                              Workflow Preview
                            </h5>
                            <div className="space-y-2">
                              {workflowSelectedApplets.map((applet, index) => (
                                <div
                                  key={applet.id}
                                  className="flex items-center p-2 bg-textured rounded-md border-border"
                                >
                                  <div className="flex items-center justify-center h-6 w-6 bg-emerald-500 dark:bg-emerald-600 rounded-full text-white text-xs font-medium mr-3">
                                    {index + 1}
                                  </div>
                                  <span>{applet.name}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Example 2: Dashboard Builder */}
                    <div className="bg-textured rounded-lg border-border p-4 mb-6">
                      <div className="flex items-center mb-3">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-md mr-3">
                          <BoxIcon className="h-5 w-5 text-blue-500 dark:text-blue-400" />
                        </div>
                        <h4 className="font-medium">Dashboard Builder</h4>
                      </div>

                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                        Create a custom dashboard by selecting applets to
                        display as widgets.
                      </p>

                      <div className="space-y-4">
                        <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                          <MultiAppletSelector
                            selectedApplets={dashboardSelectedApplets}
                            onAppletsChange={setDashboardSelectedApplets}
                            buttonLabel="Add Dashboard Widgets"
                            buttonVariant="default"
                            buttonClassName="bg-blue-500 hover:bg-blue-600 text-white"
                            maxSelections={4}
                            emptySelectionText="No widgets selected"
                            dialogTitle="Select Dashboard Widgets"
                            onCreateApplet={handleCreateApplet}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </TabsContent>

            {/* Tab 7: Multi Groups */}
            <TabsContent value="multi-groups" className="rounded-lg">
              <div className="flex justify-between mb-6">
                <h3 className="text-lg font-medium text-amber-600 dark:text-amber-400 flex items-center">
                  <LayoutGrid className="mr-2 h-5 w-5" />
                  MultiGroupSelector Component
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetGroups}
                  disabled={selectedGroups.length === 0}
                  className="border-amber-500 text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                >
                  Reset Selection
                </Button>
              </div>

              <div className="p-4 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200 dark:border-amber-800 mb-4">
                <h4 className="text-sm font-medium mb-3">
                  Basic Multi-Group Selector
                </h4>
                <MultiGroupSelector
                  selectedGroups={selectedGroups}
                  onGroupsChange={handleGroupsChange}
                  onCreateGroup={handleCreateGroup}
                  onRefreshGroup={handleRefreshGroup}
                  buttonLabel="Select Groups"
                  buttonVariant="outline"
                  buttonClassName="border-amber-500 text-amber-500"
                  dialogTitle="Select Field Groups"
                  emptySelectionText="No groups selected yet"
                />
              </div>

              <div className="p-4 bg-textured rounded-lg border-border">
                <h4 className="font-medium text-sm mb-3 flex items-center">
                  <LayoutGrid className="h-4 w-4 mr-1 text-amber-500" />
                  Selected Groups ({selectedGroups.length})
                </h4>

                {selectedGroups.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                    No groups selected. Use the selector above to choose groups.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {selectedGroups.map((group) => (
                      <div
                        key={group.id}
                        className="text-sm p-3 bg-amber-50 dark:bg-amber-900/20 rounded-md border border-amber-200 dark:border-amber-800"
                      >
                        <div className="flex items-center">
                          <span className="bg-amber-500 w-2 h-2 rounded-full mr-2"></span>
                          <span className="font-medium">{group.label}</span>
                        </div>
                        {group.description && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-4">
                            {group.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Tab 8: Multi Fields */}
            <TabsContent value="multi-fields" className="rounded-lg">
              <div className="flex justify-between mb-6">
                <h3 className="text-lg font-medium text-purple-600 dark:text-purple-400 flex items-center">
                  <FormInput className="mr-2 h-5 w-5" />
                  MultiFieldSelector Component
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetFields}
                  disabled={selectedFields.length === 0}
                  className="border-purple-500 text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                >
                  Reset Selection
                </Button>
              </div>

              <div className="p-4 bg-purple-50 dark:bg-purple-950 rounded-lg border border-purple-200 dark:border-purple-800 mb-4">
                <h4 className="text-sm font-medium mb-3">
                  Basic Multi-Field Selector
                </h4>
                <MultiFieldSelector
                  selectedFields={selectedFields}
                  onFieldsChange={handleFieldsChange}
                  onCreateField={handleCreateField}
                  buttonLabel="Select Fields"
                  buttonVariant="outline"
                  buttonClassName="border-purple-500 text-purple-500"
                  dialogTitle="Select Form Fields"
                  emptySelectionText="No fields selected yet"
                  onEditField={handleEditField}
                  onDuplicateField={() => {}}
                />
              </div>

              <div className="p-4 bg-textured rounded-lg border-border">
                <h4 className="font-medium text-sm mb-3 flex items-center">
                  <FormInput className="h-4 w-4 mr-1 text-purple-500" />
                  Selected Fields ({selectedFields.length})
                </h4>

                {selectedFields.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                    No fields selected. Use the selector above to choose fields.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {selectedFields.map((field) => (
                      <div
                        key={field.id}
                        className="text-sm p-3 bg-purple-50 dark:bg-purple-900/20 rounded-md border border-purple-200 dark:border-purple-800"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center">
                            <span className="bg-purple-500 w-2 h-2 rounded-full mr-2"></span>
                            <span className="font-medium">{field.label}</span>
                          </div>
                          <span className="text-xs px-2 py-1 bg-purple-100 dark:bg-purple-800 text-purple-700 dark:text-purple-300 rounded-full">
                            {field.component || "Unknown"}
                          </span>
                        </div>
                        {field.description && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-4">
                            {field.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Tab 9: Wrappers */}
            <TabsContent value="wrappers" className="rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* App Wrapper */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-base font-medium text-blue-600 dark:text-blue-400">
                      App Wrapper
                    </h3>
                    <Button
                      onClick={() => setIsAppWrapperOpen(true)}
                      size="sm"
                      className="bg-blue-500 hover:bg-blue-600"
                    >
                      Open App Overlay
                    </Button>
                  </div>

                  <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800 h-64 overflow-y-auto">
                    <SmartAppListWrapper
                      isOverlay={false}
                      onSelectApp={handleAppSelect}
                      onCreateApp={handleCreateApp}
                      onRefreshComplete={handleAppRefreshComplete}
                    />
                  </div>

                  {/* Overlay mode */}
                  <SmartAppListWrapper
                    isOverlay={true}
                    isOpen={isAppWrapperOpen}
                    onClose={() => setIsAppWrapperOpen(false)}
                    onSelectApp={handleAppSelect}
                    onCreateApp={handleCreateApp}
                    onRefreshComplete={handleAppRefreshComplete}
                  />
                </div>

                {/* Applet Wrapper */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-base font-medium text-emerald-600 dark:text-emerald-400">
                      Applet Wrapper
                    </h3>
                    <Button
                      onClick={() => setIsAppletWrapperOpen(true)}
                      size="sm"
                      className="bg-emerald-500 hover:bg-emerald-600"
                    >
                      Open Applet Overlay
                    </Button>
                  </div>

                  <div className="p-4 bg-emerald-50 dark:bg-emerald-950 rounded-lg border border-emerald-200 dark:border-emerald-800 h-64 overflow-y-auto">
                    <SmartAppletListWrapper
                      isOverlay={false}
                      onSelectApplet={handleAppletSelect}
                      onCreateApplet={handleCreateApplet}
                      onRefreshComplete={handleAppletRefreshComplete}
                    />
                  </div>

                  {/* Overlay mode */}
                  <SmartAppletListWrapper
                    isOverlay={true}
                    isOpen={isAppletWrapperOpen}
                    onClose={() => setIsAppletWrapperOpen(false)}
                    onSelectApplet={handleAppletSelect}
                    onCreateApplet={handleCreateApplet}
                    onRefreshComplete={handleAppletRefreshComplete}
                  />
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-base font-medium text-amber-600 dark:text-amber-400 flex items-center">
                      <LayoutGrid className="mr-2 h-5 w-5" />
                      Group Wrapper
                    </h3>
                    <Button
                      onClick={() => setIsGroupWrapperOpen(true)}
                      size="sm"
                      className="bg-amber-500 hover:bg-amber-600 text-white"
                    >
                      Open Group Overlay
                    </Button>
                  </div>

                  <div className="p-4 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200 dark:border-amber-800 h-64 overflow-y-auto">
                    <SmartGroupListWrapper
                      isOverlay={false}
                      onSelectGroup={handleGroupSelect}
                      onCreateGroup={handleCreateGroup}
                      onRefreshGroup={handleRefreshGroup}
                      onDeleteGroup={handleDeleteGroup}
                      onEditGroup={handleEditGroup}
                      onRefreshComplete={handleGroupRefreshComplete}
                    />
                  </div>

                  {/* Overlay mode */}
                  <SmartGroupListWrapper
                    isOverlay={true}
                    isOpen={isGroupWrapperOpen}
                    onClose={() => setIsGroupWrapperOpen(false)}
                    onSelectGroup={handleGroupSelect}
                    onCreateGroup={handleCreateGroup}
                    onRefreshGroup={handleRefreshGroup}
                    onDeleteGroup={handleDeleteGroup}
                    onEditGroup={handleEditGroup}
                    onRefreshComplete={handleGroupRefreshComplete}
                  />
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-base font-medium text-purple-600 dark:text-purple-400 flex items-center">
                      <FormInput className="mr-2 h-5 w-5" />
                      Field Wrapper
                    </h3>
                    <Button
                      onClick={() => setIsFieldWrapperOpen(true)}
                      size="sm"
                      className="bg-purple-500 hover:bg-purple-600 text-white"
                    >
                      Open Field Overlay
                    </Button>
                  </div>

                  <div className="p-4 bg-purple-50 dark:bg-purple-950 rounded-lg border border-purple-200 dark:border-purple-800 h-64 overflow-y-auto">
                    <SmartFieldsListWrapper
                      isOverlay={false}
                      onSelectField={handleFieldSelect}
                      onCreateField={handleCreateField}
                      onDeleteField={handleDeleteField}
                      onEditField={handleEditField}
                      onDuplicateField={() => {}}
                      onRefreshComplete={handleFieldRefreshComplete}
                    />
                  </div>

                  {/* Overlay mode */}
                  <SmartFieldsListWrapper
                    isOverlay={true}
                    isOpen={isFieldWrapperOpen}
                    onClose={() => setIsFieldWrapperOpen(false)}
                    onSelectField={handleFieldSelect}
                    onCreateField={handleCreateField}
                    onDeleteField={handleDeleteField}
                    onEditField={handleEditField}
                    onDuplicateField={() => {}}
                    onRefreshComplete={handleFieldRefreshComplete}
                  />
                </div>
              </div>
            </TabsContent>

            {/* Tab 10: Overlays */}
            <TabsContent value="overlays" className="rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* App Selector Overlay */}
                <div className="space-y-4">
                  <h3 className="text-base font-medium text-blue-600 dark:text-blue-400">
                    App Selector Overlay
                  </h3>

                  <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                    <div className="space-y-4">
                      {/* Default style */}
                      <div>
                        <p className="text-xs font-medium mb-2">
                          Default Button:
                        </p>
                        <AppSelectorOverlay
                          onAppSelected={handleAppSelect}
                          onCreateApp={handleCreateApp}
                          onRefreshComplete={handleAppRefreshComplete}
                        />
                      </div>

                      <Separator />

                      {/* Custom style */}
                      <div>
                        <p className="text-xs font-medium mb-2">
                          Custom Style:
                        </p>
                        <AppSelectorOverlay
                          buttonLabel="Choose an App"
                          buttonVariant="outline"
                          buttonSize="sm"
                          buttonClassName="border-blue-500 text-blue-500"
                          onAppSelected={handleAppSelect}
                          onCreateApp={handleCreateApp}
                          onRefreshComplete={handleAppRefreshComplete}
                        />
                      </div>

                      <Separator />

                      {/* Custom trigger */}
                      <div>
                        <p className="text-xs font-medium mb-2">
                          Custom Trigger:
                        </p>
                        <AppSelectorOverlay
                          triggerComponent={
                            <div className="cursor-pointer p-2 border border-dashed border-blue-300 rounded-lg text-center">
                              <p className="text-xs text-blue-500">
                                Select App
                              </p>
                            </div>
                          }
                          onAppSelected={handleAppSelect}
                          onCreateApp={handleCreateApp}
                          onRefreshComplete={handleAppRefreshComplete}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Applet Selector Overlay */}
                <div className="space-y-4">
                  <h3 className="text-base font-medium text-emerald-600 dark:text-emerald-400">
                    Applet Selector Overlay
                  </h3>

                  <div className="p-4 bg-emerald-50 dark:bg-emerald-950 rounded-lg border border-emerald-200 dark:border-emerald-800">
                    <div className="space-y-4">
                      {/* Default style */}
                      <div>
                        <p className="text-xs font-medium mb-2">
                          Default Button:
                        </p>
                        <AppletSelectorOverlay
                          onAppletSelected={handleAppletSelect}
                          onCreateApplet={handleCreateApplet}
                          onRefreshComplete={handleAppletRefreshComplete}
                        />
                      </div>

                      <Separator />

                      {/* Custom style */}
                      <div>
                        <p className="text-xs font-medium mb-2">
                          Custom Style:
                        </p>
                        <AppletSelectorOverlay
                          buttonLabel="Choose an Applet"
                          buttonVariant="outline"
                          buttonSize="sm"
                          buttonClassName="border-emerald-500 text-emerald-500"
                          onAppletSelected={handleAppletSelect}
                          onCreateApplet={handleCreateApplet}
                          onRefreshComplete={handleAppletRefreshComplete}
                        />
                      </div>

                      <Separator />

                      {/* Custom trigger */}
                      <div>
                        <p className="text-xs font-medium mb-2">
                          Custom Trigger:
                        </p>
                        <AppletSelectorOverlay
                          triggerComponent={
                            <div className="cursor-pointer p-2 border border-dashed border-emerald-300 rounded-lg text-center">
                              <p className="text-xs text-emerald-500">
                                Select Applet
                              </p>
                            </div>
                          }
                          onAppletSelected={handleAppletSelect}
                          onCreateApplet={handleCreateApplet}
                          onRefreshComplete={handleAppletRefreshComplete}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="space-y-6">
                  <h3 className="text-lg font-medium text-amber-600 dark:text-amber-400 flex items-center">
                    <LayoutGrid className="mr-2 h-5 w-5" />
                    Group Selector Overlay
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-4 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200 dark:border-amber-800">
                      <div className="space-y-4">
                        {/* Default style */}
                        <div>
                          <p className="text-xs font-medium mb-2">
                            Default Button:
                          </p>
                          <GroupSelectorOverlay
                            onGroupSelected={handleGroupSelect}
                            onCreateGroup={handleCreateGroup}
                            onRefreshGroup={handleRefreshGroup}
                            onRefreshComplete={handleGroupRefreshComplete}
                          />
                        </div>

                        <Separator />

                        {/* Custom style */}
                        <div>
                          <p className="text-xs font-medium mb-2">
                            Custom Style:
                          </p>
                          <GroupSelectorOverlay
                            buttonLabel="Select a Group"
                            buttonVariant="outline"
                            buttonSize="sm"
                            buttonClassName="border-amber-500 text-amber-500"
                            onGroupSelected={handleGroupSelect}
                            onCreateGroup={handleCreateGroup}
                            onRefreshGroup={handleRefreshGroup}
                            onRefreshComplete={handleGroupRefreshComplete}
                          />
                        </div>

                        <Separator />

                        {/* Custom trigger */}
                        <div>
                          <p className="text-xs font-medium mb-2">
                            Custom Trigger:
                          </p>
                          <GroupSelectorOverlay
                            triggerComponent={
                              <div className="cursor-pointer p-2 border border-dashed border-amber-300 rounded-lg text-center">
                                <p className="text-xs text-amber-500">
                                  Choose Group
                                </p>
                              </div>
                            }
                            onGroupSelected={handleGroupSelect}
                            onCreateGroup={handleCreateGroup}
                            onRefreshGroup={handleRefreshGroup}
                            onRefreshComplete={handleGroupRefreshComplete}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <h3 className="text-lg font-medium text-purple-600 dark:text-purple-400 flex items-center">
                    <FormInput className="mr-2 h-5 w-5" />
                    Field Selector Overlay
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-4 bg-purple-50 dark:bg-purple-950 rounded-lg border border-purple-200 dark:border-purple-800">
                      <div className="space-y-4">
                        {/* Default style */}
                        <div>
                          <p className="text-xs font-medium mb-2">
                            Default Button:
                          </p>
                          <FieldSelectorOverlay
                            onFieldSelected={handleFieldSelect}
                            onCreateField={handleCreateField}
                            onRefreshComplete={handleFieldRefreshComplete}
                          />
                        </div>

                        <Separator />

                        {/* Custom style */}
                        <div>
                          <p className="text-xs font-medium mb-2">
                            Custom Style:
                          </p>
                          <FieldSelectorOverlay
                            buttonLabel="Select a Field"
                            buttonVariant="outline"
                            buttonSize="sm"
                            buttonClassName="border-purple-500 text-purple-500"
                            onFieldSelected={handleFieldSelect}
                            onCreateField={handleCreateField}
                            onRefreshComplete={handleFieldRefreshComplete}
                          />
                        </div>

                        <Separator />

                        {/* Custom trigger */}
                        <div>
                          <p className="text-xs font-medium mb-2">
                            Custom Trigger:
                          </p>
                          <FieldSelectorOverlay
                            triggerComponent={
                              <div className="cursor-pointer p-2 border border-dashed border-purple-300 rounded-lg text-center">
                                <p className="text-xs text-purple-500">
                                  Choose Field
                                </p>
                              </div>
                            }
                            onFieldSelected={handleFieldSelect}
                            onCreateField={handleCreateField}
                            onRefreshComplete={handleFieldRefreshComplete}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card className="border-gray-200 dark:border-gray-700 shadow-lg p-6">
        <CardFooter className="flex justify-end pt-4 px-0 pb-0">
          <Button variant="outline" onClick={() => setActiveTab("comparison")}>
            Return to Comparison
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default SmartAppListsDemo;
