"use client";

import React, {
  useState,
  useCallback,
  memo,
  useEffect,
  useMemo,
  useRef,
} from "react";
import {
  NodeProps,
  useNodeId,
  useReactFlow,
  useUpdateNodeInternals,
} from "@xyflow/react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { LucideIcon } from "lucide-react";
import {
  getNodeStyles,
  getExecutionRequiredIcon,
  getExecutionRequiredIconStyle,
  getStatusIcon,
  getStatusIconStyle,
  NODE_ICON_SIZES,
  getNodeConfig,
  getTextColorClass,
} from "@/features/workflows-xyflow/utils/nodeStyles";
import BaseNodeToolbar, { ToolbarAction } from "./BaseNodeToolbar";
import { NodeHandles } from "./NodeHandles";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { workflowNodesSelectors } from "@/lib/redux/workflow-nodes/selectors";
import { workflowNodesActions } from "@/lib/redux/workflow-nodes/slice";
import { DynamicIcon } from "@/components/official/icons/IconResolver";

export interface BaseNodeData extends Record<string, unknown> {
  nodeType?: string;
  displayMode?: "detailed" | "compact";
  isActive?: boolean;
  status?: string;
  executionRequired?: boolean;
  workflowId?: string;
  // Add height tracking
  measuredHeight?: number;
}

// Configuration interface for node customization
export interface NodeConfig {
  // Node appearance
  nodeType?: string;
  icon?: LucideIcon;
  displayText?: string;

  isValidConnection?: (connection: any) => boolean;

  // Custom handles (for non-workflow nodes)
  customInputs?: Array<{
    id: string;
    name: string;
    required: boolean;
    component: string;
    data_type: string;
    input_type: string;
  }>;
  customOutputs?: Array<{
    name: string;
    broker_id: string;
    component: string;
    data_type: string;
    description: string | null;
    output_type: string;
  }>;

  // Custom content components
  CompactContent?: React.ComponentType;
  DetailedContent?: React.ComponentType;

  // Custom styling
  customStyles?: {
    cardClass?: string;
    headerClass?: string;
    contentClass?: string;
    footerClass?: string;
    compactClass?: string;
  };

  // Settings modal
  SettingsComponent?: React.ComponentType<{
    nodeId: string;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
  }>;

  // Required handlers
  onDuplicate?: (nodeId: string) => void;
  onDelete?: (nodeId: string) => void;

  // Additional toolbar actions
  additionalActions?: ToolbarAction[];

  // Event handlers
  onActiveToggle?: (nodeId: string, active: boolean) => void;
  onDoubleClick?: (nodeId: string) => void;

  // Feature flags
  allowCompactMode?: boolean;
  useWorkflowActions?: boolean;
}

interface BaseNodeProps extends Omit<NodeProps, "data"> {
  config: NodeConfig;
}

