"use client";

import React, { useCallback, useState } from "react";
import "@xyflow/react/dist/style.css";
import { useReactFlow, Viewport, Node, Edge } from "@xyflow/react";
import { WorkflowCanvas } from "./core/WorkflowCanvas";
import { WorkflowHeader } from "./core/WorkflowHeader";
import { useWorkflowSync } from "./hooks/useWorkflowSync";
import FieldDisplaySheet from "./nodes/source-node/sheets/FieldDisplaySheet";
import { WorkflowAdminOverlay } from "./admin/WorkflowAdminOverlay";
import RecipeNodeInitializer from "./custom-nodes/recipes/RecipeNodeInitializer";
import { WorkflowNode } from "@/lib/redux/workflow-nodes/types";
import { useAppDispatch } from "@/lib/redux/hooks";
import { saveWorkflowNode } from "@/lib/redux/workflow-nodes/thunks";
import { autoArrangeNodes } from "./utils/auto-arrange";
import SourceTypeSelector from "./nodes/source-node/SourceTypeSelector";

interface WorkflowSystemProps {
    workflowId: string;
    mode?: "edit" | "view" | "execute";
}

export const WorkflowSystem: React.FC<WorkflowSystemProps> = ({ workflowId, mode = "edit" }) => {
    const reactFlowInstance = useReactFlow();
    const dispatch = useAppDispatch();

    // Get initial data and save function
    const { initialNodes, initialEdges, initialViewport, saveWorkflow, isLoading } = useWorkflowSync(workflowId);

    // UI state management at top level
    const [isFieldDisplaySheetOpen, setIsFieldDisplaySheetOpen] = useState(false);
    const [isAdminOverlayOpen, setIsAdminOverlayOpen] = useState(false);
    
    // Source Type Selector state - now supports optional brokerId
    const [sourceInputCreatorState, setSourceInputCreatorState] = useState<{
        isOpen: boolean;
        brokerId?: string;
    }>({
        isOpen: false,
        brokerId: undefined,
    });
    
    // Recipe node initializer state (shared between access panel and header)
    const [showRecipeInitializer, setShowRecipeInitializer] = useState(false);
    const [pendingRecipeNode, setPendingRecipeNode] = useState<{
        nodeData: WorkflowNode;
    } | null>(null);

    // Save handler - gets current state directly from ReactFlow
    const handleSave = useCallback(async () => {
        if (saveWorkflow) {
            const currentNodes = reactFlowInstance.getNodes();
            const currentEdges = reactFlowInstance.getEdges();
            const currentViewport = reactFlowInstance.getViewport();
            await saveWorkflow(currentNodes, currentEdges, currentViewport);
        }
    }, [saveWorkflow, reactFlowInstance]);

    // Auto arrange handler - uses our dedicated utility
    const handleAutoArrange = useCallback(() => {
        const currentNodes = reactFlowInstance.getNodes();
        const currentEdges = reactFlowInstance.getEdges();

        // Use our dedicated auto-arrange utility
        const arrangedNodes = autoArrangeNodes(currentNodes, currentEdges);
        
        reactFlowInstance.setNodes(arrangedNodes);

        setTimeout(() => {
            reactFlowInstance.fitView({ duration: 800, padding: 0.2, maxZoom: 1.5 });
        }, 100);
    }, [reactFlowInstance]);

    const handleOpenFieldDisplay = useCallback(() => {
        setIsFieldDisplaySheetOpen(true);
    }, []);

    const handleOpenAdminOverlay = useCallback(() => {
        setIsAdminOverlayOpen(true);
    }, []);

    // Updated handler to support optional brokerId
    const handleOpenSourceInputCreator = useCallback((brokerId?: string) => {
        setSourceInputCreatorState({
            isOpen: true,
            brokerId,
        });
    }, []);

    const handleCloseSourceInputCreator = useCallback((open: boolean) => {
        if (!open) {
            setSourceInputCreatorState({
                isOpen: false,
                brokerId: undefined,
            });
        }
    }, []);

    const handleRecipeNodeCreated = useCallback((nodeData: WorkflowNode) => {
        setPendingRecipeNode({ nodeData });
        setShowRecipeInitializer(true);
    }, []);

    const handleRecipeConfirm = useCallback(async () => {
        if (pendingRecipeNode) {
            try {
                dispatch(saveWorkflowNode({ id: pendingRecipeNode.nodeData.id }));
                setShowRecipeInitializer(false);
                setPendingRecipeNode(null);
            } catch (error) {
                console.error("Error finalizing recipe node:", error);
            }
        }
    }, [pendingRecipeNode, dispatch]);

    const handleRecipeCancel = useCallback(() => {
        setShowRecipeInitializer(false);
        setPendingRecipeNode(null);
    }, []);

    return (
        <div className="h-dvh w-full flex flex-col bg-background">
            <WorkflowHeader
                workflowId={workflowId}
                mode={mode}
                onSave={mode === "edit" ? handleSave : undefined}
                onAutoArrange={handleAutoArrange}
                onOpenFieldDisplay={handleOpenFieldDisplay}
                onOpenAdminOverlay={handleOpenAdminOverlay}
                onRecipeNodeCreated={handleRecipeNodeCreated}
            />

            <WorkflowCanvas
                workflowId={workflowId}
                initialNodes={initialNodes}
                initialEdges={initialEdges}
                initialViewport={initialViewport}
                mode={mode}
                onRecipeNodeCreated={handleRecipeNodeCreated}
                handleSave={handleSave}
                onOpenSourceInputCreator={handleOpenSourceInputCreator}
            />

            {/* Field Display Sheet */}
            <FieldDisplaySheet
                isOpen={isFieldDisplaySheetOpen}
                onOpenChange={setIsFieldDisplaySheetOpen}
                workflowId={workflowId}
                onSave={handleSave}
            />

            {/* Admin Overlay */}
            <WorkflowAdminOverlay
                isOpen={isAdminOverlayOpen}
                onClose={() => setIsAdminOverlayOpen(false)}
                workflowId={workflowId}
            />

            {/* Source Type Selector */}
            <SourceTypeSelector
                isOpen={sourceInputCreatorState.isOpen}
                onOpenChange={handleCloseSourceInputCreator}
                workflowId={workflowId}
                brokerId={sourceInputCreatorState.brokerId}
            />

            {/* Shared Recipe Node Initializer */}
            {pendingRecipeNode && (
                <RecipeNodeInitializer
                    nodeId={pendingRecipeNode.nodeData.id}
                    onConfirm={handleRecipeConfirm}
                    onCancel={handleRecipeCancel}
                    open={showRecipeInitializer}
                />
            )}
        </div>
    );
};

export default WorkflowSystem;
