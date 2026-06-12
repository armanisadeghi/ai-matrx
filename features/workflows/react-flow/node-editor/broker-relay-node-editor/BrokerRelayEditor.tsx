"use client";

import React, { useState, useEffect } from "react";
import {
  ConvertedWorkflowData,
  DbBrokerRelayData,
  DbCompleteWorkflow,
} from "@/features/workflows/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRightLeft, Plus, Trash2, Copy } from "lucide-react";
import { BrokerSelect } from "@/components/ui/broker-select";
import { useBrokerData } from "@/features/workflows/hooks/useBrokerData";
import { CustomFieldLabelAndHelpText } from "@/constants/app-builder-help-text";
import { EnrichedBroker } from "@/features/workflows/utils/data-flow-manager";
import { asStringArray } from "@/features/workflows/utils/workflow-json-fields";

interface BrokerRelayEditorProps {
  nodeData: DbBrokerRelayData | null;
  onSave: (updatedNodeData: DbBrokerRelayData) => void;
  onClose: () => void;
  open: boolean;
  readOnly?: boolean;
  completeWorkflowData?: ConvertedWorkflowData | null;
  enrichedBrokers: EnrichedBroker[];
}

const BrokerRelayEditor: React.FC<BrokerRelayEditorProps> = ({
  nodeData,
  onSave,
  onClose,
  open,
  readOnly = false,
  completeWorkflowData,
  enrichedBrokers,
}) => {
  const [editingNode, setEditingNode] = useState<DbBrokerRelayData | null>(
    nodeData,
  );
  const [cancelClicked, setCancelClicked] = useState(false);

  // Get broker data for the workflow
  const { producerBrokers, allBrokers } = useBrokerData(completeWorkflowData);

  useEffect(() => {
    setEditingNode(nodeData);
    setCancelClicked(false); // Reset cancel flag when dialog opens
  }, [nodeData]);

  if (!editingNode) return null;

  const targetBrokerIds = asStringArray(editingNode.target_broker_ids);

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

  const addTarget = () => {
    setEditingNode({
      ...editingNode,
      target_broker_ids: [...targetBrokerIds, ""],
    });
  };

  const updateTarget = (index: number, value: string) => {
    const newTargets = [...targetBrokerIds];
    newTargets[index] = value;
    setEditingNode({
      ...editingNode,
      target_broker_ids: newTargets,
    });
  };

  const removeTarget = (index: number) => {
    const newTargets = targetBrokerIds.filter((_, i) => i !== index);
    setEditingNode({
      ...editingNode,
      target_broker_ids: newTargets,
    });
  };

  const copyAllTargets = () => {
    const targetsText = targetBrokerIds.join("\n");
    navigator.clipboard.writeText(targetsText);
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="max-w-3xl h-[85dvh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Edit Broker Relay: {editingNode.label || "Unnamed Relay"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-6">
          {/* Relay Label */}
          <Card>
            <CardContent>
              <div className="space-y-2">
                <CustomFieldLabelAndHelpText
                  fieldId="relay-label"
                  fieldLabel="Relay Label"
                  helpText="A human-readable name to identify this relay in the workflow"
                  required={true}
                  className="pt-2"
                />
                <Input
                  id="relay-label"
                  value={editingNode.label || ""}
                  onChange={(e) =>
                    setEditingNode({ ...editingNode, label: e.target.value })
                  }
                  placeholder="Enter a descriptive name for this relay"
                  disabled={readOnly}
                />
              </div>
            </CardContent>
          </Card>

          {/* Source Configuration */}
          <Card>
            <CardContent>
              <BrokerSelect
                label="Source Broker ID"
                description="The broker ID that provides data to this relay"
                value={editingNode.source_broker_id}
                onValueChange={(value) =>
                  setEditingNode({ ...editingNode, source_broker_id: value })
                }
                brokers={producerBrokers}
                showProducersOnly={true}
                placeholder="Select source broker..."
                disabled={readOnly}
              />
            </CardContent>
          </Card>

          {/* Target Configuration */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Data Targets</CardTitle>
                <div className="flex gap-2">
                  <Button onClick={copyAllTargets} variant="outline" size="sm">
                    <Copy className="h-4 w-4 mr-2" />
                    Copy All
                  </Button>
                  <Button onClick={addTarget} size="sm" disabled={readOnly}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Target
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {targetBrokerIds.length > 0 ? (
                <div className="space-y-3">
                  {targetBrokerIds.map((target, index) => (
                    <Card key={index} className="border-border">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-4">
                          <div className="flex-1">
                            <BrokerSelect
                              label={`Target ${index + 1}`}
                              value={target}
                              onValueChange={(value) =>
                                updateTarget(index, value)
                              }
                              brokers={allBrokers}
                              placeholder="Select or enter target broker ID..."
                              disabled={readOnly}
                            />
                          </div>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => removeTarget(index)}
                            className="mt-8"
                            disabled={readOnly}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No target brokers configured. Click "Add Target" to get
                  started.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Data Flow Visualization */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Data Flow Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-muted p-4 rounded-md">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="bg-blue-100 dark:bg-blue-900/50 px-3 py-2 rounded text-sm font-mono">
                      {editingNode.source_broker_id || "source_broker_id"}
                    </div>
                    <ArrowRightLeft className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <div className="text-sm font-medium">
                      {editingNode.label || "Relay"}
                    </div>
                    <ArrowRightLeft className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <div className="text-sm text-muted-foreground">
                      {targetBrokerIds.length} target
                      {targetBrokerIds.length !== 1 ? "s" : ""}
                    </div>
                  </div>

                  {targetBrokerIds.length > 0 && (
                    <div className="ml-8 space-y-1">
                      {targetBrokerIds.slice(0, 5).map((target, index) => (
                        <div
                          key={index}
                          className="bg-green-100 dark:bg-green-900/50 px-2 py-1 rounded text-xs font-mono"
                        >
                          → {target || `target_${index + 1}`}
                        </div>
                      ))}
                      {targetBrokerIds.length > 5 && (
                        <div className="text-xs text-muted-foreground px-2">
                          +{targetBrokerIds.length - 5} more targets...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Label</p>
                  <p className="font-medium">
                    {editingNode.label || "Unnamed Relay"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Source</p>
                  <p className="font-mono text-xs">
                    {editingNode.source_broker_id || "Not set"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Target Count</p>
                  <p className="font-medium">{targetBrokerIds.length}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Valid Targets</p>
                  <p className="font-medium">
                    {targetBrokerIds.filter((t) => t.trim()).length}
                  </p>
                </div>
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

export default BrokerRelayEditor;
