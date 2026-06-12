"use client";
import React, { useState } from "react";
import {
  X,
  ArrowRight,
  Database,
  GitBranch,
  Link,
  Zap,
  Trash2,
  Copy,
  Download,
  Settings,
  AlertTriangle,
  Info,
  Save,
  Star,
} from "lucide-react";
import { Edge } from "reactflow";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  deleteWorkflowEdge,
  saveWorkflowEdge,
  convertVirtualToSaved,
  reactFlowToEdge,
} from "@/features/workflows/service";
import type { WorkflowEdge } from "@/features/workflows/types";
import { EnrichedBroker } from "@/features/workflows/utils/data-flow-manager";
import { recordFromJson } from "@/features/workflows/utils/jsonFromDb";

interface EdgeDetailOverlayProps {
  edge: Edge | null;
  isOpen: boolean;
  onClose: () => void;
  onEdgeDeleted?: () => void;
  onEdgeUpdated?: () => void;
  workflowId?: string;
}

/**
 * Get connection type details for styling and display
 */
function getConnectionTypeInfo(connectionType: string) {
  switch (connectionType) {
    case "to_argument":
      return {
        icon: Link,
        label: "Argument",
        color: "emerald",
        iconColor: "text-emerald-500",
      };
    case "to_relay":
      return {
        icon: ArrowRight,
        label: "Relay",
        color: "blue",
        iconColor: "text-blue-500",
      };
    case "to_dependency":
      return {
        icon: GitBranch,
        label: "Dependency",
        color: "purple",
        iconColor: "text-purple-500",
      };
    default:
      return {
        icon: Database,
        label: "Connection",
        color: "gray",
        iconColor: "text-gray-500",
      };
  }
}

