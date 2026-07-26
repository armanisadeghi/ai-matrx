"use client";

import React, { ReactNode, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { usePathname, useRouter } from "next/navigation";
import {
  selectHasUnsavedFieldChanges,
  selectDirtyFields,
  selectActiveFieldId,
} from "@/lib/redux/app-builder/selectors/fieldSelectors";
import { startFieldCreation } from "@/lib/redux/app-builder/slices/fieldBuilderSlice";
import { v4 as uuidv4 } from "uuid";
import { fetchFieldsThunk } from "@/lib/redux/app-builder/thunks/fieldBuilderThunks";
import { useToast } from "@/components/ui/use-toast";
import { useNavigationInterceptor } from "@/lib/hooks/useNavigationInterceptor";
import { UnsavedChangesAlert } from "@/components/ui/unsaved-changes-alert";
import { useIsMobile } from "@/hooks/use-mobile";
import { AppBuilderNavTabs } from "@/features/applet/builder/parts/AppBuilderNavTabs";

interface FieldsLayoutProps {
  children: ReactNode;
}

export default function FieldsLayoutClient({ children }: FieldsLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  // Get global state from Redux
  const hasUnsavedChanges = useAppSelector(selectHasUnsavedFieldChanges);
  const dirtyFields = useAppSelector(selectDirtyFields);
  const activeFieldId = useAppSelector(selectActiveFieldId);

  // Set up navigation interception
  const fieldBuilderBasePath = "/apps/app-builder/fields";
  const {
    showDialog,
    pendingUrl,
    confirmNavigation,
    cancelNavigation,
    closeDialog,
  } = useNavigationInterceptor({
    shouldIntercept: hasUnsavedChanges,
    currentPath: fieldBuilderBasePath,
  });

  // Load fields data when the component mounts
  useEffect(() => {
    loadFields();
  }, []);

  // Determine the current mode based on URL
  const determineCurrentMode = () => {
    if (pathname === "/apps/app-builder/fields") return "main";
    if (pathname === "/apps/app-builder/fields/list") return "list";
    if (pathname === "/apps/app-builder/fields/create") return "create";
    if (pathname === "/apps/app-builder/fields/templates") return "templates";
    if (pathname === "/apps/app-builder/fields/organization")
      return "organization";
    if (pathname === "/apps/app-builder/fields/community") return "community";
    if (pathname.includes("/edit")) return "edit";
    if (pathname.includes("/apps/app-builder/fields/")) return "view";
    return "list";
  };

  const currentMode = determineCurrentMode();

  // Extract field ID from the path if we're in view or edit mode
  const getFieldIdFromPath = () => {
    if (
      currentMode === "list" ||
      currentMode === "create" ||
      currentMode === "templates" ||
      currentMode === "organization" ||
      currentMode === "community"
    )
      return null;
    const matches = pathname.match(/\/fields\/([^\/]+)/);
    return matches ? matches[1] : null;
  };

  const currentFieldId = getFieldIdFromPath();

  // Load fields from the API
  const loadFields = async () => {
    try {
      await dispatch(fetchFieldsThunk()).unwrap();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load fields",
        variant: "destructive",
      });
    }
  };

  // Handle creating a new field
  const handleCreateNew = () => {
    const newId = uuidv4();
    dispatch(startFieldCreation({ id: newId }));
    router.push(`/apps/app-builder/fields/${newId}/edit`);
  };

  // Navigate to the create page
  const navigateToCreate = () => {
    router.push("/apps/app-builder/fields/create");
  };

  // Navigate to the first unsaved field's edit page
  const navigateToUnsavedField = () => {
    if (dirtyFields.length > 0) {
      const firstDirtyFieldId = dirtyFields[0].id;
      router.push(`/apps/app-builder/fields/${firstDirtyFieldId}/edit`);
    }
  };

  // Handle viewing unsaved changes from the alert
  const handleViewUnsavedChanges = () => {
    closeDialog();
    navigateToUnsavedField();
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

  // Handle refreshing the fields list
  const handleRefresh = () => {
    loadFields();
    toast({
      title: "Refreshed",
      description: "Fields list has been refreshed",
    });
  };

  // Navigation handlers for tabs
  const navigateToMain = () => {
    router.push("/apps/app-builder/fields");
  };

  const navigateToList = () => {
    router.push("/apps/app-builder/fields/list");
  };

  const navigateToView = () => {
    if (currentFieldId) {
      router.push(`/apps/app-builder/fields/${currentFieldId}`);
    }
  };

  const navigateToEdit = () => {
    if (currentFieldId) {
      router.push(`/apps/app-builder/fields/${currentFieldId}/edit`);
    }
  };

  // Navigation handlers for new tabs
  const navigateToTemplates = () => {
    router.push("/apps/app-builder/fields/templates");
  };

  const navigateToOrganization = () => {
    router.push("/apps/app-builder/fields/organization");
  };

  const navigateToCommunity = () => {
    router.push("/apps/app-builder/fields/community");
  };

  // Prepare tab items for the reusable component
  const getTabItems = () => {
    const baseTabs = [
      { value: "main", label: "My Fields", onClick: navigateToMain },
      { value: "list", label: "Field List", onClick: navigateToList },
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

  // Define the base layout for all field operations
  return (
    <div className="flex flex-col space-y-4">
      <div className="pb-2">
        <AppBuilderNavTabs
          currentMode={currentMode}
          tabs={getTabItems()}
          hasUnsavedChanges={hasUnsavedChanges}
          unsavedItemsCount={dirtyFields.length}
          onRefresh={handleRefresh}
          onCreate={navigateToCreate}
          onUnsavedChanges={navigateToUnsavedField}
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
        unsavedItemsCount={dirtyFields.length}
      />
    </div>
  );
}
