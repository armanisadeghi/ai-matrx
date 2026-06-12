"use client";
import "./react-flow.css";
import React, {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from "react";
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  NodeTypes,
  EdgeTypes,
  Connection,
  useReactFlow,
} from "reactflow";
import "reactflow/dist/style.css";

import { WorkflowHeader } from "@/features/workflows/react-flow/core/WorkflowHeader";
import { WorkflowCanvas } from "@/features/workflows/react-flow/core/WorkflowCanvas";
import { NodeEditorManager } from "@/features/workflows/react-flow/core/NodeEditorManager";
import { NodeDeleteDialog } from "@/features/workflows/components/common/NodeDeleteDialog";
import { useWorkflowData } from "@/features/workflows/hooks/useWorkflowData";
import { useWorkflowActions } from "@/features/workflows/hooks/useWorkflowActions";
import { NodeWrapper } from "@/features/workflows/react-flow/nodes/NodeWrapper";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import {
  DataBrokerRecords,
  DataFlowManager,
  EnrichedBroker,
} from "@/features/workflows/utils/data-flow-manager";
import { useEntityRecords } from "@/lib/redux/entity/hooks/useAllData";
import { EdgeDetailOverlay } from "@/features/workflows/components/common/EdgeDetailOverlay";
import { ConnectionDetailOverlay } from "@/features/workflows/components/common/ConnectionDetailOverlay";
import {
  ConvertedWorkflowData,
  DbWorkflow,
  FunctionNode,
  UserInputNode,
  BrokerRelayNode,
  DbNodeData,
} from "@/features/workflows/types";
import { parseWorkflowViewport } from "@/features/workflows/utils/workflow-json-fields";

interface WorkflowSystemProps {
  workflowId?: string;
  mode?: "edit" | "view" | "execute";
  onSave?: (workflowData: any) => void;
  onExecute?: (workflowData: any) => void;
}

