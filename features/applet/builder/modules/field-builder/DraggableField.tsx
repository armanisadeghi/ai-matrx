"use client";
import React, { useState } from "react";
import { GripVertical, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectContainerById } from "@/lib/redux/app-builder/selectors/containerSelectors";
import { selectAppletById } from "@/lib/redux/app-builder/selectors/appletSelectors";

interface DraggableFieldProps {
    fieldId: string;
    brokerId: string;
    field: any;
    broker: any;
    isDropped: boolean;
    appletContainers: any[];
    onSuccessfulDrop?: (fieldId: string, brokerId: string, appletId: string) => void;
    appletId: string;
}

const DraggableField: React.FC<DraggableFieldProps> = ({
    fieldId,
    brokerId,
    field,
    broker,
    isDropped,
    appletContainers,
    onSuccessfulDrop,
    appletId,
}) => {
    const [isDragging, setIsDragging] = useState<boolean>(false);

    // Get applet information
    const applet = useAppSelector((state) => selectAppletById(state, appletId));

    // Find which container this field belongs to (if any)
    let containerId: string | null = null;
    let containerFromApplet: any = null;
    if (appletContainers) {
        for (const container of appletContainers) {
            if (container.fields && container.fields.some((f: any) => f.id === fieldId)) {
                containerId = container.id;
                containerFromApplet = container;
                break;
            }
        }
    }

    // Get the database container for status checking
    const databaseContainer = useAppSelector((state) =>
        containerId ? selectContainerById(state, containerId) : null
    );

    // Check field status in containers
    const checkFieldContainerStatus = (fieldId: string, appletContainers: any[], databaseContainer: any | null) => {
        const result = {
            inAppletContainer: false,
            appletContainerId: null as string | null,
            databaseContainerExists: false,
            fieldInDatabaseContainer: false,
            status: "error" as "error" | "warning" | "ok",
        };

        // Step 1: Find the field in applet containers
        if (appletContainers && appletContainers.length > 0) {
            for (const container of appletContainers) {
                if (container.fields && container.fields.some((f: any) => f.id === fieldId)) {
                    result.inAppletContainer = true;
                    result.appletContainerId = container.id;
                    break;
                }
            }
        }

        // Step 2 & 3: Check database container
        if (result.appletContainerId && databaseContainer) {
            result.databaseContainerExists = true;

            // Check if the field exists in the database container
            if (databaseContainer.fields && databaseContainer.fields.some((f: any) => f.id === fieldId)) {
                result.fieldInDatabaseContainer = true;
            }
        }

        // Determine overall status
        if (!result.inAppletContainer) {
            result.status = "error"; // Field not in any applet container
        } else if (!result.databaseContainerExists) {
            result.status = "error"; // Container doesn't exist in database
        } else if (!result.fieldInDatabaseContainer) {
            result.status = "warning"; // Container exists but field is missing
        } else {
            result.status = "ok"; // Everything is fine
        }

        return result;
    };

    const containerStatus = checkFieldContainerStatus(fieldId, appletContainers, databaseContainer);
    const hasIssue = containerStatus.status !== "ok";

    // Handle drag start - this is now isolated to this specific field instance
    const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
        setIsDragging(true);

        // Only include fieldId - brokerId is not needed for drop operation
        e.dataTransfer.setData(
            "application/json",
            JSON.stringify({
                type: "database-field",
                fieldId, // This is all we need for the drop operation
            })
        );
        e.dataTransfer.effectAllowed = "move";
    };

    // Handle drag end
    const handleDragEnd = () => {
        setIsDragging(false);
    };

    // Show error state if field or broker data is missing
    if (!field || !broker) {
        return (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md p-2 flex items-center">
                <AlertTriangle className="h-4 w-4 mr-2 text-red-500 dark:text-red-400" />
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-red-700 dark:text-red-300">
                        Mapping Error
                    </p>
                    <p className="text-xs text-red-600 dark:text-red-400">
                        {!field && "Missing Field Data"}
                        {!broker && "Missing Broker Data"}
                        {!field && !broker && "Missing Field and Broker Data"}
                    </p>
                    <p className="text-xs text-red-500 dark:text-red-500">
                        Field ID: {fieldId} | Broker ID: {brokerId}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div
            draggable={true}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            className={`
                bg-gray-50 dark:bg-gray-700 border-border 
                rounded-md p-2 flex items-center
                ${
                    isDropped && !hasIssue
                        ? "opacity-50 bg-gray-100 dark:bg-gray-800"
                        : "hover:border-indigo-300 dark:hover:border-indigo-500"
                }
                ${isDragging ? "opacity-50 border-indigo-500" : ""}
                ${hasIssue ? "border-amber-400 dark:border-amber-600" : ""}
                transition-colors duration-150 cursor-move
            `}
        >
            {!isDropped && !hasIssue && <GripVertical className="h-4 w-4 mr-2 flex-shrink-0 text-gray-400" />}
            {isDropped && !hasIssue && (
                <>
                    <CheckCircle2
                        className="h-4 w-4 mr-2 flex-shrink-0 text-green-500 dark:text-green-400"
                        aria-hidden="true"
                    />
                    <span className="sr-only">Dropped</span>
                </>
            )}
            {hasIssue && (
                <AlertTriangle className="h-4 w-4 mr-2 flex-shrink-0 text-amber-500 dark:text-amber-400" />
            )}
            <div className="flex-1 min-w-0 space-y-3">
                {/* BROKER MAPPING SECTION */}
                <div className="mb-2">
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Broker Mapping</p>
                    <div className="space-y-2">
                        <div className="flex items-center justify-between py-0 my-0">
                            <span className="text-xs text-gray-600 dark:text-gray-400 leading-none py-0 my-0">
                                Field: {field.label || "Field Without Label"}
                            </span>
                            <CheckCircle2 className="h-3 w-3 text-green-500 dark:text-green-400 flex-shrink-0" />
                        </div>
                        <div className="flex items-center justify-between py-0 my-0">
                            <span className="text-xs text-gray-600 dark:text-gray-400 leading-none py-0 my-0">
                                Broker: {broker.name || "Broker Without Name"}
                            </span>
                            <CheckCircle2 className="h-3 w-3 text-green-500 dark:text-green-400 flex-shrink-0" />
                        </div>
                        <div className="flex items-center justify-between py-0 my-0">
                            <span className="text-xs text-gray-600 dark:text-gray-400 leading-none py-0 my-0">
                                Applet: {applet?.name || "No Applet Found"}
                            </span>
                            {applet ? (
                                <CheckCircle2 className="h-3 w-3 text-green-500 dark:text-green-400 flex-shrink-0" />
                            ) : (
                                <XCircle className="h-3 w-3 text-red-500 dark:text-red-400 flex-shrink-0" />
                            )}
                        </div>
                    </div>
                </div>


                {/* FIELD & CONTAINER ASSOCIATIONS SECTION */}
                <div>
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Associations:</p>
                    <div className="space-y-2">
                        <div className="flex items-center justify-between py-0 my-0">
                            <span className="text-xs text-gray-600 dark:text-gray-400 leading-none py-0 my-0">
                                Database Field: {field.label || "Field Without Label"}
                            </span>
                            <CheckCircle2 className="h-3 w-3 text-green-500 dark:text-green-400 flex-shrink-0" />
                        </div>
                        <div className="flex items-center justify-between py-0 my-0">
                            <span className="text-xs text-gray-600 dark:text-gray-400 leading-none py-0 my-0">
                                Applet Container: {containerFromApplet ? (containerFromApplet.label || "Container Without Label") : "No Container"}
                            </span>
                            {containerStatus.inAppletContainer ? (
                                <CheckCircle2 className="h-3 w-3 text-green-500 dark:text-green-400 flex-shrink-0" />
                            ) : (
                                <XCircle className="h-3 w-3 text-red-500 dark:text-red-400 flex-shrink-0" />
                            )}
                        </div>
                        <div className="flex items-center justify-between py-0 my-0">
                            <span className="text-xs text-gray-600 dark:text-gray-400 leading-none py-0 my-0">
                                Database Container: {databaseContainer ? (databaseContainer.label || "Container Without Label") : "No Container"}
                            </span>
                            {containerStatus.databaseContainerExists ? (
                                <CheckCircle2 className="h-3 w-3 text-green-500 dark:text-green-400 flex-shrink-0" />
                            ) : (
                                <XCircle className="h-3 w-3 text-red-500 dark:text-red-400 flex-shrink-0" />
                            )}
                        </div>
                    </div>
                </div>

                {/* STATUS MESSAGES */}
                <div className="mt-2">
                    {!containerStatus.inAppletContainer && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">Field not in applet container</p>
                    )}
                    {containerStatus.inAppletContainer && !containerStatus.databaseContainerExists && (
                        <p className="text-xs text-red-600 dark:text-red-400">Container missing from database</p>
                    )}
                    {containerStatus.databaseContainerExists && !containerStatus.fieldInDatabaseContainer && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">Field missing from database container</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DraggableField;
