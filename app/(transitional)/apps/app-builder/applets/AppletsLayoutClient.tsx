"use client";

import React, { ReactNode, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { usePathname, useRouter } from "next/navigation";
import {
  selectHasUnsavedAppletChanges,
  selectDirtyApplets,
  selectActiveAppletId,
} from "@/lib/redux/app-builder/selectors/appletSelectors";
import { startNewApplet } from "@/lib/redux/app-builder/slices/appletBuilderSlice";
import { v4 as uuidv4 } from "uuid";
import { fetchAppletsThunk } from "@/lib/redux/app-builder/thunks/appletBuilderThunks";
import { useToast } from "@/components/ui/use-toast";
import { useNavigationInterceptor } from "@/lib/hooks/useNavigationInterceptor";
import { UnsavedChangesAlert } from "@/components/ui/unsaved-changes-alert";
import { useIsMobile } from "@/hooks/use-mobile";
import { AppBuilderNavTabs } from "@/features/applet/builder/parts/AppBuilderNavTabs";

interface AppletsLayoutProps {
  children: ReactNode;
}

export default function AppletsLayoutClient({ children }: AppletsLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  // Get global state from Redux
  const hasUnsavedChanges = useAppSelector(selectHasUnsavedAppletChanges);
  const dirtyApplets = useAppSelector(selectDirtyApplets);
  const activeAppletId = useAppSelector(selectActiveAppletId);

  // Set up navigation interception
  const appletBuilderBasePath = "/apps/app-builder/applets";
  const {
    showDialog,
    pendingUrl,
    confirmNavigation,
    cancelNavigation,
    closeDialog,
  } = useNavigationInterceptor({
    shouldIntercept: hasUnsavedChanges,
    currentPath: appletBuilderBasePath,
  });

  // Load applets data when the component mounts
  useEffect(() => {
    loadApplets();
  }, []);

  // Determine the current mode based on URL
  const determineCurrentMode = () => {
    if (pathname === "/apps/app-builder/applets") return "main";
    if (pathname === "/apps/app-builder/applets/list") return "list";
    if (pathname === "/apps/app-builder/applets/create") return "create";
    if (pathname === "/apps/app-builder/applets/templates") return "templates";
    if (pathname === "/apps/app-builder/applets/organization")
      return "organization";
    if (pathname === "/apps/app-builder/applets/community") return "community";
    if (pathname.includes("/edit")) return "edit";
    if (pathname.includes("/apps/app-builder/applets/")) return "view";
    return "list";
  };

  const currentMode = determineCurrentMode();

  // Extract applet ID from the path if we're in view or edit mode
  const getAppletIdFromPath = () => {
    if (
      currentMode === "list" ||
      currentMode === "create" ||
      currentMode === "templates" ||
      currentMode === "organization" ||
      currentMode === "community"
    )
      return null;
    const matches = pathname.match(/\/applets\/([^\/]+)/);
    return matches ? matches[1] : null;
  };

  const currentAppletId = getAppletIdFromPath();

  // Load applets from the API
  const loadApplets = async () => {
    try {
      await dispatch(fetchAppletsThunk()).unwrap();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load applets",
        variant: "destructive",
      });
    }
  };

  // Navigate to the create page for a new applet
  const navigateToCreate = () => {
    router.push("/apps/app-builder/applets/create");
  };

  // Handle creating a new applet directly
  const handleCreateNew = () => {
    const newId = uuidv4();
    dispatch(startNewApplet({ id: newId }));
    router.push(`/apps/app-builder/applets/${newId}/edit`);
  };

  // Navigate to the first unsaved applet's edit page
  const navigateToUnsavedApplet = () => {
    if (dirtyApplets.length > 0) {
      const firstDirtyAppletId = dirtyApplets[0].id;
      router.push(`/apps/app-builder/applets/${firstDirtyAppletId}/edit`);
    }
  };

  // Handle viewing unsaved changes from the alert
  const handleViewUnsavedChanges = () => {
    closeDialog();
    navigateToUnsavedApplet();
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

  // Handle refreshing the applets list
  const handleRefresh = () => {
    loadApplets();
    toast({
      title: "Refreshed",
      description: "Applets list has been refreshed",
    });
  };

  // Navigation handlers for tabs
  const navigateToMain = () => {
    router.push("/apps/app-builder/applets");
  };

  const navigateToList = () => {
    router.push("/apps/app-builder/applets/list");
  };

  const navigateToView = () => {
    if (currentAppletId) {
      router.push(`/apps/app-builder/applets/${currentAppletId}`);
    }
  };

  const navigateToEdit = () => {
    if (currentAppletId) {
      router.push(`/apps/app-builder/applets/${currentAppletId}/edit`);
    }
  };

  // Navigation handlers for new tabs
  const navigateToTemplates = () => {
    router.push("/apps/app-builder/applets/templates");
  };

  const navigateToOrganization = () => {
    router.push("/apps/app-builder/applets/organization");
  };

  const navigateToCommunity = () => {
    router.push("/apps/app-builder/applets/community");
  };

  // Prepare tab items for the reusable component
  const getTabItems = () => {
    const baseTabs = [
      { value: "main", label: "My Applets", onClick: navigateToMain },
      { value: "list", label: "Applet List", onClick: navigateToList },
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

  // Define the base layout for all applet operations
  return (
    <div className="flex flex-col space-y-4">
      <div className="pb-2">
        <AppBuilderNavTabs
          currentMode={currentMode}
          tabs={getTabItems()}
          hasUnsavedChanges={hasUnsavedChanges}
          unsavedItemsCount={dirtyApplets.length}
          onRefresh={handleRefresh}
          onCreate={navigateToCreate}
          onUnsavedChanges={navigateToUnsavedApplet}
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
        unsavedItemsCount={dirtyApplets.length}
      />
    </div>
  );
}
