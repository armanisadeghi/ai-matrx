"use client";
import React, { useState, useRef } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import SmartAppletList, { SmartAppletListRefType } from "./SmartAppletList";
import { CustomAppletConfig } from "@/types/customAppTypes";
import { useAppDispatch } from "@/lib/redux/hooks";
import { startNewApplet, setActiveApplet } from "@/lib/redux/app-builder/slices/appletBuilderSlice";
import { saveAppletThunk } from "@/lib/redux/app-builder/thunks/appletBuilderThunks";
import { QuickAppletCreateEdit } from "./QuickAppletCreateEdit";
import { v4 as uuidv4 } from "uuid";

// Define type for appletIds
type AppletId = string;

type AppletSelectCreateOverlayProps = {
    onAppletSaved: (applet: CustomAppletConfig) => void;
    buttonLabel?: string;
    buttonVariant?: "default" | "outline" | "secondary" | "ghost" | "link" | "destructive";
    buttonSize?: "default" | "sm" | "lg" | "icon";
    buttonClassName?: string;
    dialogTitle?: string;
    showCreateOption?: boolean;
    showDelete?: boolean;
    triggerComponent?: React.ReactNode;
    defaultOpen?: boolean;
    isFullscreen?: boolean;
    appletIds?: AppletId[];
    appId?: string;
    onRefreshComplete?: (applets: CustomAppletConfig[]) => void;
};

/**
 * An overlay component that allows selecting an applet from a list or creating a new one
 * Can be triggered by a button or custom trigger component
 */
const AppletSelectCreateOverlay: React.FC<AppletSelectCreateOverlayProps> & {
    refresh: () => Promise<CustomAppletConfig[]>;
} = ({
    onAppletSaved,
    buttonLabel = "Select Applet",
    buttonVariant = "default",
    buttonSize = "default",
    buttonClassName = "",
    dialogTitle = "Select an Applet",
    showCreateOption = true,
    showDelete = false,
    triggerComponent,
    defaultOpen = false,
    isFullscreen = false,
    appletIds,
    appId,
    onRefreshComplete,
}) => {
        const dispatch = useAppDispatch();
        const [open, setOpen] = useState(defaultOpen);
        const [view, setView] = useState<"list" | "quickapplet">("list");
        const [currentAppletId, setCurrentAppletId] = useState<string | undefined>(undefined);
        const appletListRef = useRef<SmartAppletListRefType | null>(null);

        const handleAppletSelect = (applet: CustomAppletConfig) => {
            onAppletSaved(applet);
            setOpen(false);
        };

        const handleCreateApplet = () => {
            const newAppletId = uuidv4();
            dispatch(startNewApplet({ id: newAppletId }));
            dispatch(setActiveApplet(newAppletId));
            setCurrentAppletId(newAppletId);
            setView("quickapplet");
        };

        const handleQuickAppletSaved = async (applet?: CustomAppletConfig) => {
            try {
                if (currentAppletId) {
                    // Save the applet and get the result
                    const savedApplet = await dispatch(saveAppletThunk(currentAppletId)).unwrap();
                    // Pass the saved applet to the parent callback
                    onAppletSaved(savedApplet);
                } else if (applet) {
                    // If applet is provided directly, use that
                    onAppletSaved(applet);
                }
                setOpen(false);
                setView("list");
                setCurrentAppletId(undefined);
            } catch (error) {
                console.error("Error saving applet:", error);
                // Don't close the dialog if save fails, so user can try again
            }
        };

        const handleQuickAppletCancel = () => {
            setView("list");
            setCurrentAppletId(undefined);
        };

        return (
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                    {triggerComponent ? (
                        triggerComponent
                    ) : (
                        <Button variant={buttonVariant} size={buttonSize} className={buttonClassName}>
                            {buttonLabel}
                        </Button>
                    )}
                </DialogTrigger>

                <DialogContent
                    className={`
                    p-0 border-gray-200 dark:border-gray-700
                    ${isFullscreen ? "w-screen h-dvh max-w-none rounded-none" : "max-w-[80vw] h-[80dvh]"}
                `}
                >
                    <DialogHeader className="px-6 py-4 border-b border-border">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                                {view === "quickapplet" && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={handleQuickAppletCancel}
                                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                    >
                                        <ArrowLeft className="h-4 w-4" />
                                    </Button>
                                )}
                                <DialogTitle className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                                    {view === "list" ? dialogTitle : currentAppletId ? "Edit Applet" : "Create New Applet"}
                                </DialogTitle>
                            </div>
                        </div>
                    </DialogHeader>

                    {view === "list" ? (
                        <>
                            <div className="overflow-y-auto p-6 flex-1">
                                <SmartAppletList
                                    ref={appletListRef}
                                    onSelectApplet={handleAppletSelect}
                                    showCreateButton={showCreateOption}
                                    onCreateApplet={handleCreateApplet}
                                    showDelete={showDelete}
                                    className="pb-4"
                                    appletIds={appletIds}
                                    appId={appId}
                                    onRefreshComplete={onRefreshComplete}
                                />
                            </div>

                            <div className="px-6 py-4 border-t border-border bg-gray-50 dark:bg-gray-800 flex justify-end space-x-2">
                                <Button variant="outline" onClick={() => setOpen(false)}>
                                    Cancel
                                </Button>
                            </div>
                        </>
                    ) : (
                        <div className="h-full p-6">
                            <QuickAppletCreateEdit
                                appletId={currentAppletId}
                                appId={appId}
                                isNew={!currentAppletId}
                                onSaveApplet={handleQuickAppletSaved}
                                onRemoveApplet={handleQuickAppletCancel}
                                showLayoutOption={false}
                                showButtonOptions={false}
                            />
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        );
    };

// Static refresh method
AppletSelectCreateOverlay.refresh = async (): Promise<CustomAppletConfig[]> => {
    return Promise.resolve([]);
};

export default AppletSelectCreateOverlay;