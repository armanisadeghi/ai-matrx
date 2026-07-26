"use client";

import React, { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import FieldComponentsList from "@/features/applet/builder/modules/field-builder/FieldComponentsList";
import FieldEditor from "@/features/applet/builder/modules/field-builder/editor/FieldEditor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  selectAllFields,
  selectFieldLoading,
  selectFieldError,
  selectActiveFieldId,
} from "@/lib/redux/app-builder/selectors/fieldSelectors";
import {
  setActiveField,
  startFieldCreation,
  cancelFieldCreation,
} from "@/lib/redux/app-builder/slices/fieldBuilderSlice";
import {
  fetchFieldsThunk,
  deleteFieldThunk,
  fetchFieldByIdThunk,
  saveFieldThunk,
} from "@/lib/redux/app-builder/thunks/fieldBuilderThunks";
import { v4 as uuidv4 } from "uuid";
import { duplicateFieldComponent } from "@/lib/redux/app-builder/service/fieldComponentService";
import { useToast } from "@/components/ui/use-toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

export default function FieldBuilderDemo() {
  const dispatch = useAppDispatch();
  const { toast } = useToast();

  // Get state from Redux (unchanged from original)
  const components = useAppSelector(selectAllFields);
  const isLoading = useAppSelector(selectFieldLoading);
  const error = useAppSelector(selectFieldError);
  const activeFieldId = useAppSelector(selectActiveFieldId);

  // Local state for UI (use Redux state now)
  const [isCreatingNew, setIsCreatingNew] = React.useState(false);
  const [deleteTargetId, setDeleteTargetId] = React.useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);

  // Determine active tab based on Redux state
  const activeTab = activeFieldId ? "editor" : "list";

  // Load components from Redux (unchanged)
  const loadComponents = async () => {
    try {
      await dispatch(fetchFieldsThunk()).unwrap();
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: errorMessage(err, "Failed to load components"),
        variant: "destructive",
      });
    }
  };

  // Load all components on initial render
  useEffect(() => {
    const loadInitialComponents = async () => {
      try {
        await dispatch(fetchFieldsThunk()).unwrap();
      } catch (err: unknown) {
        toast({
          title: "Error",
          description: errorMessage(err, "Failed to load components"),
          variant: "destructive",
        });
      }
    };

    void loadInitialComponents();
  }, [dispatch, toast]);

  // Create a new component (unchanged)
  const handleCreateNew = () => {
    const newId = uuidv4();
    dispatch(startFieldCreation({ id: newId }));
    setIsCreatingNew(true);
  };

  // Edit an existing component (unchanged)
  const handleEdit = async (id: string) => {
    try {
      await dispatch(fetchFieldByIdThunk(id)).unwrap();
      dispatch(setActiveField(id));
      setIsCreatingNew(false);
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: errorMessage(err, "Failed to load component"),
        variant: "destructive",
      });
    }
  };

  // Cancel editing (unchanged)
  const handleCancel = () => {
    if (activeFieldId && isCreatingNew) {
      dispatch(cancelFieldCreation(activeFieldId));
    }

    dispatch(setActiveField(null));
    setIsCreatingNew(false);
  };

  // Handle save success (unchanged)
  const handleSaveSuccess = (_savedFieldId: string) => {
    setIsCreatingNew(false);
    dispatch(setActiveField(null));

    // Refresh the components list
    void loadComponents();
  };

  // Delete a component (unchanged)
  const handleDelete = async (id: string) => {
    try {
      await dispatch(deleteFieldThunk(id)).unwrap();

      if (activeFieldId === id) {
        dispatch(setActiveField(null));
      }

      toast({
        title: "Success",
        description: "Field component deleted successfully",
      });
      setDeleteTargetId(null);
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: errorMessage(err, "Failed to delete component"),
        variant: "destructive",
      });
    }
  };

  // Duplicate a component (unchanged)
  const handleDuplicate = async (id: string) => {
    try {
      await duplicateFieldComponent(id);
      // Refresh the components to include the new duplicated component
      await loadComponents();

      toast({
        title: "Success",
        description: "Field component duplicated successfully",
      });
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: errorMessage(err, "Failed to duplicate component"),
        variant: "destructive",
      });
    }
  };

  // Handle field selection (simplified)
  const handleFieldSelected = (id: string) => {
    dispatch(setActiveField(id));
    setIsCreatingNew(false);
  };

  // Handle tab change
  const handleTabChange = (value: string) => {
    if (value === "list") {
      dispatch(setActiveField(null));
    }
  };

  return (
    <div className="w-full">
      {error && (
        <div className="p-3 mb-4 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 rounded">
          {error}
        </div>
      )}

      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-2 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
          <TabsTrigger
            value="list"
            className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-800 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400"
          >
            Component List
          </TabsTrigger>
          <TabsTrigger
            value="editor"
            className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-800 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400"
            disabled={!activeFieldId}
          >
            {isCreatingNew ? "Create Component" : "Edit Component"}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-6">
          {isLoading && !components.length ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          ) : (
            <FieldComponentsList
              fields={components}
              onFieldSelected={handleFieldSelected}
              onCreateNew={handleCreateNew}
              onEditField={handleEdit}
              onDeleteField={setDeleteTargetId}
              onDuplicateField={handleDuplicate}
              isLoading={isLoading}
            />
          )}
        </TabsContent>

        <TabsContent value="editor" className="mt-6">
          {activeFieldId && (
            <FieldEditor
              fieldId={activeFieldId}
              isCreatingNew={isCreatingNew}
              onSaveSuccess={handleSaveSuccess}
              onCancel={handleCancel}
            />
          )}
        </TabsContent>
      </Tabs>
      <ConfirmDialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) setDeleteTargetId(null);
        }}
        title="Delete field component"
        description="Permanently delete this field component. This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        busy={deleteBusy}
        onConfirm={async () => {
          if (!deleteTargetId) return;
          setDeleteBusy(true);
          try {
            await handleDelete(deleteTargetId);
          } finally {
            setDeleteBusy(false);
          }
        }}
      />
    </div>
  );
}
