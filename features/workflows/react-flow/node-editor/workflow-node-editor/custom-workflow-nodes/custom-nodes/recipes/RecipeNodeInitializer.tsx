"use client";
import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { X, Check, AlertCircle, Loader2, Copy } from "lucide-react";
import { DbFunctionNode } from "@/features/workflows/types";
import { NodeDefinitionType } from "../custom-node-definitions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
    setArgValueAndReady,
    getFunctionData,
    getAllReturnBrokers,
} from "@/features/workflows/react-flow/node-editor/workflow-node-editor/utils";
import { setNeededBrokerDependenciesWithCallback } from "@/features/workflows/react-flow/node-editor/workflow-node-editor/utils";
import {
    overwriteReturnBrokerOverridesFromDefinitionWithCallback,
    clearReturnBrokerOverrides,
} from "@/features/workflows/react-flow/node-editor/workflow-node-editor/utils/broker-utils";
import { useRecipeFetch } from "./hooks/useRecipeFetch";
import { cloneDeep } from "lodash";
import RecipeCardSelector from "./RecipeCardSelector";
import { EnrichedBroker } from '@/features/workflows/utils/data-flow-manager';


interface RecipeNodeInitializerProps {
    nodeData: DbFunctionNode;
    nodeDefinition: NodeDefinitionType;
    onConfirm: (updatedNodeData: DbFunctionNode) => void;
    onCancel: () => void;
    open: boolean;
}

const DEBUG = false;

