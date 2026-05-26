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

  // Determine active tab based on Redux state
  const activeTab = activeFieldId ? "editor" : "list";

  // Load all components on initial render
  useEffect(() => {
    loadComponents();
  }, []);

  // Load components from Redux (unchanged)
  const loadComponents = async () => {
    try {
      await dispatch(fetchFieldsThunk()).unwrap();
    } catch (err) {
      toast({
        title: "Error",
        description: err.message || "Failed to load components",
        variant: "destructive",
      });
    }
  };

  // Create a new component (unchanged)
  const handleCreateNew = () => {
    const newId = uuidv4();
    dispatch(startFieldCreation({ id: newId }));
    setIsCreatingNew(true);
  };

  // Edit an existing component (unchanged)
  const handleEdit = async (id) => {
    try {
      await dispatch(fetchFieldByIdThunk(id)).unwrap();
      dispatch(setActiveField(id));
      setIsCreatingNew(false);
    } catch (err) {
      toast({
        title: "Error",
        description: err.message || "Failed to load component",
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
  const handleSaveSuccess = (savedFieldId) => {
    setIsCreatingNew(false);
    dispatch(setActiveField(null));

    // Refresh the components list
    loadComponents();
  };

  // Delete a component (unchanged)
  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to delete this field component?"))
      return;

    try {
      await dispatch(deleteFieldThunk(id)).unwrap();

      if (activeFieldId === id) {
        dispatch(setActiveField(null));
      }

      toast({
        title: "Success",
        description: "Field component deleted successfully",
      });
    } catch (err) {
      toast({
        title: "Error",
        description: err.message || "Failed to delete component",
        variant: "destructive",
      });
    }
  };

  // Duplicate a component (unchanged)
  const handleDuplicate = async (id) => {
    try {
      const newComponent = await duplicateFieldComponent(id);
      // Refresh the components to include the new duplicated component
      await loadComponents();

      toast({
        title: "Success",
        description: "Field component duplicated successfully",
      });
    } catch (err) {
      toast({
        title: "Error",
        description: err.message || "Failed to duplicate component",
        variant: "destructive",
      });
    }
  };

  // Handle field selection (simplified)
  const handleFieldSelected = (id) => {
    dispatch(setActiveField(id));
    setIsCreatingNew(false);
  };

  // Handle tab change
  const handleTabChange = (value) => {
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
              onDeleteField={handleDelete}
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
    </div>
  );
}
