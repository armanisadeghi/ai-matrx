"use client";
import { confirm as confirmDialog } from "@/components/dialogs/confirm/ConfirmDialogHost";

import React, { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import FieldComponentsList from "./FieldComponentsList";
import FieldEditor from "./editor/FieldEditor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
    selectAllFields, 
    selectFieldLoading, 
    selectFieldError, 
    selectActiveFieldId 
} from "@/lib/redux/app-builder/selectors/fieldSelectors";
import { 
    setActiveField, 
    startFieldCreation, 
    cancelFieldCreation 
} from "@/lib/redux/app-builder/slices/fieldBuilderSlice";
import { 
    fetchFieldsThunk, 
    deleteFieldThunk, 
    fetchFieldByIdThunk, 
    saveFieldThunk 
} from "@/lib/redux/app-builder/thunks/fieldBuilderThunks";
import { v4 as uuidv4 } from "uuid";
import { duplicateFieldComponent } from "@/lib/redux/app-builder/service/fieldComponentService";

interface PrimaryFieldBuilderProps {
    onFieldSelected?: (fieldId: string) => void;
    noFetch?: boolean;
    initialMode?: "list" | "editor";
    initialFieldId?: string;
}


const PrimaryFieldBuilder: React.FC<PrimaryFieldBuilderProps> = ({ onFieldSelected, noFetch = false, initialMode = "list", initialFieldId = null }) => {
    const dispatch = useAppDispatch();
    const { toast } = useToast();

    // Get state from Redux
    const components = useAppSelector(selectAllFields);
    const isLoading = useAppSelector(selectFieldLoading);
    const error = useAppSelector(selectFieldError);
    const activeFieldId = useAppSelector(selectActiveFieldId);

    // Local state for UI
    const [isCreatingNew, setIsCreatingNew] = useState(false);
    const [activeTab, setActiveTab] = useState<string>(initialMode);

    // Load all components on initial render
    useEffect(() => {
        if (!noFetch) {
            loadComponents();
        }
        if (initialFieldId) {
            handleFieldSelected(initialFieldId);
        }
    }, []);

    // Load components from Redux
    const loadComponents = async () => {
        try {
            await dispatch(fetchFieldsThunk()).unwrap();
        } catch (err: any) {
            toast({
                title: "Error",
                description: err.message || "Failed to load components",
                variant: "destructive",
            });
        }
    };

    // Create a new component
    const handleCreateNew = () => {
        const newId = uuidv4();
        dispatch(startFieldCreation({ id: newId }));
        setIsCreatingNew(true);
        setActiveTab("editor");
    };

    // Edit an existing component
    const handleEdit = async (id: string) => {
        try {
            await dispatch(fetchFieldByIdThunk(id)).unwrap();
            dispatch(setActiveField(id));
            setIsCreatingNew(false);
            setActiveTab("editor");
        } catch (err: any) {
            toast({
                title: "Error",
                description: err.message || "Failed to load component",
                variant: "destructive",
            });
        }
    };

    // Cancel editing
    const handleCancel = () => {
        if (activeFieldId && isCreatingNew) {
            dispatch(cancelFieldCreation(activeFieldId));
        }
        
        dispatch(setActiveField(null));
        setIsCreatingNew(false);
        setActiveTab("list");
    };

    // Handle save success
    const handleSaveSuccess = (savedFieldId: string) => {
        setIsCreatingNew(false);
        dispatch(setActiveField(null));
        setActiveTab("list"); // Navigate back to the list view after saving
        
        // Refresh the components list
        loadComponents();
    };

    // Delete a component
    const handleDelete = async (id: string) => {
        const ok = await confirmDialog({
            title: "Delete this field component?",
            description: "Applets using this component will lose it.",
            confirmLabel: "Delete",
            variant: "destructive",
        });
        if (!ok) return;

        try {
            await dispatch(deleteFieldThunk(id)).unwrap();
            
            if (activeFieldId === id) {
                dispatch(setActiveField(null));
                setActiveTab("list");
            }
            
            toast({
                title: "Success",
                description: "Field component deleted successfully",
            });
        } catch (err: any) {
            toast({
                title: "Error",
                description: err.message || "Failed to delete component",
                variant: "destructive",
            });
        }
    };

    // Duplicate a component
    const handleDuplicate = async (id: string) => {
        try {
            const newComponent = await duplicateFieldComponent(id);
            // Refresh the components to include the new duplicated component
            await loadComponents();
            
            toast({
                title: "Success",
                description: "Field component duplicated successfully",
            });
        } catch (err: any) {
            toast({
                title: "Error",
                description: err.message || "Failed to duplicate component",
                variant: "destructive",
            });
        }
    };

    const handleFieldSelected = (id: string) => {
        dispatch(setActiveField(id));
        setIsCreatingNew(false);
        setActiveTab("editor");
        onFieldSelected?.(id);
    };

    return (
        <div className="container mx-auto px-4 py-6">
            <Card className="border-border bg-textured shadow-lg">
                <CardHeader>
                    <CardTitle className="text-2xl font-bold text-blue-500 dark:text-blue-400">Field Components Manager</CardTitle>
                    <CardDescription className="text-gray-500 dark:text-gray-400">
                        Create, edit and manage field components for your applications
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    {error && <div className="p-3 mb-4 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 rounded">{error}</div>}

                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <TabsList className="grid w-full grid-cols-2 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                            <TabsTrigger
                                value="list"
                                className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-800 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400"
                            >
                                Component List
                            </TabsTrigger>
                            <TabsTrigger
                                value="editor"
                                className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-800 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400"
                                disabled={!activeFieldId}
                            >
                                {isCreatingNew ? "Create Component" : "Edit Component"}
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="list" className="mt-6">
                            {isLoading && !components.length ? (
                                <div className="flex justify-center items-center h-64">
                                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
                                </div>
                            ) : (
                                <FieldComponentsList
                                    fields={components}
                                    onFieldSelected={handleFieldSelected}
                                    onCreateNew={handleCreateNew}
                                    onEditField={handleEdit}
                                    onDeleteField={handleDelete}
                                    onDuplicateField={handleDuplicate}
                                    isLoading={isLoading}
                                />
                            )}
                        </TabsContent>

                        <TabsContent value="editor" className="mt-6">
                            {activeFieldId && (
                                <FieldEditor 
                                    fieldId={activeFieldId}
                                    isCreatingNew={isCreatingNew}
                                    onSaveSuccess={handleSaveSuccess}
                                    onCancel={handleCancel}
                                />
                            )}
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        </div>
    );
};

export default PrimaryFieldBuilder;
