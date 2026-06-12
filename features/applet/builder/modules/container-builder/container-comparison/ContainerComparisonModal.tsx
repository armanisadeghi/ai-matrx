import React from "react";
import { useSelector } from "react-redux";
import { useAppDispatch } from "@/lib/redux/hooks"; // Need this import
import type { RootState } from "@/lib/redux/store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertCircle, Unlink } from "lucide-react";
import { ContainerComparisonDetails } from "./ContainerComparisonDetails";
import {
  selectContainerComparisonResult,
  selectDoContainersMatch,
} from "@/lib/redux/app-builder/selectors/containerMatchSelectors";
import { selectAppletById } from "@/lib/redux/app-builder/selectors/appletSelectors"; // Need this
import { createContainerThunk } from "@/lib/redux/app-builder/thunks/containerBuilderThunks";

interface ContainerComparisonModalProps {
  appletId: string;
  containerId: string;
  onRecompile?: () => void;
  onSetAsIdentical?: () => void;
  onCancel?: () => void;
  onDetach?: (event: React.MouseEvent) => void;
}

export const ContainerComparisonModal: React.FC<
  ContainerComparisonModalProps
> = ({
  appletId,
  containerId,
  onRecompile,
  onSetAsIdentical,
  onCancel,
  onDetach,
}) => {
  const dispatch = useAppDispatch();
  const [open, setOpen] = React.useState(false);
  const containersMatch = useSelector((state: RootState) =>
    selectDoContainersMatch(state, appletId, containerId),
  );
  const comparisonResult = useSelector((state: RootState) =>
    selectContainerComparisonResult(state, appletId, containerId),
  );
  const applet = useSelector((state: RootState) =>
    selectAppletById(state, appletId),
  );

  // Check if the container exists in the database
  const missingDatabaseContainer = !comparisonResult.coreContainerExists;

  if (containersMatch) {
    return null;
  }

  const handleRecompile = () => {
    onRecompile?.();
    setOpen(false);
  };

  const handleSetAsIdentical = () => {
    onSetAsIdentical?.();
    setOpen(false);
  };

  const handleCancel = () => {
    onCancel?.();
    setOpen(false);
  };

  const handleDetach = (e: React.MouseEvent) => {
    onDetach?.(e);
    setOpen(false);
  };

  const handleCreateContainer = async () => {
    // Find the container data from the applet
    const appletContainer = applet?.containers?.find(
      (c) => c.id === containerId,
    );

    if (!appletContainer) {
      console.error("Container not found in applet");
      return;
    }

    try {
      // Create the container using the applet's container data
      await dispatch(
        createContainerThunk({
          ...appletContainer,
          // You might want to add/modify some properties here
          // For example, ensure isDirty is false, isLocal is false, etc.
        }),
      ).unwrap();

      // Optionally close the modal or refresh data
      setOpen(false);
    } catch (error) {
      console.error("Failed to create container:", error);
      // Handle error - maybe show a toast or error message
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <AlertCircle className="h-4 w-4" />
          Container Mismatch
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Container Comparison Analysis</DialogTitle>
          <DialogDescription>
            Detailed comparison between the applet container and the source
            container
          </DialogDescription>
        </DialogHeader>
        <ContainerComparisonDetails
          appletId={appletId}
          containerId={containerId}
        />
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t dark:border-zinc-700">
          {missingDatabaseContainer && (
            <>
              <Button
                variant="default"
                onClick={handleCreateContainer}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Create Container
              </Button>
              {onDetach && (
                <Button
                  variant="outline"
                  onClick={handleDetach}
                  className="flex items-center gap-1 text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/50"
                >
                  <Unlink className="h-4 w-4" />
                  Detach Container
                </Button>
              )}
            </>
          )}
          <Button
            variant="destructive"
            onClick={handleRecompile}
            disabled={!onRecompile || missingDatabaseContainer}
          >
            Recompile
          </Button>
          <Button
            variant="secondary"
            onClick={handleSetAsIdentical}
            disabled={!onSetAsIdentical}
          >
            Set as Identical
          </Button>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ContainerComparisonModal;
