"use client";

import React from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAppById, selectAppIsDirty, selectAppLoading } from "@/lib/redux/app-builder/selectors/appSelectors";
import { saveAppThunk } from "@/lib/redux/app-builder/thunks/appBuilderThunks";
import { setActiveApp } from "@/lib/redux/app-builder/slices/appBuilderSlice";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Save, X, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { setName, setDescription, setSlug, setMainAppIcon } from "@/lib/redux/app-builder/slices/appBuilderSlice";
import { TailwindColorPicker } from "@/components/ui/TailwindColorPicker";
import { IconPicker } from "@/components/ui/IconPicker";
import { SingleImageSelect } from "@/components/image/shared/SingleImageSelect";
import { COLOR_VARIANTS } from "@/features/applet/styles/StyledComponents";
import { convertToKebabCase } from "@/utils/text/stringUtils";

interface AppEditorProps {
    appId: string;
    isCreatingNew?: boolean;
    onSaveSuccess?: (appId: string) => void;
    onCancel?: () => void;
}

const AppEditor: React.FC<AppEditorProps> = ({ appId, isCreatingNew = false, onSaveSuccess, onCancel }) => {
    const dispatch = useAppDispatch();
    const { toast } = useToast();

    // Get app data from Redux
    const app = useAppSelector((state) => selectAppById(state, appId));
    const isDirty = useAppSelector((state) => selectAppIsDirty(state, appId));
    const isLoading = useAppSelector(selectAppLoading);

    // Handle saving the app
    const handleSave = async () => {
        if (!appId) return;

        try {
            await dispatch(saveAppThunk(appId)).unwrap();
            toast({
                title: "Success",
                description: `App ${isCreatingNew ? "created" : "updated"} successfully.`,
            });

            if (onSaveSuccess) {
                onSaveSuccess(appId);
            }
        } catch (error: any) {
            toast({
                title: "Error",
                description: error.message || `Failed to ${isCreatingNew ? "create" : "update"} app.`,
                variant: "destructive",
            });
        }
    };

    // Handle cancel button
    const handleCancelClick = () => {
        // Clean up active app
        dispatch(setActiveApp(null));

        if (onCancel) {
            onCancel();
        }
    };

    // Handle form field changes
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;

        if (name === "name") {
            dispatch(setName({ id: appId, name: value }));

            // Auto-generate slug from name if this is a new app
            if (isCreatingNew && !app?.slug) {
                const slug = convertToKebabCase(value);
                dispatch(setSlug({ id: appId, slug }));
            }
        } else if (name === "description") {
            dispatch(setDescription({ id: appId, description: value }));
        } else if (name === "slug") {
            dispatch(setSlug({ id: appId, slug: value }));
        }
    };

    // Handle color changes
    const handleColorChange = (colorType: "primary" | "accent", color: string) => {
        if (colorType === "primary") {
            dispatch({ type: "appBuilder/setPrimaryColor", payload: { id: appId, primaryColor: color } });
        } else {
            dispatch({ type: "appBuilder/setAccentColor", payload: { id: appId, accentColor: color } });
        }
    };

    // Handle image selection
    const handleImageSelected = (imageUrl: string, imageFileId?: string) => {
        dispatch({ type: "appBuilder/setImageUrl", payload: { id: appId, imageUrl, imageFileId: imageFileId || "" } });
    };

    // Handle image removal
    const handleImageRemoved = () => {
        dispatch({ type: "appBuilder/setImageUrl", payload: { id: appId, imageUrl: "", imageFileId: "" } });
    };

    // Handle icon selection
    const handleAppIconSelect = (iconName: string) => {
        dispatch(setMainAppIcon({ id: appId, mainAppIcon: iconName }));
    };

    const customBackgroundColor = COLOR_VARIANTS.background[app.primaryColor];
    const customAccentColor = COLOR_VARIANTS.border[app.accentColor];

    if (!app) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Main Form Content */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Left column: Main details */}
                <div className="md:col-span-2 space-y-6">
                    <Card className="p-6">
                        <h3 className="text-lg font-medium mb-4 text-gray-800 dark:text-gray-200">App Information</h3>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="app-name">App Name</Label>
                                <Input
                                    id="app-name"
                                    name="name"
                                    value={app.name || ""}
                                    onChange={handleInputChange}
                                    placeholder="Enter app name"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="app-slug">URL Slug</Label>
                                <Input
                                    id="app-slug"
                                    name="slug"
                                    value={app.slug || ""}
                                    onChange={handleInputChange}
                                    placeholder="app-url-slug"
                                />
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    This will be used in the URL: /apps/{app.slug || "app-slug"}
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="app-description">Description</Label>
                                <Textarea
                                    id="app-description"
                                    name="description"
                                    value={app.description || ""}
                                    onChange={handleInputChange}
                                    placeholder="Describe your app"
                                    rows={5}
                                />
                            </div>
                        </div>
                    </Card>
                </div>

                {/* Right column: Visuals */}
                <div className="space-y-6">
                    <Card className={`p-6 ${customBackgroundColor}`}>
                        <h3 className="text-lg font-medium mb-4 text-gray-800 dark:text-gray-200">App Appearance</h3>
                        <div className="space-y-2">
                            <SingleImageSelect
                                size="sm"
                                aspectRatio="landscape"
                                placeholder="Select App Image"
                                onImageSelected={handleImageSelected}
                                onImageRemoved={handleImageRemoved}
                                initialTab="public-search"
                                initialSearchTerm={app.name}
                                preselectedImageUrl={app.imageUrl}
                                className="w-full"
                                instanceId={`app-image-${appId}`}
                                saveTo="public"
                            />
                        </div>
                        <div className="space-y-4">
                            <div className="space-y-2 pt-4">
                                <div className="flex flex-col space-y-4">
                                    <div className="flex items-center justify-between">
                                        <Label>Primary Color</Label>
                                        <TailwindColorPicker
                                            selectedColor={app.primaryColor || "#3b82f6"}
                                            onColorChange={(color) => handleColorChange("primary", color)}
                                            size="sm"
                                        />
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <Label>Accent Color</Label>
                                        <TailwindColorPicker
                                            selectedColor={app.accentColor || "#f43f5e"}
                                            onColorChange={(color) => handleColorChange("accent", color)}
                                            size="sm"
                                        />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <Label>App Icon</Label>
                                        <IconPicker
                                            iconType="appIcon"
                                            selectedIcon={app.mainAppIcon}
                                            onIconSelect={handleAppIconSelect}
                                            primaryColor={app.primaryColor}
                                            accentColor={app.accentColor}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end space-x-4 pt-4 border-t border-border">
                <Button variant="outline" onClick={handleCancelClick} disabled={isLoading}>
                    <X className="w-4 h-4 mr-2" />
                    Cancel
                </Button>

                <Button onClick={handleSave} disabled={isLoading || !isDirty}>
                    {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    {isCreatingNew ? "Create App" : "Save Changes"}
                </Button>
            </div>
        </div>
    );
};

export default AppEditor;
