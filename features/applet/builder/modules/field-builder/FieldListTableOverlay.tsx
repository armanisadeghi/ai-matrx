// File Location: @/features/applet/builder/modules/field-builder/FieldListTableOverlay.tsx
"use client";
import React, { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { Button } from "@/components/ui/button";
import { X, List, Eye, ArrowLeft, Plus, Edit } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  startFieldCreation,
  setActiveField,
} from "@/lib/redux/app-builder/slices/fieldBuilderSlice";
import { selectFieldComponent } from "@/lib/redux/app-builder/selectors/fieldSelectors";
import { v4 as uuidv4 } from "uuid";
import FieldListTable from "./FieldListTable";
import FieldEditor from "./editor/FieldEditor";
import FieldPreview from "./previews/FieldPreview";

// Overlay view states
type OverlayView = "list" | "create" | "edit" | "view";

// Extend the original props with overlay-specific ones
interface FieldListTableOverlayProps {
  // Overlay behavior props
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
  overlayType?: "dialog" | "sheet";

  // Overlay appearance props
  overlayTitle?: string;
  overlayDescription?: string;
  overlaySize?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "full";
  sheetSide?: "top" | "right" | "bottom" | "left";
  showCloseButton?: boolean;
  closeOnSelect?: boolean;

  // Auto-configured props for overlay context
  autoConfigureForOverlay?: boolean;

  // Field management capabilities
  allowCreate?: boolean;
  allowEdit?: boolean;
  allowView?: boolean;
  allowDelete?: boolean;

  // Event handlers
  onFieldView?: (id: string) => void;
  onFieldEdit?: (id: string) => void;
  onFieldDelete?: (id: string) => void;
  onFieldSelect?: (id: string) => void;
  onFieldCreate?: () => void;
  onFieldCreated?: (fieldId: string) => void;
  onFieldUpdated?: (fieldId: string) => void;

  // All original FieldListTable props
  hiddenColumns?: string[];
  defaultPageSize?: number;
  customSettings?: any; // Using any to avoid importing the type
  hideTableHeader?: boolean;
  hideActionsColumn?: boolean;
  hideStatusColumn?: boolean;
  hideIconColumn?: boolean;
  hideTableFooter?: boolean;

  title?: string;
  allowSelectAction?: boolean;
  showStripedRows?: boolean;
  headerClassName?: string;
  searchPlaceholder?: string;
  createButtonText?: string;
  selectLabel?: string;
  allowRefresh?: boolean;

  renderCustomHeader?: React.ReactNode;
  customSelectActionRender?: (
    field: any,
    onClick: (e: React.MouseEvent) => void,
  ) => React.ReactNode;
}

