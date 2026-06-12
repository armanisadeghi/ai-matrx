'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bug, RefreshCw, Trash2, Database } from "lucide-react";
import { Node, Edge } from "reactflow";
import RawJsonExplorer from "@/components/official/json-explorer/RawJsonExplorer";
import { UserInputNode, BrokerRelayNode, FunctionNode, DbNodeData, ConvertedWorkflowData } from "@/features/workflows/types";
import { DataFlowManager, EnrichedBroker } from "@/features/workflows/utils/data-flow-manager";

interface DebugOverlayProps {
  nodes: Node[];
  edges: Edge[];
  coreWorkflowData?: any;
  viewport?: any;
  userInputs: UserInputNode[];
  relays: BrokerRelayNode[];
  functionNodes: FunctionNode[];
  editingNode: DbNodeData | null;
  workflowDataForReactFlow: ConvertedWorkflowData | null;
  workflowId?: string;
  className?: string;
}

const DebugOverlay: React.FC<DebugOverlayProps> = ({ 
  nodes, 
  edges, 
  coreWorkflowData,
  viewport,
  userInputs,
  relays,
  functionNodes,
  editingNode,
  workflowDataForReactFlow,
  workflowId,
  className 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Singleton data state
  const [singletonData, setSingletonData] = useState<{
    instance: DataFlowManager | null;
    currentWorkflowId: string | null;
    sources: any[];
    targets: any[];
    sourceBrokerIds: string[];
    targetBrokerIds: string[];
    allBrokers: string[];
    enrichedBrokers: EnrichedBroker[];
    generatedEdges: any[];
    allKnownBrokers: any[];
  }>({
    instance: null,
    currentWorkflowId: null,
    sources: [],
    targets: [],
    sourceBrokerIds: [],
    targetBrokerIds: [],
    allBrokers: [],
    enrichedBrokers: [],
    generatedEdges: [],
    allKnownBrokers: [],
  });

  // Refresh singleton data
  const refreshSingletonData = useCallback(() => {
    try {
      const instance = workflowId ? DataFlowManager.getInstance(workflowId) : null;
      const currentWorkflowId = DataFlowManager.getCurrentWorkflowId();
      
      if (instance) {
        setSingletonData({
          instance,
          currentWorkflowId,
          sources: instance.getSources(),
          targets: instance.getTargets(),
          sourceBrokerIds: instance.getSourceBrokerIds(),
          targetBrokerIds: instance.getTargetBrokerIds(),
          allBrokers: instance.getAllBrokers(),
          enrichedBrokers: instance.getEnrichedBrokers(),
          generatedEdges: instance.generateEdges(),
          allKnownBrokers: instance.getAllKnownBrokers(),
        });
      } else {
        setSingletonData({
          instance: null,
          currentWorkflowId,
          sources: [],
          targets: [],
          sourceBrokerIds: [],
          targetBrokerIds: [],
          allBrokers: [],
          enrichedBrokers: [],
          generatedEdges: [],
          allKnownBrokers: [],
        });
      }
    } catch (error) {
      console.error('Error refreshing singleton data:', error);
    }
  }, [workflowId]);

  // Auto-refresh when dialog opens or when refresh trigger changes
  useEffect(() => {
    if (isOpen) {
      refreshSingletonData();
    }
  }, [isOpen, refreshTrigger, refreshSingletonData]);

  // Manual refresh handler
  const handleRefresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  // Reset singleton handler
  const handleResetSingleton = useCallback(() => {
    try {
      DataFlowManager.resetInstance();
      setRefreshTrigger(prev => prev + 1);
    } catch (error) {
      console.error('Error resetting singleton:', error);
    }
  }, []);

  const StateTab = ({ label, data, withSelect = true }: { label: string; data: any, withSelect?: boolean }) => (
    <Card>
      <CardContent>
        <RawJsonExplorer pageData={data} withSelect={withSelect} />
      </CardContent>
    </Card>
  );

  const SimpleStatsTab = () => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">ReactFlow State</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">nodes (ReactFlow)</span>
              <Badge variant="secondary">{nodes.length}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">edges (ReactFlow)</span>
              <Badge variant="secondary">{edges.length}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">userInputs</span>
              <Badge variant="secondary">{userInputs.length}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">relays</span>
              <Badge variant="secondary">{relays.length}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">functionNodes</span>
              <Badge variant="secondary">{functionNodes.length}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">editingNode</span>
              <Badge variant="secondary">{editingNode ? "1" : "null"}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">DataFlow Singleton</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">singleton instance</span>
              <Badge variant={singletonData.instance ? "default" : "destructive"}>
                {singletonData.instance ? "active" : "null"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">current workflow</span>
              <Badge variant="outline" className="text-xs max-w-24 truncate">
                {singletonData.currentWorkflowId || "none"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">sources</span>
              <Badge variant="secondary">{singletonData.sources.length}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">targets</span>
              <Badge variant="secondary">{singletonData.targets.length}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">all brokers</span>
              <Badge variant="secondary">{singletonData.allBrokers.length}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">enriched brokers</span>
              <Badge variant="secondary">{singletonData.enrichedBrokers.length}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">generated edges</span>
              <Badge variant="secondary">{singletonData.generatedEdges.length}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">known brokers</span>
              <Badge variant="secondary">{singletonData.allKnownBrokers.length}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Admin Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              className="w-full flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh Data
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleResetSingleton}
              className="w-full flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Reset Singleton
            </Button>
            <div className="pt-2 text-xs text-muted-foreground">
              <div>Current Workflow: {workflowId || "none"}</div>
              <div>Singleton Workflow: {singletonData.currentWorkflowId || "none"}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className={`flex items-center gap-2 ${className}`}
        >
          <Bug className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          Debug
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-7xl h-[90dvh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Bug className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            Raw Workflow State Debug Panel
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col">
          <Tabs defaultValue="stats" className="flex-1 flex flex-col">
            <div className="flex-shrink-0 overflow-x-auto">
              <TabsList className="flex w-max min-w-full">
                <TabsTrigger value="stats" className="text-xs whitespace-nowrap">Stats</TabsTrigger>
                <TabsTrigger value="nodes" className="text-xs whitespace-nowrap">Nodes</TabsTrigger>
                <TabsTrigger value="edges" className="text-xs whitespace-nowrap">Edges</TabsTrigger>
                <TabsTrigger value="sources" className="text-xs whitespace-nowrap">Sources</TabsTrigger>
                <TabsTrigger value="targets" className="text-xs whitespace-nowrap">Targets</TabsTrigger>
                <TabsTrigger value="enrichedBrokers" className="text-xs whitespace-nowrap">Enriched</TabsTrigger>
                <TabsTrigger value="generatedEdges" className="text-xs whitespace-nowrap">Generated</TabsTrigger>
                <TabsTrigger value="knownBrokers" className="text-xs whitespace-nowrap">Known</TabsTrigger>
                <TabsTrigger value="coreWorkflowData" className="text-xs whitespace-nowrap">Core</TabsTrigger>
                <TabsTrigger value="viewport" className="text-xs whitespace-nowrap">Viewport</TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
              <TabsContent value="stats" className="mt-4">
                <SimpleStatsTab />
              </TabsContent>

              <TabsContent value="nodes" className="mt-4">
                <StateTab label="nodes (useNodesState)" data={nodes} />
              </TabsContent>

              <TabsContent value="edges" className="mt-4">
                <StateTab label="edges (useEdgesState)" data={edges} />
              </TabsContent>

              {/* DataFlowManager Singleton Tabs */}
              <TabsContent value="sources" className="mt-4">
                <StateTab label="sources (DataFlowManager.getSources())" data={singletonData.sources} />
              </TabsContent>

              <TabsContent value="targets" className="mt-4">
                <StateTab label="targets (DataFlowManager.getTargets())" data={singletonData.targets} />
              </TabsContent>

              <TabsContent value="enrichedBrokers" className="mt-4">
                <StateTab label="enrichedBrokers (DataFlowManager.getEnrichedBrokers())" data={singletonData.enrichedBrokers} />
              </TabsContent>

              <TabsContent value="generatedEdges" className="mt-4">
                <StateTab label="generatedEdges (DataFlowManager.generateEdges())" data={singletonData.generatedEdges} />
              </TabsContent>

              <TabsContent value="knownBrokers" className="mt-4">
                <StateTab label="knownBrokers (DataFlowManager.getAllKnownBrokers())" data={singletonData.allKnownBrokers}  />
              </TabsContent>

              <TabsContent value="coreWorkflowData" className="mt-4">
                <StateTab label="coreWorkflowData (useState)" data={coreWorkflowData} />
              </TabsContent>

              <TabsContent value="viewport" className="mt-4">
                <StateTab label="viewport (getViewport())" data={viewport} />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DebugOverlay;