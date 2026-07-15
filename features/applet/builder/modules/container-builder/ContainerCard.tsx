"use client";

import React, { useEffect, useState } from "react";
import { Trash2, X, RefreshCw, Save, Unlink, AlertTriangle, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { addField, removeField } from "@/lib/redux/app-builder/slices/containerBuilderSlice";
import { selectAllFields } from "@/lib/redux/app-builder/selectors/fieldSelectors";
import { selectAllContainerIds, selectContainerById } from "@/lib/redux/app-builder/selectors/containerSelectors";
import { fetchContainerByIdThunk, setActiveContainerWithFetchThunk, recompileContainerThunk } from "@/lib/redux/app-builder/thunks/containerBuilderThunks";
import { saveFieldThunk } from "@/lib/redux/app-builder/thunks/fieldBuilderThunks";
import { toast } from "@/components/ui/use-toast";
import { selectAppletContainers, selectAppletBrokerMappings, selectAllNeededBrokers, selectAppletById } from "@/lib/redux/app-builder/selectors/appletSelectors";
import { selectContainerComparisonResult, selectDoContainersMatch, selectContainerComparisonDetails } from "@/lib/redux/app-builder/selectors/containerMatchSelectors";
import ContainerComparisonModal from "./container-comparison/ContainerComparisonModal";
import { useFieldAnalysis } from "@/features/applet/hooks/useFieldAnalysis";
import type { Broker } from "@/types/customAppTypes";

interface ContainerCardProps {
    containerId: string;
    appletId: string;
    isActive: boolean;
    onSelect: (containerId: string) => void;
    onDelete: (containerId: string, event: React.MouseEvent) => void;
    onDetach?: (containerId: string, event: React.MouseEvent) => void;
}

const ContainerCard: React.FC<ContainerCardProps> = ({ containerId, appletId, isActive, onSelect, onDelete, onDetach }) => {
    const dispatch = useAppDispatch();
    const [isDragOver, setIsDragOver] = useState(false);
    const [ignoreContainerMismatch, setIgnoreContainerMismatch] = useState(false);
    const allFields = useAppSelector(selectAllFields);
    const allContainerIds = useAppSelector(selectAllContainerIds);

    const allAppletContainers = useAppSelector((state) => selectAppletContainers(state, appletId));
    
    // Get applet, broker mappings, and brokers for labeling
    const applet = useAppSelector((state) => selectAppletById(state, appletId));
    const brokerMappings = useAppSelector((state) => selectAppletBrokerMappings(state, appletId));
    const allBrokers = useAppSelector((state) => selectAllNeededBrokers(state, appletId));

    const isCompiled = "placeholder";
    const isExistingContainer = "placeholder";

    // In a component
    const comparisonResult = useAppSelector((state) => selectContainerComparisonResult(state, appletId, containerId));

    // Simple boolean check
    const containersMatch = useAppSelector((state) => selectDoContainersMatch(state, appletId, containerId));

    // Just the details
    const details = useAppSelector((state) => selectContainerComparisonDetails(state, appletId, containerId));

    const [fetchingContainer, setFetchingContainer] = useState(false);

    // Handle recompile request from modal
    const handleRecompile = () => {
        dispatch(recompileContainerThunk(containerId))
            .unwrap()
            .then(() => {
                toast({
                    title: "Container Recompiled",
                    description: "The container has been recompiled successfully",
                });
            })
            .catch((error) => {
                toast({
                    title: "Recompile Failed",
                    description: error || "Failed to recompile container",
                    variant: "destructive",
                });
            });
    };

    // Handle set as identical from modal
    const handleSetAsIdentical = () => {
        setIgnoreContainerMismatch(true);
        toast({
            title: "Container Marked as Identical",
            description: "You've marked this container as identical to the source",
        });
    };

    // Handle cancel from modal
    const handleCancel = () => {
        console.log("Container comparison modal cancelled");
    };

    const handleContainerSelect = async (containerId: string) => {
        const containerExists = allContainerIds.includes(containerId);
        if (containerExists) {
            dispatch(setActiveContainerWithFetchThunk(containerId));
        } else {
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

    useEffect(() => {
        const fetchContainer = async () => {
            await dispatch(setActiveContainerWithFetchThunk(containerId));
        };
        fetchContainer();
    }, [containerId, dispatch]);

    const container = useAppSelector((state) => selectContainerById(state, containerId));

    // Add field analysis to detect database vs container differences
    const containerFields = container?.fields || [];
    const fieldAnalysis = useFieldAnalysis(containerFields, allFields);

    const handleRemoveField = (fieldId: string, event: React.MouseEvent) => {
        event.stopPropagation(); // Prevent container selection
        dispatch(removeField({ containerId: containerId, fieldId }));
    };

    // Drag handling events
    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!isDragOver) setIsDragOver(true);
    };

    const handleDragLeave = () => {
        setIsDragOver(false);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);

        if (!container) return;

        try {
            const dataTransfer = e.dataTransfer.getData("application/json");
            const data = JSON.parse(dataTransfer);

            // Handle database field drops (fieldId -> containerId relationship)
            if (data.type === "database-field") {
                const fieldId = data.fieldId;

                if (!fieldId) {
                    return;
                }

                // Find the field from the database and add it to this container
                const existingField = allFields.find((field) => field.id === fieldId);

                if (existingField) {
                    dispatch(
                        addField({
                            containerId: container.id,
                            field: existingField,
                        })
                    );
                }
            }
        } catch (error) {
            console.error("Error processing dropped field:", error);
        }
    };

    // Handle saving a dirty field
    const handleSaveField = (fieldId: string) => {
        dispatch(saveFieldThunk(fieldId))
            .unwrap()
            .then(() => {
                toast({
                    title: "Field Saved",
                    description: "Field has been saved successfully",
                });
                // After saving the field, recompile the container to reflect the changes
                handleRecompile();
            })
            .catch((error) => {
                toast({
                    title: "Save Failed",
                    description: error || "Failed to save field",
                    variant: "destructive",
                });
            });
    };

    if (!container) {
        return (
            <div className="p-3 border rounded-lg transition-all w-full border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20">
                <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                        <div>
                            <p className="text-amber-700 dark:text-amber-300 font-medium">Missing Container</p>
                            <p className="text-xs text-amber-600 dark:text-amber-400">
                                This container exists in the applet but the source container is missing from the system
                            </p>
                        </div>
                        <div className="flex items-center space-x-1">
                            {!containersMatch && !ignoreContainerMismatch && (
                                <ContainerComparisonModal
                                    appletId={appletId}
                                    containerId={containerId}
                                    onRecompile={handleRecompile}
                                    onSetAsIdentical={handleSetAsIdentical}
                                    onCancel={handleCancel}
                                    onDetach={onDetach ? (e) => onDetach(containerId, e) : undefined}
                                />
                            )}
                            {onDetach && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => onDetach(containerId, e)}
                                    className="h-7 w-7 rounded-full hover:bg-amber-100 dark:hover:bg-amber-900/20 text-amber-500 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-300"
                                    title="Detach container (remove from applet but keep in system)"
                                >
                                    <Unlink className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    </div>
                    <div className="text-xs text-amber-600 dark:text-amber-400 mt-1 bg-amber-100 dark:bg-amber-900/40 p-2 rounded-md">
                        <p>
                            <strong>Note:</strong> This may not be a problem if the applet has a compiled container version, but you 
                            can detach it if it's causing issues.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            onClick={() => onSelect(container.id)}
            data-container-id={container.id}
            data-droppable="true"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`p-3 border rounded-lg cursor-pointer transition-all w-full overflow-hidden ${
                isActive
                    ? "border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
            } container-drop-target relative h-full flex flex-col`}
        >
            <div className="flex flex-col space-y-2">
                <div>
                    <h4 className="font-medium text-gray-900 dark:text-gray-100">Container: {container.label || "Container Without Label"}</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Short Label: {container.shortLabel || "No Short Label"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 py-0.5 px-1.5 rounded-full">
                        {container.fields?.length || 0} field
                        {container.fields?.length !== 1 ? "s" : ""}
                    </span>
                    {isCompiled && (
                        <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 py-0.5 px-1.5 rounded-full">
                            Compiled Version
                        </span>
                    )}
                    {fieldAnalysis.fieldsDifferentFromCoreField.length > 0 && (
                        <span className="text-xs bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 py-0.5 px-1.5 rounded-full">
                            {fieldAnalysis.fieldsDifferentFromCoreField.length} field
                            {fieldAnalysis.fieldsDifferentFromCoreField.length !== 1 ? 's' : ''} differ from database
                        </span>
                    )}
                    {fieldAnalysis.dirtyCoreFieldsForOurFields.length > 0 && (
                        <span className="text-xs bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 py-0.5 px-1.5 rounded-full">
                            {fieldAnalysis.dirtyCoreFieldsForOurFields.length} database field
                            {fieldAnalysis.dirtyCoreFieldsForOurFields.length !== 1 ? 's' : ''} modified
                        </span>
                    )}
                    <div className="flex items-center space-x-1 ml-auto">
                        {!containersMatch && !ignoreContainerMismatch && (
                            <ContainerComparisonModal
                                appletId={appletId}
                                containerId={containerId}
                                onRecompile={handleRecompile}
                                onSetAsIdentical={handleSetAsIdentical}
                                onCancel={handleCancel}
                            />
                        )}
                        {onDetach && (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => onDetach(container.id, e)}
                                className="h-7 w-7 rounded-full hover:bg-amber-100 dark:hover:bg-amber-900/20 text-amber-500 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-300"
                                title="Detach container (remove from applet but keep in system)"
                            >
                                <Unlink className="h-4 w-4" />
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => onDelete(container.id, e)}
                            className="h-7 w-7 rounded-full hover:bg-red-100 dark:hover:bg-red-900/20 text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300"
                            title="Remove container"
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Display fields that are in the container */}
            <div className="mt-3 grow overflow-hidden flex flex-col">
                {container.fields && container.fields.length > 0 ? (
                    <div className="space-y-2 overflow-y-auto max-h-[940px] pr-1">
                        {container.fields.map((field) => {
                            // Check if the field is dirty (unsaved changes)
                            const fieldFromState = allFields.find(f => f.id === field.id);
                            const isFieldDirty = fieldFromState?.isDirty;
                            
                            // Check if field differs from database version
                            const hasDatabaseDifferences = fieldAnalysis.fieldsDifferentFromCoreField.some(f => f.id === field.id);
                            const isDatabaseFieldDirty = fieldAnalysis.dirtyCoreFieldsForOurFields.some(f => f.id === field.id);
                            const isFieldMissing = fieldAnalysis.fieldsNotInCoreFields.some(f => f.id === field.id);
                            
                            // Check if field matches database (positive feedback)
                            const hasMatchingDatabaseField = fieldFromState && !hasDatabaseDifferences && !isDatabaseFieldDirty && !isFieldMissing;
                            
                            // Find the broker for this field
                            const brokerMapping = brokerMappings?.find(mapping => mapping.fieldId === field.id);
                            const broker = brokerMapping ? allBrokers?.find((b: Broker) => b.id === brokerMapping.brokerId) : null;
                            
                            return (
                                <div
                                    key={field.id}
                                    className="w-full bg-gray-50 dark:bg-gray-700 border-border rounded-md p-3"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div className="space-y-3">
                                        {/* FIELD INFO SECTION */}
                                        <div className="space-y-2">
                                            {/* Field name row with X button */}
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center min-w-0 flex-1">
                                                    <span className="text-xs font-medium text-gray-800 dark:text-gray-200 leading-none truncate">
                                                        Field: {field.label || "Field Without Label"}
                                                    </span>
                                                    {isFieldDirty && (
                                                        <span className="ml-2 text-[10px] bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 py-0.5 px-1.5 rounded-full flex-shrink-0">
                                                            Unsaved
                                                        </span>
                                                    )}
                                                    {hasDatabaseDifferences && (
                                                        <span className="ml-2 text-[10px] bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 py-0.5 px-1.5 rounded-full flex-shrink-0">
                                                            Database Differs
                                                        </span>
                                                    )}
                                                    {isDatabaseFieldDirty && (
                                                        <span className="ml-2 text-[10px] bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 py-0.5 px-1.5 rounded-full flex-shrink-0">
                                                            Database Modified
                                                        </span>
                                                    )}
                                                    {isFieldMissing && (
                                                        <span className="ml-2 text-[10px] bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 py-0.5 px-1.5 rounded-full flex-shrink-0">
                                                            Missing in DB
                                                        </span>
                                                    )}
                                                    {hasMatchingDatabaseField && (
                                                        <span className="ml-2 text-[10px] bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 py-0.5 px-1.5 rounded-full flex-shrink-0 flex items-center gap-1">
                                                            <CircleCheck className="h-2.5 w-2.5" />
                                                            Synced
                                                        </span>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={(e) => handleRemoveField(field.id, e)}
                                                    className="ml-2 h-6 w-6 rounded-full flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900/20 text-red-500 dark:text-red-400 flex-shrink-0"
                                                >
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </div>
                                            
                                            {/* Info rows using full width */}
                                            <div className="space-y-2">
                                                <span className="block text-xs text-gray-600 dark:text-gray-400 leading-none truncate">
                                                    Applet: {applet?.name || "No Applet Found"}
                                                </span>
                                                <span className="block text-xs text-gray-600 dark:text-gray-400 leading-none truncate">
                                                    Broker: {broker?.name || "No Broker Found"}
                                                </span>
                                                <span className="block text-xs text-gray-600 dark:text-gray-400 leading-none truncate">
                                                    Component Type: {field.component || "No Component"}
                                                </span>
                                            </div>
                                        </div>
                                        
                                        {/* ACTIONS SECTION */}
                                        <div className="flex items-center gap-2">
                                            {isFieldDirty && (
                                                <div className="flex items-center">
                                                    <button
                                                        onClick={() => handleSaveField(field.id)}
                                                        className="h-6 w-6 rounded-full flex items-center justify-center hover:bg-green-100 dark:hover:bg-green-900/20 text-green-500 dark:text-green-400"
                                                        title="Save field"
                                                    >
                                                        <Save className="h-3 w-3" />
                                                    </button>
                                                    <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">Save changes</span>
                                                </div>
                                            )}
                                            {(hasDatabaseDifferences || isDatabaseFieldDirty) && (
                                                <div className="flex items-center">
                                                    <button
                                                        onClick={() => handleRecompile()}
                                                        className="h-6 w-6 rounded-full flex items-center justify-center hover:bg-blue-100 dark:hover:bg-blue-900/20 text-blue-500 dark:text-blue-400"
                                                        title="Recompile to get latest database version"
                                                    >
                                                        <RefreshCw className="h-3 w-3" />
                                                    </button>
                                                    <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">Update from database</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-32 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
                        <p className="text-sm text-gray-500 dark:text-gray-400">Drag fields here to add them to this container</p>
                    </div>
                )}
            </div>

            {/* Visual indicator for drop area that will be styled with CSS */}
            <div
                className={`absolute inset-0 pointer-events-none drop-indicator border-2 border-dashed border-blue-400 dark:border-blue-500 rounded-lg transition-opacity ${
                    isDragOver ? "opacity-100" : "opacity-0"
                }`}
            ></div>
        </div>
    );
};

export default ContainerCard;
