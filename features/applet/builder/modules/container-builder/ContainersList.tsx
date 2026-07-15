"use client";

import React, { useEffect, useState } from "react";
import { Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectContainersForApplet,
  selectIsAppletDirtyById,
} from "@/lib/redux/app-builder/selectors/appletSelectors";
import {
  selectActiveContainerId,
  selectAllContainerIds,
  selectIsContainerDirtyById,
} from "@/lib/redux/app-builder/selectors/containerSelectors";
import { removeContainer } from "@/lib/redux/app-builder/slices/appletBuilderSlice";
import { setActiveContainer } from "@/lib/redux/app-builder/slices/containerBuilderSlice";
import {
  setActiveContainerWithFetchThunk,
  fetchContainerByIdThunk,
  fetchContainersThunk,
  saveContainerThunk,
  saveOrUpdateContainerToAppletThunk,
} from "@/lib/redux/app-builder/thunks/containerBuilderThunks";
import {
  saveAppletThunk,
  recompileAppletThunk,
} from "@/lib/redux/app-builder/thunks/appletBuilderThunks";
import { ConfirmationDialog } from "@/features/applet/builder/parts/ConfirmationDialog";
import { ContainerBuilder } from "@/lib/redux/app-builder/types";
import ContainerCard from "./ContainerCard";

const EMPTY_CONTAINERS: ContainerBuilder[] = [];
import { DebugLog } from "@/components/admin/debug-log-component";

interface ContainersListProps {
  appletId: string;
  appletName: string;
  onFullRecompileSuccess?: (containerId: string) => void;
}

