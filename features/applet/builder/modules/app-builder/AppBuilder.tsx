"use client";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { PlusIcon, SaveIcon, CheckIcon, AppWindowIcon, TrashIcon, PaletteIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import {
    getAllCustomAppConfigs,
    getCustomAppConfigById,
    createCustomAppConfig,
    updateCustomAppConfig,
    deleteCustomAppConfig,
    isAppSlugAvailable,
} from "@/lib/redux/app-builder/service/customAppService";
import { getAppIconOptions, COLOR_VARIANTS } from "@/features/applet/styles/StyledComponents";

import { SingleImageSelect } from "@/components/image/shared/SingleImageSelect";
import { TailwindColorPicker } from "@/components/ui/TailwindColorPicker";
import { IconPicker } from "@/components/ui/IconPicker";
import SmartAppList, { SmartAppListRefType } from "@/features/applet/builder/modules/smart-parts/apps/SmartAppList";
import { CustomAppConfig } from "@/types/customAppTypes";
import { appletLayoutOptionsArray } from "@/features/applet/constants/layout-options";

// SINGLE SOURCE OF TRUTH FOR DEFAULT VALUES
export const DEFAULT_APP_CONFIG: CustomAppConfig = {
    name: "",
    description: "",
    slug: "",
    mainAppIcon: "LayoutTemplate",
    mainAppSubmitIcon: "Search",
    creator: "",
    primaryColor: "gray",
    accentColor: "rose",
    appletList: [],
    extraButtons: [],
    layoutType: "tabbedApplets",
    imageUrl: "",
    imageFileId: "",
};

export const AppBuilder = () => {
    const { toast } = useToast();
    // Use the DEFAULT_APP_CONFIG as the initial state
    const [newApp, setNewApp] = useState<Partial<CustomAppConfig>>({ ...DEFAULT_APP_CONFIG });
    const [savedApps, setSavedApps] = useState<CustomAppConfig[]>([]);
    const [activeTab, setActiveTab] = useState<string>("create");
    const [selectedApp, setSelectedApp] = useState<CustomAppConfig | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const appListRef = useRef<SmartAppListRefType>(null);

    // Memoize the available icons using the utility from StyledComponents
    const availableIcons = useMemo(() => {
        return getAppIconOptions();
    }, []);

    // Memoize the filtered icons based on search term
    const filteredIcons = useMemo(() => {
        if (!searchTerm) return availableIcons;
        return availableIcons.filter((icon) => icon.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [availableIcons, searchTerm]);

    useEffect(() => {
        const loadApps = async () => {
            setIsLoading(true);
            try {
                const apps = await getAllCustomAppConfigs();
                setSavedApps(apps);
            } catch (error) {
                console.error("Failed to load apps:", error);
                toast({
                    title: "Error",
                    description: "Failed to load apps",
                    variant: "destructive",
                });
            } finally {
                setIsLoading(false);
            }
        };

        loadApps();
    }, [toast]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setNewApp((prev) => ({
            ...prev,
            [name]: value,
        }));
    };

    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const name = e.target.value;
        // Convert camelCase or any case to kebab-case
        const slug = name
            .toLowerCase()
            .replace(/([a-z])([A-Z])/g, "$1-$2") // Convert camelCase to kebab
            .replace(/\s+/g, "-") // Replace spaces with hyphens
            .replace(/[^a-z0-9-]/g, ""); // Remove special characters

        setNewApp((prev) => ({
            ...prev,
            name,
            slug,
        }));
    };

    const handleSelectChange = (name: string, value: string) => {
        setNewApp((prev) => ({
            ...prev,
            [name]: value,
        }));
    };

    const handleIconSelect = (iconType: "appIcon" | "submitIcon", iconName: string) => {
        if (iconType === "appIcon") {
            setNewApp((prev) => ({
                ...prev,
                mainAppIcon: iconName,
            }));
        } else {
            setNewApp((prev) => ({
                ...prev,
                mainAppSubmitIcon: iconName,
            }));
        }
    };

    const resetForm = () => {
        // Use the DEFAULT_APP_CONFIG for resetting the form
        setNewApp({ ...DEFAULT_APP_CONFIG });
        setSelectedApp(null);
    };

    const saveApp = async () => {
        if (!newApp.name || !newApp.slug) {
            toast({
                title: "Validation Error",
                description: "App name and slug are required",
                variant: "destructive",
            });
            return;
        }
        // Check slug uniqueness before saving
        setIsLoading(true);
        try {
            const isAvailable = await isAppSlugAvailable(newApp.slug);

            if (!isAvailable) {
                toast({
                    title: "Slug Error",
                    description: `The slug "${newApp.slug}" is already in use. Please choose a different one.`,
                    variant: "destructive",
                });
                setIsLoading(false);
                return;
            }

            const createdApp = await createCustomAppConfig(newApp as CustomAppConfig);
            setSavedApps((prev) => [...prev, createdApp]);
            toast({
                title: "App Saved",
                description: `App "${newApp.name}" has been saved successfully.`,
            });
            resetForm();
            // Switch to saved apps tab to show the newly created app
            setActiveTab("saved");

            // Refresh the app list
            if (appListRef.current) {
                appListRef.current.refresh();
            }
        } catch (error) {
            console.error("Error saving app:", error);
            toast({
                title: "Error",
                description: "Failed to save app",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const editApp = (app: CustomAppConfig) => {
        // Ensure all fields are properly set with defaults from DEFAULT_APP_CONFIG if missing
        const appWithDefaults = {
            ...DEFAULT_APP_CONFIG,
            ...app,
        };

        setSelectedApp(app);
        setNewApp(appWithDefaults);
        setActiveTab("create");
    };

    const updateApp = async () => {
        if (!selectedApp?.id) return;

        setIsLoading(true);
        try {
            // Check slug uniqueness only if the slug has changed
            if (selectedApp.slug !== newApp.slug) {
                const isAvailable = await isAppSlugAvailable(newApp.slug, selectedApp.id);

                if (!isAvailable) {
                    toast({
                        title: "Slug Error",
                        description: `The slug "${newApp.slug}" is already in use. Please choose a different one.`,
                        variant: "destructive",
                    });
                    setIsLoading(false);
                    return;
                }
            }

            const updatedApp = await updateCustomAppConfig(selectedApp.id, newApp as CustomAppConfig);
            setSavedApps((prev) => prev.map((app) => (app.id === selectedApp.id ? updatedApp : app)));

            toast({
                title: "App Updated",
                description: `App "${newApp.name}" has been updated successfully.`,
            });
            resetForm();
            // Switch to saved apps tab after update
            setActiveTab("saved");

            // Refresh the app list
            if (appListRef.current) {
                appListRef.current.refresh();
            }
        } catch (error) {
            console.error("Error updating app:", error);
            toast({
                title: "Error",
                description: "Failed to update app",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const deleteApp = async (id: string) => {
        setIsLoading(true);
        try {
            await deleteCustomAppConfig(id);
            setSavedApps((prev) => prev.filter((app) => app.id !== id));
            toast({
                title: "App Deleted",
                description: "App has been deleted successfully.",
            });

            // Refresh the app list
            if (appListRef.current) {
                appListRef.current.refresh();
            }
        } catch (error) {
            console.error("Error deleting app:", error);
            toast({
                title: "Error",
                description: "Failed to delete app",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleImageSelected = (imageUrl: string, imageFileId?: string) => {
        setNewApp((prev) => ({
            ...prev,
            imageUrl,
            imageFileId: imageFileId || "",
        }));
    };

    // Handle image removal from SingleImageSelect
    const handleImageRemoved = () => {
        setNewApp((prev) => ({
            ...prev,
            imageUrl: "",
            imageFileId: "",
        }));
    };

    // Handle app selection from AppList
    const handleAppSelect = (app: CustomAppConfig) => {
        editApp(app);
    };

    // Handle create new app from AppList
    const handleCreateNewApp = () => {
        resetForm();
        setActiveTab("create");
    };

    // Handle refresh completion
    const handleRefreshComplete = (apps: CustomAppConfig[]) => {
        setSavedApps(apps);
    };

    return (
        <div className="container mx-auto px-4 py-6">
            <Card className="border-border bg-textured shadow-lg">
                <CardHeader>
                    <CardTitle className="text-2xl font-bold text-blue-500 dark:text-blue-400">App Builder</CardTitle>
                    <CardDescription className="text-gray-500 dark:text-gray-400">Create and manage custom apps</CardDescription>
                </CardHeader>

                <CardContent>
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <TabsList className="grid w-full grid-cols-2 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                            <TabsTrigger
                                value="create"
                                className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-800 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400"
                            >
                                Create App
                            </TabsTrigger>
                            <TabsTrigger
                                value="saved"
                                className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-800 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400"
                            >
                                Saved Apps ({savedApps.length})
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="create" className="mt-6">
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="name" className="text-gray-900 dark:text-gray-100">
                                                App Name
                                            </Label>
                                            <Input
                                                id="name"
                                                name="name"
                                                value={newApp.name || ""}
                                                onChange={handleNameChange}
                                                placeholder="Enter app name"
                                                className="border-gray-200 dark:border-gray-700 bg-textured"
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="slug" className="text-gray-900 dark:text-gray-100">
                                                Slug
                                            </Label>
                                            <Input
                                                id="slug"
                                                name="slug"
                                                value={newApp.slug || ""}
                                                onChange={handleInputChange}
                                                placeholder="Enter slug"
                                                className="border-gray-200 dark:border-gray-700 bg-textured"
                                            />
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                Auto-generated from name, but can be customized
                                            </p>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="description" className="text-gray-900 dark:text-gray-100">
                                                Description
                                            </Label>
                                            <Textarea
                                                id="description"
                                                name="description"
                                                value={newApp.description || ""}
                                                onChange={handleInputChange}
                                                placeholder="Enter app description"
                                                className="resize-none border-gray-200 dark:border-gray-700 bg-textured"
                                                rows={3}
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="creator" className="text-gray-900 dark:text-gray-100">
                                                Creator
                                            </Label>
                                            <Input
                                                id="creator"
                                                name="creator"
                                                value={newApp.creator || ""}
                                                onChange={handleInputChange}
                                                placeholder="Enter creator name"
                                                className="border-gray-200 dark:border-gray-700 bg-textured"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label className="text-gray-900 dark:text-gray-100">Main App Icon</Label>
                                                <div className="flex justify-center">
                                                    <IconPicker
                                                        selectedIcon={newApp.mainAppIcon}
                                                        onIconSelect={(iconName) => handleIconSelect("appIcon", iconName)}
                                                        dialogTitle="Select Main App Icon"
                                                        dialogDescription="Choose an icon to represent your app"
                                                        className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-lg"
                                                        defaultIcon={DEFAULT_APP_CONFIG.mainAppIcon}
                                                        primaryColor={newApp.primaryColor}
                                                        accentColor={newApp.accentColor}
                                                        iconType="appIcon"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <Label className="text-gray-900 dark:text-gray-100">Submit Icon</Label>
                                                <div className="flex justify-center">
                                                    <IconPicker
                                                        selectedIcon={newApp.mainAppSubmitIcon}
                                                        onIconSelect={(iconName) => handleIconSelect("submitIcon", iconName)}
                                                        dialogTitle="Select Submit Icon"
                                                        dialogDescription="Choose an icon for the submit action"
                                                        className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-lg"
                                                        defaultIcon={DEFAULT_APP_CONFIG.mainAppSubmitIcon}
                                                        primaryColor={newApp.primaryColor}
                                                        accentColor={newApp.accentColor}
                                                        iconType="submitIcon"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="primaryColor" className="text-gray-900 dark:text-gray-100">
                                                    Primary Background Color
                                                </Label>
                                                <TailwindColorPicker
                                                    selectedColor={newApp.primaryColor ?? DEFAULT_APP_CONFIG.primaryColor}
                                                    onColorChange={(color) => handleSelectChange("primaryColor", color)}
                                                    size="md"
                                                    customSize={64}
                                                    className="mt-1"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <Label htmlFor="accentColor" className="text-gray-900 dark:text-gray-100">
                                                    Accent Color
                                                </Label>
                                                <TailwindColorPicker
                                                    selectedColor={newApp.accentColor ?? DEFAULT_APP_CONFIG.accentColor}
                                                    onColorChange={(color) => handleSelectChange("accentColor", color)}
                                                    size="md"
                                                    customSize={64}
                                                    className="mt-1"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="layoutType" className="text-gray-900 dark:text-gray-100">
                                                Layout Type
                                            </Label>
                                            <Select
                                                value={newApp.layoutType ?? DEFAULT_APP_CONFIG.layoutType}
                                                onValueChange={(value) => handleSelectChange("layoutType", value)}
                                            >
                                                <SelectTrigger className="border-gray-200 dark:border-gray-700 bg-textured">
                                                    <SelectValue placeholder="Select a layout" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {appletLayoutOptionsArray.map((layout) => (
                                                        <SelectItem
                                                            key={layout.value}
                                                            value={layout.value}
                                                            className="flex items-center gap-2"
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-gray-700 dark:text-gray-300">{layout.icon}</span>
                                                                <span>{layout.title}</span>
                                                            </div>
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="imageUrl" className="text-gray-900 dark:text-gray-100">
                                                App Banner
                                            </Label>
                                            <SingleImageSelect
                                                size="md"
                                                aspectRatio="landscape"
                                                placeholder="Select App Banner"
                                                onImageSelected={handleImageSelected}
                                                onImageRemoved={handleImageRemoved}
                                                initialTab="public-search"
                                                initialSearchTerm={newApp.name}
                                                preselectedImageUrl={newApp.imageUrl}
                                                className="w-full max-w-full"
                                                instanceId="app-banner"
                                                saveTo="public"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex justify-end space-x-4 pt-4">
                                    <Button
                                        variant="outline"
                                        onClick={resetForm}
                                        className="border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"
                                    >
                                        Reset
                                    </Button>

                                    <Button
                                        onClick={selectedApp ? updateApp : saveApp}
                                        disabled={isLoading}
                                        className="bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white"
                                    >
                                        {isLoading ? (
                                            "Processing..."
                                        ) : selectedApp ? (
                                            <>
                                                <CheckIcon className="h-4 w-4 mr-2" /> Update App
                                            </>
                                        ) : (
                                            <>
                                                <SaveIcon className="h-4 w-4 mr-2" /> Save App
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="saved" className="mt-6">
                            {/* Replace the old saved apps view with our new AppList component */}
                            <SmartAppList
                                ref={appListRef}
                                onSelectApp={handleAppSelect}
                                showCreateButton={true}
                                onCreateApp={handleCreateNewApp}
                                appIds={undefined}
                                onRefreshComplete={handleRefreshComplete}
                            />
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        </div>
    );
};

export default AppBuilder;
