"use client";

import React, { useEffect } from "react";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import {
  selectAppletRuntimeActiveAppletId,
  selectActiveAppletSlug,
  selectAppletRuntimeBySlug,
  selectAppletIdBySlug,
  selectAppletRuntimeIsInitialized,
} from "@/lib/redux/app-runner/slices/customAppletRuntimeSlice";
import {
  selectAppRuntimeId,
  selectAppRuntimeIsDemo,
  selectAppRuntimeIsDebug,
  selectAppRuntimeIsInitialized,
  selectAppRuntimeStatus,
} from "@/lib/redux/app-runner/slices/customAppRuntimeSlice";
import { fetchAppWithApplets } from "@/lib/redux/app-runner/thunks/appRunnerThunks";
import { LoadingSpinner } from "@/components/ui/spinner";
import { CustomAppHeader } from "@/features/applet/runner/header/CustomAppHeader";
import AppletRunComponent from "@/features/applet/runner/AppletRunComponent";
import { AppletLayoutOption } from "@/types/customAppTypes";

interface LiveAppAndAppletPreviewProps {
  appSlug?: string;
  appId?: string;
  appletSlug: string;
  layoutTypeOverride?: AppletLayoutOption;
  isPreview?: boolean;
  allowSubmit?: boolean;
  hideHeader?: boolean;
  className?: string;
  forceHeaderDisplay?: boolean;
  isFullScreenPreview?: boolean;
  showUserMenu?: boolean;
}

/**
 * Component that combines app layout and applet rendering for preview purposes
 * This creates a self-contained preview that loads the app and applet data and renders it
 */
export default function LiveAppAndAppletPreview({
  appSlug,
  appId,
  appletSlug,
  layoutTypeOverride,
  isPreview = true,
  allowSubmit = true,
  hideHeader = false,
  className,
  forceHeaderDisplay = false,
  isFullScreenPreview = false,
  showUserMenu,
}: LiveAppAndAppletPreviewProps) {
  const dispatch = useAppDispatch();
  const status = useAppSelector(selectAppRuntimeStatus);

  // Initial app data loading - can use either appSlug or appId
  useEffect(() => {
    if (status === "uninitialized" && (appSlug || appId)) {
      dispatch(
        fetchAppWithApplets({
          idOrSlug: appId || (appSlug as string),
          isSlug: Boolean(!appId && appSlug),
          validationOptions: {
            runValidations: false,
            logResults: false,
          },
        }),
      );
    }
  }, [dispatch, appSlug, appId, status]);

  // Get app and applet data from state
  const reduxAppId = useAppSelector(selectAppRuntimeId);
  const isDemo = useAppSelector(selectAppRuntimeIsDemo);
  const isDebug = useAppSelector(selectAppRuntimeIsDebug);
  const isAppInitialized = useAppSelector(selectAppRuntimeIsInitialized);
  const isAppletInitialized = useAppSelector(selectAppletRuntimeIsInitialized);
  const activeAppletSlug = useAppSelector(selectActiveAppletSlug);
  const applet = useAppSelector((state) =>
    selectAppletRuntimeBySlug(state, appletSlug),
  );
  const appletId = useAppSelector((state) =>
    selectAppletIdBySlug(state, appletSlug),
  );

  // Loading state
  if (!isAppInitialized || !isAppletInitialized || !applet || !appletId) {
    return (
      <div
        className={`flex flex-col items-center justify-center ${className || "h-full w-full"}`}
      >
        <LoadingSpinner size="lg" />
        <p className="mt-4 text-gray-600 dark:text-gray-400 text-sm animate-pulse">
          Loading preview...
        </p>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col bg-textured transition-colors ${className || "h-full w-full"}`}
    >
      {(!hideHeader || forceHeaderDisplay) && (
        <div className="w-full">
          <CustomAppHeader
            appId={reduxAppId}
            initialActiveAppletSlug={activeAppletSlug || appletSlug}
            isDemo={isDemo}
            isDebug={isDebug}
            isPreview={isPreview}
            showUserMenu={showUserMenu ?? isFullScreenPreview}
          />
        </div>
      )}
      <div className="flex-1 overflow-hidden flex justify-center">
        <div className={`w-full ${isFullScreenPreview ? "" : "max-w-xl"}`}>
          <AppletRunComponent
            appSlug={appSlug || ""}
            appletSlug={appletSlug}
            layoutTypeOverride={layoutTypeOverride}
            isPreview={isPreview}
            allowSubmit={allowSubmit}
          />
        </div>
      </div>
    </div>
  );
}
