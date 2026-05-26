"use client";

import React, { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectFieldById,
  selectFieldLoading,
  selectFieldIsDirty,
} from "@/lib/redux/app-builder/selectors/fieldSelectors";
import { setActiveField } from "@/lib/redux/app-builder/slices/fieldBuilderSlice";
import { fetchFieldByIdThunk } from "@/lib/redux/app-builder/thunks/fieldBuilderThunks";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";
import FieldEditor from "@/features/applet/builder/modules/field-builder/editor/FieldEditor";

export default function FieldEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Use React.use() to unwrap the params Promise
  const resolvedParams = React.use(params);
  const { id } = resolvedParams;

  const dispatch = useAppDispatch();
  const router = useRouter();
  const { toast } = useToast();

  // Get field data from Redux
  const field = useAppSelector((state) => selectFieldById(state, id));
  const isLoading = useAppSelector(selectFieldLoading);
  const isDirty = useAppSelector((state) => selectFieldIsDirty(state, id));

  // Determine if this is a new field
  const isCreatingNew = field?.isLocal === true;

  // Load field data when the component mounts
  useEffect(() => {
    const loadField = async () => {
      try {
        if (!field) {
          await dispatch(fetchFieldByIdThunk(id)).unwrap();
        }
        dispatch(setActiveField(id));
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to load field component",
          variant: "destructive",
        });
        router.push("/apps/app-builder/fields");
      }
    };

    loadField();
  }, [id, dispatch, field, router, toast]);

  // Handle save success - navigation is handled by the layout
  const handleSaveSuccess = () => {
    // We don't need to do anything here as the layout will handle navigation
    // after a successful save
  };

  // Handle cancel - navigation is handled by the layout
  const handleCancel = () => {
    // We don't need to do anything here as the layout will handle navigation
    // when the user clicks the "View" button
  };

  if (isLoading || !field) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <FieldEditor
        fieldId={id}
        isCreatingNew={isCreatingNew}
        onSaveSuccess={handleSaveSuccess}
        onCancel={handleCancel}
      />
    </div>
  );
}
