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
import { User } from "lucide-react";
import { EnrichedBroker } from "@/features/workflows/utils/data-flow-manager";
import { BrokerMapEntry } from "@/lib/redux/brokerSlice/types";
import { v4 as uuidv4 } from "uuid";
import { brokerActions } from "@/lib/redux/brokerSlice";
import { useAppDispatch } from "@/lib/redux/hooks";
import { ComponentProps, ComponentType, FieldDefinition } from "@/types/customAppTypes";
import { normalizeFieldDefinition } from "@/features/applet/utils/field-normalization";

interface UserInputEditorProps {
    nodeData: DbUserInput | null;
    onSave: (nodeData: DbUserInput) => void;
    onClose: () => void;
    open: boolean;
    readOnly?: boolean;
    enrichedBrokers: EnrichedBroker[];
}

const UserInputEditor: React.FC<UserInputEditorProps> = ({ nodeData, onSave, onClose, open, readOnly = false, enrichedBrokers }) => {
    const [editingNode, setEditingNode] = useState<DbUserInput | null>(nodeData);
    const [cancelClicked, setCancelClicked] = useState(false);
    const [componentId, setComponentId] = useState<string | null>(nodeData?.field_component_id || null);
    const dispatch = useAppDispatch();
    const [fieldComponent, setFieldComponent] = useState<FieldDefinition | null>(null);

    useEffect(() => {
        setEditingNode(nodeData);
        setCancelClicked(false);
    }, [nodeData]);

    if (!editingNode) return null;

    useEffect(() => {
        if (!editingNode) return;
        if (!editingNode.field_component_id) {
            setComponentId(`TEMP-FIELD-${uuidv4()}`);
        }
        setEditingNode({
            ...editingNode,
            field_component_id: componentId,
        });
    }, []);

    const handleCreateBrokerMapping = () => {
        const brokerMapping: BrokerMapEntry = {
            brokerId: editingNode.broker_id,
            mappedItemId: editingNode.field_component_id,
            source: "workflows",
            sourceId: editingNode.workflow_id,
        };
        dispatch(brokerActions.addOrUpdateRegisterEntry(brokerMapping));
        return brokerMapping;
    };

    const handleCreateFieldComponent = (componentType: ComponentType, componentProps?: ComponentProps) => {
        const brokerMapping: BrokerMapEntry = {
            brokerId: editingNode.broker_id,
            mappedItemId: editingNode.field_component_id,
            source: "workflows",
            sourceId: editingNode.workflow_id,
        };
        dispatch(brokerActions.addOrUpdateRegisterEntry(brokerMapping));

        const fieldComponent: Partial<FieldDefinition> = {
            id: editingNode.field_component_id,
            label: editingNode.label,
            component: componentType,
            componentProps: componentProps,
        };
        setFieldComponent(normalizeFieldDefinition(fieldComponent));
    };

    const handleSave = () => {
        if (editingNode) {
            onSave(editingNode);
            onClose();
        }
    };

    const handleCancel = () => {
        setCancelClicked(true);
        onClose();
    };

    const handleDialogClose = (open: boolean) => {
        if (!open) {
            // If dialog is closing and user didn't click cancel, auto-save
            if (!cancelClicked && editingNode) {
                onSave(editingNode);
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

    return (
        <Dialog open={open} onOpenChange={handleDialogClose}>
            <DialogContent className="max-w-2xl h-[85dvh] flex flex-col">
                <DialogHeader className="flex-shrink-0">
                    <DialogTitle className="flex items-center gap-2">
                        <User className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                        Edit User Input: {editingNode.label || "Unnamed Input"}
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 min-h-0 overflow-y-auto space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Input Configuration</CardTitle>
                        </CardHeader>
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

                            <div className="space-y-2">
                                <Label htmlFor="broker-id">Broker ID</Label>
                                <Input
                                    id="broker-id"
                                    value={editingNode.broker_id}
                                    onChange={(e) => setEditingNode({ ...editingNode, broker_id: e.target.value })}
                                    placeholder="Enter unique broker ID"
                                    className="font-mono"
                                />
                                <p className="text-xs text-muted-foreground">This ID will be used to reference this input in other nodes</p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Default Value</CardTitle>
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

                    {/* Preview */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Preview</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="bg-muted p-3 rounded-md">
                                <p className="text-sm text-muted-foreground">
                                    <strong>Label:</strong> {editingNode.label || "Unnamed Input"}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    <strong>Broker ID:</strong>{" "}
                                    <code className="bg-background px-1 py-0.5 rounded text-xs">{editingNode.broker_id}</code>
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    <strong>Type:</strong> {editingNode.data_type}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    <strong>Value:</strong>
                                    <code className="bg-background px-1 py-0.5 rounded text-xs">{getValueAsString() || "null"}</code>
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <DialogFooter className="flex-shrink-0">
                    <Button variant="outline" onClick={handleCancel}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave}>Save Changes</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default UserInputEditor;