export function EdgeDetailOverlay({
  edge,
  isOpen,
  onClose,
  onEdgeDeleted,
  onEdgeUpdated,
  workflowId,
}: EdgeDetailOverlayProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [labelValue, setLabelValue] = useState("");

  React.useEffect(() => {
    if (edge) {
      setLabelValue(edge.data?.label || "");
    }
  }, [edge]);

  if (!isOpen || !edge) return null;

  const connectionType = edge.data?.connectionType || "unknown";
  const sourceBrokerId = edge.data?.sourceBrokerId;
  const isVirtualEdge = edge.id.startsWith("virtual_");
  const isKnownBroker = edge.data?.metadata?.isKnownBroker;
  const knownBrokerData = edge.data?.metadata?.knownBrokerData;

  const typeInfo = getConnectionTypeInfo(connectionType);
  const IconComponent = typeInfo.icon;

  const saveLabel = async () => {
    if (!workflowId) return;

    setIsSaving(true);
    try {
      if (isVirtualEdge) {
        // Convert virtual edge to saved edge
        const savedEdgeData = convertVirtualToSaved(edge, workflowId);
        const prevVirtualMeta = recordFromJson(savedEdgeData.metadata);
        savedEdgeData.metadata = {
          ...prevVirtualMeta,
          label: labelValue,
        };
        await saveWorkflowEdge(workflowId, savedEdgeData);
      } else {
        const base = reactFlowToEdge(edge as WorkflowEdge);
        const prevMeta =
          base.metadata &&
          typeof base.metadata === "object" &&
          !Array.isArray(base.metadata)
            ? (base.metadata as Record<string, unknown>)
            : {};
        await saveWorkflowEdge(workflowId, {
          ...base,
          metadata: { ...prevMeta, ...edge.data?.metadata, label: labelValue },
        });
      }

      edge.data.label = labelValue;
      onEdgeUpdated?.();
    } catch (error) {
      console.error("Error saving edge:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const convertToSaved = async () => {
    if (!workflowId || !isVirtualEdge) return;

    setIsConverting(true);
    try {
      const savedEdgeData = convertVirtualToSaved(edge, workflowId);
      await saveWorkflowEdge(workflowId, savedEdgeData);
      onEdgeUpdated?.();
    } catch (error) {
      console.error("Error converting edge:", error);
    } finally {
      setIsConverting(false);
    }
  };

  const handleDeleteEdge = async () => {
    if (!edge?.id || isVirtualEdge) return;

    setIsDeleting(true);
    try {
      await deleteWorkflowEdge(edge.id);
      onEdgeDeleted?.();
      onClose();
    } catch (error) {
      console.error("Error deleting edge:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const copyToClipboard = (data: any) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
  };

  const downloadJson = (data: any, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Overlay Content */}
      <div className="relative bg-textured rounded-lg shadow-2xl border-border w-full max-w-4xl mx-4 h-[90dvh] flex flex-col">
        {/* Compact Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <IconComponent className={`w-5 h-5 ${typeInfo.iconColor}`} />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {typeInfo.label} Connection
            </h2>
            {isVirtualEdge && (
              <Badge variant="outline" className="text-xs">
                Virtual
              </Badge>
            )}
            {isKnownBroker && (
              <Badge variant="secondary" className="text-xs">
                Known Broker
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isVirtualEdge && (
              <Button
                onClick={convertToSaved}
                disabled={isConverting}
                size="sm"
                variant="outline"
                className="gap-1"
              >
                <Star className="w-3 h-3" />
                {isConverting ? "Converting..." : "Save Edge"}
              </Button>
            )}
            <Button
              onClick={handleDeleteEdge}
              disabled={isDeleting || isVirtualEdge}
              variant="destructive"
              size="sm"
            >
              <Trash2 className="w-3 h-3" />
            </Button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full h-full flex flex-col"
          >
            <TabsList className="m-4 mb-0">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="broker">Broker Details</TabsTrigger>
              <TabsTrigger value="admin">Admin</TabsTrigger>
            </TabsList>

            <div className="flex-1 min-h-0 p-4 overflow-hidden">
              {/* Overview Tab - Essential Information Only */}
              <TabsContent
                value="overview"
                className="mt-0 space-y-4 h-full overflow-y-auto"
              >
                {/* Label - Directly Editable */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Label
                  </label>
                  <div className="flex gap-2">
                    <Input
                      value={labelValue}
                      onChange={(e) => setLabelValue(e.target.value)}
                      className="flex-1"
                      placeholder="Enter connection label..."
                    />
                    <Button
                      onClick={saveLabel}
                      disabled={isSaving || labelValue === edge.data?.label}
                      size="sm"
                    >
                      <Save className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                {/* Broker ID - Prominent Display */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Broker ID
                  </label>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded border font-mono text-sm">
                    {sourceBrokerId || "Unknown"}
                    {knownBrokerData?.name && (
                      <span className="ml-2 text-xs text-gray-500">
                        ({knownBrokerData.name})
                      </span>
                    )}
                  </div>
                </div>

                {/* Source → Target Flow - Compact */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Data Flow
                  </label>
                  <div className="grid grid-cols-5 gap-2 items-center">
                    <div className="col-span-2 p-2 bg-blue-50 dark:bg-blue-950/30 rounded border text-center">
                      <div className="text-xs text-gray-500 mb-1">Source</div>
                      <div className="font-mono text-sm truncate">
                        {edge.source}
                      </div>
                    </div>
                    <div className="flex justify-center">
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                    </div>
                    <div className="col-span-2 p-2 bg-green-50 dark:bg-green-950/30 rounded border text-center">
                      <div className="text-xs text-gray-500 mb-1">Target</div>
                      <div className="font-mono text-sm truncate">
                        {edge.target}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Connection Type Info */}
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded border">
                  <div className="flex items-center gap-2 mb-2">
                    <IconComponent
                      className={`w-4 h-4 ${typeInfo.iconColor}`}
                    />
                    <span className="font-medium text-sm">
                      {typeInfo.label} Connection
                    </span>
                  </div>
                  {edge.data?.metadata?.targetArgName && (
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Target Parameter:{" "}
                      <span className="font-mono">
                        {edge.data.metadata.targetArgName}
                      </span>
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Broker Details Tab */}
              <TabsContent
                value="broker"
                className="mt-0 space-y-4 h-full overflow-y-auto"
              >
                {isKnownBroker && knownBrokerData && (
                  <Card className="border-green-200 dark:border-green-800">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-green-600 dark:text-green-400 text-base flex items-center gap-2">
                        <Database className="w-4 h-4" />
                        Known Broker Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">
                            Name:
                          </span>
                          <div className="font-medium">
                            {knownBrokerData.name}
                          </div>
                        </div>
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">
                            Data Type:
                          </span>
                          <div className="font-medium">
                            {knownBrokerData.dataType || "Unknown"}
                          </div>
                        </div>
                        {knownBrokerData.defaultValue && (
                          <div className="col-span-2">
                            <span className="text-gray-500 dark:text-gray-400">
                              Default Value:
                            </span>
                            <div className="font-mono text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded mt-1">
                              {knownBrokerData.defaultValue}
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      Connection Analysis
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">
                          Type:
                        </span>
                        <div className="font-medium">{connectionType}</div>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">
                          Status:
                        </span>
                        <div className="font-medium">
                          {isVirtualEdge ? "Virtual" : "Saved"}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Admin Tab */}
              <TabsContent
                value="admin"
                className="mt-0 space-y-4 h-full overflow-y-auto"
              >
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center justify-between">
                      Edge Data
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            navigator.clipboard.writeText(
                              JSON.stringify(edge, null, 2),
                            )
                          }
                        >
                          <Copy className="w-3 h-3 mr-1" />
                          Copy
                        </Button>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3 text-sm">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">
                            Edge ID:
                          </span>
                          <div className="font-mono text-xs break-all">
                            {edge.id}
                          </div>
                        </div>
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">
                            Type:
                          </span>
                          <div className="font-mono">
                            {edge.type || "default"}
                          </div>
                        </div>
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">
                            Animated:
                          </span>
                          <div>{edge.animated ? "Yes" : "No"}</div>
                        </div>
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">
                            Virtual:
                          </span>
                          <div>{isVirtualEdge ? "Yes" : "No"}</div>
                        </div>
                      </div>

                      {/* Visual Properties */}
                      {edge.style && (
                        <div className="pt-2 border-t border-border">
                          <span className="text-gray-500 dark:text-gray-400 text-xs font-medium">
                            Visual Properties:
                          </span>
                          <div className="mt-1 grid grid-cols-3 gap-2 text-xs">
                            <div>Color: {edge.style.stroke || "default"}</div>
                            <div>Width: {edge.style.strokeWidth || 1}px</div>
                            <div>
                              Style:{" "}
                              {edge.style.strokeDasharray ? "dashed" : "solid"}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Danger Zone */}
                <Card className="border-red-200 dark:border-red-800">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-red-600 dark:text-red-400 text-base flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      Danger Zone
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {isVirtualEdge ? (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                        Virtual edges cannot be deleted as they are
                        automatically generated.
                      </p>
                    ) : (
                      <p className="text-sm text-red-600 dark:text-red-400 mb-3">
                        This will permanently remove the edge. This action
                        cannot be undone.
                      </p>
                    )}
                    <Button
                      onClick={handleDeleteEdge}
                      disabled={isDeleting || isVirtualEdge}
                      variant="destructive"
                      size="sm"
                    >
                      <Trash2 className="w-3 h-3 mr-1" />
                      {isDeleting ? "Deleting..." : "Delete Edge"}
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
