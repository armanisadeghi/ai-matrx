"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { DownloadIcon, UploadIcon, DatabaseIcon, FileIcon, AppWindowIcon, BoxIcon, LayersIcon, CheckIcon, Copy } from "lucide-react";
import { CustomAppConfig, FieldDefinition, CustomAppletConfig, AppletContainer, ComponentType } from "@/types/customAppTypes";
import { getAllCustomAppConfigs } from "@/lib/redux/app-builder/service/customAppService";
import { getAllCustomAppletConfigs } from "@/lib/redux/app-builder/service/customAppletService";
import { getAllFieldComponents, getAllComponentGroups } from "@/lib/redux/app-builder/service";

type AppPartType = "app" | "applet" | "group" | "field";

// Type adapters to convert service types to component types
const adaptAppletToCustomApplet = (applet: any): CustomAppletConfig => {
  return {
      id: applet.id || "",
      name: applet.name,
      description: applet.description || "",
      slug: applet.slug,
      appletIcon: applet.appletIcon || applet.applet_icon,
      appletSubmitText: applet.appletSubmitText || applet.applet_submit_text,
      creator: applet.creator,
      primaryColor: applet.primaryColor || applet.primary_color,
      accentColor: applet.accentColor || applet.accent_color,
      layoutType: applet.layoutType || applet.layout_type,
      containers: applet.containers || [],
      dataSourceConfig: applet.dataSourceConfig || applet.data_source_config,
      resultComponentConfig: applet.resultComponentConfig || applet.result_component_config,
      nextStepConfig: applet.nextStepConfig || applet.next_step_config,
      compiledRecipeId: applet.compiledRecipeId || applet.compiled_recipe_id,
      subcategoryId: applet.subcategoryId || applet.subcategory_id,
      imageUrl: applet.imageUrl || applet.image_url
  };
};

const adaptGroupToAppletContainer = (group: any): AppletContainer => {
  return {
      id: group.id,
      label: group.label,
      shortLabel: group.shortLabel || group.short_label || "",
      description: group.description || "",
      hideDescription: group.hideDescription || group.hide_description || false,
      helpText: group.helpText || group.help_text || "",
      fields: Array.isArray(group.fields) ? group.fields.map(adaptFieldDefinition) : []
  };
};

const adaptFieldDefinition = (field: any): FieldDefinition => {
  return {
      id: field.id,
      label: field.label,
      description: field.description,
      helpText: field.helpText || field.help_text,
      group: field.group,
      iconName: field.iconName || field.icon_name,
      component: field.component as ComponentType,
      required: field.required,
      // @ts-ignore - 'disabled' does not exist in FieldDefinition type but is used
      disabled: field.disabled,
      placeholder: field.placeholder,
      defaultValue: field.defaultValue || field.default_value,
      options: field.options,
      componentProps: field.componentProps || field.component_props || {},
      includeOther: field.includeOther || field.include_other
  };
};


