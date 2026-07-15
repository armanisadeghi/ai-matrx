"use client";

import React, { useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { Broker } from "@/types/customAppTypes";
import SectionCard from "@/components/official/cards/SectionCard";
import {
    selectFieldById,
    selectFieldError,
    selectFieldLoading,
    selectFieldComponent,
    selectHasFieldUnsavedChanges,
} from "@/lib/redux/app-builder/selectors/fieldSelectors";
import { startFieldCreation, setActiveField, cancelFieldCreation } from "@/lib/redux/app-builder/slices/fieldBuilderSlice";
import { saveFieldThunk, fetchFieldByIdThunk } from "@/lib/redux/app-builder/thunks/fieldBuilderThunks";
import { addFieldAndCompileContainerThunk } from "@/lib/redux/app-builder/thunks/containerBuilderThunks";
import { recompileAppletThunk } from "@/lib/redux/app-builder/thunks/appletBuilderThunks";
import { useToast } from "@/components/ui/use-toast";
import { LoadingSpinner } from "@/components/ui/spinner";
import SmartFieldBuilder from "./SmartFieldBuilder";
import FieldEditorActions from "./FieldEditorActions";
import FieldPreview from "../previews/FieldPreview";  

interface FieldEditorProps {
    fieldId?: string;
    isCreatingNew?: boolean;
    onSaveSuccess?: (fieldId: string) => void;
    onCancel?: () => void;
    containerId?: string;
    appletId?: string;
    broker?: Broker;
    showBackButton?: boolean;
}

const FieldEditor: React.FC<FieldEditorProps> = ({
    fieldId,
    isCreatingNew = false,
    onSaveSuccess,
    onCancel,
    containerId,
    appletId,
    broker,
    showBackButton = false,
}) => {
    const dispatch = useAppDispatch();
    const { toast } = useToast();

    const isLoading = useAppSelector(selectFieldLoading);
    const error = useAppSelector(selectFieldError);
    const [localFieldId, setLocalFieldId] = useState<string | null>(fieldId ?? null);

    // Get field data and state from Redux
    const field = useAppSelector((state) => localFieldId ? selectFieldById(state, localFieldId) : undefined);
    const componentType = useAppSelector((state) => localFieldId ? selectFieldComponent(state, localFieldId) : null);
    const hasUnsavedChanges = useAppSelector((state) => localFieldId ? selectHasFieldUnsavedChanges(state, localFieldId) : false);

    useEffect(() => {
        if (fieldId) {
            dispatch(setActiveField(fieldId));
        }
    }, [dispatch, fieldId]);

    useEffect(() => {
        if (isCreatingNew) {
            if (localFieldId) dispatch(cancelFieldCreation(localFieldId));
            const newFieldId = uuidv4();
            setLocalFieldId(newFieldId);
            dispatch(startFieldCreation({ id: newFieldId }));
        } else if (fieldId) {
            dispatch(setActiveField(fieldId));
        }
    }, [dispatch, isCreatingNew]);

    const handleSave = async () => {
        if (!localFieldId) return;

        try {
            const savedComponent = await dispatch(saveFieldThunk(localFieldId)).unwrap();

            toast({
                title: "Success",
                description: `Field component ${isCreatingNew ? "created" : "updated"}`,
            });

            if (onSaveSuccess) {
                onSaveSuccess(savedComponent.id);
            }
        } catch (err: any) {
            toast({
                title: "Error",
                description: err.message || `Failed to ${isCreatingNew ? "create" : "update"} component`,
                variant: "destructive",
            });
            console.error("Error saving component:", err);
        }
    };

    const handleCompileAndAdd = async () => {
        await handleSave();

        // Only proceed if we have a container ID and a valid field
        if (containerId && field) {
            try {
                // Use the appropriate container thunk to add the field
                await dispatch(
                    addFieldAndCompileContainerThunk({
                        containerId: containerId,
                        field: field,
                    })
                ).unwrap();

                // Recompile the applet if we have an active applet ID
                if (appletId) {
                    await dispatch(recompileAppletThunk(appletId)).unwrap();
                }

                toast({
                    title: "Success",
                    description: `Field compiled and added to container successfully${appletId ? ", applet recompiled" : ""}`,
                });
            } catch (err: any) {
                toast({
                    title: "Error",
                    description: err.message || "Failed to compile and add field",
                    variant: "destructive",
                });
            }
        }
    };

    const handleCancel = async () => {
        if (onCancel) {
            onCancel();
        } else {
            if (!isCreatingNew && localFieldId) {
                // Fetch the original field data to restore it
                try {
                    await dispatch(fetchFieldByIdThunk(localFieldId)).unwrap();

                    toast({
                        title: "Changes Discarded",
                        description: "Your changes have been discarded",
                    });
                } catch (err: unknown) {
                    toast({
                        title: "Error",
                        description: err instanceof Error ? err.message : "Failed to restore original field data",
                        variant: "destructive",
                    });
                    console.error("Error restoring field:", err);
                }
            } else {
                setLocalFieldId(null);
                if (localFieldId) dispatch(cancelFieldCreation(localFieldId));
            }
        }
    };

    if (!field || !localFieldId) {
        return <LoadingSpinner />;
    }

    return (
        <div className="w-full">
            {error && <div className="p-1 mb-4 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 rounded">{error}</div>}

            <div className="flex flex-col lg:flex-row gap-3">
                {/* Left side: Field Builder */}
                <div className="w-full lg:w-1/2">
                    <SectionCard
                        title={isCreatingNew ? "Create New Component" : "Edit Component"}
                        color="gray"
                        spacing="relaxed"
                        footer={
                            <FieldEditorActions
                                isCreatingNew={isCreatingNew}
                                isLoading={isLoading}
                                hasUnsavedChanges={hasUnsavedChanges}
                                showBackButton={showBackButton}
                                showCompileButton={!!containerId}
                                onSave={handleSave}
                                onCancel={handleCancel}
                                onCompileAndAdd={handleCompileAndAdd}
                                fieldId={localFieldId}
                            />
                        }
                    >
                        <SmartFieldBuilder key={broker?.id} fieldId={localFieldId} broker={broker} />
                    </SectionCard>
                </div>

                {/* Right side: Preview area */}
                <div className="w-full">
                    <FieldPreview fieldId={localFieldId} componentType={componentType} />
                </div>
            </div>
        </div>
    );
};

export default FieldEditor;
