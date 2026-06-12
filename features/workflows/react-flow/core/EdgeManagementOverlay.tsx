"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GitBranch, Copy, Download, Trash2, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { Edge } from "reactflow";
import { createEdgeValidationList, EdgeValidationItem, analyzeWorkflowEdges } from "@/features/workflows/utils/edgeAnalyzer";
import { deleteWorkflowEdge } from "@/features/workflows/service";
import {
    identifyDuplicateEdges,
    removeDuplicateEdges,
    getDuplicateSummary,
    DuplicateEdgeGroup,
} from "@/features/workflows/utils/edgeCleanup";
import { useWorkflowData } from "@/features/workflows/hooks/useWorkflowData";
import { ConvertedWorkflowData } from "@/features/workflows/types";

interface EdgeManagementOverlayProps {
    workflowId: string;
    onEdgesUpdated: () => void;
    className?: string;
}

const EdgeManagementOverlay: React.FC<EdgeManagementOverlayProps> = ({ workflowId, onEdgesUpdated, className }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    const [isDeletingAll, setIsDeletingAll] = useState(false);
    const [isCleaningDuplicates, setIsCleaningDuplicates] = useState(false);
    const [edges, setEdges] = useState<Edge[]>([]);
    const [completeWorkflowData, setCompleteWorkflowData] = useState<ConvertedWorkflowData | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const { loadWorkflow } = useWorkflowData();

    // Load fresh data when overlay opens
    const loadFreshData = useCallback(async () => {
        if (!workflowId) return;

        setIsLoading(true);
        try {
            const workflowData = await loadWorkflow(workflowId);
            if (workflowData) {
                setEdges(workflowData.edges || []);
                setCompleteWorkflowData(workflowData);
            }
        } catch (error) {
            console.error("Error loading fresh workflow data:", error);
        } finally {
            setIsLoading(false);
        }
    }, [workflowId, loadWorkflow]);

    // Load data when overlay opens
    useEffect(() => {
        if (isOpen) {
            loadFreshData();
        }
    }, [isOpen, loadFreshData]);

    // Analyze edges
    const edgeAnalysis = useMemo(() => {
        if (!completeWorkflowData) return { validEdges: [], invalidEdges: [], expectedEdges: [], databaseEdges: [] };
        return analyzeWorkflowEdges(edges, completeWorkflowData);
    }, [edges, completeWorkflowData]);

    const edgeValidationList = useMemo(() => {
        if (!completeWorkflowData) return [];
        return createEdgeValidationList(edges, completeWorkflowData);
    }, [edges, completeWorkflowData]);

    const invalidEdges = edgeValidationList.filter((item) => !item.isValid);

    // Analyze duplicates
    const duplicateGroups = useMemo(() => {
        return identifyDuplicateEdges(edges);
    }, [edges]);

    const duplicateSummary = useMemo(() => {
        return getDuplicateSummary(duplicateGroups);
    }, [duplicateGroups]);

    const handleDeleteEdge = async (edgeId: string) => {
        setIsDeleting(edgeId);
        try {
            await deleteWorkflowEdge(edgeId);
            // Reload fresh data and notify parent
            await loadFreshData();
            onEdgesUpdated();
        } catch (error) {
            console.error("Error deleting edge:", error);
        } finally {
            setIsDeleting(null);
        }
    };

    const handleDeleteAllInvalid = async () => {
        setIsDeletingAll(true);
        try {
            await Promise.all(invalidEdges.map((item) => deleteWorkflowEdge(item.edge.id)));
            // Reload fresh data and notify parent
            await loadFreshData();
            onEdgesUpdated();
        } catch (error) {
            console.error("Error deleting edges:", error);
        } finally {
            setIsDeletingAll(false);
        }
    };

    const handleCleanupDuplicates = async () => {
        setIsCleaningDuplicates(true);
        try {
            await removeDuplicateEdges(duplicateGroups);
            // Reload fresh data and notify parent
            await loadFreshData();
            onEdgesUpdated();
        } catch (error) {
            console.error("Error cleaning up duplicates:", error);
        } finally {
            setIsCleaningDuplicates(false);
        }
    };

    const copyToClipboard = (data: any) => {
        navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    };

    const downloadJson = (data: any, filename: string) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const getNodeLabel = (nodeId: string) => {
        if (!completeWorkflowData) return nodeId;

        // Try to find node label from workflow data
        const workflowNode = completeWorkflowData.functionNodes.find((n) => n.id === nodeId);
        if (workflowNode) return workflowNode.data.step_name || "Workflow Node";

        const userInput = completeWorkflowData.userInputs.find((n) => n.id === nodeId);
        if (userInput) return userInput.data.label || "User Input";

        const relay = completeWorkflowData.relays.find((n) => n.id === nodeId);
        if (relay) return relay.data.label || "Relay";

        return nodeId;
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className={`flex items-center gap-2 ${className}`}>
                    <GitBranch className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    Manage Edges
                    {(invalidEdges.length > 0 || duplicateSummary.totalDuplicates > 0) && (
                        <div className="flex gap-1 ml-1">
                            {invalidEdges.length > 0 && <Badge variant="destructive">{invalidEdges.length} Invalid</Badge>}
                            {duplicateSummary.totalDuplicates > 0 && (
                                <Badge variant="secondary">{duplicateSummary.totalDuplicates} Duplicates</Badge>
                            )}
                        </div>
                    )}
                </Button>
            </DialogTrigger>

            <DialogContent className="max-w-6xl h-[85dvh] flex flex-col">
                <DialogHeader className="flex-shrink-0">
                    <DialogTitle className="flex items-center gap-2">
                        <GitBranch className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        Edge Management
                        <div className="flex gap-2 ml-2">
                            {invalidEdges.length > 0 && (
                                <Badge variant="destructive">
                                    {invalidEdges.length} Invalid Edge{invalidEdges.length !== 1 ? "s" : ""}
                                </Badge>
                            )}
                            {duplicateSummary.totalDuplicates > 0 && (
                                <Badge variant="secondary">
                                    {duplicateSummary.totalDuplicates} Duplicate{duplicateSummary.totalDuplicates !== 1 ? "s" : ""}
                                </Badge>
                            )}
                        </div>
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 min-h-0 overflow-hidden">
                    <Tabs defaultValue="management" className="w-full h-full flex flex-col">
                        <TabsList className="grid w-full grid-cols-3 flex-shrink-0">
                            <TabsTrigger value="management">Edge Management</TabsTrigger>
                            <TabsTrigger value="duplicates">Duplicates</TabsTrigger>
                            <TabsTrigger value="json">All Edges JSON</TabsTrigger>
                        </TabsList>

                        <div className="flex-1 min-h-0 overflow-y-auto">
                            {/* Management Tab */}
                            <TabsContent value="management" className="mt-4 space-y-4">
                                {isLoading && (
                                    <div className="text-center py-8">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                                        <p className="text-muted-foreground mt-2">Loading fresh edge data...</p>
                                    </div>
                                )}

                                {!isLoading && completeWorkflowData && (
                                    <>
                                        {/* Summary Cards */}
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <Card>
                                                <CardHeader className="pb-3">
                                                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                                                        <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                                                        Valid Edges
                                                    </CardTitle>
                                                </CardHeader>
                                                <CardContent>
                                                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                                                        {edgeAnalysis.validEdges.length}
                                                    </div>
                                                </CardContent>
                                            </Card>

                                            <Card>
                                                <CardHeader className="pb-3">
                                                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                                                        <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                                                        Invalid Edges
                                                    </CardTitle>
                                                </CardHeader>
                                                <CardContent>
                                                    <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                                                        {edgeAnalysis.invalidEdges.length}
                                                    </div>
                                                </CardContent>
                                            </Card>

                                            <Card>
                                                <CardHeader className="pb-3">
                                                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                                                        <GitBranch className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                                        Expected Edges
                                                    </CardTitle>
                                                </CardHeader>
                                                <CardContent>
                                                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                                                        {edgeAnalysis.expectedEdges.length}
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        </div>

                                        {/* Edge Table */}
                                        <Card className="flex-1">
                                            <CardHeader>
                                                <div className="flex items-center justify-between">
                                                    <CardTitle className="text-lg">Database Edges</CardTitle>
                                                    {invalidEdges.length > 0 && (
                                                        <Button
                                                            onClick={handleDeleteAllInvalid}
                                                            disabled={isDeletingAll}
                                                            variant="destructive"
                                                            size="sm"
                                                            className="gap-2"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                            {isDeletingAll ? "Deleting..." : `Delete All Invalid (${invalidEdges.length})`}
                                                        </Button>
                                                    )}
                                                </div>
                                            </CardHeader>
                                            <CardContent>
                                                {edgeValidationList.length > 0 ? (
                                                    <div className="space-y-1">
                                                        {/* Header */}
                                                        <div className="grid grid-cols-12 gap-3 px-3 py-2 text-sm font-medium text-muted-foreground border-b">
                                                            <div className="col-span-1">Status</div>
                                                            <div className="col-span-3">Source</div>
                                                            <div className="col-span-3">Target</div>
                                                            <div className="col-span-2">Type</div>
                                                            <div className="col-span-2">Edge ID</div>
                                                            <div className="col-span-1">Actions</div>
                                                        </div>

                                                        {/* Rows */}
                                                        {edgeValidationList.map((item, index) => (
                                                            <div
                                                                key={item.edge.id}
                                                                className={`grid grid-cols-12 gap-3 px-3 py-2 text-sm rounded-md hover:bg-muted/50 ${
                                                                    !item.isValid
                                                                        ? "bg-red-50 dark:bg-red-900/20"
                                                                        : "bg-green-50 dark:bg-green-900/20"
                                                                }`}
                                                            >
                                                                <div className="col-span-1 flex items-center">
                                                                    {item.isValid ? (
                                                                        <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                                                                    ) : (
                                                                        <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                                                                    )}
                                                                </div>
                                                                <div className="col-span-3 font-medium">
                                                                    {getNodeLabel(item.edge.source)}
                                                                </div>
                                                                <div className="col-span-3 font-medium">
                                                                    {getNodeLabel(item.edge.target)}
                                                                </div>
                                                                <div className="col-span-2">
                                                                    <Badge variant="outline" className="text-xs">
                                                                        {item.edge.data?.connectionType || "manual"}
                                                                    </Badge>
                                                                </div>
                                                                <div className="col-span-2 font-mono text-xs text-muted-foreground truncate">
                                                                    {item.edge.id}
                                                                </div>
                                                                <div className="col-span-1 flex items-center">
                                                                    {!item.isValid && (
                                                                        <Button
                                                                            onClick={() => handleDeleteEdge(item.edge.id)}
                                                                            disabled={isDeleting === item.edge.id}
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/20"
                                                                        >
                                                                            <Trash2 className="h-3 w-3" />
                                                                        </Button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="text-center text-muted-foreground py-8">
                                                        <GitBranch className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                                        <p>No database edges found.</p>
                                                        <p className="text-sm">Edges are auto-generated based on broker connections.</p>
                                                    </div>
                                                )}
                                            </CardContent>
                                        </Card>
                                    </>
                                )}
                            </TabsContent>

                            {/* Duplicates Tab */}
                            <TabsContent value="duplicates" className="mt-4 space-y-4">
                                {/* Duplicate Summary */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <Card>
                                        <CardHeader className="pb-3">
                                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                                <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                                                Total Duplicates
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                                                {duplicateSummary.totalDuplicates}
                                            </div>
                                        </CardContent>
                                    </Card>

                                    <Card>
                                        <CardHeader className="pb-3">
                                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                                <GitBranch className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                                Affected Connections
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                                                {duplicateSummary.affectedConnections}
                                            </div>
                                        </CardContent>
                                    </Card>

                                    <Card>
                                        <CardHeader className="pb-3">
                                            <CardTitle className="text-sm font-medium">Actions</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            {duplicateSummary.totalDuplicates > 0 ? (
                                                <Button
                                                    onClick={handleCleanupDuplicates}
                                                    disabled={isCleaningDuplicates}
                                                    variant="outline"
                                                    size="sm"
                                                    className="w-full gap-2"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                    {isCleaningDuplicates ? "Cleaning..." : "Clean All"}
                                                </Button>
                                            ) : (
                                                <div className="text-sm text-muted-foreground text-center">No duplicates found</div>
                                            )}
                                        </CardContent>
                                    </Card>
                                </div>

                                {/* Duplicate Groups */}
                                {duplicateGroups.length > 0 && (
                                    <Card>
                                        <CardHeader>
                                            <CardTitle className="text-lg">Duplicate Edge Groups</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="space-y-4">
                                                {duplicateGroups.map((group, index) => (
                                                    <div key={index} className="border rounded-lg p-4 bg-orange-50 dark:bg-orange-900/20">
                                                        <div className="flex items-center justify-between mb-3">
                                                            <div className="font-medium text-sm">Connection: {group.signature}</div>
                                                            <Badge variant="outline">
                                                                {group.edges.length} total, {group.duplicateEdges.length} duplicates
                                                            </Badge>
                                                        </div>

                                                        <div className="space-y-2">
                                                            {group.edges.map((edge, edgeIndex) => (
                                                                <div
                                                                    key={edge.id}
                                                                    className={`flex items-center justify-between p-2 rounded text-xs ${
                                                                        edge.id === group.keepEdge.id
                                                                            ? "bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700"
                                                                            : "bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700"
                                                                    }`}
                                                                >
                                                                    <div className="flex items-center gap-2">
                                                                        {edge.id === group.keepEdge.id ? (
                                                                            <CheckCircle className="h-3 w-3 text-green-600" />
                                                                        ) : (
                                                                            <XCircle className="h-3 w-3 text-red-600" />
                                                                        )}
                                                                        <span className="font-mono">{edge.id}</span>
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <Badge variant="outline" className="text-xs">
                                                                            {edge.data?.connectionType || "manual"}
                                                                        </Badge>
                                                                        {edge.id !== group.keepEdge.id && (
                                                                            <span className="text-red-600 text-xs">Duplicate</span>
                                                                        )}
                                                                        {edge.id === group.keepEdge.id && (
                                                                            <span className="text-green-600 text-xs">Keep</span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </CardContent>
                                    </Card>
                                )}

                                {duplicateGroups.length === 0 && (
                                    <Card>
                                        <CardContent className="text-center py-8">
                                            <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-600 dark:text-green-400 opacity-50" />
                                            <p className="text-muted-foreground">No duplicate edges found!</p>
                                            <p className="text-sm text-muted-foreground">All edges appear to be unique.</p>
                                        </CardContent>
                                    </Card>
                                )}
                            </TabsContent>

                            {/* JSON Tab */}
                            <TabsContent value="json" className="mt-4 space-y-4">
                                <Card>
                                    <CardHeader>
                                        <div className="flex items-center justify-between">
                                            <CardTitle className="text-lg">All Edges JSON ({edges.length})</CardTitle>
                                            <div className="flex gap-2">
                                                <Button variant="outline" size="sm" onClick={() => copyToClipboard(edges)}>
                                                    <Copy className="h-4 w-4 mr-2" />
                                                    Copy
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => downloadJson(edges, "workflow-edges.json")}
                                                >
                                                    <Download className="h-4 w-4 mr-2" />
                                                    Download
                                                </Button>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <pre className="bg-muted p-4 rounded-lg overflow-auto text-sm font-mono h-full min-h-[400px]">
                                            {JSON.stringify(edges, null, 2)}
                                        </pre>
                                    </CardContent>
                                </Card>
                            </TabsContent>
                        </div>
                    </Tabs>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default EdgeManagementOverlay;