const ComponentLibrary = () => {
    const { toast } = useToast();
    const [activeTab, setActiveTab] = useState<string>("export");
    const [componentType, setComponentType] = useState<AppPartType>("app");
    const [exportData, setExportData] = useState<string>("");
    const [importData, setImportData] = useState<string>("");
    const [savedApps, setSavedApps] = useState<CustomAppConfig[]>([]);
    const [savedApplets, setSavedApplets] = useState<CustomAppletConfig[]>([]);
    const [savedGroups, setSavedGroups] = useState<AppletContainer[]>([]);
    const [savedFields, setSavedFields] = useState<FieldDefinition[]>([]);
    const [copied, setCopied] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Load saved data from database on component mount
    useEffect(() => {
      const fetchData = async () => {
          setIsLoading(true);
          setError(null);
          try {
              // Fetch data from database services
              const [apps, applets, groups, fields] = await Promise.all([
                  getAllCustomAppConfigs(),
                  getAllCustomAppletConfigs(),
                  getAllComponentGroups(),
                  getAllFieldComponents(),
              ]);
              
              // Convert to proper types
              const customApps = apps.map(app => ({
                id: app.id,
                name: app.name,
                description: app.description || "",
                slug: app.slug,
                mainAppIcon: app.mainAppIcon,
                mainAppSubmitIcon: app.mainAppSubmitIcon,
                creator: app.creator,
                primaryColor: app.primaryColor,
                accentColor: app.accentColor,
                layoutType: app.layoutType,
                appletList: app.appletList,
                extraButtons: app.extraButtons,
                imageUrl: app.imageUrl
            }));
            
              const customApplets = applets.map(adaptAppletToCustomApplet);
              const appletContainers = groups.map(adaptGroupToAppletContainer);
              const fieldDefinitions = fields.map(adaptFieldDefinition);
              
              setSavedApps(customApps);
              setSavedApplets(customApplets);
              setSavedGroups(appletContainers);
              setSavedFields(fieldDefinitions);
          } catch (err) {
              console.error("Error fetching components:", err);
              setError("Failed to load components. Please try again later.");
              toast({
                  title: "Error Loading Data",
                  description: "There was a problem loading your saved components.",
                  variant: "destructive",
              });
          } finally {
              setIsLoading(false);
          }
      };
      fetchData();
  }, [toast]);


    // Generate export data when component type changes
    useEffect(() => {
        generateExportData();
    }, [componentType, savedApps, savedApplets, savedGroups, savedFields]);

    const generateExportData = () => {
        let dataToExport: any[] = [];
        switch (componentType) {
            case "app":
                dataToExport = savedApps;
                break;
            case "applet":
                dataToExport = savedApplets;
                break;
            case "group":
                dataToExport = savedGroups;
                break;
            case "field":
                dataToExport = savedFields;
                break;
        }
        if (dataToExport.length > 0) {
            const exportObj = {
                type: componentType,
                data: dataToExport,
                exportDate: new Date().toISOString(),
            };
            setExportData(JSON.stringify(exportObj, null, 2));
        } else {
            setExportData(`No ${componentType}s available to export.`);
        }
    };

    const handleComponentTypeChange = (type: string) => {
        setComponentType(type as AppPartType);
    };

    const handleImportDataChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setImportData(e.target.value);
    };

    const copyExportData = () => {
        navigator.clipboard.writeText(exportData);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast({
            title: "Copied to Clipboard",
            description: "Export data has been copied to clipboard.",
        });
    };

    const importComponents = async () => {
        if (!importData.trim()) {
            toast({
                title: "Import Error",
                description: "Please enter valid JSON data to import.",
                variant: "destructive",
            });
            return;
        }
        try {
            const importObj = JSON.parse(importData);
            if (!importObj.type || !importObj.data || !Array.isArray(importObj.data)) {
                throw new Error("Invalid import format");
            }
            // This part would need to be updated to use the service functions
            // for creating/importing components, which isn't implemented yet
            toast({
                title: "Import Not Implemented",
                description: "The import functionality using database services is not yet implemented.",
                variant: "destructive",
            });
            setImportData("");
        } catch (error) {
            console.error("Import error:", error);
            toast({
                title: "Import Error",
                description: "Failed to parse import data. Please ensure it's valid JSON.",
                variant: "destructive",
            });
        }
    };

    const downloadExportFile = () => {
        const blob = new Blob([exportData], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${componentType}-export-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast({
            title: "Download Started",
            description: `${componentType} data is being downloaded.`,
        });
    };

    const getComponentTypeIcon = () => {
        switch (componentType) {
            case "app":
                return <AppWindowIcon className="h-5 w-5 text-indigo-500 dark:text-indigo-400" />;
            case "applet":
                return <BoxIcon className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />;
            case "group":
                return <LayersIcon className="h-5 w-5 text-amber-500 dark:text-amber-400" />;
            case "field":
                return <FileIcon className="h-5 w-5 text-rose-500 dark:text-rose-400" />;
            default:
                return <DatabaseIcon className="h-5 w-5" />;
        }
    };

    if (isLoading) {
        return (
            <div className="container mx-auto px-4 py-6 min-h-dvh">
                <Card className="border-border bg-textured shadow-lg h-full">
                    <CardContent className="p-8 flex justify-center items-center min-h-[80dvh]">
                        <div className="text-center">
                            <div className="animate-pulse h-6 w-24 bg-gray-200 dark:bg-gray-700 rounded mx-auto mb-4"></div>
                            <p className="text-gray-500 dark:text-gray-400">Loading components...</p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-6 min-h-dvh">
            <Card className="border-border bg-textured shadow-lg h-full">
                <CardHeader>
                    <CardTitle className="text-2xl font-bold text-blue-500 dark:text-blue-400">Component Library</CardTitle>
                    <CardDescription className="text-gray-500 dark:text-gray-400">Import and export components for reuse</CardDescription>
                </CardHeader>
                <CardContent className="min-h-[80dvh]">
                    {error && (
                        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-300 rounded-md">{error}</div>
                    )}
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full">
                        <TabsList className="grid w-full grid-cols-2 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                            <TabsTrigger
                                value="export"
                                className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-800 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400"
                            >
                                Export Components
                            </TabsTrigger>
                            <TabsTrigger
                                value="import"
                                className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-800 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400"
                            >
                                Import Components
                            </TabsTrigger>
                        </TabsList>
                        <TabsContent value="export" className="mt-6 h-full">
                            <div className="space-y-6 h-full">
                                <div className="space-y-4">
                                    <Label className="text-gray-900 dark:text-gray-100">Component Type</Label>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        <Button
                                            variant={componentType === "app" ? "default" : "outline"}
                                            onClick={() => handleComponentTypeChange("app")}
                                            className={
                                                componentType === "app"
                                                    ? "bg-indigo-500 hover:bg-indigo-600 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white"
                                                    : "border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"
                                            }
                                        >
                                            <AppWindowIcon className="h-4 w-4 mr-2" />
                                            Apps ({savedApps.length})
                                        </Button>
                                        <Button
                                            variant={componentType === "applet" ? "default" : "outline"}
                                            onClick={() => handleComponentTypeChange("applet")}
                                            className={
                                                componentType === "applet"
                                                    ? "bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white"
                                                    : "border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"
                                            }
                                        >
                                            <BoxIcon className="h-4 w-4 mr-2" />
                                            Applets ({savedApplets.length})
                                        </Button>
                                        <Button
                                            variant={componentType === "group" ? "default" : "outline"}
                                            onClick={() => handleComponentTypeChange("group")}
                                            className={
                                                componentType === "group"
                                                    ? "bg-amber-500 hover:bg-amber-600 dark:bg-amber-600 dark:hover:bg-amber-700 text-white"
                                                    : "border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"
                                            }
                                        >
                                            <LayersIcon className="h-4 w-4 mr-2" />
                                            Groups ({savedGroups.length})
                                        </Button>
                                        <Button
                                            variant={componentType === "field" ? "default" : "outline"}
                                            onClick={() => handleComponentTypeChange("field")}
                                            className={
                                                componentType === "field"
                                                    ? "bg-rose-500 hover:bg-rose-600 dark:bg-rose-600 dark:hover:bg-rose-700 text-white"
                                                    : "border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"
                                            }
                                        >
                                            <FileIcon className="h-4 w-4 mr-2" />
                                            Fields ({savedFields.length})
                                        </Button>
                                    </div>
                                </div>
                                <div className="space-y-2 flex flex-col h-[calc(80dvh-12rem)]">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-gray-900 dark:text-gray-100 flex items-center gap-2">
                                            {getComponentTypeIcon()}
                                            Export Data
                                        </Label>
                                        <div className="flex space-x-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={copyExportData}
                                                className="border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"
                                            >
                                                {copied ? <CheckIcon className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                                                Copy
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={downloadExportFile}
                                                className="border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"
                                            >
                                                <DownloadIcon className="h-4 w-4 mr-2" />
                                                Download
                                            </Button>
                                        </div>
                                    </div>
                                    <Textarea
                                        value={exportData}
                                        readOnly
                                        className="font-mono text-sm flex-grow h-full min-h-[600px] border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
                                    />
                                </div>
                            </div>
                        </TabsContent>
                        <TabsContent value="import" className="mt-6 h-full">
                            <div className="space-y-6 h-full">
                                <div className="space-y-2 flex flex-col h-[calc(80dvh-8rem)]">
                                    <Label className="text-gray-900 dark:text-gray-100">Import JSON Data</Label>
                                    <Textarea
                                        value={importData}
                                        onChange={handleImportDataChange}
                                        placeholder="Paste JSON export data here..."
                                        className="font-mono text-sm flex-grow h-full min-h-[600px] border-gray-200 dark:border-gray-700 bg-textured"
                                    />
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                        Note: Import will merge with existing data. Duplicate IDs will be skipped.
                                    </p>
                                </div>
                                <div className="flex justify-end">
                                    <Button
                                        onClick={importComponents}
                                        className="bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white"
                                        disabled={!importData.trim()}
                                    >
                                        <UploadIcon className="h-4 w-4 mr-2" />
                                        Import Components
                                    </Button>
                                </div>
                            </div>
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        </div>
    );
};

export default ComponentLibrary;