export default function FieldListTableOverlay({
  // Overlay behavior props
  isOpen,
  onOpenChange,
  trigger,
  overlayType = "dialog",

  // Overlay appearance props
  overlayTitle = "Select Field Component",
  overlayDescription = "Choose a field component from the list below.",
  overlaySize = "2xl",
  sheetSide = "right",
  showCloseButton = true,
  closeOnSelect = true,

  // Auto-configuration
  autoConfigureForOverlay = true,

  // Field management capabilities
  allowCreate = false,
  allowEdit = false,
  allowView = false,
  allowDelete = false,

  // Event handlers
  onFieldView,
  onFieldEdit,
  onFieldDelete,
  onFieldSelect,
  onFieldCreate,
  onFieldCreated,
  onFieldUpdated,

  // Original table props
  hiddenColumns = [],
  defaultPageSize = 10,
  customSettings,
  hideTableHeader = false,
  hideActionsColumn = false,
  hideStatusColumn = false,
  hideIconColumn = false,
  hideTableFooter = false,

  title,
  allowSelectAction = true,
  showStripedRows = true,
  headerClassName,
  searchPlaceholder,
  createButtonText,
  selectLabel = "Select",
  allowRefresh = true,

  renderCustomHeader,
  customSelectActionRender,
}: FieldListTableOverlayProps) {
  const dispatch = useAppDispatch();

  // State for managing overlay views and current field
  const [currentView, setCurrentView] = useState<OverlayView>("list");
  const [currentFieldId, setCurrentFieldId] = useState<string | null>(null);

  // Get current field component type for preview
  const currentFieldComponentType = useAppSelector((state) =>
    currentFieldId ? selectFieldComponent(state, currentFieldId) : null,
  );

  // Auto-configure props for overlay context
  const overlayOptimizedProps = autoConfigureForOverlay
    ? {
        // Show the table header when we have an overlay title or table title
        hideTableHeader: overlayTitle || title ? false : true,

        // Reduce default page size for better overlay experience
        defaultPageSize: defaultPageSize || 8,

        // Configure actions for overlay context
        allowSelectAction: onFieldSelect ? true : allowSelectAction,
        selectLabel: onFieldSelect ? selectLabel || "Select" : selectLabel,

        // Auto-hide columns that might not be needed in overlay
        hiddenColumns: onFieldSelect ? [...hiddenColumns] : hiddenColumns,

        // Optimize for smaller screens
        showStripedRows: showStripedRows,

        // Custom search placeholder for overlay
        searchPlaceholder: searchPlaceholder || "Search fields...",
      }
    : {};

  // Handle field selection with optional close
  const handleFieldSelect = useCallback(
    (id: string) => {
      onFieldSelect?.(id);
      if (closeOnSelect && onOpenChange) {
        onOpenChange(false);
      }
    },
    [onFieldSelect, closeOnSelect, onOpenChange],
  );

  // Handle field view
  const handleFieldView = useCallback(
    (id: string) => {
      if (allowView) {
        setCurrentFieldId(id);
        setCurrentView("view");
        dispatch(setActiveField(id));
      } else {
        onFieldView?.(id);
        if (closeOnSelect && onOpenChange) {
          onOpenChange(false);
        }
      }
    },
    [allowView, onFieldView, closeOnSelect, onOpenChange, dispatch],
  );

  // Handle field edit
  const handleFieldEdit = useCallback(
    (id: string) => {
      if (allowEdit) {
        setCurrentFieldId(id);
        setCurrentView("edit");
        dispatch(setActiveField(id));
      } else {
        onFieldEdit?.(id);
        if (closeOnSelect && onOpenChange) {
          onOpenChange(false);
        }
      }
    },
    [allowEdit, onFieldEdit, closeOnSelect, onOpenChange, dispatch],
  );

  // Handle field creation
  const handleFieldCreate = useCallback(() => {
    if (allowCreate) {
      const newFieldId = uuidv4();
      setCurrentFieldId(newFieldId);
      setCurrentView("create");
      dispatch(startFieldCreation({ id: newFieldId }));
    } else {
      onFieldCreate?.();
    }
  }, [allowCreate, onFieldCreate, dispatch]);

  // Handle save success from FieldEditor
  const handleSaveSuccess = useCallback(
    (fieldId: string) => {
      if (currentView === "create") {
        onFieldCreated?.(fieldId);
      } else if (currentView === "edit") {
        onFieldUpdated?.(fieldId);
      }

      // Return to list view
      setCurrentView("list");
      setCurrentFieldId(null);
    },
    [currentView, onFieldCreated, onFieldUpdated],
  );

  // Handle cancel from FieldEditor
  const handleCancel = useCallback(() => {
    setCurrentView("list");
    setCurrentFieldId(null);
  }, []);

  // Handle back to list
  const handleBackToList = useCallback(() => {
    setCurrentView("list");
    setCurrentFieldId(null);
  }, []);

  // Get dynamic overlay title based on current view
  const getDynamicTitle = () => {
    switch (currentView) {
      case "create":
        return "Create New Field";
      case "edit":
        return "Edit Field";
      case "view":
        return "View Field";
      default:
        return overlayTitle;
    }
  };

  // Get dynamic overlay description based on current view
  const getDynamicDescription = () => {
    switch (currentView) {
      case "create":
        return "Create a new field component for your applet.";
      case "edit":
        return "Modify the field component settings and configuration.";
      case "view":
        return "View the details and configuration of this field component.";
      default:
        return overlayDescription;
    }
  };

  // Merge all props for the table
  const tableProps = {
    onFieldView: handleFieldView,
    onFieldEdit: allowEdit ? handleFieldEdit : onFieldEdit,
    onFieldDelete: allowDelete ? onFieldDelete : undefined,
    onFieldSelect: handleFieldSelect,
    onFieldCreate: allowCreate
      ? handleFieldCreate
      : onFieldCreate
        ? handleFieldCreate
        : undefined,
    allowDelete: allowDelete,

    hiddenColumns,
    defaultPageSize,
    customSettings,
    hideTableHeader,
    hideActionsColumn,
    hideStatusColumn,
    hideIconColumn,
    hideTableFooter,

    title: title,
    allowSelectAction,
    showStripedRows,
    headerClassName,
    searchPlaceholder,
    createButtonText: createButtonText,
    selectLabel,
    allowRefresh,

    renderCustomHeader,
    customSelectActionRender,

    // Apply overlay optimizations
    ...overlayOptimizedProps,
  };

  // Default trigger if none provided
  const defaultTrigger = (
    <Button variant="outline" size="sm">
      <List className="h-4 w-4 mr-2" />
      Browse Fields
    </Button>
  );

  // Render the appropriate content based on current view
  const renderContent = () => {
    switch (currentView) {
      case "create":
      case "edit":
        return (
          <div className="flex-1 overflow-auto px-2 py-0">
            <FieldEditor
              fieldId={currentFieldId}
              isCreatingNew={currentView === "create"}
              onSaveSuccess={handleSaveSuccess}
              onCancel={handleCancel}
            />
          </div>
        );

      case "view":
        return (
          <div className="flex-1 overflow-auto p-0">
            <FieldPreview
              fieldId={currentFieldId!}
              componentType={currentFieldComponentType}
            />
          </div>
        );

      default:
        return (
          <div className="flex flex-col h-full">
            {showCloseButton && overlayType === "sheet" && (
              <div className="flex justify-end p-2 border-b">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onOpenChange?.(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            <div className="flex-1 overflow-auto p-0">
              <FieldListTable {...tableProps} />
            </div>
          </div>
        );
    }
  };

  // Get dialog size classes
  const getDialogSizeClass = (size: string) => {
    switch (size) {
      case "sm":
        return "max-w-md";
      case "md":
        return "max-w-lg";
      case "lg":
        return "max-w-2xl";
      case "xl":
        return "max-w-4xl";
      case "2xl":
        return "max-w-6xl";
      case "3xl":
        return "max-w-7xl";
      case "full":
        return "max-w-[95vw]";
      default:
        return "max-w-4xl";
    }
  };

  if (overlayType === "sheet") {
    return (
      <>
        {trigger && (
          <span
            role="presentation"
            onClick={() => onOpenChange(true)}
            className="contents"
          >
            {trigger}
          </span>
        )}
        <MatrxDynamicPanelHost
          open={isOpen}
          onOpenChange={onOpenChange}
          title={getDynamicTitle()}
          description={getDynamicDescription() ?? undefined}
          position={
            sheetSide === "left" || sheetSide === "right" ? sheetSide : "right"
          }
          defaultSize={overlaySize === "full" ? 88 : 55}
          maxSize={92}
          contentClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
        >
          {renderContent()}
        </MatrxDynamicPanelHost>
      </>
    );
  }

  // Default to dialog
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        className={`${getDialogSizeClass(overlaySize)} max-h-[90dvh] flex flex-col p-0 gap-0`}
      >
        <DialogHeader className="px-6 pt-6 pb-0 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <DialogTitle>{getDynamicTitle()}</DialogTitle>
              {getDynamicDescription() && (
                <DialogDescription className="mt-1">
                  {getDynamicDescription()}
                </DialogDescription>
              )}
            </div>
            {(currentView === "create" ||
              currentView === "edit" ||
              currentView === "view") && (
              <div className="flex items-center gap-2 ml-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleBackToList}
                  className="gap-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                {currentView === "view" && allowEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleFieldEdit(currentFieldId!)}
                    className="gap-2"
                  >
                    <Edit className="h-4 w-4" />
                    Edit
                  </Button>
                )}
              </div>
            )}
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-auto">{renderContent()}</div>
      </DialogContent>
    </Dialog>
  );
}

