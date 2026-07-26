"use client";

import React, { ReactNode, useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectContainerById,
  selectIsContainerDirtyById,
} from "@/lib/redux/app-builder/selectors/containerSelectors";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Save, AlertCircle } from "lucide-react";
import { saveContainerThunk } from "@/lib/redux/app-builder/thunks/containerBuilderThunks";
import { useToast } from "@/components/ui/use-toast";
import StructuredSectionCard from "@/components/official/StructuredSectionCard";

interface ContainerDetailLayoutProps {
  children: ReactNode;
  params: Promise<{ id: string }>;
}

export default function ContainerDetailLayoutClient({
  children,
  params,
}: ContainerDetailLayoutProps) {
  // Use React.use() to unwrap the params Promise
  const resolvedParams = React.use(params);
  const { id } = resolvedParams;

  const pathname = usePathname();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { toast } = useToast();

  // Get container data from Redux
  const container = useAppSelector((state) => selectContainerById(state, id));
  const isDirty = useAppSelector((state) =>
    selectIsContainerDirtyById(state, id),
  );

  // Check if we're in view or edit mode
  const isEditMode = pathname.includes("/edit");

  // Handle back button - memoized to use in useEffect
  const handleBack = useCallback(() => {
    if (isDirty && isEditMode) {
      if (
        confirm("You have unsaved changes. Are you sure you want to leave?")
      ) {
        router.push("/apps/app-builder/containers");
      }
    } else {
      router.push("/apps/app-builder/containers");
    }
  }, [isDirty, isEditMode, router]);

  // Handle save - memoized to use in useEffect
  const handleSave = useCallback(async () => {
    if (id) {
      try {
        await dispatch(saveContainerThunk(id)).unwrap();
        toast({
          title: "Success",
          description: "Container saved successfully",
        });
        router.push(`/apps/app-builder/containers/${id}`);
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to save container",
          variant: "destructive",
        });
      }
    }
  }, [id, dispatch, toast, router]);

  // Get dynamic title and description based on container and mode
  const title = container
    ? isEditMode
      ? `Edit: ${container.label}`
      : container.label
    : isEditMode
      ? "Create Container"
      : "Container Details";

  const description = isEditMode
    ? "Modify this container's properties"
    : "View detailed information about this container";

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
      Back to Containers
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
