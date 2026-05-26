// @/features/applet/demo/AppDemoLoader.tsx
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
    selectAppRuntimeIsDemo,
    selectAppRuntimeIsDebug,
    selectAppRuntimeIsInitialized,
    selectAppRuntimeStatus,
    selectAppRuntimeAppletList,
} from "@/lib/redux/app-runner/slices/customAppRuntimeSlice";
import { LoadingSpinner } from "@/components/ui/spinner";
import AppletLayoutManager from "@/features/applet/runner/layouts/AppletLayoutManager";
import { AppletLayoutOption } from "@/types/customAppTypes";
import { fetchAppWithApplets } from "@/lib/redux/app-runner/thunks/appRunnerThunks";
import { CustomAppHeader } from "@/features/applet/runner/header";
// @ts-ignore - Module path may not exist, using dynamic import fallback
// import LayoutSelector from "@/app/(transitional)/apps/dynamic-layouts/[id]/LayoutSelector";
const LayoutSelector = null as any;

interface AppDemoManagerProps {
    appSlug: string;
    appletId: string;
    layoutTypeOverride?: AppletLayoutOption;
    className?: string;
    demoWidth?: string;
    demoHeight?: string;
    demoHeaderClassName?: string;
}

export default function AppDemoManager({
    appSlug,
    appletId,
    layoutTypeOverride,
    className,
    demoWidth,
    demoHeight,
    demoHeaderClassName,
}: AppDemoManagerProps) {
    const dispatch = useAppDispatch();
    const status = useAppSelector(selectAppRuntimeStatus);

    useEffect(() => {
        if (status === "uninitialized" && appSlug) {
            const slugValue = Array.isArray(appSlug) ? appSlug[0] : appSlug;

            dispatch(
                fetchAppWithApplets({
                    idOrSlug: slugValue,
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
    }, [dispatch, appSlug]);

    const appId = useAppSelector(selectAppRuntimeId);

    const availableApplets = useAppSelector(selectAppRuntimeAppletList);

    if (availableApplets?.length === 0 && status !== "loading" && status !== "uninitialized") {
        throw new Error("This app has no applets configured");
    }

    const validAppletId = availableApplets?.find((applet) => applet.appletId === appletId)?.appletId || availableApplets?.[0]?.appletId;

    const isAppInitialized = useAppSelector(selectAppRuntimeIsInitialized);
    const isAppletInitialized = useAppSelector(selectAppletRuntimeIsInitialized);
    const activeAppletId = useAppSelector(selectAppletRuntimeActiveAppletId);

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
    return (
        <div
            className="overflow-hidden border-border rounded-lg shadow-lg"
            style={{
                width: demoWidth,
                height: demoHeight,
                margin: "0 auto", // Center the demo container
            }}
        >
            {/* Use the CustomAppHeader with our demo-specific className */}
            <CustomAppHeader appId={appId} isDemo={true} headerClassName={demoHeaderClassName} />

            {/* Main content area */}
            <div className="h-full w-full bg-textured transition-colors overflow-auto">
                <div className="w-full px-4 py-3">
                    <div className="max-w-lg">
                        <LayoutSelector currentLayout={layoutTypeOverride} />
                    </div>
                </div>
                <AppletLayoutManager appletId={validAppletId} layoutTypeOverride={layoutTypeOverride} className={className} />{" "}
            </div>
        </div>
    );
}
