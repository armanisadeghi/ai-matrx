"use client";

import React from "react";
import { ChevronUp, ChevronDown, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { moveFieldUpThunk, moveFieldDownThunk, removeFieldThunk } from "@/lib/redux/app-builder/thunks/containerBuilderThunks";
import { FieldDefinition } from "@/types/customAppTypes";
import { selectContainerById } from "@/lib/redux/app-builder/selectors/containerSelectors";
import ContainerFieldStatusManager from "./ContainerFieldStatusManager";

interface ContainerFieldDisplayProps {
    containerId: string;
    fields: FieldDefinition[];
    disabled?: boolean;
}

const ContainerFieldDisplay: React.FC<ContainerFieldDisplayProps> = ({
    containerId,
    fields,
    disabled = false,
}) => {
    const dispatch = useAppDispatch();
    const store = useAppStore();
    const container = useAppSelector((state) => selectContainerById(state, containerId));

    const handleMoveFieldUp = async (fieldId: string) => {
        if (!containerId) return;
        try {
            await dispatch(moveFieldUpThunk({ containerId, fieldId })).unwrap();
            const updatedContainer = selectContainerById(store.getState(), containerId);
            console.log("After moveFieldUp:", {
                fieldId,
                containerFields: updatedContainer?.fields.map(f => ({ id: f.id, label: f.label }))
            });
        } catch (error) {
            console.error("Error moving field up:", error);
        }
    };

    const handleMoveFieldDown = async (fieldId: string) => {
        if (!containerId) return;
        try {
            await dispatch(moveFieldDownThunk({ containerId, fieldId })).unwrap();
        } catch (error) {
            console.error("Error moving field down:", error);
        }
    };

    const handleRemoveField = async (fieldId: string) => {
        if (!containerId) return;
        try {
            await dispatch(removeFieldThunk({ containerId, fieldId })).unwrap();
            console.log(`Field ${fieldId} removed from container ${containerId}`);
        } catch (error) {
            console.error("Error removing field:", error);
        }
    };

    const handleAddField = () => {
        console.log("Add field clicked");
    };

    // Status action handlers
    const handleRecompileField = (fieldId: string) => {
        console.log(`Recompile field clicked for ${fieldId}`);
    };

    const handleSaveFieldChanges = (fieldId: string) => {
        console.log(`Save field changes clicked for ${fieldId}`);
    };

    const handleMissingField = (fieldId: string) => {
        console.log(`Missing field status clicked for ${fieldId}`);
    };

    return (
        <div className="space-y-2">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Fields</div>
            <div className="space-y-2">
                {fields && fields.length > 0 ? (
                    fields.map((field, index) => (
                        <Card 
                            key={field.id} 
                            className="w-full border-border bg-gray-50 dark:bg-gray-800/50"
                        >
                            <CardContent className="p-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleRemoveField(field.id)}
                                            disabled={disabled}
                                            className="h-7 w-7 text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/20 mr-2"
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                        <div className="text-sm text-gray-700 dark:text-gray-300">
                                            {field.label}
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-1">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleMoveFieldUp(field.id)}
                                            disabled={index === 0 || disabled}
                                            className="h-7 w-7 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                                        >
                                            <ChevronUp className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleMoveFieldDown(field.id)}
                                            disabled={index === fields.length - 1 || disabled}
                                            className="h-7 w-7 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                                        >
                                            <ChevronDown className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                                <ContainerFieldStatusManager
                                    container={container ?? null}
                                    field={field}
                                    onRecompileField={handleRecompileField}
                                    onSaveFieldChanges={handleSaveFieldChanges}
                                    onMissingField={handleMissingField}
                                />
                            </CardContent>
                        </Card>
                    ))
                ) : (
                    <div className="text-sm text-gray-500 dark:text-gray-400 p-2 text-center">
                        No fields added to this container yet.
                    </div>
                )}
                
                <Card 
                    className="w-full border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/30 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/30 transition-colors"
                    onClick={handleAddField}
                >
                    <CardContent className="p-3 flex items-center justify-center">
                        <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                            <Plus className="h-4 w-4 mr-2" />
                            Select Field to Add
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default ContainerFieldDisplay;