const BaseNodeComponent: React.FC<BaseNodeProps> = ({
  config,
  selected,
  dragging,
  positionAbsoluteX,
  positionAbsoluteY,
  ...nodeProps
}) => {
  const updateNodeInternals = useUpdateNodeInternals();
  const nodeId = useNodeId();
  const { updateNodeData, getNode, deleteElements } = useReactFlow();
  const mode = useAppSelector((s) => s.theme.mode);
  const isDarkMode = mode === "dark";
  const isLightMode = mode === "light";

  // Add ref for height measurement
  const nodeRef = useRef<HTMLDivElement>(null);

  if (!nodeId) {
    console.error("BaseNode: nodeId is required");
    return null;
  }
  const dispatch = useAppDispatch();

  const nodeData = useAppSelector((state) =>
    workflowNodesSelectors.nodeById(state, nodeId || ""),
  );
  const nodeStatus = useAppSelector((state) =>
    workflowNodesSelectors.nodeStatus(state, nodeId || ""),
  );
  const nodeDefinition = useAppSelector((state) =>
    workflowNodesSelectors.nodeDefinition(state, nodeId || ""),
  );

  const node = getNode(nodeId);
  const data = (node?.data || {}) as BaseNodeData;

  // Extract configuration with defaults
  const {
    nodeType = "default",
    icon,
    displayText = "Node",
    isValidConnection,
    customInputs,
    customOutputs,
    CompactContent,
    DetailedContent,
    customStyles,
    SettingsComponent,
    onDuplicate,
    onDelete,
    additionalActions = [],
    onActiveToggle,
    onDoubleClick,
    allowCompactMode = true,
    useWorkflowActions = false,
  } = config;

  // Create effective nodeData for NodeHandles (handles custom handles for non-workflow nodes)
  const effectiveNodeData = useMemo(() => {
    if (customInputs || customOutputs) {
      // For non-workflow nodes, create mock nodeData with custom handles
      return {
        ...nodeData,
        metadata: {
          ...nodeData?.metadata,
          nodeDefinition: {
            inputs: customInputs || [],
            outputs: customOutputs || [],
          },
        },
      };
    }
    // For workflow nodes, use existing nodeData
    return nodeData;
  }, [nodeData, customInputs, customOutputs]);

  // Get node configuration from styles
  const nodeConfig = getNodeConfig(nodeType);
  const IconComponent = icon || nodeConfig.icon;

  // Local state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Extract data with defaults (displayMode comes from React Flow node data)
  const displayMode = data.displayMode ?? "detailed";
  const isActive = useWorkflowActions
    ? nodeData?.is_active !== false
    : data.isActive !== false; // Default to true
  const status = data.status || "pending";
  const executionRequired = data.executionRequired || false;

  const isCompact = displayMode === "compact";

  // Get node styles from utility - matching WorkflowNode approach
  const baseNodeStyles = getNodeStyles(nodeData?.node_type || nodeType);

  // Unified styling - no custom background colors, consistent slate background
  const nodeStyles = {
    ...baseNodeStyles,
    borderColor: isActive
      ? baseNodeStyles.borderColor
      : "border-gray-500 dark:border-gray-400",
    // Unified background - slightly different from main background
    backgroundColor: "bg-slate-50 dark:bg-slate-900",
    iconColor: "text-blue-500 dark:text-blue-400",
  };

  // Update node internals when handles change - like WorkflowNode
  useEffect(() => {
    if (nodeId) {
      updateNodeInternals(nodeId);
    }
  }, [
    Array.isArray(effectiveNodeData?.metadata?.nodeDefinition?.inputs)
      ? effectiveNodeData?.metadata?.nodeDefinition?.inputs.length
      : 0,
    Array.isArray(effectiveNodeData?.metadata?.nodeDefinition?.outputs)
      ? effectiveNodeData?.metadata?.nodeDefinition?.outputs.length
      : 0,
    nodeId,
    updateNodeInternals,
  ]);

  // Add height measurement effect
  useEffect(() => {
    if (nodeRef.current && nodeId) {
      const measureHeight = () => {
        const height = nodeRef.current?.getBoundingClientRect().height;
        if (height && Math.abs(height - (data.measuredHeight || 0)) > 1) {
          // Only update if height changed significantly (> 1px to avoid micro-updates)
          updateNodeData(nodeId, { measuredHeight: height });
        }
      };

      // Measure immediately
      measureHeight();

      // Also measure after layout changes
      const resizeObserver = new ResizeObserver(measureHeight);
      resizeObserver.observe(nodeRef.current);

      return () => {
        resizeObserver.disconnect();
      };
    }
  }, [
    nodeId,
    updateNodeData,
    data.measuredHeight,
    displayMode,
    isActive,
    data.showOptionalInputs,
  ]);

  // Set default active state if not already set
  useEffect(() => {
    if (
      useWorkflowActions &&
      nodeId &&
      nodeData &&
      nodeData.is_active === null
    ) {
      dispatch(
        workflowNodesActions.updateField({
          id: nodeId,
          field: "is_active",
          value: true,
        }),
      );
    } else if (
      !useWorkflowActions &&
      nodeId &&
      node &&
      !("isActive" in (node.data || {}))
    ) {
      // For non-workflow nodes, store active state in React Flow data
      updateNodeData(nodeId, { isActive: true });
    }
  }, [nodeId, nodeData, dispatch, useWorkflowActions, node, updateNodeData]);

  // Set default showOptionalInputs state if not already set (React Flow data)
  useEffect(() => {
    if (nodeId && node && !("showOptionalInputs" in (node.data || {}))) {
      updateNodeData(nodeId, { showOptionalInputs: true });
    }
  }, [nodeId, node, updateNodeData]);

  // Update node data helper
  const updateData = useCallback(
    (updates: Partial<BaseNodeData>) => {
      updateNodeData(nodeId, updates);
    },
    [nodeId, updateNodeData],
  );

  // Handle active toggle - using Redux for workflow nodes, React Flow data for others
  const handleActiveToggle = useCallback(
    (checked: boolean) => {
      if (nodeId) {
        if (useWorkflowActions) {
          dispatch(
            workflowNodesActions.updateField({
              id: nodeId,
              field: "is_active",
              value: checked,
            }),
          );
        } else {
          // For non-workflow nodes, store active state in React Flow data
          updateNodeData(nodeId, { isActive: checked });
        }
      }
      onActiveToggle?.(nodeId, checked);
    },
    [nodeId, dispatch, onActiveToggle, useWorkflowActions, updateNodeData],
  );

  // Handle show optional toggle - using React Flow data
  const handleShowOptionalToggle = useCallback(
    (checked: boolean) => {
      if (nodeId) {
        updateNodeData(nodeId, { showOptionalInputs: checked });
      }
    },
    [nodeId, updateNodeData],
  );

  // Handle display mode toggle (exactly like WorkflowNode)
  const handleDisplayModeToggle = useCallback(() => {
    if (!allowCompactMode) return;
    const newMode = displayMode === "detailed" ? "compact" : "detailed";

    // Use React Flow's direct method to update node data (like WorkflowNode)
    if (nodeId) {
      updateNodeData(nodeId, { displayMode: newMode });
    }
  }, [displayMode, nodeId, updateNodeData, allowCompactMode]);

  // Handle settings
  const handleSettings = useCallback(() => {
    setIsSettingsOpen(true);
    console.log("Settings clicked for node:", nodeId);
  }, [nodeId]);

  // Handle duplicate
  const handleDuplicate = useCallback(() => {
    if (onDuplicate) {
      onDuplicate(nodeId);
    } else {
      console.log("Duplicate clicked for node:", nodeId);
    }
  }, [onDuplicate, nodeId]);

  // Handle delete
  const handleDelete = useCallback(() => {
    if (onDelete) {
      onDelete(nodeId);
    } else {
      // Default delete behavior
      deleteElements({ nodes: [{ id: nodeId }] });
      console.log("Delete clicked for node:", nodeId);
    }
  }, [onDelete, nodeId, deleteElements]);

  // Handle double click - always open settings
  const handleDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      // Always open settings on double-click
      handleSettings();

      // Also call custom double-click handler if provided
      if (onDoubleClick) {
        onDoubleClick(nodeId);
      }
    },
    [handleSettings, onDoubleClick, nodeId],
  );

  // Compact mode rendering
  if (isCompact) {
    return (
      <div ref={nodeRef}>
        {/* Built-in Toolbar */}
        <BaseNodeToolbar
          nodeId={nodeId}
          isVisible={selected}
          isCompact={true}
          displayMode={displayMode}
          positionAbsoluteX={positionAbsoluteX}
          positionAbsoluteY={positionAbsoluteY}
          onSettings={handleSettings}
          onDuplicate={onDuplicate ? handleDuplicate : undefined}
          onDelete={handleDelete}
          onDisplayModeToggle={handleDisplayModeToggle}
          additionalActions={additionalActions}
          useWorkflowActions={useWorkflowActions}
        />

        {/* Compact Node */}
        <div
          className={`relative w-16 h-16 rounded-full
                                ${customStyles?.compactClass || nodeStyles.borderColor} 
                                ${customStyles?.compactClass || nodeStyles.backgroundColor}
                                ${selected ? "ring-2 ring-primary ring-offset-2 dark:ring-offset-background" : ""}
                                ${dragging ? "shadow-2xl scale-110" : "shadow-lg hover:shadow-xl"}
                                ${!isActive ? "opacity-60" : ""}
                                transition-all duration-200
                                border-2
                                ${selected ? "z-10" : ""}
                                flex items-center justify-center
                                group
                                cursor-pointer
                            `}
          onDoubleClick={handleDoubleClick}
        >
          {/* Icon */}
          {CompactContent ? (
            <CompactContent />
          ) : (
            <DynamicIcon
              name={nodeDefinition?.icon || nodeConfig.icon?.name}
              color={nodeDefinition?.color}
              size={4}
            />
          )}

          {/* Truncated name on hover */}
          <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
            <div className="bg-popover text-popover-foreground text-[9px] px-2 py-1 rounded shadow-lg border border-border whitespace-nowrap max-w-48 truncate">
              {nodeData?.step_name || displayText}
            </div>
          </div>

          {/* Compact handles positioned around the circle */}
          <NodeHandles
            nodeData={effectiveNodeData}
            isValidConnection={isValidConnection}
            compact={true}
            showOptional={Boolean(data.showOptionalInputs)}
          />
        </div>

        {/* Settings Modal */}
        {SettingsComponent && (
          <SettingsComponent
            nodeId={nodeId}
            isOpen={isSettingsOpen}
            onOpenChange={setIsSettingsOpen}
          />
        )}
      </div>
    );
  }

  // Detailed mode rendering
  return (
    <div ref={nodeRef}>
      {/* Built-in Toolbar */}
      <BaseNodeToolbar
        nodeId={nodeId}
        isVisible={selected}
        isCompact={false}
        displayMode={displayMode}
        positionAbsoluteX={positionAbsoluteX}
        positionAbsoluteY={positionAbsoluteY}
        onSettings={handleSettings}
        onDuplicate={onDuplicate ? handleDuplicate : undefined}
        onDelete={handleDelete}
        onDisplayModeToggle={handleDisplayModeToggle}
        additionalActions={additionalActions}
        useWorkflowActions={useWorkflowActions}
      />

      {/* Main Node Card */}
      <Card
        className={`
                  min-w-[200px] max-w-[300px] 
                  ${customStyles?.cardClass || `${nodeStyles.borderColor} ${nodeStyles.backgroundColor}`}
                  ${selected ? "ring-2 ring-primary ring-offset-2 dark:ring-offset-background" : ""}
                  ${dragging ? "shadow-2xl scale-105" : "shadow-lg hover:shadow-xl"}
                  ${!isActive ? "opacity-70" : ""}
                  transition-all duration-200
                  border-2
                  ${selected ? "z-10" : ""}
                  group
                  cursor-pointer
                `}
        onDoubleClick={handleDoubleClick}
      >
        <CardHeader
          className={`pb-2 relative border-b border-border ${customStyles?.headerClass || ""}`}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-1 flex-1 min-w-0">
              <DynamicIcon
                name={nodeDefinition?.icon || nodeConfig.icon?.name}
                color={nodeDefinition?.color}
                size={4}
                className="flex-shrink-0"
              />
              <span
                className={`font-medium text-[10px] tracking-wide ${getTextColorClass(nodeDefinition?.color)} subpixel-antialiased break-words hyphens-auto leading-tight`}
              >
                {nodeData?.step_name || displayText}
              </span>
            </div>
          </div>
        </CardHeader>

        <CardContent
          className={`pt-2 relative ${customStyles?.contentClass || ""}`}
        >
          {/* Middle section with minimum height */}
          <div className="min-h-[80px] flex flex-col">
            {/* Handles Component */}
            <NodeHandles
              nodeData={effectiveNodeData}
              isValidConnection={isValidConnection}
              compact={false}
              showOptional={Boolean(data.showOptionalInputs)}
            />

            {/* Custom detailed content - should only be used for additional info, not handles */}
            {DetailedContent && <DetailedContent />}
          </div>

          {/* Status indicators */}
          <div
            className={`flex items-center justify-between mt-2 pt-1 border-t border-border ${customStyles?.footerClass || ""}`}
          >
            {/* Toggle Switches */}
            <div className="flex flex-col gap-1">
              {/* Active Toggle Switch */}
              <div className="flex items-center gap-0.5">
                <span className="text-[8px] text-muted-foreground leading-none">
                  Active
                </span>
                <Switch
                  checked={isActive}
                  onCheckedChange={handleActiveToggle}
                  className="h-2.5 w-5 border data-[state=checked]:bg-green-500 dark:data-[state=checked]:bg-green-600 [&>*]:h-2 [&>*]:w-2 [&>*]:data-[state=checked]:translate-x-2.5"
                />
              </div>

              {/* Show Optional Toggle Switch */}
              <div className="flex items-center gap-0.5">
                <span className="text-[8px] text-muted-foreground leading-none">
                  Show Optional
                </span>
                <Switch
                  checked={Boolean(data.showOptionalInputs)}
                  onCheckedChange={handleShowOptionalToggle}
                  className="h-2.5 w-5 border data-[state=checked]:bg-blue-500 dark:data-[state=checked]:bg-blue-600 [&>*]:h-2 [&>*]:w-2 [&>*]:data-[state=checked]:translate-x-2.5"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Execution Required Icon - Always visible */}
              {React.createElement(getExecutionRequiredIcon(), {
                className: `${NODE_ICON_SIZES.small} ${getExecutionRequiredIconStyle(nodeData?.execution_required)}`,
              })}

              {/* Status Icon - Always visible */}
              {React.createElement(getStatusIcon(nodeStatus), {
                className: `${NODE_ICON_SIZES.small} ${getStatusIconStyle(nodeStatus)} ${
                  nodeStatus === "executing" ? "animate-spin" : ""
                }`,
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Settings Modal */}
      {SettingsComponent && (
        <SettingsComponent
          nodeId={nodeId}
          isOpen={isSettingsOpen}
          onOpenChange={setIsSettingsOpen}
        />
      )}
    </div>
  );
};

export const BaseNode = memo(BaseNodeComponent);
