"use client";

import React, { useState } from "react";
import FullScreenOverlay, { TabDefinition } from '@/components/official/FullScreenOverlay';
import { useAppSelector } from "@/lib/redux/hooks";
import { workflowsSelectors } from "@/lib/redux/workflow/selectors";
import { workflowNodesSelectors } from "@/lib/redux/workflow-nodes/selectors";
import { 
    useNodes, 
    useEdges, 
    useViewport, 
    useReactFlow,
    useConnection,
    useNodesInitialized,
    useHandleConnections
} from '@xyflow/react';

interface WorkflowAdminOverlayProps {
    isOpen: boolean;
    onClose: () => void;
    workflowId: string;
}

export const WorkflowAdminOverlay: React.FC<WorkflowAdminOverlayProps> = ({
    isOpen,
    onClose,
    workflowId
}) => {
    // Redux state
    const workflow = useAppSelector((state) => workflowsSelectors.workflowById(state, workflowId));
    const workflowNodes = useAppSelector((state) => workflowNodesSelectors.nodesByWorkflowId(state, workflowId));
    const workflowWithNodes = useAppSelector((state) => workflowsSelectors.workflowWithNodes(state, workflowId));

    // React Flow direct state hooks
    const reactFlowNodes = useNodes();
    const reactFlowEdges = useEdges();
    const viewport = useViewport();
    const reactFlowInstance = useReactFlow();
    const currentConnection = useConnection();
    const nodesInitialized = useNodesInitialized();

    // Get React Flow instance data
    const reactFlowData = {
        nodes: reactFlowNodes,
        edges: reactFlowEdges,
        viewport,
        nodesInitialized,
        currentConnection,
        instanceMethods: {
            getNodes: reactFlowInstance.getNodes(),
            getEdges: reactFlowInstance.getEdges(),
            getViewport: reactFlowInstance.getViewport(),
            toObject: reactFlowInstance.toObject()
        }
    };

    // Define tab content
    const tabs: TabDefinition[] = [
        {
            id: 'workflow',
            label: 'Workflow Data',
            content: (
                <div className="p-6">
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 overflow-auto max-h-full">
                        <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                            {JSON.stringify(workflow, null, 2)}
                        </pre>
                    </div>
                </div>
            )
        },
        {
            id: 'nodes',
            label: 'Workflow Nodes',
            content: (
                <div className="p-6">
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 overflow-auto max-h-full">
                        <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                            {JSON.stringify(workflowNodes, null, 2)}
                        </pre>
                    </div>
                </div>
            )
        },
        {
            id: 'complete',
            label: 'Workflow + Nodes',
            content: (
                <div className="p-6">
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 overflow-auto max-h-full">
                        <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                            {JSON.stringify(workflowWithNodes, null, 2)}
                        </pre>
                    </div>
                </div>
            )
        },
        {
            id: 'reactflow-nodes',
            label: 'React Flow Nodes',
            content: (
                <div className="p-6">
                    <div className="mb-4">
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">
                            React Flow Nodes ({reactFlowNodes.length})
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                            Direct node data from useNodes() hook
                        </p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 overflow-auto max-h-full">
                        <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                            {JSON.stringify(reactFlowNodes, null, 2)}
                        </pre>
                    </div>
                </div>
            )
        },
        {
            id: 'reactflow-edges',
            label: 'React Flow Edges',
            content: (
                <div className="p-6">
                    <div className="mb-4">
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">
                            React Flow Edges ({reactFlowEdges.length})
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                            Direct edge data from useEdges() hook
                        </p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 overflow-auto max-h-full">
                        <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                            {JSON.stringify(reactFlowEdges, null, 2)}
                        </pre>
                    </div>
                </div>
            )
        },
        {
            id: 'reactflow-viewport',
            label: 'Viewport & State',
            content: (
                <div className="p-6">
                    <div className="mb-4">
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">
                            React Flow State
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                            Viewport, connection state, and initialization status
                        </p>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Viewport</h4>
                            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                                <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                    {JSON.stringify(viewport, null, 2)}
                                </pre>
                            </div>
                        </div>
                        <div>
                            <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Current Connection</h4>
                            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                                <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                    {JSON.stringify(currentConnection, null, 2)}
                                </pre>
                            </div>
                        </div>
                        <div>
                            <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Nodes Initialized</h4>
                            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                                <span className={`px-2 py-1 rounded text-sm font-medium ${
                                    nodesInitialized 
                                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                                        : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                                }`}>
                                    {nodesInitialized ? 'Initialized' : 'Not Initialized'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )
        },
        {
            id: 'reactflow-complete',
            label: 'Complete React Flow Data',
            content: (
                <div className="p-6">
                    <div className="mb-4">
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">
                            Complete React Flow State
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                            All available data from React Flow hooks and instance methods
                        </p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 overflow-auto max-h-full">
                        <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                            {JSON.stringify(reactFlowData, null, 2)}
                        </pre>
                    </div>
                </div>
            )
        }
    ];

    return (
        <FullScreenOverlay
            isOpen={isOpen}
            onClose={onClose}
            title="Workflow Admin Panel"
            description={`Administration panel for workflow: ${workflow?.name || workflowId}`}
            tabs={tabs}
            initialTab="workflow"
            onTabChange={(tab) => console.log('Admin tab changed:', tab)}
            showCancelButton={true}
            onCancel={onClose}
            cancelButtonLabel="Close"
            width="95vw"
            height="95dvh"
        />
    );
}; 