const RecipeNodeInitializer: React.FC<RecipeNodeInitializerProps> = ({ nodeData, nodeDefinition, onConfirm, onCancel, open }) => {
    const [currentNodeData, setCurrentNodeData] = useState<DbFunctionNode>(nodeData);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const {
        loading,
        error,
        recipeDetails,
        neededBrokers,
        recipeId,
        useLatestVersion,
        version,
        quickReferenceSelectOptions,
        setRecipeId,
        setUseLatestVersion,
        setVersion,
    } = useRecipeFetch();
    
    const enrichedBrokers = window.workflowEnrichedBrokers || [];

    const copyToClipboard = async (text: string, id: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    };

    const handleNodeUpdate = useCallback((updatedNode: DbFunctionNode) => {
        setCurrentNodeData(updatedNode);
    }, []);

    const handleRecipeChange = (recipeId: string, useLatestVersion: boolean, version: number | null) => {
        let updatedNode = cloneDeep(currentNodeData);
        if (recipeId) {
            updatedNode = setArgValueAndReady(updatedNode, handleNodeUpdate, "recipe_id", recipeId, true);

            // Handle version logic based on useLatestVersion flag
            if (useLatestVersion) {
                // Using latest version
                updatedNode = setArgValueAndReady(updatedNode, handleNodeUpdate, "latest_version", true, true);
                updatedNode = setArgValueAndReady(updatedNode, handleNodeUpdate, "version", null, false);
            } else {
                // Using specific version
                updatedNode = setArgValueAndReady(updatedNode, handleNodeUpdate, "latest_version", false, true);
                updatedNode = setArgValueAndReady(updatedNode, handleNodeUpdate, "version", version, version !== undefined);
            }
            if (neededBrokers && neededBrokers.length > 0) {
                console.log("setting needed brokers", neededBrokers);
                // `setNeededBrokerDependenciesWithCallback` widens to WorkflowNodePersistShape;
                // the editor only ever holds the saved DbFunctionNode row, so narrow back.
                updatedNode = setNeededBrokerDependenciesWithCallback(updatedNode, handleNodeUpdate, neededBrokers) as DbFunctionNode;
            } else {
                updatedNode = clearReturnBrokerOverrides(updatedNode, handleNodeUpdate);
            }
            updatedNode = overwriteReturnBrokerOverridesFromDefinitionWithCallback(updatedNode, handleNodeUpdate, nodeDefinition, {
                recipe_id: recipeId,
            });
        } else {
            updatedNode = setArgValueAndReady(updatedNode, handleNodeUpdate, "recipe_id", "", false);
            updatedNode = setArgValueAndReady(updatedNode, handleNodeUpdate, "latest_version", true, false);
            updatedNode = setArgValueAndReady(updatedNode, handleNodeUpdate, "version", null, false);
            updatedNode = clearReturnBrokerOverrides(updatedNode, handleNodeUpdate);
            updatedNode = overwriteReturnBrokerOverridesFromDefinitionWithCallback(updatedNode, handleNodeUpdate, nodeDefinition, {
                recipe_id: "NO-RECIPE-SELECTED",
            });
        }
        setCurrentNodeData(updatedNode);
        return updatedNode;
    };

    useEffect(() => {
        handleRecipeChange(recipeId, useLatestVersion, version);
    }, [recipeId, useLatestVersion, version]);

    useEffect(() => {
        if (DEBUG) {
            console.log("RecipeNodeInitializer currentNodeData", currentNodeData);
        }
    }, [currentNodeData]);

    const handleConfirm = () => {
        onConfirm(currentNodeData);
    };

    const handleCancel = () => {
        onCancel();
    };

    // Check if we have the minimum required data to proceed
    const functionData = getFunctionData(nodeData.function_id);

    const allReturnBrokers = getAllReturnBrokers(currentNodeData, functionData);
    const allDependencies = currentNodeData.additional_dependencies;

    const canProceed = recipeId && (useLatestVersion || version);

    if (!open) return null;
    if (!recipeId) {
        return (
            <RecipeCardSelector
                nodeData={nodeData}
                nodeDefinition={nodeDefinition}
                onConfirm={onConfirm}
                onCancel={onCancel}
                open={open}
                quickReferenceSelectOptions={quickReferenceSelectOptions}
                onRecipeSelect={setRecipeId}
                enrichedBrokers={enrichedBrokers}
            />
        );
    }


    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <Card className="w-full max-w-5xl h-[95dvh] flex flex-col">
                <CardHeader className="flex flex-row items-center justify-between flex-shrink-0">
                    <div className="space-y-1 px-4">
                        <CardTitle>Configure Recipe Node</CardTitle>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onCancel}>
                        <X className="h-4 w-4" />
                    </Button>
                </CardHeader>
                <CardContent className="space-y-4 flex-1 overflow-y-auto">
                    {/* Section 1: Recipe Selection Form */}
                    <div className="space-y-4 rounded-lg border p-4">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="col-span-1 space-y-2 md:col-span-2">
                                <Label htmlFor="recipe-select">Select a Different Recipe</Label>
                                <Select onValueChange={setRecipeId} defaultValue={recipeId}>
                                    <SelectTrigger id="recipe-select">
                                        <SelectValue placeholder="Select a recipe..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {quickReferenceSelectOptions.map((record) => (
                                            <SelectItem key={record.value} value={record.value}>
                                                {record.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex items-end">
                                <div className="flex items-center space-x-2">
                                    <Checkbox
                                        id="latest-version"
                                        checked={useLatestVersion}
                                        onCheckedChange={(checked) => setUseLatestVersion(!!checked)}
                                        disabled={!recipeId}
                                    />
                                    <Label htmlFor="latest-version" className="cursor-pointer text-sm font-medium">
                                        Use latest version
                                    </Label>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="version-input">Version</Label>
                                <Input
                                    id="version-input"
                                    type="number"
                                    value={version || ""}
                                    onChange={(e) => setVersion(e.target.value ? parseInt(e.target.value) : null)}
                                    placeholder="e.g., 1"
                                    disabled={useLatestVersion || !recipeId}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Section 2: Status and Details (conditionally rendered) */}
                    {error && (
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Error Fetching Recipe</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    {recipeDetails && !loading && !error && (
                        <div className="space-y-4 rounded-lg border p-4">
                            <h3 className="font-semibold text-lg">Recipe Details</h3>
                            {/* Recipe Info */}
                            <div className="grid grid-cols-3 gap-4 text-sm">
                                <div className="font-medium text-muted-foreground">Status</div>
                                <div className="col-span-2">
                                    <Badge variant="success">Ready</Badge>
                                </div>
                                <div className="font-medium text-muted-foreground">Name</div>
                                <div className="col-span-2">{recipeDetails.name || "N/A"}</div>
                                <div className="font-medium text-muted-foreground">Loaded Version</div>
                                <div className="col-span-2">{recipeDetails.version || "N/A"}</div>
                            </div>

                            {/* Needed Brokers Table */}
                            {neededBrokers.length > 0 && (
                                <div className="space-y-2">
                                    <Label>Needed Brokers</Label>
                                    <div className="border rounded-md">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="h-8 px-3 py-1 text-xs font-medium">Name</TableHead>
                                                    <TableHead className="h-8 px-3 py-1 text-xs font-medium">ID</TableHead>
                                                    <TableHead className="h-8 px-3 py-1 text-xs font-medium">Data Type</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {neededBrokers.map((broker, index) => (
                                                    <TableRow 
                                                        key={broker.id}
                                                        className={`text-xs ${index % 2 === 0 ? 'bg-background' : 'bg-muted/30'} hover:bg-muted/50`}
                                                    >
                                                        <TableCell className="px-3 py-1 font-medium">{broker.name}</TableCell>
                                                        <TableCell className="px-3 py-1">
                                                            <div className="flex items-center gap-1 group">
                                                                <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
                                                                    {broker.id}
                                                                </code>
                                                                <button
                                                                    onClick={() => copyToClipboard(broker.id, `needed-${broker.id}`)}
                                                                    className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground hover:text-foreground transition-all"
                                                                    title="Copy ID to clipboard"
                                                                >
                                                                    {copiedId === `needed-${broker.id}` ? (
                                                                        <Check className="h-3 w-3 text-green-500" />
                                                                    ) : (
                                                                        <Copy className="h-3 w-3" />
                                                                    )}
                                                                </button>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="px-3 py-1">
                                                            <Badge variant="outline" className="text-xs">{broker.dataType}</Badge>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>
                            )}

                            {/* Return Brokers Table */}
                            {allReturnBrokers.length > 0 && (
                                <div className="space-y-2">
                                    <Label>Return Brokers</Label>
                                    <div className="border rounded-md">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="h-8 px-3 py-1 text-xs font-medium">ID</TableHead>
                                                    <TableHead className="h-8 px-3 py-1 text-xs font-medium w-24">Type</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {allReturnBrokers.map((broker, index) => (
                                                    <TableRow 
                                                        key={index}
                                                        className={`text-xs ${index % 2 === 0 ? 'bg-background' : 'bg-muted/30'} hover:bg-muted/50`}
                                                    >
                                                        <TableCell className="px-3 py-1">
                                                            <div className="flex items-center gap-1 group">
                                                                <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded break-all">
                                                                    {broker.id}
                                                                </code>
                                                                <button
                                                                    onClick={() => copyToClipboard(broker.id, `return-${index}`)}
                                                                    className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground hover:text-foreground transition-all flex-shrink-0"
                                                                    title="Copy ID to clipboard"
                                                                >
                                                                    {copiedId === `return-${index}` ? (
                                                                        <Check className="h-3 w-3 text-green-500" />
                                                                    ) : (
                                                                        <Copy className="h-3 w-3" />
                                                                    )}
                                                                </button>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="px-3 py-1">
                                                            <Badge variant={broker.type === "default" ? "secondary" : "default"}>
                                                                {broker.type === "default" ? "Default" : "Override"}
                                                            </Badge>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {loading && (
                        <div className="flex items-center justify-center p-6 text-muted-foreground">
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            <span>Loading recipe details...</span>
                        </div>
                    )}
                </CardContent>
                <CardFooter className="flex justify-end space-x-2 flex-shrink-0 pb-4">
                    <Button variant="outline" onClick={onCancel}>
                        <X className="mr-2 h-4 w-4" />
                        Cancel
                    </Button>
                    <Button onClick={handleConfirm} disabled={!canProceed || loading}>
                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                        Continue with Recipe
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
};

export default RecipeNodeInitializer;
