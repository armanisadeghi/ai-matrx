"use client";
import React, { useState, useRef, useEffect } from "react";
import { X, RefreshCw, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import SmartAppList, { SmartAppListRefType } from "./SmartAppList";
import { CustomAppConfig } from "@/types/customAppTypes";
import { QuickAppMaker } from "@/features/applet/builder/modules/app-builder/QuickAppMaker";
import { useAppDispatch } from "@/lib/redux/hooks";
import { startNewApp } from "@/lib/redux/app-builder/slices/appBuilderSlice";
import { v4 as uuidv4 } from "uuid";

// Define type for appIds
type AppId = string;

type AppSelectCreateOverlayProps = {
    onAppSaved: (app: CustomAppConfig) => void;
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
    appIds?: AppId[];
    onRefreshComplete?: (apps: CustomAppConfig[]) => void;
    gridColumns?: {
        sm?: number;
        md?: number;
        lg?: number;
        xl?: number;
    };
};

/**
 * An overlay component that allows selecting an app from a list
 * Can be triggered by a button or custom trigger component
 */
const AppSelectCreateOverlay: React.FC<AppSelectCreateOverlayProps> & {
    refresh: () => Promise<CustomAppConfig[]>;
} = ({
    onAppSaved,
    buttonLabel = "Select App",
    buttonVariant = "default",
    buttonSize = "default",
    buttonClassName = "",
    dialogTitle = "Select an App",
    showCreateOption = true,
    showDelete = true,
    triggerComponent,
    defaultOpen = false,
    isFullscreen = false,
    appIds,
    onRefreshComplete,
    gridColumns,
}) => {
        const dispatch = useAppDispatch();
        const [open, setOpen] = useState(defaultOpen);
        const [isRefreshing, setIsRefreshing] = useState(false);
        const [view, setView] = useState<"list" | "quickapp">("list");
        const [currentAppId, setCurrentAppId] = useState<string | undefined>(undefined);
        const appListRef = useRef<SmartAppListRefType | null>(null);

        const handleAppSelect = (app: CustomAppConfig) => {
            onAppSaved(app);
            setOpen(false);
        };

        const handleCreateApp = () => {
            const newAppId = uuidv4();
            dispatch(startNewApp({ id: newAppId }));
            setCurrentAppId(newAppId);
            setView("quickapp");
        };

        const handleQuickAppSaved = (appId: string, app?: CustomAppConfig) => {
            if (app) {
                onAppSaved(app);
            }
            setOpen(false);
            setView("list");
            setCurrentAppId(undefined);
        };

        const handleQuickAppCancel = () => {
            setView("list");
            setCurrentAppId(undefined);
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
                                {view === "quickapp" && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={handleQuickAppCancel}
                                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                    >
                                        <ArrowLeft className="h-4 w-4" />
                                    </Button>
                                )}
                                <DialogTitle className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                                    {view === "list" ? dialogTitle : currentAppId ? "Edit App" : "Create New App"}
                                </DialogTitle>
                            </div>
                        </div>
                    </DialogHeader>

                    {view === "list" ? (
                        <>
                            <div className={`overflow-y-auto p-6 ${isFullscreen ? "h-[calc(100dvh-10rem)]" : "max-h-[70dvh]"}`}>
                                <SmartAppList
                                    ref={appListRef}
                                    onSelectApp={handleAppSelect}
                                    showCreateButton={showCreateOption}
                                    onCreateApp={handleCreateApp}
                                    showDelete={showDelete}
                                    className="pb-4"
                                    appIds={appIds}
                                    onRefreshComplete={onRefreshComplete}
                                    gridColumns={gridColumns}
                                />
                            </div>

                            <div className="px-6 py-4 border-t border-border bg-gray-50 dark:bg-gray-800 flex justify-end space-x-2">
                                <Button variant="outline" onClick={() => setOpen(false)}>
                                    Cancel
                                </Button>
                            </div>
                        </>
                    ) : (
                        <div className="h-full">
                            <QuickAppMaker currentAppId={currentAppId} onAppSaved={handleQuickAppSaved} onCancel={handleQuickAppCancel} />
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        );
    };

// Static refresh method
AppSelectCreateOverlay.refresh = async (): Promise<CustomAppConfig[]> => {
    return Promise.resolve([]);
};

export default AppSelectCreateOverlay;
