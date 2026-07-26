// app\(authenticated)\apps\dynamic-layouts\page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import {
    selectAppletRuntimeActiveAppletId,
    setActiveAppletId,
    selectAppletRuntimeIsInitialized,
    selectActiveAppletLayoutType,
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
import { appletLayoutOptionsArray } from "@/features/applet/constants/layout-options";
import { AppletLayoutOption } from "@/types/customAppTypes";


export default function DynamicLayoutsPage() {
    const [layoutType, setLayoutType] = useState<AppletLayoutOption>("open");
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
    const standardAppLayout = useAppSelector(selectActiveAppletLayoutType);

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
        <>
            <CustomAppHeader isDemo={true} />
            <AppletLayoutManager appletId={validAppletId} layoutTypeOverride={layoutType} />

            <div className="px-6">
                <div className="py-8">
                    {/* Content based on active tab */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{/* Cards would go here */}</div>
                </div>
            </div>
        </>
    );
}