// Export some common configurations for ease of use
export const FieldSelectOverlay = (
  props: Omit<
    FieldListTableOverlayProps,
    "overlayTitle" | "overlayDescription" | "selectLabel" | "closeOnSelect"
  >,
) => (
  <FieldListTableOverlay
    overlayTitle="Select Field Component"
    overlayDescription="Choose a field component to use in your form."
    closeOnSelect={true}
    autoConfigureForOverlay={true}
    {...props}
  />
);

export const FieldBrowserOverlay = (
  props: Omit<
    FieldListTableOverlayProps,
    "overlayTitle" | "overlayDescription" | "closeOnSelect"
  >,
) => (
  <FieldListTableOverlay
    overlayTitle="Browse Field Components"
    overlayDescription="View and manage your field components."
    closeOnSelect={false}
    autoConfigureForOverlay={true}
    {...props}
  />
);

export const FieldManagerOverlay = (
  props: Omit<
    FieldListTableOverlayProps,
    | "overlayTitle"
    | "overlayDescription"
    | "overlayType"
    | "overlaySize"
    | "allowCreate"
    | "allowEdit"
    | "allowView"
    | "allowDelete"
  >,
) => (
  <FieldListTableOverlay
    overlayTitle="Manage Field Components"
    overlayDescription="Create, edit, and organize your field components."
    overlayType="sheet"
    overlaySize="full"
    sheetSide="right"
    autoConfigureForOverlay={true}
    allowCreate={true}
    allowEdit={true}
    allowView={true}
    allowDelete={true}
    {...props}
  />
);
