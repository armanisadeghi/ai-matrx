"use client";

import React, { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { SingleImageSelect } from "@/components/image/shared/SingleImageSelect";
import { CheckCircle, SaveIcon, Plus } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

// Redux imports
import { saveAppThunk, checkAppSlugUniqueness } from "@/lib/redux/app-builder/thunks/appBuilderThunks";
import {
    setName,
    setDescription,
    setSlug,
    setCreator,
    setImageUrl,
    startNewApp,
} from "@/lib/redux/app-builder/slices/appBuilderSlice";
import {
    selectAppLoading,
    selectAppError,
    selectAppSlugStatus,
    selectAppIsDirty,
    selectAppName,
    selectAppDescription,
    selectAppSlug,
    selectAppCreator,
    selectAppImageUrl,
    selectAppIsLocal,
} from "@/lib/redux/app-builder/selectors/appSelectors";
import { convertToKebabCase } from "@/utils/text/stringUtils";
import { AppSlugChecker } from "@/features/applet/builder/modules/smart-parts/apps/AppSlugChecker";
import { v4 as uuidv4 } from "uuid";
import { CustomAppConfig } from "@/types/customAppTypes";

interface QuickAppMakerProps {
    currentAppId?: string;
    onAppSaved: (appId: string, app?: CustomAppConfig) => void;
    onCancel: () => void;
}

export const QuickAppMaker: React.FC<QuickAppMakerProps> = ({ currentAppId, onAppSaved, onCancel }) => {
    const { toast } = useToast();
    const dispatch = useAppDispatch();
    const [view, setView] = useState<"initial" | "edit">("initial");
    const [appId, setAppId] = useState<string | null>(currentAppId || null);

    useEffect(() => {
        if (currentAppId) {
            setView("edit");
            setAppId(currentAppId);
        } else {
            setView("initial");
            setAppId(null);
        }
    }, [currentAppId]);

    const handleCreateNewApp = () => {
        const newAppId = uuidv4();
        dispatch(startNewApp({ id: newAppId }));
        setAppId(newAppId);
        setView("edit");
    };

    // Redux state selectors
    const appLoading = useAppSelector(selectAppLoading);
    const slugStatus = useAppSelector((state) => selectAppSlugStatus(state, appId));
    const isDirty = useAppSelector((state) => selectAppIsDirty(state, appId));
    const isLocal = useAppSelector((state) => selectAppIsLocal(state, appId));

    // App field selectors
    const name = useAppSelector((state) => selectAppName(state, appId));
    const description = useAppSelector((state) => selectAppDescription(state, appId));
    const slug = useAppSelector((state) => selectAppSlug(state, appId));
    const creator = useAppSelector((state) => selectAppCreator(state, appId));
    const imageUrl = useAppSelector((state) => selectAppImageUrl(state, appId));

    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newName = e.target.value;
        dispatch(setName({ id: appId, name: newName }));

        // Auto-generate slug from name if field is empty or hasn't been manually edited
        if (!slug || slug === convertToKebabCase(name)) {
            const newSlug = convertToKebabCase(newName);
            dispatch(setSlug({ id: appId, slug: newSlug }));
        }
    };

    const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawSlug = e.target.value;
        const newSlug = convertToKebabCase(rawSlug);
        dispatch(setSlug({ id: appId, slug: newSlug }));
    };

    const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        dispatch(setDescription({ id: appId, description: e.target.value }));
    };

    const handleCreatorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        dispatch(setCreator({ id: appId, creator: e.target.value }));
    };

    const handleImageSelected = (imageUrl: string, imageFileId?: string) => {
        dispatch(setImageUrl({ id: appId, imageUrl, imageFileId: imageFileId || "" }));
    };

    const handleImageRemoved = () => {
        dispatch(setImageUrl({ id: appId, imageUrl: "", imageFileId: "" }));
    };

    const handleSaveApp = async () => {
        if (!name || !slug) {
            toast({
                title: "Required Fields Missing",
                description: "App name and slug are required.",
                variant: "destructive",
            });
            return;
        }

        // Handle slug status check
        if (slugStatus === "unchecked") {
            try {
                const checkResult = await dispatch(
                    checkAppSlugUniqueness({
                        slug,
                        appId,
                    })
                ).unwrap();

                if (!checkResult) {
                    toast({
                        title: "Slug Not Available",
                        description: "This slug is not available. Please choose a different one.",
                        variant: "destructive",
                    });
                    return;
                }
            } catch (error) {
                console.error("Error checking slug uniqueness:", error);
                toast({
                    title: "Error",
                    description: "Failed to check slug availability. Please try again.",
                    variant: "destructive",
                });
                return;
            }
        } else if (slugStatus === "notUnique") {
            toast({
                title: "Slug Not Available",
                description: "This slug is not available. Please choose a different one.",
                variant: "destructive",
            });
            return;
        }

        try {
            // Save app using the unified save thunk
            const savedApp = await dispatch(saveAppThunk(appId)).unwrap();

            toast({
                title: isLocal ? "App Created" : "App Updated",
                description: isLocal ? "Your app has been created successfully." : "Your changes have been saved.",
            });

            // Call the parent's callback with the app ID and full app object
            onAppSaved(savedApp.id, savedApp);
        } catch (error) {
            console.error("Error saving app:", error);
            toast({
                title: "Error",
                description: "Failed to save app. Please try again.",
                variant: "destructive",
            });
        }
    };

    // Helper to render required field indicator
    const Required = () => <span className="text-red-500 ml-1">*</span>;

    // Render the save/update button based on dirty state
    const renderSaveButton = () => {
        // For new apps (not yet saved) or dirty apps
        if (isLocal || isDirty) {
            return (
                <Button
                    onClick={handleSaveApp}
                    disabled={appLoading || slugStatus === "notUnique" || !name || !slug}
                    className="w-full mt-4 bg-rose-500 hover:bg-rose-600 text-white dark:bg-rose-600 dark:hover:bg-rose-700"
                >
                    {appLoading ? "Saving..." : isLocal ? "Save App Info" : "Update App Info"}
                </Button>
            );
        }

        // For saved apps with no changes (not dirty)
        return (
            <Button
                disabled
                className="w-full mt-4 bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 flex items-center justify-center gap-2 cursor-default"
            >
                <CheckCircle className="h-4 w-4" />
                App Saved
            </Button>
        );
    };

    // Render initial view with Create New App button
    if (view === "initial") {
        return (
            <div className="w-full">
                <Card className="bg-white dark:bg-slate-900 overflow-hidden p-0 rounded-3xl border border-rose-200 dark:border-rose-600">
                    <CardHeader className="bg-gray-100 dark:bg-gray-700 border border-rose-200 dark:border-rose-600 p-3 rounded-t-3xl">
                        <div className="flex flex-col gap-1">
                            <h2 className="text-rose-500 font-medium text-lg">Create New App</h2>
                            <p className="text-gray-600 dark:text-gray-300 text-sm">
                                Start building a new application from scratch
                            </p>
                        </div>
                    </CardHeader>
                    
                    <div className="p-8 flex flex-col items-center justify-center space-y-6">
                        <div className="flex flex-col items-center text-center space-y-4">
                            <div className="w-16 h-16 rounded-full bg-rose-100 dark:bg-rose-900 flex items-center justify-center">
                                <Plus className="w-8 h-8 text-rose-500" />
                            </div>
                            <div>
                                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                                    Ready to create your app?
                                </h3>
                                <p className="text-gray-600 dark:text-gray-400 text-sm max-w-md">
                                    Click the button below to start configuring your new application. You'll be able to set the name, description, and other details.
                                </p>
                            </div>
                        </div>
                        
                        <div className="flex gap-3 w-full max-w-sm">
                            <Button
                                onClick={handleCreateNewApp}
                                className="flex-1 bg-rose-500 hover:bg-rose-600 text-white dark:bg-rose-600 dark:hover:bg-rose-700"
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Create New App
                            </Button>
                            <Button
                                onClick={onCancel}
                                variant="outline"
                                className="flex-1 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                            >
                                Cancel
                            </Button>
                        </div>
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <div className="w-full">
            {/* Add loading state check here */}
            {!appId || appLoading ? (
                <div className="flex flex-col items-center justify-center h-96">
                    <LoadingSpinner size="lg" />
                    <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">Loading app configuration...</p>
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-500">Debug: appId is missing or invalid</p>
                </div>
            ) : (
                <Card className="bg-white dark:bg-slate-900 overflow-hidden p-0 rounded-3xl border border-rose-200 dark:border-rose-600">
                    <CardHeader className="bg-gray-100 dark:bg-gray-700 border border-rose-200 dark:border-rose-600 p-3 rounded-t-3xl">
                        <div className="grid md:grid-cols-[1fr_auto] gap-4 md:items-center">
                            <div className="flex flex-col gap-1">
                                <h2 className="text-rose-500 font-medium text-lg">Primary App Information</h2>
                                <p className="text-gray-600 dark:text-gray-300 text-sm">
                                    Please provide information about your app. This can be updated later
                                </p>
                            </div>
                        </div>
                    </CardHeader>

                    {/* Content */}
                    <div className="flex flex-col md:flex-row">
                        {/* Form */}
                        <div className="w-full p-5 overflow-y-auto">
                            <div className="space-y-4">
                                {/* App Name & Slug (combined row) */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="name" className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                            App Name
                                            <Required />
                                        </Label>
                                        <Input
                                            id="name"
                                            name="name"
                                            placeholder="Enter app name"
                                            value={name || ""}
                                            onChange={handleNameChange}
                                            className="border-gray-200 dark:border-gray-700 bg-textured text-gray-900 dark:text-gray-100 focus:border-rose-500"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="slug" className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                            App URL Slug
                                            <Required />
                                        </Label>
                                        <div className="relative">
                                            <Input
                                                id="slug"
                                                name="slug"
                                                placeholder="Enter unique app slug"
                                                value={slug || ""}
                                                onChange={handleSlugChange}
                                                className={`border-gray-200 dark:border-gray-700 bg-textured text-gray-900 dark:text-gray-100 focus:border-rose-500 ${
                                                    slugStatus === "notUnique" ? "border-red-500 dark:border-red-500" : ""
                                                } pr-10`}
                                            />
                                            <AppSlugChecker appId={appId} slug={slug} />
                                        </div>
                                        {slugStatus === "notUnique" && (
                                            <p className="text-red-500 text-xs mt-1">This slug is not available</p>
                                        )}
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="creator" className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                            Creator Name
                                        </Label>
                                        <Input
                                            id="creator"
                                            name="creator"
                                            placeholder="Enter your name"
                                            value={creator || ""}
                                            onChange={handleCreatorChange}
                                            className="border-gray-200 dark:border-gray-700 bg-textured text-gray-900 dark:text-gray-100 focus:border-rose-500"
                                        />
                                    </div>
                                </div>

                                {/* Description */}
                                <div className="space-y-2">
                                    <Label htmlFor="description" className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                        Description
                                    </Label>
                                    <Textarea
                                        id="description"
                                        name="description"
                                        placeholder="Enter app description"
                                        value={description || ""}
                                        onChange={handleDescriptionChange}
                                        rows={3}
                                        className="resize-none border-gray-200 dark:border-gray-700 bg-textured text-gray-900 dark:text-gray-100 focus:border-rose-500"
                                    />
                                </div>


                                {/* App Banner Image */}
                                <div className="space-y-2">
                                    <Label className="text-sm font-medium text-gray-900 dark:text-gray-100">App Banner Image</Label>
                                    <div className="w-full">
                                        <SingleImageSelect
                                            size="md"
                                            aspectRatio="landscape"
                                            placeholder="Select App Banner"
                                            onImageSelected={handleImageSelected}
                                            onImageRemoved={handleImageRemoved}
                                            initialTab="public-search"
                                            initialSearchTerm={name}
                                            preselectedImageUrl={imageUrl}
                                            className="w-full max-w-full"
                                            instanceId="app-banner"
                                            saveTo="public"
                                        />
                                    </div>
                                </div>
                                {renderSaveButton()}

                            </div>
                        </div>
                    </div>
                </Card>
            )}
        </div>
    );
};

export const QuickAppMakerOverlay: React.FC<QuickAppMakerProps> = ({ currentAppId, onAppSaved, onCancel }) => {
    return (
        <Dialog open={true} onOpenChange={(open) => !open && onCancel()}>
            <DialogContent className="max-w-none bg-transparent" style={{ width: 'min(95vw, 40vw)', minWidth: '320px', height: '50dvh' }}>
                <DialogTitle className="sr-only">
                    {currentAppId ? "Edit App" : "Create New App"}
                </DialogTitle>
                <div className="h-full overflow-auto pt-4">
                    <QuickAppMaker
                        currentAppId={currentAppId}
                        onAppSaved={onAppSaved}
                        onCancel={onCancel}
                    />
                </div>
            </DialogContent>
        </Dialog>
    );
};