"use client";

import React, { ReactNode, useEffect, useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectFieldById,
  selectFieldIsDirty,
} from "@/lib/redux/app-builder/selectors/fieldSelectors";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Save, AlertCircle } from "lucide-react";
import { saveFieldThunk } from "@/lib/redux/app-builder/thunks/fieldBuilderThunks";
import { useToast } from "@/components/ui/use-toast";
import StructuredSectionCard from "@/components/official/StructuredSectionCard";

interface FieldDetailLayoutProps {
  children: ReactNode;
  params: Promise<{ id: string }>;
}

export default function FieldDetailLayoutClient({
  children,
  params,
}: FieldDetailLayoutProps) {
  // Use React.use() to unwrap the params Promise
  const resolvedParams = React.use(params);
  const { id } = resolvedParams;

  const pathname = usePathname();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { toast } = useToast();

  // Get field data from Redux
  const field = useAppSelector((state) => selectFieldById(state, id));
  const isDirty = useAppSelector((state) => selectFieldIsDirty(state, id));

  // Check if we're in view or edit mode
  const isEditMode = pathname.includes("/edit");

  // Handle back button - memoized to use in useEffect
  const handleBack = useCallback(() => {
    if (isDirty && isEditMode) {
      if (
        confirm("You have unsaved changes. Are you sure you want to leave?")
      ) {
        router.push("/apps/app-builder/fields");
      }
    } else {
      router.push("/apps/app-builder/fields");
    }
  }, [isDirty, isEditMode, router]);

  // Handle save - memoized to use in useEffect
  const handleSave = useCallback(async () => {
    if (id) {
      try {
        await dispatch(saveFieldThunk(id)).unwrap();
        toast({
          title: "Success",
          description: "Field component saved successfully",
        });
        router.push(`/apps/app-builder/fields/${id}`);
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to save field component",
          variant: "destructive",
        });
      }
    }
  }, [id, dispatch, toast, router]);

  // Get dynamic title and description based on field and mode
  const title = field
    ? isEditMode
      ? `Edit: ${field.label}`
      : field.label
    : isEditMode
      ? "Create Field"
      : "Field Details";

  const description = isEditMode
    ? "Modify this field component's properties"
    : "View detailed information about this field component";

  // Define header actions
  const headerActions =
    isEditMode && isDirty
      ? [
          <div
            key="status"
            className="flex items-center text-amber-500 dark:text-amber-400 mr-2 text-sm"
          >
            <AlertCircle className="h-4 w-4" />
            <span>Unsaved changes</span>
          </div>,
        ]
      : [];

  // Define footer buttons
  const footerLeft = (
    <Button variant="outline" size="sm" onClick={handleBack}>
      <ArrowLeft className="h-4 w-4 mr-2" />
      Back to Fields
    </Button>
  );

  // Only show save button in edit mode, no edit/view buttons (handled by tabs)
  const footerRight = isEditMode ? (
    <Button size="sm" onClick={handleSave} disabled={!isDirty}>
      <Save className="h-4 w-4 mr-2" />
      Save
    </Button>
  ) : null;

  return (
    <StructuredSectionCard
      title={title}
      description={description}
      headerActions={headerActions}
      footerLeft={footerLeft}
      footerRight={footerRight}
    >
      {children}
    </StructuredSectionCard>
  );
}