const ContainersList: React.FC<ContainersListProps> = ({
  appletId,
  appletName,
  onFullRecompileSuccess,
}) => {
  const { toast } = useToast();
  const dispatch = useAppDispatch();

  // UI state
  const [fetchingContainer, setFetchingContainer] = useState<boolean>(false);
  const [savingApplet, setSavingApplet] = useState<boolean>(false);
  const [savingContainer, setSavingContainer] = useState<boolean>(false);

  // Delete dialog state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState<boolean>(false);
  const [containerToDelete, setContainerToDelete] = useState<string | null>(
    null,
  );
  const [isDeletingContainer, setIsDeletingContainer] =
    useState<boolean>(false);

  // Detach dialog state
  const [isDetachDialogOpen, setIsDetachDialogOpen] = useState<boolean>(false);
  const [containerToDetach, setContainerToDetach] = useState<string | null>(
    null,
  );
  const [isDetachingContainer, setIsDetachingContainer] =
    useState<boolean>(false);

  // Selectors
  const activeContainerId = useAppSelector(selectActiveContainerId);
  const allContainerIds = useAppSelector(selectAllContainerIds);
  const appletContainers = useAppSelector((state) =>
    appletId ? selectContainersForApplet(state, appletId) : EMPTY_CONTAINERS,
  );

  const isAppletDirty = useAppSelector((state) =>
    selectIsAppletDirtyById(state, appletId),
  );
  const isContainerDirty = useAppSelector((state) =>
    selectIsContainerDirtyById(state, activeContainerId),
  );

  useEffect(() => {
    dispatch(fetchContainersThunk());
  }, []);

  // Handle container selection
  const handleContainerSelect = async (containerId: string) => {
    // Check if the container already exists in state
    const containerExists = allContainerIds.includes(containerId);

    if (containerExists) {
      // Container already in state, just set it as active
      dispatch(setActiveContainerWithFetchThunk(containerId));
    } else {
      // Container not in state, need to fetch it first
      setFetchingContainer(true);
      try {
        await dispatch(fetchContainerByIdThunk(containerId)).unwrap();
        dispatch(setActiveContainerWithFetchThunk(containerId));

        toast({
          title: "Success",
          description: "Container loaded successfully.",
        });
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to load container from database.",
          variant: "destructive",
        });
      } finally {
        setFetchingContainer(false);
      }
    }
  };

  const handleSaveContainerAndRecompileFieldsAndApplet = async () => {
    if (!activeContainerId) return;

    setSavingContainer(true);

    try {
      const result = await dispatch(
        saveOrUpdateContainerToAppletThunk({
          appletId,
          containerId: activeContainerId,
          recompileAllFields: true,
        }),
      ).unwrap();

      toast({
        title: "Success",
        description: "Container saved successfully.",
      });

      if (onFullRecompileSuccess) {
        onFullRecompileSuccess(activeContainerId);
      }
    } catch (error) {
      toast({
        title: "Error",
        description:
          typeof error === "string" ? error : "Failed to save container.",
        variant: "destructive",
      });
    } finally {
      setSavingContainer(false);
    }
  };

  // Save and recompile applet
  const saveAndRecompileApplet = async () => {
    if (!appletId) return;

    setSavingApplet(true);

    try {
      // First, save the applet to ensure all changes are persisted
      await dispatch(saveAppletThunk(appletId)).unwrap();

      // After saving, recompile the applet to ensure all container relationships are updated
      await dispatch(recompileAppletThunk(appletId)).unwrap();

      toast({
        title: "Success",
        description: "Applet containers recompiled successfully.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description:
          typeof error === "string"
            ? error
            : "Failed to recompile applet containers.",
        variant: "destructive",
      });
    } finally {
      setSavingApplet(false);
    }
  };

  // Handle container detachment (remove from applet without deleting)
  const openDetachDialog = (containerId: string, event: React.MouseEvent) => {
    // Stop the click event from bubbling up to the parent (container selection)
    event.stopPropagation();
    setContainerToDetach(containerId);
    setIsDetachDialogOpen(true);
  };

  const handleDetachContainer = async () => {
    if (!containerToDetach || !appletId) return;

    setIsDetachingContainer(true);

    try {
      // Dispatch the remove container action
      dispatch(removeContainer({ appletId, containerId: containerToDetach }));

      // If this was the active container, clear it
      if (activeContainerId === containerToDetach) {
        dispatch(setActiveContainer(null));
      }

      // Notify the user
      toast({
        title: "Success",
        description:
          "Container removed from applet but still available for reuse.",
      });

      // Return a resolved promise to indicate success
      return Promise.resolve();
    } catch (error) {
      console.error("Error removing container:", error);
      toast({
        title: "Error",
        description: "Failed to remove container from applet.",
        variant: "destructive",
      });
      return Promise.reject(error);
    } finally {
      setIsDetachingContainer(false);
    }
  };

  // Handle container deletion
  const openDeleteDialog = (containerId: string, event: React.MouseEvent) => {
    // Stop the click event from bubbling up to the parent (container selection)
    event.stopPropagation();
    setContainerToDelete(containerId);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteContainer = async () => {
    if (!containerToDelete || !appletId) return;

    setIsDeletingContainer(true);

    try {
      // Dispatch the remove container action
      dispatch(removeContainer({ appletId, containerId: containerToDelete }));

      // If this was the active container, clear it
      if (activeContainerId === containerToDelete) {
        dispatch(setActiveContainer(null));
      }

      // Notify the user
      toast({
        title: "Success",
        description: "Container removed from applet.",
      });

      // Return a resolved promise to indicate success
      return Promise.resolve();
    } catch (error) {
      console.error("Error removing container:", error);
      toast({
        title: "Error",
        description: "Failed to remove container.",
        variant: "destructive",
      });
      return Promise.reject(error);
    } finally {
      setIsDeletingContainer(false);
    }
  };

  const handleSaveAfterDelete = async () => {
    if (!appletId) return Promise.resolve();

    try {
      return saveAndRecompileApplet();
    } catch (error) {
      console.error("Error saving applet after delete:", error);
      return Promise.reject(error);
    }
  };

  const handleSaveAfterDetach = async () => {
    if (!appletId) return Promise.resolve();

    try {
      return saveAndRecompileApplet();
    } catch (error) {
      console.error("Error saving applet after detaching container:", error);
      return Promise.reject(error);
    }
  };

  if (!appletContainers) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
        The applet container configuration is unavailable.
      </div>
    );
  }

  return (
    <>
      {/* DeleteConfirmationDialog component */}
      <ConfirmationDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        handleDeleteGroup={handleDeleteContainer}
        loading={isDeletingContainer}
        title="Remove Container"
        description="Are you sure you want to remove this container from the applet? This action cannot be undone."
        deleteButtonText="Remove Container"
        hasSecondStep={true}
        secondStepButtonText="Remove & Save Immediately"
        onSecondStepConfirm={handleSaveAfterDelete}
      />

      {/* DetachConfirmationDialog component */}
      <ConfirmationDialog
        open={isDetachDialogOpen}
        onOpenChange={setIsDetachDialogOpen}
        handleDeleteGroup={handleDetachContainer}
        loading={isDetachingContainer}
        title="Detach Container"
        description="Are you sure you want to remove this container from the applet? The container will still be available in the system for reuse."
        deleteButtonText="Detach Container"
        hasSecondStep={true}
        secondStepButtonText="Detach & Save Immediately"
        onSecondStepConfirm={handleSaveAfterDetach}
      />

      <Card className="border-border bg-textured shadow-lg overflow-hidden">
        <CardHeader className="bg-gray-50 dark:bg-gray-800/50 border-b border-border">
          <div className="flex flex-col space-y-3">
            <div>
              <CardTitle className="text-lg font-medium text-gray-800 dark:text-gray-200">
                {appletName} Containers
              </CardTitle>
              <CardDescription className="text-gray-500 dark:text-gray-400 pl-2">
                {appletContainers.length === 0
                  ? "No Containers Added"
                  : appletContainers.length === 1
                    ? "1 Container"
                    : `${appletContainers.length} Containers`}
              </CardDescription>
            </div>
            <DebugLog
              title="-> Container List Applet Recompile Button"
              values={{
                isAppletDirty,
                isContainerDirty,
              }}
            />
            {isAppletDirty && !isContainerDirty && (
              <Button
                onClick={saveAndRecompileApplet}
                disabled={savingApplet}
                size="sm"
                className="bg-amber-500 hover:bg-amber-600 text-white w-full"
              >
                {savingApplet ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Applet Recompile Needed
              </Button>
            )}
            <Button
              onClick={handleSaveContainerAndRecompileFieldsAndApplet}
              disabled={savingContainer}
              size="sm"
              className="bg-amber-500 hover:bg-amber-600 text-white w-full"
            >
              {savingContainer ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4 text-red-500" />
              )}
              FULLY RECOMPILE FIELDS & APPLET
              <TriangleAlert className="ml-2 h-4 w-4 text-red-500" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {appletContainers.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
              <p className="text-gray-500 dark:text-gray-400">
                No containers added to this applet yet
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Use the form to add your first container
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {appletContainers.map((container: ContainerBuilder) => (
                <ContainerCard
                  key={container.id}
                  appletId={appletId}
                  containerId={container.id}
                  isActive={activeContainerId === container.id}
                  onSelect={handleContainerSelect}
                  onDelete={openDeleteDialog}
                  onDetach={openDetachDialog}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
};

export default ContainersList;
