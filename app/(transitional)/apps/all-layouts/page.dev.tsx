"use client";

import React, { useEffect } from "react";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import {
    selectAppletRuntimeActiveAppletId,
    setActiveAppletId,
    selectAppletRuntimeIsInitialized,
} from "@/lib/redux/app-runner/slices/customAppletRuntimeSlice";
import {
    selectAppRuntimeId,
    selectAppRuntimeIsInitialized,
    selectAppRuntimeStatus,
    selectAppRuntimeAppletList,
} from "@/lib/redux/app-runner/slices/customAppRuntimeSlice";
import { LoadingSpinner } from "@/components/ui/spinner";
import AppletLayoutManager from "@/features/applet/runner/layouts/AppletLayoutManager";
import { fetchAppWithApplets } from "@/lib/redux/app-runner/thunks/appRunnerThunks";
import { CustomAppHeader } from "@/features/applet/runner/header";
import AppletLayoutIntroCard from "@/features/applet/builder/parts/AppletLayoutIntroCard";
import { Beaker, MessageSquare, Map, LayoutPanelTop } from "lucide-react";
import { appletLayoutOptionsArray } from "@/features/applet/constants/layout-options";
import { AppletLayoutOption } from "@/types/customAppTypes";


export default function SearchAppletPage() {
    const dispatch = useAppDispatch();
    const status = useAppSelector(selectAppRuntimeStatus);
    const appSlug = "test-applet";
    const appletId = "da4b93ac-176d-466c-bb13-c627d8def0c9";

    useEffect(() => {
        if (status === "uninitialized") {
            dispatch(
                fetchAppWithApplets({
                    idOrSlug: appSlug,
                    isSlug: true,
                    validationOptions: {
                        runValidations: false,
                        logResults: false,
                    },
                })
            );
        } else {
            console.log("Not fetching, status already:", status);
        }
    }, [dispatch]);

    const availableApplets = useAppSelector(selectAppRuntimeAppletList);

    if (availableApplets?.length === 0 && status !== "loading" && status !== "uninitialized") {
        throw new Error("This app has no applets configured");
    }

    const validAppletId = availableApplets?.find((applet) => applet.appletId === appletId)?.appletId || availableApplets?.[0]?.appletId;

    const isAppInitialized = useAppSelector(selectAppRuntimeIsInitialized);
    const isAppletInitialized = useAppSelector(selectAppletRuntimeIsInitialized);
    const activeAppletId = useAppSelector(selectAppletRuntimeActiveAppletId);

    // Filter layouts by experimental status
    const standardLayouts = appletLayoutOptionsArray.filter(layout => !layout.experimental);
    const experimentalLayouts = appletLayoutOptionsArray.filter(layout => layout.experimental);

    // Set as active applet if not already active
    useEffect(() => {
        if (isAppInitialized && validAppletId && activeAppletId !== validAppletId) {
            dispatch(setActiveAppletId(validAppletId));
        }
    }, [dispatch, isAppInitialized, validAppletId, activeAppletId]);

    if (!isAppInitialized || !isAppletInitialized || !validAppletId) {
        return (
            <div className="h-full w-full flex items-center justify-center">
                <LoadingSpinner />
            </div>
        );
    }

    // Helper function to render a layout section
    const renderLayoutSection = (layoutType: AppletLayoutOption, extraClasses: string = "") => (
        <>
            <AppletLayoutIntroCard layoutType={layoutType} />
            <div className={extraClasses}>
                <AppletLayoutManager appletId={validAppletId} layoutTypeOverride={layoutType} />
            </div>
        </>
    );

    return (
        <div className="h-full w-full bg-textured transition-colors">
            <CustomAppHeader isDemo={true} />

            <div className="w-full mt-24 mb-8">
                <div className="w-full bg-indigo-50 dark:bg-indigo-950/40 border-t border-b border-indigo-200 dark:border-indigo-800">
                    <div className="flex items-center p-3 max-w-screen-2xl mx-auto">
                        <div className="flex-shrink-0 mr-3 w-8 h-8 flex items-center justify-center bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 rounded-full">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z"/><path d="M16 8h.01"/><path d="M16 12h.01"/><path d="M8 8h.01"/><path d="M8 12h.01"/><path d="M12 18h.01"/><path d="M12 8h.01"/><path d="M4 18h16"/></svg>
                        </div>
                        <div>
                            <h3 className="font-medium text-indigo-700 dark:text-indigo-300">Applet Specified Layout</h3>
                            <p className="text-sm text-indigo-600 dark:text-indigo-400">Default layout as configured in the applet's settings</p>
                        </div>
                    </div>
                </div>
            </div>
            <AppletLayoutManager appletId={validAppletId} />
            
            {/* Render all standard layouts */}
            {standardLayouts.map(layout => {
                // Add special classes for specific layouts
                let extraClasses = "";
                if (layout.value === "horizontal") extraClasses = "mt-64 mb-64";
                if (layout.value === "minimalist") extraClasses = "mb-32";
                if (layout.value === "cardStack") extraClasses = "mb-20";
                
                return (
                    <React.Fragment key={layout.value}>
                        {renderLayoutSection(layout.value, extraClasses)}
                    </React.Fragment>
                );
            })}

            {/* Experimental layouts section */}
            <div className="my-8 p-6 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800 shadow-sm">
                <div className="flex items-center mb-3">
                    <Beaker className="h-6 w-6 text-blue-600 dark:text-blue-400 mr-3" />
                    <h1 className="text-2xl font-bold text-blue-700 dark:text-blue-400">Experimental Layouts</h1>
                </div>
                <p className="text-blue-700 dark:text-blue-300 mb-5">
                    These cutting-edge layouts showcase new interaction patterns and user experiences. We're currently refining these
                    designs based on user feedback and research.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    {experimentalLayouts.map(layout => (
                        <div key={layout.value} className="flex items-center p-3 bg-blue-100/70 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-800">
                            <span className="h-5 w-5 text-blue-600 dark:text-blue-400 mr-2">{layout.icon}</span>
                            <span className="text-blue-700 dark:text-blue-300">{layout.title.replace(" Layout", "")}</span>
                        </div>
                    ))}
                </div>
                <div className="text-sm text-blue-600 dark:text-blue-400 flex items-center">
                    <span className="inline-block h-2 w-2 rounded-full bg-blue-500 dark:bg-blue-400 mr-2"></span>
                    Feedback and suggestions welcome on these experimental interfaces
                </div>
            </div>

            {/* Render all experimental layouts */}
            {experimentalLayouts.map(layout => {
                // Add special classes for specific layouts
                let extraClasses = "";
                if (layout.value === "chat") extraClasses = "mb-24";
                
                return (
                    <React.Fragment key={layout.value}>
                        {renderLayoutSection(layout.value, extraClasses)}
                    </React.Fragment>
                );
            })}
        </div>
    );
}
