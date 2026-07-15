"use client";

import React, { useRef, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import SmartAppListWrapper from "@/features/applet/builder/modules/smart-parts/apps/SmartAppListWrapper";
import { CustomAppConfig } from "@/types/customAppTypes";
import { SmartAppListRefType } from "@/features/applet/builder/modules/smart-parts/apps/SmartAppList";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAppById } from "@/lib/redux/app-builder/selectors/appSelectors";

interface SelectAppStepProps {
    onAppSelected: (id: string) => void;
    onCreateNewApp: () => void;
    selectedAppId: string | null;
    onUpdateCompletion?: (completion: {
        isComplete: boolean;
        canProceed: boolean;
        message?: string;
        footerButtons?: React.ReactNode;
    }) => void;
}

export const SelectAppStep: React.FC<SelectAppStepProps> = ({ onAppSelected, onCreateNewApp, selectedAppId, onUpdateCompletion }) => {
    const appListRef = useRef<SmartAppListRefType | null>(null);
    const selectedApp = useAppSelector((state) =>
        selectedAppId ? selectAppById(state, selectedAppId) : undefined
    );

    useEffect(() => {
        onUpdateCompletion?.({
            isComplete: !!selectedAppId,
            canProceed: !!selectedAppId,
            message: selectedAppId
                ? `"${selectedApp?.name || "Unknown"}" selected`
                : "Please select an app or create a new one to continue",
        });
    }, [selectedAppId, selectedApp]);

    const handleAppSelected = (app: CustomAppConfig) => {
        if (!app.id) {
            console.error("Cannot select an app without an id");
            return;
        }
        onAppSelected(app.id);
    };

    return (
        <div className="w-full">
            <Card className="bg-white dark:bg-slate-900 overflow-hidden p-0 rounded-3xl border border-rose-200 dark:border-rose-600">
                <CardHeader className="bg-gray-100 dark:bg-gray-700 border-b border-rose-200 dark:border-rose-600 p-3 rounded-t-3xl">
                    <div className="grid md:grid-cols-[1fr_auto] gap-4 md:items-center">
                        <div className="flex flex-col gap-1">
                            <h2 className="text-rose-500 font-medium text-lg">Select or Create an App</h2>
                            <p className="text-gray-600 dark:text-gray-300 text-sm">
                                Choose an existing app to edit or create a new one from scratch
                            </p>
                        </div>
                        <Button
                            onClick={onCreateNewApp}
                            variant="outline"
                            className="rounded-lg bg-gray-100 dark:bg-gray-900 hover:bg-gray-200 dark:hover:bg-gray-800 border text-blue-500 dark:text-blue-300 border-blue-500 dark:border-blue-600 hover:text-white flex items-center gap-2"
                        >
                            <PlusCircle className="h-4 w-4" />
                            Create New App
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="p-4">
                    <SmartAppListWrapper
                        ref={appListRef}
                        onSelectApp={handleAppSelected}
                        showCreateButton={true}
                        onCreateApp={onCreateNewApp}
                    />
                </CardContent>
            </Card>
        </div>
    );
};

export default SelectAppStep;
