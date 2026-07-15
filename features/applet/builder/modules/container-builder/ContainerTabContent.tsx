"use client";

import React, { useState, useEffect, useCallback } from "react";
import { PlusIcon, Loader2, Cpu, SaveIcon, Edit, Eye, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAppletById, selectContainersForApplet } from "@/lib/redux/app-builder/selectors/appletSelectors";
import {
    selectActiveContainerId,
    selectContainerError,
    selectContainerLoading,
    selectNewContainerId,
    selectAllContainerIds,
    selectIsContainerDirtyById,
} from "@/lib/redux/app-builder/selectors/containerSelectors";
import { startNewContainer, setActiveContainer, cancelNewContainer } from "@/lib/redux/app-builder/slices/containerBuilderSlice";
import { saveAppletThunk, recompileAppletThunk } from "@/lib/redux/app-builder/thunks/appletBuilderThunks";
import ContainerFormComponent from "../smart-parts/containers/ContainerFormComponent";
import { v4 as uuidv4 } from "uuid";
import ContainersList from "./ContainersList";
import DraggableFields from "../field-builder/DraggableFields";
import ContainerListTable from "./ContainerListTable";
import { selectIsAppletDirtyById } from "@/lib/redux/app-builder/selectors/appletSelectors";

interface ContainerTabContentProps {
    appletId: string;
    appId: string;
    onUpdateCompletion?: (completion: {
        isComplete: boolean;
        canProceed: boolean;
        message?: string;
        footerButtons?: React.ReactNode;
    }) => void;
}

const ContainerTabContent: React.FC<ContainerTabContentProps> = ({ appletId, appId, onUpdateCompletion }) => {
    const { toast } = useToast();
    const dispatch = useAppDispatch();

    const [savingApplet, setSavingApplet] = useState<boolean>(false);
    const [compiledContainerCount, setCompiledContainerCount] = useState<number>(0);
    const [mode, setMode] = useState<"edit" | "new" | "list">("list");
    const containerError = useAppSelector(selectContainerError);
    const activeContainerId = useAppSelector(selectActiveContainerId);
    const isContainerLoading = useAppSelector(selectContainerLoading);

    const appletContainers = useAppSelector((state) => selectContainersForApplet(state, appletId));
    const activeApplet = useAppSelector((state) => selectAppletById(state, appletId));
    const isAppletDirty = useAppSelector((state) => selectIsAppletDirtyById(state, appletId));
    const isContainerDirty = useAppSelector((state) => selectIsContainerDirtyById(state, activeContainerId));
    const activeAppletName = activeApplet?.name || "";

    useEffect(() => {
        setCompiledContainerCount(appletContainers?.length || 0);
    }, [appletContainers]);

    // Filter containers that are already in the applet
    const appletContainerIds = appletContainers?.map((container) => container.id);
    const isContainerInApplet = activeContainerId
        ? appletContainerIds?.includes(activeContainerId) === true
        : false;

    // Show error toasts when they occur
    useEffect(() => {
        if (containerError) {
            toast({
                title: "Error",
                description: containerError,
                variant: "destructive",
            });
        }
    }, [containerError, toast]);

    const handleCreateNewContainer = useCallback(() => {
        setMode("new");
        const newId = uuidv4();
        console.log("ContainerTabContent Creating new container with id", newId);
        dispatch(startNewContainer({ id: newId }));
    }, [dispatch]);


    const handleCancelCreateNewContainer = useCallback((activeContainerId: string) => {
        dispatch(cancelNewContainer(activeContainerId));
        setMode("list");
    }, [dispatch, ]);

    const handleEditContainer = useCallback(
        (id: string) => {
            dispatch(setActiveContainer(id));
            setMode("edit");
        },
        [dispatch]
    );

    const handleContainerSelect = useCallback((id: string) => {
        handleEditContainer(id);
    }, [handleEditContainer]);


    const handleContainerSaved = (containerId: string) => {
        console.log("Container Tab Content Not going to do anything after this save... containerId", containerId);
    };

    // Save active applet and recompile it
    const saveAndRecompileApplet = async (appletId: string) => {
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
                description: typeof error === "string" ? error : "Failed to recompile applet containers.",
                variant: "destructive",
            });
        } finally {
            setSavingApplet(false);
            setMode("list");
        }
    };

    // Save the active applet
    const saveActiveApplet = () => {
        if (appletId && isAppletDirty) {

            // TODO: Compile fields into containers and then save. Either here or in the applet thunk.
            saveAndRecompileApplet(appletId);
            setMode("list");
        }
    };

    // Update completion status for parent component
    useEffect(() => {
        const hasContainers = compiledContainerCount > 0;

        let message = "";
        if (!hasContainers) {
            message = "No containers found. You can create one or add existing ones.";
        } else if (isAppletDirty) {
            message = "Unsaved changes. Please save your applet.";
        } else {
            message = `You have ${compiledContainerCount} container${compiledContainerCount === 1 ? "" : "s"} configured.`;
        }

        // Create a save button if the applet has unsaved changes
        const footerButtons = isAppletDirty ? (
            <Button
                onClick={saveActiveApplet}
                className="border-blue-500 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                variant="outline"
                disabled={savingApplet}
            >
                {savingApplet ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <SaveIcon className="h-4 w-4" />}
                Save Applet
            </Button>
        ) : undefined;

        onUpdateCompletion?.({
            isComplete: hasContainers,
            canProceed: true, // Can proceed as long as there's an applet
            message,
            footerButtons,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [compiledContainerCount, isAppletDirty, savingApplet]);

    return (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            {/* Container List Table - first column */}
            <div className="md:col-span-3 bg-gray-100 dark:bg-gray-800/80 rounded-lg border-border overflow-hidden rounded-t-xl">
                <ContainerListTable
                    onContainerEdit={handleEditContainer}
                    onContainerSelect={handleContainerSelect}
                    onContainerCreate={handleCreateNewContainer}
                    internalFetch={true}
                    hiddenColumns={["icon", "description", "shortLabel", "createdAt", "updatedAt"]}
                    defaultPageSize={10}
                    title=""
                    hideStatusColumn={true}
                    hideIconColumn={true}
                    customSettings={{
                        tableClassName: "text-sm",
                        hideEntriesInfo: true,
                    }}
                    allowSelectAction={true}
                />
            </div>

            {/* Container form card */}
            <div className="md:col-span-3">
                <ContainerFormComponent
                    containerId={activeContainerId}
                    onSaveSuccess={handleContainerSaved}
                    onCancelCreateNewContainer={handleCancelCreateNewContainer}
                    title={mode === "list" ? "Select or Create a Container" : mode === "edit" ? "Edit Container" : "Container Details"}
                    initialAppletId={appletId}
                    mode={mode}
                />
            </div>

            {/* List of containers */}
            <div className="md:col-span-3">
                <ContainersList appletId={appletId} appletName={activeAppletName}/>
            </div>

            {/* Fields Preview - right column */}
            <div className="md:col-span-3">
                <DraggableFields appId={appId} appletId={appletId} className="h-full" />
            </div>
        </div>
    );
};

export default ContainerTabContent;
