'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bug, RefreshCw } from "lucide-react";
import { useReactFlow, useStore } from "reactflow";
import RawJsonExplorer from "@/components/official/json-explorer/RawJsonExplorer";

interface ReactFlowDebugOverlayProps {
  className?: string;
}

const ReactFlowDebugOverlay: React.FC<ReactFlowDebugOverlayProps> = ({ className }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Get React Flow state directly - no props needed!
  const { 
    getNodes, 
    getEdges, 
    getViewport,
    getNode,
    getEdge
  } = useReactFlow();

  // Access React Flow's internal store
  const reactFlowInstance = useStore((state) => ({
    nodeInternalsSize: state.nodeInternals.size,
    nodeInternalsKeys: Array.from(state.nodeInternals.keys()),
    edges: state.edges,
    transform: state.transform,
    connectionMode: state.connectionMode,
    snapGrid: state.snapGrid,
    snapToGrid: state.snapToGrid,
    nodesDraggable: state.nodesDraggable,
    nodesConnectable: state.nodesConnectable,
    nodesFocusable: state.nodesFocusable,
    edgesFocusable: state.edgesFocusable,
    elementsSelectable: state.elementsSelectable,
    minZoom: state.minZoom,
    maxZoom: state.maxZoom,
    translateExtent: state.translateExtent,
    nodeExtent: state.nodeExtent,
    width: state.width,
    height: state.height,
    paneDragging: state.paneDragging,
    multiSelectionActive: state.multiSelectionActive,
    userSelectionActive: state.userSelectionActive,
    connectionStatus: state.connectionStatus,
    fitViewOnInit: state.fitViewOnInit,
    autoPanOnConnect: state.autoPanOnConnect,
    autoPanOnNodeDrag: state.autoPanOnNodeDrag,
  }));

  // Get current data (refreshes when refreshTrigger changes)
  const currentData = useMemo(() => {
    const nodes = getNodes();
    const edges = getEdges();
    const viewport = getViewport();

    // Group nodes by type for dynamic tabs
    const nodesByType = nodes.reduce((acc, node) => {
      const type = node.type || 'default';
      if (!acc[type]) {
        acc[type] = [];
      }
      acc[type].push(node);
      return acc;
    }, {} as Record<string, any[]>);

    // Group edges by type
    const edgesByType = edges.reduce((acc, edge) => {
      const type = edge.type || 'default';
      if (!acc[type]) {
        acc[type] = [];
      }
      acc[type].push(edge);
      return acc;
    }, {} as Record<string, any[]>);

    return {
      nodes,
      edges,
      viewport,
      nodesByType,
      edgesByType,
      totalNodes: nodes.length,
      totalEdges: edges.length,
      nodeTypes: Object.keys(nodesByType),
      edgeTypes: Object.keys(edgesByType),
    };
  }, [getNodes, getEdges, getViewport, refreshTrigger]);

  // Manual refresh handler
  const handleRefresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
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
          <CardTitle className="text-sm font-medium">React Flow Data</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
                         <div className="flex items-center justify-between">
               <span className="text-sm text-muted-foreground">Total Nodes</span>
               <Badge variant="secondary">{currentData.totalNodes}</Badge>
             </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total Edges</span>
              <Badge variant="secondary">{currentData.totalEdges}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Node Types</span>
              <Badge variant="secondary">{currentData.nodeTypes.length}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Edge Types</span>
              <Badge variant="secondary">{currentData.edgeTypes.length}</Badge>
            </div>
            <div className="pt-2">
              <div className="text-xs text-muted-foreground">Node Types:</div>
              <div className="flex flex-wrap gap-1 mt-1">
                {currentData.nodeTypes.map(type => (
                  <Badge key={type} variant="outline" className="text-xs">
                    {type} ({currentData.nodesByType[type].length})
                  </Badge>
                ))}
              </div>
            </div>
            <div className="pt-2">
              <div className="text-xs text-muted-foreground">Edge Types:</div>
              <div className="flex flex-wrap gap-1 mt-1">
                {currentData.edgeTypes.map(type => (
                  <Badge key={type} variant="outline" className="text-xs">
                    {type} ({currentData.edgesByType[type].length})
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

             <Card>
         <CardHeader className="pb-3">
           <CardTitle className="text-sm font-medium">React Flow Store</CardTitle>
         </CardHeader>
         <CardContent>
           <div className="space-y-3">
             <div className="flex items-center justify-between">
               <span className="text-sm text-muted-foreground">Canvas Size</span>
               <Badge variant="outline">{reactFlowInstance.width} × {reactFlowInstance.height}</Badge>
             </div>
             <div className="flex items-center justify-between">
               <span className="text-sm text-muted-foreground">Nodes Draggable</span>
               <Badge variant={reactFlowInstance.nodesDraggable ? "default" : "secondary"}>
                 {reactFlowInstance.nodesDraggable ? "Yes" : "No"}
               </Badge>
             </div>
             <div className="flex items-center justify-between">
               <span className="text-sm text-muted-foreground">Nodes Connectable</span>
               <Badge variant={reactFlowInstance.nodesConnectable ? "default" : "secondary"}>
                 {reactFlowInstance.nodesConnectable ? "Yes" : "No"}
               </Badge>
             </div>
             <div className="flex items-center justify-between">
               <span className="text-sm text-muted-foreground">Elements Selectable</span>
               <Badge variant={reactFlowInstance.elementsSelectable ? "default" : "secondary"}>
                 {reactFlowInstance.elementsSelectable ? "Yes" : "No"}
               </Badge>
             </div>
             <div className="flex items-center justify-between">
               <span className="text-sm text-muted-foreground">Snap to Grid</span>
               <Badge variant={reactFlowInstance.snapToGrid ? "default" : "secondary"}>
                 {reactFlowInstance.snapToGrid ? "Yes" : "No"}
               </Badge>
             </div>
             <div className="flex items-center justify-between">
               <span className="text-sm text-muted-foreground">Multi Selection</span>
               <Badge variant={reactFlowInstance.multiSelectionActive ? "default" : "secondary"}>
                 {reactFlowInstance.multiSelectionActive ? "Active" : "Inactive"}
               </Badge>
             </div>
             <div className="flex items-center justify-between">
               <span className="text-sm text-muted-foreground">Pane Dragging</span>
               <Badge variant={reactFlowInstance.paneDragging ? "default" : "secondary"}>
                 {reactFlowInstance.paneDragging ? "Yes" : "No"}
               </Badge>
             </div>
             <div className="flex items-center justify-between">
               <span className="text-sm text-muted-foreground">Connection Status</span>
               <Badge variant={reactFlowInstance.connectionStatus === 'valid' ? "default" : "secondary"}>
                 {reactFlowInstance.connectionStatus || "None"}
               </Badge>
             </div>
           </div>
         </CardContent>
       </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Actions</CardTitle>
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
                         <div className="pt-2 text-xs text-muted-foreground">
               <div>Viewport X: {Math.round(currentData.viewport.x)}</div>
               <div>Viewport Y: {Math.round(currentData.viewport.y)}</div>
               <div>Zoom: {Math.round(currentData.viewport.zoom * 100)}%</div>
               <div className="pt-1 border-t border-border mt-2">
                 <div>Min Zoom: {reactFlowInstance.minZoom}</div>
                 <div>Max Zoom: {reactFlowInstance.maxZoom}</div>
               </div>
             </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // Generate tabs dynamically
  const generateTabs = () => {
    const tabs = [];
    
         // Core tabs
     tabs.push(
       <TabsTrigger key="stats" value="stats" className="text-xs whitespace-nowrap">Stats</TabsTrigger>,
       <TabsTrigger key="all-nodes" value="all-nodes" className="text-xs whitespace-nowrap">Nodes</TabsTrigger>,
       <TabsTrigger key="all-edges" value="all-edges" className="text-xs whitespace-nowrap">Edges</TabsTrigger>,
       <TabsTrigger key="viewport" value="viewport" className="text-xs whitespace-nowrap">Viewport</TabsTrigger>,
       <TabsTrigger key="store" value="store" className="text-xs whitespace-nowrap">Store</TabsTrigger>
     );
    
         // Dynamic node type tabs
     currentData.nodeTypes.forEach(nodeType => {
       tabs.push(
         <TabsTrigger 
           key={`nodes-${nodeType}`} 
           value={`nodes-${nodeType}`} 
           className="text-xs whitespace-nowrap"
         >
           {nodeType}
         </TabsTrigger>
       );
     });
     
     // Dynamic edge type tabs
     currentData.edgeTypes.forEach(edgeType => {
       tabs.push(
         <TabsTrigger 
           key={`edges-${edgeType}`} 
           value={`edges-${edgeType}`} 
           className="text-xs whitespace-nowrap"
         >
           {edgeType} Edges
         </TabsTrigger>
       );
     });
    
    return tabs;
  };

  const generateTabContents = () => {
    const contents = [];
    
         // Core tab contents
     contents.push(
       <TabsContent key="stats" value="stats" className="mt-4">
         <SimpleStatsTab />
       </TabsContent>,
       <TabsContent key="all-nodes" value="all-nodes" className="mt-4">
         <StateTab label="All Nodes (getNodes())" data={currentData.nodes} />
       </TabsContent>,
       <TabsContent key="all-edges" value="all-edges" className="mt-4">
         <StateTab label="All Edges (getEdges())" data={currentData.edges} />
       </TabsContent>,
       <TabsContent key="viewport" value="viewport" className="mt-4">
         <StateTab label="Viewport (getViewport())" data={currentData.viewport} />
       </TabsContent>,
       <TabsContent key="store" value="store" className="mt-4">
         <StateTab label="React Flow Store (useStore)" data={reactFlowInstance} />
       </TabsContent>
     );
    
    // Dynamic node type contents
    currentData.nodeTypes.forEach(nodeType => {
      contents.push(
        <TabsContent key={`nodes-${nodeType}`} value={`nodes-${nodeType}`} className="mt-4">
          <StateTab 
            label={`${nodeType} Nodes (${currentData.nodesByType[nodeType].length})`} 
            data={currentData.nodesByType[nodeType]} 
          />
        </TabsContent>
      );
    });
    
    // Dynamic edge type contents
    currentData.edgeTypes.forEach(edgeType => {
      contents.push(
        <TabsContent key={`edges-${edgeType}`} value={`edges-${edgeType}`} className="mt-4">
          <StateTab 
            label={`${edgeType} Edges (${currentData.edgesByType[edgeType].length})`} 
            data={currentData.edgesByType[edgeType]} 
          />
        </TabsContent>
      );
    });
    
    return contents;
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className={`flex items-center gap-2 ${className}`}
        >
          <Bug className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          React Flow Debug
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-7xl h-[90dvh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Bug className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            React Flow State Debug Panel (No Props!)
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col">
          <Tabs defaultValue="stats" className="flex-1 flex flex-col">
            <div className="flex-shrink-0 overflow-x-auto">
              <TabsList className="flex w-max min-w-full">
                {generateTabs()}
              </TabsList>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
              {generateTabContents()}
            </div>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReactFlowDebugOverlay; 