"use client";

import React, { ReactNode, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { usePathname, useRouter } from "next/navigation";
import {
  selectHasUnsavedContainerChanges,
  selectDirtyContainers,
  selectActiveContainerId,
} from "@/lib/redux/app-builder/selectors/containerSelectors";
import { startNewContainer } from "@/lib/redux/app-builder/slices/containerBuilderSlice";
import { v4 as uuidv4 } from "uuid";
import { fetchContainersThunk } from "@/lib/redux/app-builder/thunks/containerBuilderThunks";
import { useToast } from "@/components/ui/use-toast";
import { useNavigationInterceptor } from "@/lib/hooks/useNavigationInterceptor";
import { UnsavedChangesAlert } from "@/components/ui/unsaved-changes-alert";
import { useIsMobile } from "@/hooks/use-mobile";
import { AppBuilderNavTabs } from "@/features/applet/builder/parts/AppBuilderNavTabs";

interface ContainersLayoutProps {
  children: ReactNode;
}

export default function ContainersLayoutClient({
  children,
}: ContainersLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  // Get global state from Redux
  const hasUnsavedChanges = useAppSelector(selectHasUnsavedContainerChanges);
  const dirtyContainers = useAppSelector(selectDirtyContainers);
  const activeContainerId = useAppSelector(selectActiveContainerId);

  // Set up navigation interception
  const containerBuilderBasePath = "/apps/app-builder/containers";
  const {
    showDialog,
    pendingUrl,
    confirmNavigation,
    cancelNavigation,
    closeDialog,
  } = useNavigationInterceptor({
    shouldIntercept: hasUnsavedChanges,
    currentPath: containerBuilderBasePath,
  });

  // Load containers data when the component mounts
  useEffect(() => {
    loadContainers();
  }, []);

  // Determine the current mode based on URL
  const determineCurrentMode = () => {
    if (pathname === "/apps/app-builder/containers") return "main";
    if (pathname === "/apps/app-builder/containers/list") return "list";
    if (pathname === "/apps/app-builder/containers/create") return "create";
    if (pathname === "/apps/app-builder/containers/templates")
      return "templates";
    if (pathname === "/apps/app-builder/containers/organization")
      return "organization";
    if (pathname === "/apps/app-builder/containers/community")
      return "community";
    if (pathname.includes("/edit")) return "edit";
    if (pathname.includes("/apps/app-builder/containers/")) return "view";
    return "list";
  };

  const currentMode = determineCurrentMode();

  // Extract container ID from the path if we're in view or edit mode
  const getContainerIdFromPath = () => {
    if (
      currentMode === "list" ||
      currentMode === "create" ||
      currentMode === "templates" ||
      currentMode === "organization" ||
      currentMode === "community"
    )
      return null;
    const matches = pathname.match(/\/containers\/([^\/]+)/);
    return matches ? matches[1] : null;
  };

  const currentContainerId = getContainerIdFromPath();

  // Load containers from the API
  const loadContainers = async () => {
    try {
      await dispatch(fetchContainersThunk()).unwrap();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load containers",
        variant: "destructive",
      });
    }
  };

  // Navigate to the create page for a new container
  const navigateToCreate = () => {
    router.push("/apps/app-builder/containers/create");
  };

  // Handle creating a new container directly
  const handleCreateNew = () => {
    const newId = uuidv4();
    dispatch(startNewContainer({ id: newId }));
    router.push(`/apps/app-builder/containers/${newId}/edit`);
  };

  // Navigate to the first unsaved container's edit page
  const navigateToUnsavedContainer = () => {
    if (dirtyContainers.length > 0) {
      const firstDirtyContainerId = dirtyContainers[0].id;
      router.push(`/apps/app-builder/containers/${firstDirtyContainerId}/edit`);
    }
  };

  // Handle viewing unsaved changes from the alert
  const handleViewUnsavedChanges = () => {
    closeDialog();
    navigateToUnsavedContainer();
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

  // Handle refreshing the containers list
  const handleRefresh = () => {
    loadContainers();
    toast({
      title: "Refreshed",
      description: "Containers list has been refreshed",
    });
  };

  // Navigation handlers for tabs
  const navigateToMain = () => {
    router.push("/apps/app-builder/containers");
  };

  const navigateToList = () => {
    router.push("/apps/app-builder/containers/list");
  };

  const navigateToView = () => {
    if (currentContainerId) {
      router.push(`/apps/app-builder/containers/${currentContainerId}`);
    }
  };

  const navigateToEdit = () => {
    if (currentContainerId) {
      router.push(`/apps/app-builder/containers/${currentContainerId}/edit`);
    }
  };

  // Navigation handlers for new tabs
  const navigateToTemplates = () => {
    router.push("/apps/app-builder/containers/templates");
  };

  const navigateToOrganization = () => {
    router.push("/apps/app-builder/containers/organization");
  };

  const navigateToCommunity = () => {
    router.push("/apps/app-builder/containers/community");
  };

  // Prepare tab items for the reusable component
  const getTabItems = () => {
    const baseTabs = [
      { value: "main", label: "My Containers", onClick: navigateToMain },
      { value: "list", label: "Container List", onClick: navigateToList },
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

  // Define the base layout for all container operations
  return (
    <div className="flex flex-col space-y-4">
      <div className="pb-2">
        <AppBuilderNavTabs
          currentMode={currentMode}
          tabs={getTabItems()}
          hasUnsavedChanges={hasUnsavedChanges}
          unsavedItemsCount={dirtyContainers.length}
          onRefresh={handleRefresh}
          onCreate={navigateToCreate}
          onUnsavedChanges={navigateToUnsavedContainer}
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
        unsavedItemsCount={dirtyContainers.length}
      />
    </div>
  );
}
