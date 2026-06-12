"use client";

import React, { useState, useEffect } from "react";
import { DbUserInput } from "@/features/workflows/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { User, Edit3, AlertTriangle } from "lucide-react";
import { EnrichedBroker } from "@/features/workflows/utils/data-flow-manager";
import { BrokerMapEntry } from "@/lib/redux/brokerSlice/types";
import { brokerActions } from "@/lib/redux/brokerSlice";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import PrimaryFieldBuilder from "@/features/applet/builder/modules/field-builder/PrimaryFieldBuilder";
import { fetchFieldsThunk } from "@/lib/redux/app-builder/thunks/fieldBuilderThunks";
import FieldsWithFetch from "@/features/applet/runner/fields/core/FieldsWithFetch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import BrokerSelector from "@/components/ui/broker-selector";

interface UserInputEditorProps {
    nodeData: DbUserInput | null;
    onSave: (nodeData: DbUserInput) => void;
    onClose: () => void;
    open: boolean;
    readOnly?: boolean;
    enrichedBrokers: EnrichedBroker[];
}

const ConnectedUserInput: React.FC<UserInputEditorProps> = ({ nodeData, onSave, onClose, open, readOnly = false, enrichedBrokers }) => {
    const [editingNode, setEditingNode] = useState<DbUserInput | null>(nodeData);
    const [cancelClicked, setCancelClicked] = useState(false);
    const dispatch = useAppDispatch();
    const [activeFieldId, setActiveFieldId] = useState<string | null>(nodeData?.field_component_id || null);
    const [showFieldBuilder, setShowFieldBuilder] = useState(false);
    const [mappingError, setMappingError] = useState<string | null>(null);

    // Get broker registry from Redux - single source of truth
    const brokerMap = useAppSelector((state) => state.broker?.brokerMap);

    // Derive broker mapping from Redux instead of local state
    const brokerMapping = editingNode && editingNode.broker_id && editingNode.field_component_id
        ? Object.values(brokerMap).find(
            (entry) => entry.mappedItemId === editingNode.field_component_id && entry.brokerId === editingNode.broker_id
        ) || null
        : null;

    // Load all components on initial render
    useEffect(() => {
        loadComponents();
    }, []);

    // Load components from Redux
    const loadComponents = async () => {
        try {
            await dispatch(fetchFieldsThunk()).unwrap();
        } catch (err: any) {
            console.error("Error loading components", err);
        }
    };

    useEffect(() => {
        setEditingNode(nodeData);
        setCancelClicked(false);
        setActiveFieldId(nodeData?.field_component_id || null);
        
        // Validate existing mapping when node data changes
        if (nodeData) {
            validateBrokerMapping(nodeData);
        }
    }, [nodeData]);

    // Validate broker mapping whenever broker ID or field ID changes
    useEffect(() => {
        if (editingNode) {
            validateBrokerMapping(editingNode);
        }
    }, [editingNode?.broker_id, editingNode?.field_component_id, brokerMap]);

    const validateBrokerMapping = (node: DbUserInput) => {
        if (!node.broker_id || !node.field_component_id) {
            setMappingError(null);
            setShowFieldBuilder(!node.field_component_id);
            return;
        }

        // Check if there's a valid mapping in Redux (brokerMapping is derived from Redux)
        if (brokerMapping) {
            setMappingError(null);
            setShowFieldBuilder(false);
        } else {
            // If node has both IDs but no mapping exists, automatically create it
            // This happens when opening a previously saved workflow
            const autoMapping: BrokerMapEntry = {
                brokerId: node.broker_id,
                mappedItemId: node.field_component_id,
                source: "workflows",
                sourceId: node.workflow_id,
            };
            
            dispatch(brokerActions.addOrUpdateRegisterEntry(autoMapping));
            setMappingError(null);
            setShowFieldBuilder(false);
        }
    };

    if (!editingNode) return null;

    const handleCreateBrokerMapping = () => {
        if (!editingNode.field_component_id) {
            setMappingError("Please select a field first.");
            return null;
        }

        const newBrokerMapping: BrokerMapEntry = {
            brokerId: editingNode.broker_id,
            mappedItemId: editingNode.field_component_id,
            source: "workflows",
            sourceId: editingNode.workflow_id,
        };
        
        dispatch(brokerActions.addOrUpdateRegisterEntry(newBrokerMapping));
        setMappingError(null);
        setShowFieldBuilder(false);
        return newBrokerMapping;
    };

    const handleChangeField = () => {
        setShowFieldBuilder(true);
        setEditingNode({
            ...editingNode,
            field_component_id: '',
        });
    };

    const handleBrokerIdChange = (newBrokerId: string) => {
        setEditingNode({
            ...editingNode,
            broker_id: newBrokerId,
        });
        
        // Clear current mapping error as broker ID changed
        setMappingError(null);
        
        // If we have a field selected, we'll need to re-map
        if (editingNode.field_component_id) {
            setShowFieldBuilder(true);
        }
    };

    const handleSave = () => {
        if (!editingNode) return;

        // Validate that we have proper mapping before saving
        if (editingNode.field_component_id) {
            const validMapping = Object.values(brokerMap).find(
                (entry) => entry.mappedItemId === editingNode.field_component_id && entry.brokerId === editingNode.broker_id
            );

            if (!validMapping) {
                setMappingError("Cannot save: Field and broker must be properly mapped. Please map them together before saving.");
                return;
            }
        }

        onSave(editingNode);
        onClose();
    };

    const handleCancel = () => {
        setCancelClicked(true);
        onClose();
    };

    const handleDialogClose = (open: boolean) => {
        if (!open) {
            // If dialog is closing and user didn't click cancel, auto-save
            if (!cancelClicked && editingNode) {
                            // Only auto-save if mapping is valid
            if (!editingNode.field_component_id || Object.values(brokerMap).find(
                (entry) => entry.mappedItemId === editingNode.field_component_id && entry.brokerId === editingNode.broker_id
            )) {
                onSave(editingNode);
            }
            }
            onClose();
        }
    };

    const handleValueChange = (value: string) => {
        let processedValue: any = value;

        // Convert value based on data type
        if (editingNode.data_type === "int") {
            processedValue = value ? parseInt(value) || 0 : null;
        } else if (editingNode.data_type === "float") {
            processedValue = value ? parseFloat(value) || 0 : null;
        } else if (editingNode.data_type === "bool") {
            processedValue = value.toLowerCase() === "true";
        } else if (editingNode.data_type === "dict" || editingNode.data_type === "list") {
            try {
                processedValue = value ? JSON.parse(value) : null;
            } catch (e) {
                // Keep as string if not valid JSON
                processedValue = value;
            }
        }

        setEditingNode({
            ...editingNode,
            default_value: processedValue,
        });
    };

    const getValueAsString = () => {
        if (editingNode.default_value === null || editingNode.default_value === undefined) return "";
        if ((editingNode.data_type === "dict" || editingNode.data_type === "list") && typeof editingNode.default_value === "object") {
            return JSON.stringify(editingNode.default_value, null, 2);
        }
        return String(editingNode.default_value);
    };

    const handleFieldSelected = (fieldId: string) => {
        setEditingNode({
            ...editingNode,
            field_component_id: fieldId,
        });
        setActiveFieldId(fieldId);
        
        // Don't automatically create mapping here - let user click the map button
        // This allows for validation and explicit user action
        setShowFieldBuilder(false);
    };

    return (
        <Dialog open={open} onOpenChange={handleDialogClose}>
            <DialogContent className="max-w-7xl h-[95dvh] flex flex-col">
                <DialogHeader className="flex-shrink-0">
                    <DialogTitle className="flex items-center gap-2">
                        <User className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                        Edit User Input: {editingNode.label || "Unnamed Input"}
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 min-h-0 overflow-y-auto space-y-6">
                    {mappingError && (
                        <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription>{mappingError}</AlertDescription>
                        </Alert>
                    )}

                    <Card>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="input-label">Label</Label>
                                    <Input
                                        id="input-label"
                                        value={editingNode.label || ""}
                                        onChange={(e) => setEditingNode({ ...editingNode, label: e.target.value })}
                                        placeholder="Enter input label"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="data-type">Data Type</Label>
                                    <Select
                                        value={editingNode.data_type || "str"}
                                        onValueChange={(value: any) => setEditingNode({ ...editingNode, data_type: value })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="str">String (str)</SelectItem>
                                            <SelectItem value="int">Integer (int)</SelectItem>
                                            <SelectItem value="float">Float (float)</SelectItem>
                                            <SelectItem value="bool">Boolean (bool)</SelectItem>
                                            <SelectItem value="list">List (list)</SelectItem>
                                            <SelectItem value="dict">Dictionary (dict)</SelectItem>
                                            <SelectItem value="tuple">Tuple (tuple)</SelectItem>
                                            <SelectItem value="set">Set (set)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <BrokerSelector
                                selectedBrokerId={editingNode.broker_id}
                                enrichedBrokers={enrichedBrokers}
                                workflowId={editingNode.workflow_id}
                                onBrokerSelect={handleBrokerIdChange}
                                label="Broker ID"
                                placeholder="Select or create a broker for this input"
                            />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Default Value</CardTitle>
                            <p className="text-xs text-muted-foreground">IMPORTANT: The value when your workflow runs automatically. If you don't intend to have that happen, then please do not enter a default value.</p>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {editingNode.data_type === "bool" ? (
                                <Select value={String(editingNode.default_value)} onValueChange={(value) => handleValueChange(value)}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="true">True</SelectItem>
                                        <SelectItem value="false">False</SelectItem>
                                    </SelectContent>
                                </Select>
                            ) : editingNode.data_type === "dict" || editingNode.data_type === "list" ? (
                                <div className="space-y-2">
                                    <Textarea
                                        value={getValueAsString()}
                                        onChange={(e) => handleValueChange(e.target.value)}
                                        placeholder="Enter JSON data"
                                        className="font-mono min-h-24"
                                    />
                                    <p className="text-xs text-muted-foreground">Enter valid JSON format</p>
                                </div>
                            ) : (
                                <Input
                                    type={editingNode.data_type === "int" || editingNode.data_type === "float" ? "number" : "text"}
                                    value={getValueAsString()}
                                    onChange={(e) => handleValueChange(e.target.value)}
                                    placeholder={`Enter ${editingNode.data_type} value`}
                                />
                            )}
                        </CardContent>
                    </Card>

                    {/* Field Selection and Management */}
                    <div className="space-y-4">
                        {showFieldBuilder && (
                            <>
                                <Alert>
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertDescription>
                                        Please select or create a field and map it to your broker before saving changes.
                                    </AlertDescription>
                                </Alert>
                                <div className="max-h-[48rem] overflow-y-auto border rounded-lg">
                                    <PrimaryFieldBuilder onFieldSelected={handleFieldSelected} noFetch={true} initialMode={activeFieldId ? "editor" : "list"}/>
                                </div>
                            </>
                        )}

                        {activeFieldId && !brokerMapping && (
                            <div className="space-y-4">
                                <div className="text-sm text-muted-foreground space-y-2">
                                    <p>
                                        <strong>Selected Field ID:</strong>{" "}
                                        <code className="bg-background px-1 py-0.5 rounded text-xs">{activeFieldId}</code>
                                    </p>
                                    <p>
                                        <strong>Broker ID:</strong>{" "}
                                        <code className="bg-background px-1 py-0.5 rounded text-xs">{editingNode.broker_id}</code>
                                    </p>
                                    <p>
                                        <strong>Type:</strong> {editingNode.data_type}
                                    </p>
                                </div>
                                <Button onClick={handleCreateBrokerMapping} disabled={!activeFieldId || !editingNode.broker_id}>
                                    Map Broker to Field
                                </Button>
                            </div>
                        )}

                        {activeFieldId && brokerMapping && (
                            <FieldsWithFetch 
                                fieldIds={[activeFieldId]} 
                                sourceId={editingNode.workflow_id} 
                                source="workflows" 
                            />
                        )}

                        {activeFieldId && brokerMapping && (
                            <div className="flex items-center justify-between">
                                <div className="text-sm text-emerald-600 dark:text-emerald-400">
                                    ✓ Field and broker are properly mapped
                                </div>
                                <Button variant="outline" size="sm" onClick={handleChangeField}>
                                    <Edit3 className="h-4 w-4 mr-2" />
                                    Change Field
                                </Button>
                            </div>
                        )}


                    </div>
                </div>

                <DialogFooter className="flex-shrink-0">
                    <Button variant="outline" onClick={handleCancel}>
                        Cancel
                    </Button>
                    <Button 
                        onClick={handleSave}
                        disabled={!!mappingError || (editingNode.field_component_id && !brokerMapping) || showFieldBuilder}
                    >
                        Save Changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default ConnectedUserInput;
