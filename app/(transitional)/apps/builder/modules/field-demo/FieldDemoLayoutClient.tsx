"use client";

import React, { ReactNode } from "react";
import BuilderPageLayout from "../common/BuilderPageLayout";
import StructuredSectionCard from "@/components/official/StructuredSectionCard";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Save, Plus, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectHasUnsavedFieldChanges,
  selectActiveFieldId,
  selectDirtyFields,
} from "@/lib/redux/app-builder/selectors/fieldSelectors";
import {
  setActiveField,
  startFieldCreation,
} from "@/lib/redux/app-builder/slices/fieldBuilderSlice";
import { saveFieldThunk } from "@/lib/redux/app-builder/thunks/fieldBuilderThunks";
import { v4 as uuidv4 } from "uuid";
import { useToast } from "@/components/ui/use-toast";

interface FieldDemoLayoutProps {
  children: ReactNode;
}

export default function FieldDemoLayoutClient({
  children,
}: FieldDemoLayoutProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { toast } = useToast();

  // Use Redux selectors instead of context
  const hasUnsavedChanges = useAppSelector(selectHasUnsavedFieldChanges);
  const activeFieldId = useAppSelector(selectActiveFieldId);
  const dirtyFields = useAppSelector(selectDirtyFields);

  // Determine if we're in list or editor mode based on active field
  const isEditorMode = activeFieldId !== null;

  // Example actions using Redux
  const handleBack = () => {
    if (hasUnsavedChanges) {
      if (
        confirm("You have unsaved changes. Are you sure you want to leave?")
      ) {
        dispatch(setActiveField(null));
        router.push("/apps/builder/modules/field");
      }
    } else {
      dispatch(setActiveField(null));
      router.push("/apps/builder/modules/field");
    }
  };

  const handleSave = async () => {
    if (activeFieldId) {
      try {
        await dispatch(saveFieldThunk(activeFieldId)).unwrap();
        toast({
          title: "Success",
          description: "Field component saved successfully",
        });
      } catch (error) {
        toast({
          title: "Error",
          description: error.message || "Failed to save field component",
          variant: "destructive",
        });
      }
    }
  };

  const handleCreate = () => {
    const newId = uuidv4();
    dispatch(startFieldCreation({ id: newId }));
  };

  // Define dynamic header actions based on active tab
  const headerActions = !isEditorMode
    ? [
        <Button key="new" size="sm" variant="default" onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          New Field
        </Button>,
      ]
    : [
        hasUnsavedChanges && (
          <div
            key="status"
            className="flex items-center text-amber-500 dark:text-amber-400 mr-2 text-sm"
          >
            <AlertCircle className="h-4 w-4" />
            <span>Unsaved changes</span>
          </div>
        ),
      ];

  // Define dynamic footer actions
  const footerLeft = (
    <Button variant="outline" size="sm" onClick={handleBack}>
      <ArrowLeft className="h-4 w-4 mr-2" />
      Back to Fields
    </Button>
  );

  const footerCenter = isEditorMode && hasUnsavedChanges && (
    <div className="text-xs text-gray-500 dark:text-gray-400">
      Don't forget to save your changes
    </div>
  );

  const footerRight = isEditorMode && (
    <Button
      size="sm"
      onClick={handleSave}
      disabled={!hasUnsavedChanges}
      className={!hasUnsavedChanges ? "opacity-50 cursor-not-allowed" : ""}
    >
      <Save className="h-4 w-4 mr-2" />
      Save Component
    </Button>
  );

  return (
    <BuilderPageLayout activeModuleId="fields">
      <div className="container mx-auto px-4 py-6">
        <StructuredSectionCard
          title="Field Builder (Redux Demo)"
          description="Enhanced layout using Redux state management"
          headerActions={headerActions}
          footerLeft={footerLeft}
          footerCenter={footerCenter}
          footerRight={footerRight}
        >
          {children}
        </StructuredSectionCard>
      </div>
    </BuilderPageLayout>
  );
}
