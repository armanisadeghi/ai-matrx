"use client";

import React, { ReactNode, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { usePathname, useRouter } from "next/navigation";
import { fetchAppsThunk } from "@/lib/redux/app-builder/thunks/appBuilderThunks";
import { useToast } from "@/components/ui/use-toast";
import { useNavigationInterceptor } from "@/lib/hooks/useNavigationInterceptor";
import { UnsavedChangesAlert } from "@/components/ui/unsaved-changes-alert";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  selectHasUnsavedAppChanges,
  selectDirtyApps,
  selectActiveAppId,
} from "@/lib/redux/app-builder/selectors/appSelectors";
import { AppBuilderNavTabs } from "@/features/applet/builder/parts/AppBuilderNavTabs";

interface AppsLayoutProps {
  children: ReactNode;
}

export default function AppsSectionLayoutClient({ children }: AppsLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  // Get global state from Redux
  const hasUnsavedChanges = useAppSelector(selectHasUnsavedAppChanges);
  const dirtyApps = useAppSelector(selectDirtyApps);
  const activeAppId = useAppSelector(selectActiveAppId);

  // Set up navigation interception
  const appBuilderBasePath = "/apps/app-builder/apps";
  const {
    showDialog,
    pendingUrl,
    confirmNavigation,
    cancelNavigation,
    closeDialog,
  } = useNavigationInterceptor({
    shouldIntercept: hasUnsavedChanges,
    currentPath: appBuilderBasePath,
  });

  // Load apps data when the component mounts
  useEffect(() => {
    loadApps();
  }, []);

  // Determine the current mode based on URL
  const determineCurrentMode = () => {
    if (pathname === "/apps/app-builder/apps") return "main";
    if (pathname === "/apps/app-builder/apps/list") return "list";
    if (pathname === "/apps/app-builder/apps/create") return "create";
    if (pathname === "/apps/app-builder/apps/templates") return "templates";
    if (pathname === "/apps/app-builder/apps/organization")
      return "organization";
    if (pathname === "/apps/app-builder/apps/community") return "community";
    if (pathname.includes("/edit")) return "edit";
    if (pathname.includes("/apps/app-builder/apps/")) return "view";
    return "list";
  };

  const currentMode = determineCurrentMode();

  // Extract app ID from the path if we're in view or edit mode
  const getAppIdFromPath = () => {
    if (
      currentMode === "list" ||
      currentMode === "create" ||
      currentMode === "templates" ||
      currentMode === "organization" ||
      currentMode === "community"
    )
      return null;
    const matches = pathname.match(/\/apps\/([^\/]+)/);
    return matches ? matches[1] : null;
  };

  const currentAppId = getAppIdFromPath();

  // Load apps from the API
  const loadApps = async () => {
    try {
      await dispatch(fetchAppsThunk()).unwrap();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load apps",
        variant: "destructive",
      });
    }
  };

  // Navigate to the create page for a new app
  const navigateToCreate = () => {
    router.push("/apps/app-builder/apps/create");
  };

  // Navigate to the first unsaved app's edit page
  const navigateToUnsavedApp = () => {
    if (dirtyApps.length > 0) {
      const firstDirtyAppId = dirtyApps[0].id;
      router.push(`/apps/app-builder/apps/${firstDirtyAppId}/edit`);
    }
  };

  // Handle viewing unsaved changes from the alert
  const handleViewUnsavedChanges = () => {
    closeDialog();
    navigateToUnsavedApp();
  };

  // Handle continuing navigation despite unsaved changes
  const handleContinueNavigation = () => {
    confirmNavigation();
  };

  // Handle dialog state changes
  const handleDialogOpenChange = (open: boolean) => {
    if (!open) {
      closeDialog();
    }
  };

  // Handle refreshing the apps list
  const handleRefresh = () => {
    loadApps();
    toast({
      title: "Refreshed",
      description: "Apps list has been refreshed",
    });
  };

  // Navigation handlers for tabs
  const navigateToMain = () => {
    router.push("/apps/app-builder/apps");
  };

  const navigateToList = () => {
    router.push("/apps/app-builder/apps/list");
  };

  const navigateToView = () => {
    if (currentAppId) {
      router.push(`/apps/app-builder/apps/${currentAppId}`);
    }
  };

  const navigateToEdit = () => {
    if (currentAppId) {
      router.push(`/apps/app-builder/apps/${currentAppId}/edit`);
    }
  };

  // Navigation handlers for new tabs
  const navigateToTemplates = () => {
    router.push("/apps/app-builder/apps/templates");
  };

  const navigateToOrganization = () => {
    router.push("/apps/app-builder/apps/organization");
  };

  const navigateToCommunity = () => {
    router.push("/apps/app-builder/apps/community");
  };

  // Prepare tab items for the reusable component
  const getTabItems = () => {
    const baseTabs = [
      { value: "main", label: "My Apps", onClick: navigateToMain },
      { value: "list", label: "App List", onClick: navigateToList },
      { value: "create", label: "Create New", onClick: navigateToCreate },
      { value: "templates", label: "Templates", onClick: navigateToTemplates },
      {
        value: "organization",
        label: "Organization",
        onClick: navigateToOrganization,
      },
      { value: "community", label: "Community", onClick: navigateToCommunity },
    ];

    // For view or edit modes, add the view and edit tabs
    if (currentMode === "view" || currentMode === "edit") {
      return [
        ...baseTabs,
        { value: "view", label: "View Details", onClick: navigateToView },
        { value: "edit", label: "Edit", onClick: navigateToEdit },
      ];
    }

    return baseTabs;
  };

  // Define the base layout for all app operations
  return (
    <div className="flex flex-col space-y-4">
      <div className="pb-2">
        <AppBuilderNavTabs
          currentMode={currentMode}
          tabs={getTabItems()}
          hasUnsavedChanges={hasUnsavedChanges}
          unsavedItemsCount={dirtyApps.length}
          onRefresh={handleRefresh}
          onCreate={navigateToCreate}
          onUnsavedChanges={navigateToUnsavedApp}
        />
      </div>

      {/* Main content */}
      <div>{children}</div>

      {/* Unsaved changes alert dialog */}
      <UnsavedChangesAlert
        open={showDialog}
        onOpenChange={handleDialogOpenChange}
        onViewChanges={handleViewUnsavedChanges}
        onContinue={handleContinueNavigation}
        unsavedItemsCount={dirtyApps.length}
      />
    </div>
  );
}
