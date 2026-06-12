"use client";

import React, { useState, useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { workflowNodesSelectors } from "@/lib/redux/workflow-nodes/selectors";
import { updateWorkflowNode } from "@/lib/redux/workflow-nodes/thunks";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

// Tab components
import OverviewTab from "@/features/workflows-xyflow/node-editor/tabs/OverviewTab";
import InputsTab from "@/features/workflows-xyflow/node-editor/tabs/InputsTab";
import OutputsTab from "@/features/workflows-xyflow/node-editor/tabs/OutputsTab";
import DependenciesTab from "@/features/workflows-xyflow/node-editor/tabs/DependenciesTab";
import AdminTab from "@/features/workflows-xyflow/node-editor/tabs/AdminTab";
import MetadataTab from "@/features/workflows-xyflow/node-editor/tabs/MetadataTab";
import RawDataTab from "@/features/workflows-xyflow/node-editor/tabs/RawDataTab";
import NodeDefinitionTab from "@/features/workflows-xyflow/node-editor/tabs/NodeDefinitionTab";

interface NodeEditorProps {
  nodeId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export const NodeEditor: React.FC<NodeEditorProps> = ({
  nodeId,
  isOpen,
  onOpenChange,
}) => {
  const dispatch = useAppDispatch();
  const [activeTab, setActiveTab] = useState("overview");

  // Get node data and dirty state from Redux
  const nodeData = useAppSelector((state) =>
    workflowNodesSelectors.nodeById(state, nodeId),
  );
  const isDirty = useAppSelector((state) =>
    workflowNodesSelectors.isNodeDirty(state, nodeId),
  );

  const handleSave = useCallback(async () => {
    if (!nodeData) return;

    try {
      // Use the node data directly for updates (exclude id)
      const { id, ...updates } = nodeData;
      await dispatch(updateWorkflowNode({ id: nodeId, updates })).unwrap();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save node:", error);
    }
  }, [dispatch, nodeData, nodeId, onOpenChange]);

  const handleCancel = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  if (!nodeData) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:w-[70vw] h-[90dvh] sm:h-[90dvh] max-w-none flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            Edit Node: {nodeData.step_name || nodeData.id}
          </DialogTitle>
        </DialogHeader>

        {/* Tabs Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <TabsList className="flex-shrink-0 flex w-full overflow-x-auto sm:grid sm:grid-cols-7">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="inputs">Inputs</TabsTrigger>
              <TabsTrigger value="outputs">Outputs</TabsTrigger>
              <TabsTrigger value="dependencies">Dependencies</TabsTrigger>
              <TabsTrigger value="definition">Definition</TabsTrigger>
              <TabsTrigger value="metadata">Metadata</TabsTrigger>
              <TabsTrigger value="admin">Admin</TabsTrigger>
              <TabsTrigger value="rawdata">Raw Data</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="flex-1 overflow-auto mt-2">
              <OverviewTab nodeId={nodeId} />
            </TabsContent>

            <TabsContent value="inputs" className="flex-1 overflow-auto mt-2">
              <InputsTab nodeId={nodeId} />
            </TabsContent>

            <TabsContent value="outputs" className="flex-1 overflow-auto mt-2">
              <OutputsTab nodeId={nodeId} />
            </TabsContent>

            <TabsContent
              value="dependencies"
              className="flex-1 overflow-auto mt-2"
            >
              <DependenciesTab nodeId={nodeId} />
            </TabsContent>

            <TabsContent
              value="definition"
              className="flex-1 overflow-auto mt-2"
            >
              <NodeDefinitionTab nodeId={nodeId} />
            </TabsContent>

            <TabsContent value="metadata" className="flex-1 overflow-auto mt-2">
              <MetadataTab nodeId={nodeId} />
            </TabsContent>

            <TabsContent value="admin" className="flex-1 overflow-auto mt-2">
              <AdminTab nodeId={nodeId} />
            </TabsContent>

            <TabsContent value="rawdata" className="flex-1 overflow-auto mt-2">
              <RawDataTab nodeId={nodeId} />
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!isDirty}
            className="min-w-[80px]"
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
