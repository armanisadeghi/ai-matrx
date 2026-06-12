"use client";

import React from "react";
import FullScreenOverlay, {
  TabDefinition,
} from "@/components/official/FullScreenOverlay";
import { Edge } from "@xyflow/react";
import { SectionContainer } from "@/features/workflows-xyflow/common/SectionContainer";
import {
  SectionTable,
  type TableRowData,
} from "@/features/workflows-xyflow/common/SectionTable";
import { Badge } from "@/components/ui/badge";
import { TableCell } from "@/components/ui/table";

interface WorkflowEdgeData {
  connectionType?: string;
  sourceNode?: {
    id: string;
    step_name?: string;
    node_type?: string;
  };
  targetNode?: {
    id: string;
    step_name?: string;
    node_type?: string;
  };
  sourceOutput?: {
    broker_id?: string;
    name?: string;
    type?: string;
    format?: string;
    description?: string;
  };
  targetInput?: {
    arg_name?: string;
    type?: string;
    source_broker_id?: string;
    ready?: boolean;
    metadata?: any;
  };
  relay?: {
    type?: string;
    id?: string;
  };
  isTemporary?: boolean;
  createdAt?: string;
}

interface EdgeSettingsOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  edge: Edge | null;
}

export const EdgeSettingsOverlay: React.FC<EdgeSettingsOverlayProps> = ({
  isOpen,
  onClose,
  edge,
}) => {
  if (!edge) return null;

  // Cast edge data to our typed interface
  const edgeData = edge.data as WorkflowEdgeData;

  // Core edge information rows
  const coreInfoRows: TableRowData[] = [
    {
      key: "connectionType",
      label: "Connection Type",
      content: edgeData?.connectionType ? (
        <Badge variant="outline" className="text-xs">
          {edgeData.connectionType.replace("_", " ")}
        </Badge>
      ) : (
        <span className="text-xs text-muted-foreground">Not specified</span>
      ),
    },
    {
      key: "id",
      label: "Edge ID",
      content: (
        <code className="px-2 py-1 rounded text-xs font-mono break-all">
          {edge.id}
        </code>
      ),
    },
    {
      key: "type",
      label: "Edge Type",
      content: (
        <Badge variant="secondary" className="text-xs">
          {edge.type || "default"}
        </Badge>
      ),
    },
    {
      key: "source",
      label: "Source Node",
      content: (
        <code className="px-2 py-1 rounded text-xs font-mono break-all">
          {edge.source}
        </code>
      ),
    },
    {
      key: "target",
      label: "Target Node",
      content: (
        <code className="px-2 py-1 rounded text-xs font-mono break-all">
          {edge.target}
        </code>
      ),
    },
    {
      key: "sourceHandle",
      label: "Source Handle",
      content: edge.sourceHandle ? (
        <code className="px-2 py-1 rounded text-xs font-mono break-all">
          {edge.sourceHandle}
        </code>
      ) : (
        <span className="text-xs text-muted-foreground">None</span>
      ),
    },
    {
      key: "targetHandle",
      label: "Target Handle",
      content: edge.targetHandle ? (
        <code className="px-2 py-1 rounded text-xs font-mono break-all">
          {edge.targetHandle}
        </code>
      ) : (
        <span className="text-xs text-muted-foreground">None</span>
      ),
    },
  ];

  // Get arrays for workflow data tables
  const sourceOutputs = edgeData?.sourceOutput ? [edgeData.sourceOutput] : [];
  const targetInputs = edgeData?.targetInput ? [edgeData.targetInput] : [];
  const relays = edgeData?.relay ? [edgeData.relay] : [];

  // Define tab content
  const tabs: TabDefinition[] = [
    {
      id: "basic-info",
      label: "Basic Info",
      content: (
        <div className="h-full overflow-auto pr-2 space-y-6">
          {/* Core Information */}
          <SectionTable title="Core Information" rows={coreInfoRows} />
        </div>
      ),
    },
    {
      id: "workflow-connection",
      label: "Workflow Connection",
      content: (
        <div className="h-full overflow-auto pr-2 space-y-6">
          {/* Source Outputs */}
          <SectionTable
            title="Source"
            headers={["Name", "Type", "Broker ID", "Format", "Description"]}
            data={sourceOutputs}
            renderRow={(output, index) => (
              <>
                <TableCell className="font-medium text-sm w-48 border-r border-border dark:border-border">
                  {output.name || "N/A"}
                </TableCell>
                <TableCell className="font-medium text-center text-xs w-36 border-r border-border dark:border-border">
                  <Badge variant="secondary" className="text-xs">
                    {output.type || "N/A"}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium text-[10px] w-96 border-r border-border dark:border-border">
                  <code className="px-2 py-1 rounded text-xs font-mono break-all">
                    {output.broker_id || "N/A"}
                  </code>
                </TableCell>
                <TableCell className="font-medium text-center text-xs w-24 border-r border-border dark:border-border">
                  <Badge variant="outline" className="text-xs">
                    {output.format || "N/A"}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium text-sm">
                  {output.description || "No description"}
                </TableCell>
              </>
            )}
            emptyMessage="No source outputs defined"
          />

          {/* Target Inputs */}
          <SectionTable
            title="Target"
            headers={[
              "Argument Name",
              "Type",
              "Source Broker ID",
              "Ready",
              "Metadata",
            ]}
            data={targetInputs}
            renderRow={(input, index) => (
              <>
                <TableCell className="font-medium text-sm w-48 border-r border-border dark:border-border">
                  {input.arg_name || "N/A"}
                </TableCell>
                <TableCell className="font-medium text-center text-xs w-36 border-r border-border dark:border-border">
                  <Badge variant="secondary" className="text-xs">
                    {input.type || "N/A"}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium text-[10px] w-96 border-r border-border dark:border-border">
                  <code className="px-2 py-1 rounded text-xs font-mono break-all">
                    {input.source_broker_id || "N/A"}
                  </code>
                </TableCell>
                <TableCell className="font-medium text-center text-xs w-24 border-r border-border dark:border-border">
                  <Badge
                    variant={input.ready ? "default" : "destructive"}
                    className="text-xs"
                  >
                    {input.ready ? "Ready" : "Not Ready"}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium text-xs">
                  {input.metadata ? (
                    <code className="px-2 py-1 rounded text-xs font-mono bg-muted">
                      {JSON.stringify(input.metadata).substring(0, 50)}...
                    </code>
                  ) : (
                    "None"
                  )}
                </TableCell>
              </>
            )}
            emptyMessage="No target inputs defined"
          />

          {/* Relays */}
          <SectionTable
            title="Relays"
            headers={["Type", "ID"]}
            data={relays}
            renderRow={(relay, index) => (
              <>
                <TableCell className="font-medium text-sm w-48 border-r border-border dark:border-border">
                  <Badge variant="outline" className="text-xs">
                    {relay.type || "N/A"}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium text-xs">
                  <code className="px-2 py-1 rounded text-xs font-mono break-all">
                    {relay.id || "N/A"}
                  </code>
                </TableCell>
              </>
            )}
            emptyMessage="No relays defined"
          />
        </div>
      ),
    },
    {
      id: "raw-data",
      label: "Raw Data",
      content: (
        <div className="h-full overflow-auto pr-2 space-y-6">
          {/* Custom Edge Data */}
          <SectionContainer title="Custom Edge Data">
            <pre className="bg-muted p-4 rounded-lg text-sm overflow-auto whitespace-pre-wrap font-mono">
              {edge.data
                ? JSON.stringify(edge.data, null, 2)
                : "No custom data"}
            </pre>
          </SectionContainer>

          {/* Complete Edge Object */}
          <SectionContainer title="Complete Edge Object">
            <pre className="bg-muted p-4 rounded-lg text-sm overflow-auto whitespace-pre-wrap font-mono">
              {JSON.stringify(edge, null, 2)}
            </pre>
          </SectionContainer>
        </div>
      ),
    },
  ];

  return (
    <FullScreenOverlay
      isOpen={isOpen}
      onClose={onClose}
      title="Edge Settings"
      description={`Settings and data for edge: ${edge.id}`}
      tabs={tabs}
      initialTab="basic-info"
      onTabChange={(tab) => console.log("Edge settings tab changed:", tab)}
      showCancelButton={true}
      onCancel={onClose}
      cancelButtonLabel="Close"
      width="90vw"
      height="90dvh"
    />
  );
};
