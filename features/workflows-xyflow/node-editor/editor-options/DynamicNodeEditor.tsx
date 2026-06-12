"use client";
import React, { useState, useCallback, ReactNode, ReactElement } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { workflowNodesSelectors } from "@/lib/redux/workflow-nodes/selectors";
import { updateWorkflowNode } from "@/lib/redux/workflow-nodes/thunks";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export interface TabConfig {
    id: string;
    label: string;
    component: ReactElement;
}

interface NodeEditorProps {
    nodeId: string;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    tabs: TabConfig[];
    defaultTab?: string;
}

export const DynamicNodeEditor: React.FC<NodeEditorProps> = ({ 
    nodeId, 
    isOpen, 
    onOpenChange, 
    tabs,
    defaultTab
}) => {
    const dispatch = useAppDispatch();
    const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id || "");
    
    // Get node data and dirty state from Redux
    const nodeData = useAppSelector((state) => workflowNodesSelectors.nodeById(state, nodeId));
    const isDirty = useAppSelector((state) => workflowNodesSelectors.isNodeDirty(state, nodeId));

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

    // Clone each tab component and inject nodeId prop
    const renderTabComponent = useCallback((component: ReactElement) => {
        return React.cloneElement(component, { nodeId } as any);
    }, [nodeId]);

    if (!nodeData) {
        return null;
    }

    if (!tabs || tabs.length === 0) {
        console.warn("NodeEditor: No tabs provided");
        return null;
    }

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="w-[95vw] sm:w-[70vw] h-[90dvh] sm:h-[90dvh] max-w-none flex flex-col overflow-hidden">
                <DialogHeader>
                    <DialogTitle>Edit Node: {nodeData.step_name || nodeData.id}</DialogTitle>
                </DialogHeader>
                
                {/* Tabs Content */}
                <div className="flex-1 flex flex-col overflow-auto">
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <TabsList>
                            {tabs.map((tab) => (
                                <TabsTrigger key={tab.id} value={tab.id}>
                                    {tab.label}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                        
                        {tabs.map((tab) => (
                            <TabsContent 
                                key={tab.id} 
                                value={tab.id} 
                                className="flex-1 overflow-auto mt-2"
                            >
                                {renderTabComponent(tab.component)}
                            </TabsContent>
                        ))}
                    </Tabs>
                </div>
                
                <DialogFooter>
                    <Button variant="outline" onClick={handleCancel}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={!isDirty} className="min-w-[80px]">
                        Save
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default DynamicNodeEditor;