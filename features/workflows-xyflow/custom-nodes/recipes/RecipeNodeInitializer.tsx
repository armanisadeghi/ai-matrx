"use client";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { X, Check, AlertCircle, Loader2, Copy } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useRecipeFetch } from "./useRecipeFetch";
import RecipeCardSelector from "./RecipeCardSelector";
import { workflowNodesActions } from "@/lib/redux/workflow-nodes/slice";
import { workflowNodesSelectors } from "@/lib/redux/workflow-nodes/selectors";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useDataBrokerWithFetch } from "@/lib/redux/entity/hooks/entityUsedHooks";
import { RECIPE_NODE_DEFINITION } from "@/features/workflows/react-flow/node-editor/workflow-node-editor/custom-workflow-nodes/custom-nodes/custom-node-definitions";
import {
  normalizeBroker,
  normalizeInputMapping,
} from "@/features/workflows-xyflow/utils/normalizers";

interface RecipeNodeInitializerProps {
  nodeId: string;
  onCancel: () => void;
  open: boolean;
  onConfirm: () => void;
}

const DEBUG = false;

const RecipeNodeInitializer: React.FC<RecipeNodeInitializerProps> = ({
  nodeId,
  onCancel,
  open,
  onConfirm,
}) => {
  const dispatch = useAppDispatch();
  const node = useAppSelector((state) =>
    workflowNodesSelectors.nodeById(state, nodeId),
  );
  const nodeDefinitioninputs = useMemo(() => {
    // metadata is JSON at the DB level; narrow enough to read `nodeDefinition.inputs`.
    const meta = node?.metadata as
      | { nodeDefinition?: { inputs?: unknown[] } }
      | null
      | undefined;
    return meta?.nodeDefinition?.inputs ?? [];
  }, [node]);
  const { dataBrokerRecordsById } = useDataBrokerWithFetch();

  const allReturnBrokers = RECIPE_NODE_DEFINITION.predefined_brokers;

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

  useEffect(() => {
    if (neededBrokers && neededBrokers.length > 0) {
      const allDependencies = neededBrokers.map((broker) => ({
        type: "broker",
        id: broker.id,
        required: true,
        metadata: normalizeBroker(dataBrokerRecordsById[broker.id]),
      }));
      const newDataInputs = neededBrokers
        .map((broker) =>
          normalizeInputMapping({
            type: "broker" as const,
            arg_name: null,
            source_broker_id: broker.id,
            ready: true,
            use_system_default: false,
            default_value: broker.defaultValue,
            metadata: {
              scope: "workflow",
              scopeId: node.workflow_id,
              required: true,
              data_type: broker.dataType,
              use_system_default: false,
              allow_reset: false,
              broker: normalizeBroker(dataBrokerRecordsById[broker.id]),
            },
          }),
        )
        .flat();
      const newNodeInputs = neededBrokers.map((broker) => ({
        id: broker.id,
        name: broker.name,
        required: true,
        component: broker.fieldComponentId,
        data_type: broker.dataType,
        input_type: "broker",
      }));
      dispatch(
        workflowNodesActions.addInputsToNodeDefinition({
          id: nodeId,
          inputs: newNodeInputs,
        }),
      );
      dispatch(
        workflowNodesActions.updateDependencies({
          id: nodeId,
          dependencies: allDependencies,
        }),
      );
      dispatch(
        workflowNodesActions.addInputs({ id: nodeId, inputs: newDataInputs }),
      );
    } else {
      dispatch(workflowNodesActions.clearDependencies({ id: nodeId }));
    }
  }, [neededBrokers, recipeId]);

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  const handleRecipeChange = (
    recipeId: string,
    useLatestVersion: boolean,
    version: number | null,
  ) => {
    if (recipeId) {
      dispatch(
        workflowNodesActions.updateNodeInputByArgName({
          nodeId,
          argName: "recipe_id",
          updates: { default_value: recipeId, ready: true },
        }),
      );
      const recipeName = quickReferenceSelectOptions.find(
        (option) => option.value === recipeId,
      )?.label;
      dispatch(
        workflowNodesActions.updateField({
          id: nodeId,
          field: "step_name",
          value: recipeName || "ERROR! New Run Recipe",
        }),
      );
      if (useLatestVersion) {
        dispatch(
          workflowNodesActions.updateNodeInputByArgName({
            nodeId,
            argName: "latest_version",
            updates: { default_value: true, ready: true },
          }),
        );
        dispatch(
          workflowNodesActions.updateNodeInputByArgName({
            nodeId,
            argName: "version",
            updates: { default_value: null, ready: false },
          }),
        );
      } else {
        dispatch(
          workflowNodesActions.updateNodeInputByArgName({
            nodeId,
            argName: "latest_version",
            updates: { default_value: false, ready: true },
          }),
        );
        dispatch(
          workflowNodesActions.updateNodeInputByArgName({
            nodeId,
            argName: "version",
            updates: { default_value: version, ready: version !== null },
          }),
        );
      }
      if (neededBrokers && neededBrokers.length > 0) {
        neededBrokers.forEach((broker) => {
          dispatch(
            workflowNodesActions.addDependency({
              id: nodeId,
              dependency: {
                type: "dataBroker",
                id: broker.id,
                metadata: dataBrokerRecordsById[broker.id],
              },
            }),
          );
        });
      } else {
        console.log("cleared node dependencies");
      }
    } else {
      dispatch(
        workflowNodesActions.updateNodeInputByArgName({
          nodeId,
          argName: "recipe_id",
          updates: { default_value: "", ready: false },
        }),
      );
      dispatch(
        workflowNodesActions.updateNodeInputByArgName({
          nodeId,
          argName: "latest_version",
          updates: { default_value: true, ready: false },
        }),
      );
      dispatch(
        workflowNodesActions.updateNodeInputByArgName({
          nodeId,
          argName: "version",
          updates: { default_value: null, ready: false },
        }),
      );
    }
  };

  useEffect(() => {
    handleRecipeChange(recipeId, useLatestVersion, version);
  }, [recipeId, useLatestVersion, version]);

  const handleCancel = () => {
    onCancel();
  };

  const handleConfirm = () => {
    onConfirm();
  };

  const canProceed = recipeId && (useLatestVersion || version);

  if (!open) return null;
  if (!recipeId) {
    return (
      <RecipeCardSelector
        nodeId={nodeId}
        onCancel={onCancel}
        open={open}
        quickReferenceSelectOptions={quickReferenceSelectOptions}
        onRecipeSelect={setRecipeId}
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
                    onCheckedChange={(checked) =>
                      setUseLatestVersion(!!checked)
                    }
                    disabled={!recipeId}
                  />
                  <Label
                    htmlFor="latest-version"
                    className="cursor-pointer text-sm font-medium"
                  >
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
                  onChange={(e) =>
                    setVersion(e.target.value ? parseInt(e.target.value) : null)
                  }
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
                <div className="font-medium text-muted-foreground">
                  Loaded Version
                </div>
                <div className="col-span-2">
                  {recipeDetails.version || "N/A"}
                </div>
              </div>

              {/* Needed Brokers Table */}
              {neededBrokers.length > 0 && (
                <div className="space-y-2">
                  <Label>Needed Brokers</Label>
                  <div className="border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="h-8 px-3 py-1 text-xs font-medium">
                            Name
                          </TableHead>
                          <TableHead className="h-8 px-3 py-1 text-xs font-medium">
                            ID
                          </TableHead>
                          <TableHead className="h-8 px-3 py-1 text-xs font-medium">
                            Data Type
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {neededBrokers.map((broker, index) => (
                          <TableRow
                            key={broker.id}
                            className={`text-xs ${
                              index % 2 === 0 ? "bg-background" : "bg-muted/30"
                            } hover:bg-muted/50`}
                          >
                            <TableCell className="px-3 py-1 font-medium">
                              {broker.name}
                            </TableCell>
                            <TableCell className="px-3 py-1">
                              <div className="flex items-center gap-1 group">
                                <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
                                  {broker.id}
                                </code>
                                <button
                                  onClick={() =>
                                    copyToClipboard(
                                      broker.id,
                                      `needed-${broker.id}`,
                                    )
                                  }
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
                              <Badge variant="outline" className="text-xs">
                                {broker.dataType}
                              </Badge>
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
                          <TableHead className="h-8 px-3 py-1 text-xs font-medium">
                            ID
                          </TableHead>
                          <TableHead className="h-8 px-3 py-1 text-xs font-medium w-24">
                            Type
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {allReturnBrokers.map((broker, index) => (
                          <TableRow
                            key={index}
                            className={`text-xs ${
                              index % 2 === 0 ? "bg-background" : "bg-muted/30"
                            } hover:bg-muted/50`}
                          >
                            <TableCell className="px-3 py-1">
                              <div className="flex items-center gap-1 group">
                                <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded break-all">
                                  {broker.id}
                                </code>
                                <button
                                  onClick={() =>
                                    copyToClipboard(
                                      broker.id,
                                      `return-${index}`,
                                    )
                                  }
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
                              <Badge variant="secondary">Placeholder</Badge>
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
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            Continue with Recipe
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default RecipeNodeInitializer;
