"use client";
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Database } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectFieldsByBrokerMappings } from "@/lib/redux/app-builder/selectors/fieldSelectors";
import {
    selectAppletBrokerMappings,
    selectAllNeededBrokers,
    selectAllUsedFieldsInApplet,
} from "@/lib/redux/app-builder/selectors/appletSelectors";
import { selectContainersForApplet } from "@/lib/redux/app-builder/selectors/appletSelectors";
import DraggableField from "./DraggableField";

interface DraggableFieldsProps {
    appId: string;
    appletId: string;
    className?: string;
    onSuccessfulDrop?: (fieldId: string, brokerId: string, appletId: string) => void;
}

const DraggableFields: React.FC<DraggableFieldsProps> = ({ appId, appletId, onSuccessfulDrop, className = "" }) => {
    const fieldsFromDatabase = useAppSelector((state) => selectFieldsByBrokerMappings(state, appletId));
    const brokerMappings = useAppSelector((state) => selectAppletBrokerMappings(state, appletId));
    const neededBrokers = useAppSelector((state) => selectAllNeededBrokers(state, appletId));
    
    // This tells us which fields are actually in containers (the real source of truth)
    const usedFieldIdsInApplet = useAppSelector((state) => selectAllUsedFieldsInApplet(state, appletId));

    // Get containers to check if fields exist
    const appletContainers = useAppSelector((state) => selectContainersForApplet(state, appletId));

    // Handle successful drop (called by individual field component)
    const handleFieldDrop = (fieldId: string, brokerId: string) => {
        if (onSuccessfulDrop) {
            onSuccessfulDrop(fieldId, brokerId, appletId);
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
        <Card className={`border-border bg-textured shadow-sm ${className}`}>
            <CardHeader className="bg-gray-50 dark:bg-gray-800/50 border-b border-border py-3 px-4">
                <CardTitle className="text-sm font-medium text-gray-800 dark:text-gray-200 flex items-center">
                    <Database className="h-4 w-4 mr-2 text-indigo-500" />
                    Available Fields
                </CardTitle>
            </CardHeader>
            <CardContent className="p-3">
                {fieldsFromDatabase.length === 0 || !brokerMappings || brokerMappings.length === 0 ? (
                    <div className="text-center py-6">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            No fields are currently mapped to brokers for this applet.
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            Add broker mappings in the Fields & Brokers step to see fields here.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
                        {brokerMappings.map((mapping) => {
                            const field = Array.isArray(fieldsFromDatabase)
                                ? fieldsFromDatabase.find((f) => f && f.id === mapping.fieldId)
                                : undefined;
                            const broker = Array.isArray(neededBrokers)
                                ? neededBrokers.find((b) => b && b.id === mapping.brokerId)
                                : undefined;

                            // Check if this field is actually in any container (the real relationship)
                            const isFieldInContainer = usedFieldIdsInApplet.has(mapping.fieldId);

                            return (
                                <DraggableField
                                    key={`field-${mapping.fieldId}-broker-${mapping.brokerId}`}
                                    fieldId={mapping.fieldId}
                                    brokerId={mapping.brokerId}
                                    field={field}
                                    broker={broker}
                                    isDropped={isFieldInContainer}
                                    appletContainers={appletContainers}
                                    onSuccessfulDrop={handleFieldDrop}
                                    appletId={appletId}
                                />
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

export default DraggableFields;