export const WorkflowSystem: React.FC<WorkflowSystemProps> = ({
  workflowId,
  mode = "edit",
  onSave,
  onExecute,
}) => {
  const user = useAppSelector(selectUser);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // React-Flow Nodes, but separated by the type the backend recognizes
  const [userInputs, setUserInputs] = useState<UserInputNode[]>([]);
  const [relays, setRelays] = useState<BrokerRelayNode[]>([]);
  const [functionNodes, setFunctionNodes] = useState<FunctionNode[]>([]);
  const [editingNode, setEditingNode] = useState<DbNodeData | null>(null);
  const [defaultTabId, setDefaultTabId] = useState<string>("");
  const [coreWorkflowData, setCoreWorkflowData] = useState<DbWorkflow | null>(
    null,
  );
  const [workflowDataForReactFlow, setWorkflowDataForReactFlow] =
    useState<ConvertedWorkflowData | null>(null);
  const [enrichedBrokers, setEnrichedBrokers] = useState<EnrichedBroker[]>([]);

  const [selectedFunction, setSelectedFunction] = useState<string>("");
  const [deleteDialogNode, setDeleteDialogNode] = useState<Node | null>(null);
  const [isDeletionProcessing, setIsDeletionProcessing] = useState(false);

  // Edge overlay state
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  const [isEdgeOverlayOpen, setIsEdgeOverlayOpen] = useState(false);

  // Connection overlay state
  const [connectionOverlayOpen, setConnectionOverlayOpen] = useState(false);
  const [connectionSourceNode, setConnectionSourceNode] =
    useState<DbNodeData | null>(null);
  const [connectionTargetNode, setConnectionTargetNode] =
    useState<DbNodeData | null>(null);
  const [connectionMatrxEdge, setConnectionMatrxEdge] = useState<any>(null);

  const [refresh, setRefresh] = useState(false);

  const { loadWorkflow, saveWorkflow } = useWorkflowData();
  const allKnownBrokers = useEntityRecords("dataBroker") as DataBrokerRecords;

  const { setViewport, getViewport } = useReactFlow();

  useEffect(() => {
    if (nodes.length > 0 && workflowId && allKnownBrokers) {
      const result = DataFlowManager.processReactFlowNodesWithEnrichment(
        workflowId,
        nodes,
        allKnownBrokers,
        edges,
      );
      // Update both edges and enriched brokers
      if (JSON.stringify(result.edges) !== JSON.stringify(edges)) {
        setEdges(result.edges);
      }
      setEnrichedBrokers(result.enrichedBrokers);
    }
  }, [nodes, allKnownBrokers, workflowId]);

  // Expose enriched brokers globally for workflow components
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.workflowEnrichedBrokers = enrichedBrokers;
      window.workflowAllKnownBrokers = allKnownBrokers
        ? Object.values(allKnownBrokers)
        : [];
    }
  }, [enrichedBrokers, allKnownBrokers]);

  // Handle edge click - stable function with no dependencies on changing data
  const handleEdgeClick = useCallback(
    (edgeProps: any) => {
      // Create a proper Edge object from the props passed by CustomEdge
      const fullEdge: Edge = {
        id: edgeProps.id,
        source: edgeProps.source || "",
        target: edgeProps.target || "",
        sourceHandle: edgeProps.sourceHandle,
        targetHandle: edgeProps.targetHandle,
        type: edgeProps.type,
        animated: edgeProps.animated,
        style: edgeProps.style,
        data: edgeProps.data,
        // Add any other properties that might be needed
        ...edgeProps,
      };

      setSelectedEdge(fullEdge);
      setIsEdgeOverlayOpen(true);
    },
    [], // No dependencies - completely stable
  );

  const handleCloseEdgeOverlay = useCallback(() => {
    setIsEdgeOverlayOpen(false);
    setSelectedEdge(null);
  }, []);

  const handleEdgeUpdated = useCallback(() => {
    // Force re-render by updating the edges state
    // This will ensure any edge label changes are reflected
    setSelectedEdge(null);
    setIsEdgeOverlayOpen(false);
  }, []);

  useEffect(() => {
    if (workflowId) {
      loadWorkflow(workflowId).then((workflowData) => {
        if (workflowData) {
          setNodes(workflowData.allNodes);
          setEdges(workflowData.edges);
          setUserInputs(workflowData.userInputs);
          setRelays(workflowData.relays);
          setFunctionNodes(workflowData.functionNodes);
          setCoreWorkflowData(workflowData.workflow);
          setWorkflowDataForReactFlow(workflowData);

          const viewport = parseWorkflowViewport(
            workflowData.workflow.viewport,
          );
          if (viewport) {
            setViewport(viewport);
          }
          setRefresh(false);
        }
      });
    }
  }, [workflowId, refresh]);

  // Create workflow reload function
  const handleWorkflowReload = useCallback(async () => {
    if (workflowId) {
      const workflowData = await loadWorkflow(workflowId);
      if (workflowData) {
        setNodes(workflowData.allNodes);
        setEdges(workflowData.edges);
        setUserInputs(workflowData.userInputs);
        setRelays(workflowData.relays);
        setCoreWorkflowData(workflowData.workflow);
        setWorkflowDataForReactFlow(workflowData);

        const viewport = parseWorkflowViewport(workflowData.workflow.viewport);
        if (viewport) {
          setViewport(viewport);
        }
        setRefresh(false);
      }
    }
  }, [workflowId, loadWorkflow, setNodes, setEdges, setViewport]);

  const handleRefresh = useCallback(() => {
    setRefresh(true);
  }, []);

  const {
    handleAddNode,
    handleDeleteNode,
    handleNodeSave,
    handleRemoveFromWorkflow,
    handlePermanentDelete,
    handleDuplicateNode,
    prepareWorkflowData,
    exposeWorkflowMethods,
    handleAddCustomNode,
    handleFinalizeRecipeNode,
    handleAddDirectRelayNode,
  } = useWorkflowActions({
    nodes,
    edges,
    setNodes,
    setEdges,
    setEditingNode,
    setDefaultTabId,
    workflowId,
    userId: user.id,
    setDeleteDialogNode,
    onWorkflowReload: handleWorkflowReload,
    getViewport,
    handleRefresh,
  });

  // Connection handler callback
  const handleConnectionMade = useCallback(
    (sourceNode: DbNodeData, targetNode: DbNodeData, matrxEdge: any) => {
      setConnectionSourceNode(sourceNode);
      setConnectionTargetNode(targetNode);
      setConnectionMatrxEdge(matrxEdge);
      setConnectionOverlayOpen(true);
    },
    [],
  );

  // Expose methods for node components
  useEffect(() => {
    exposeWorkflowMethods();
    // Add the connection callback to the global reference
    if (window.workflowSystemRef) {
      window.workflowSystemRef.onConnectionMade = handleConnectionMade;
    }
    return () => {
      delete window.workflowSystemRef;
    };
  }, [exposeWorkflowMethods, handleConnectionMade]);

  const nodeTypes: NodeTypes = useMemo(
    () => ({
      functionNode: NodeWrapper,
      userInput: NodeWrapper,
      brokerRelay: NodeWrapper,
      workflowNode: NodeWrapper,
      default: NodeWrapper,
    }),
    [],
  );

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      // Don't open edit on right-click, in view mode, or if clicking on interactive elements
      if (event.button === 2 || mode === "view") return;

      // Check if click target is an interactive element (button, input, etc.)
      const target = event.target as HTMLElement;
      const isInteractiveElement = target.closest(
        'button, input, textarea, select, [role="button"], [tabindex]',
      );

      // Don't open edit if clicking on interactive elements
      if (isInteractiveElement) return;

      setEditingNode(node.data as DbNodeData);
    },
    [mode],
  );

  const handleSaveWorkflow = useCallback(() => {
    const currentViewport = getViewport();

    const workflowData = {
      nodes: nodes,
      edges: edges,
      userInputs,
      relays,
      coreWorkflowData: {
        ...coreWorkflowData,
        viewport: currentViewport,
      },
    };

    if (workflowId) {
      saveWorkflow(coreWorkflowData, nodes, edges);
    }

    onSave?.(workflowData);
  }, [
    nodes,
    edges,
    userInputs,
    relays,
    workflowId,
    user.id,
    saveWorkflow,
    onSave,
    coreWorkflowData,
    getViewport,
  ]);

  const handleExecuteWorkflow = useCallback(() => {
    const workflowData = prepareWorkflowData();
    onExecute?.(workflowData);
  }, [prepareWorkflowData, onExecute]);

  const handleRemoveFromWorkflowWithDialog = useCallback(
    async (nodeId: string) => {
      setIsDeletionProcessing(true);
      try {
        await handleRemoveFromWorkflow(nodeId);
        setDeleteDialogNode(null);
      } finally {
        setIsDeletionProcessing(false);
      }
    },
    [handleRemoveFromWorkflow],
  );

  const handlePermanentDeleteWithDialog = useCallback(
    async (nodeId: string) => {
      setIsDeletionProcessing(true);
      try {
        await handlePermanentDelete(nodeId);
        setDeleteDialogNode(null);
      } finally {
        setIsDeletionProcessing(false);
      }
    },
    [handlePermanentDelete],
  );

  const handleSaveConnection = useCallback(
    (sourceNode: DbNodeData, targetNode: DbNodeData, matrxEdge: any) => {
      setConnectionOverlayOpen(false);
      handleNodeSave(sourceNode);
      handleNodeSave(targetNode);
    },
    [handleNodeSave],
  );

  return (
    <div className="h-dvh w-full flex flex-col bg-background">
      <WorkflowHeader
        selectedFunction={selectedFunction}
        onFunctionSelect={setSelectedFunction}
        onAddNode={handleAddNode}
        onAddCustomNode={handleAddCustomNode}
        onFinalizeNode={handleFinalizeRecipeNode}
        nodes={nodes}
        edges={edges}
        onSave={mode === "edit" ? handleSaveWorkflow : undefined}
        onExecute={handleExecuteWorkflow}
        prepareWorkflowData={prepareWorkflowData}
        onEdgesUpdated={handleWorkflowReload}
        workflowId={workflowId}
        mode={mode}
        workflowName={coreWorkflowData?.name}
        coreWorkflowData={coreWorkflowData}
        viewport={getViewport()}
        userInputs={userInputs}
        relays={relays}
        functionNodes={functionNodes}
        editingNode={editingNode}
        workflowDataForReactFlow={workflowDataForReactFlow}
        enrichedBrokers={enrichedBrokers}
      />

      <WorkflowCanvas
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        handleEdgeClick={handleEdgeClick}
        onAddNode={handleAddNode}
        onAddCustomNode={handleAddCustomNode}
        onFinalizeNode={handleFinalizeRecipeNode}
        mode={mode}
        workflowId={workflowId}
        selectedEdge={selectedEdge}
        isEdgeOverlayOpen={isEdgeOverlayOpen}
        onCloseEdgeOverlay={handleCloseEdgeOverlay}
        onEdgeUpdated={handleEdgeUpdated}
      />

      <NodeEditorManager
        editingNode={editingNode}
        defaultTabId={defaultTabId}
        onSave={handleNodeSave}
        onClose={() => setEditingNode(null)}
        mode={mode}
        nodes={nodes}
        edges={edges}
        coreWorkflowData={coreWorkflowData}
        completeWorkflowData={workflowDataForReactFlow}
        enrichedBrokers={enrichedBrokers}
      />

      <NodeDeleteDialog
        node={deleteDialogNode}
        isOpen={!!deleteDialogNode}
        onClose={() => setDeleteDialogNode(null)}
        onRemoveFromWorkflow={handleRemoveFromWorkflowWithDialog}
        onPermanentDelete={handlePermanentDeleteWithDialog}
        isProcessing={isDeletionProcessing}
      />

      {/* Edge Detail Overlay */}
      <EdgeDetailOverlay
        edge={selectedEdge}
        isOpen={isEdgeOverlayOpen}
        onClose={handleCloseEdgeOverlay}
        onEdgeUpdated={handleEdgeUpdated}
        workflowId={workflowId}
      />

      {/* Connection Detail Overlay */}
      <ConnectionDetailOverlay
        isOpen={connectionOverlayOpen}
        onClose={() => setConnectionOverlayOpen(false)}
        initialSourceNode={connectionSourceNode}
        initialTargetNode={connectionTargetNode}
        matrxEdge={connectionMatrxEdge}
        onSaveConnection={handleSaveConnection}
        onDirectAddRelay={handleAddDirectRelayNode}
      />
    </div>
  );
};

export default WorkflowSystem;
