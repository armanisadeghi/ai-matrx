"use client";

import React, { useState, useEffect } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";
import {
  Save,
  Copy,
  ChevronDown,
  ChevronRight,
  Minimize2,
  Maximize2,
  RotateCcw,
  Check,
  Grid,
  Rows,
  Columns,
  Maximize,
  Box,
  LayoutGrid,
  MaximizeIcon,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EnhancedEditableJsonViewer } from "@/components/ui/JsonComponents/JsonEditor";
import { EnhancedJsonViewer } from "@/components/ui/JsonComponents/JsonViewerComponent";
import {
  JsonComponentConfig,
  JsonMetrics,
  LayoutControlsProps,
  MinimizedPosition,
  LayoutType,
} from "./types";

export const createJsonComponent = (
  config: Omit<JsonComponentConfig, "id"> & { id?: string },
): JsonComponentConfig => {
  return {
    id: config.id || crypto.randomUUID(),
    allowMinimize: true,
    readOnly: false,
    initialLayout: "expanded",
    ...config,
  };
};

const LayoutControls: React.FC<LayoutControlsProps> = ({
  layout,
  onLayoutChange,
  minimizedPosition,
  onPositionChange,
  showControls,
  onShowControlsChange,
}) => {
  return (
    <div className="flex items-center gap-2 mb-4 p-2 bg-muted/30 rounded-lg">
      <Select value={layout} onValueChange={onLayoutChange as any}>
        <SelectTrigger className="w-32">
          <SelectValue placeholder="Select layout" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="autoGrid">
            <div className="flex items-center gap-2">
              <LayoutGrid className="h-4 w-4" />
              Auto Grid
            </div>
          </SelectItem>
          <SelectItem value="grid">
            <div className="flex items-center gap-2">
              <Grid className="h-4 w-4" />
              Grid
            </div>
          </SelectItem>
          <SelectItem value="rows">
            <div className="flex items-center gap-2">
              <Rows className="h-4 w-4" />
              Rows
            </div>
          </SelectItem>
          <SelectItem value="columns">
            <div className="flex items-center gap-2">
              <Columns className="h-4 w-4" />
              Columns
            </div>
          </SelectItem>
        </SelectContent>
      </Select>

      <Select value={minimizedPosition} onValueChange={onPositionChange as any}>
        <SelectTrigger className="w-32">
          <SelectValue placeholder="Minimized position" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="top">Top</SelectItem>
          <SelectItem value="bottom">Bottom</SelectItem>
          <SelectItem value="left">Left</SelectItem>
          <SelectItem value="right">Right</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};

const safeCalculateJsonMetrics = (data: object | string): JsonMetrics => {
  try {
    const stringified = typeof data === "string" ? data : JSON.stringify(data);
    const parsed = typeof data === "string" ? JSON.parse(data) : data;

    const countKeys = (obj: any): number => {
      if (!obj || typeof obj !== "object") return 0;
      return Object.keys(obj).reduce(
        (acc, key) => acc + 1 + countKeys(obj[key]),
        0,
      );
    };

    const getDepth = (obj: any): number => {
      if (!obj || typeof obj !== "object") return 0;
      return 1 + Math.max(0, ...Object.values(obj).map(getDepth));
    };

    const formatSize = (str: string): string => {
      const bytes = new Blob([str]).size;
      return bytes < 1024 ? `${bytes}B` : `${(bytes / 1024).toFixed(1)}KB`;
    };

    return {
      keys: countKeys(parsed),
      depth: getDepth(parsed),
      size: formatSize(stringified),
    };
  } catch (error) {
    console.warn("Error calculating metrics:", error);
    return {
      keys: 0,
      depth: 0,
      size: "0B",
    };
  }
};

// Enhanced Component Item
interface ComponentItemProps {
  component: JsonComponentConfig;
  isMinimized: boolean;
  onMinimizeChange: (minimized: boolean) => void;
  isExpanded?: boolean;
  onExpandChange?: (expanded: boolean) => void;
  metrics: JsonMetrics;
}

const ComponentItem: React.FC<ComponentItemProps> = ({
  component,
  isMinimized,
  onMinimizeChange,
  isExpanded,
  onExpandChange,
  metrics,
}) => {
  const renderMetrics = () => {
    if (!metrics) {
      return (
        <div className="text-xs text-muted-foreground">Loading metrics...</div>
      );
    }

    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span title="Total Keys">{metrics?.keys ?? 0}k</span>
        <span title="Depth">{metrics?.depth ?? 0}d</span>
        <span title="Size">{metrics?.size ?? "0B"}</span>
      </div>
    );
  };

  const minimizedContent = (
    <motion.div
      key="minimized"
      className={cn(
        "flex items-center justify-between gap-2 bg-card rounded-lg px-3 py-2 shadow-sm border",
        component.type === "editor" && "border-primary/20",
      )}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="font-medium truncate">{component.title}</span>
        {renderMetrics()}
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onMinimizeChange(false)}
          className="h-6 w-6 p-0"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </motion.div>
  );

  const expandedContent = (
    <motion.div
      key="expanded"
      className={cn(
        "relative",
        isExpanded && "fixed inset-4 z-50 bg-background shadow-xl rounded-lg",
      )}
    >
      {isExpanded && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm rounded-lg" />
      )}
      <div className={cn("relative", isExpanded && "h-full flex flex-col")}>
        <div className="flex items-center justify-between p-3 border-b">
          <div className="flex items-center gap-2">
            <h3 className="font-medium">{component.title}</h3>
            {renderMetrics()}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onExpandChange?.(!isExpanded)}
              className="h-7 w-7 p-0"
            >
              {isExpanded ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <MaximizeIcon className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onMinimizeChange(true)}
              className="h-7 w-7 p-0"
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className={cn("p-3", isExpanded && "flex-1 overflow-auto")}>
          {component.type === "editor" ? (
            <EnhancedEditableJsonViewer
              data={component.data}
              onChange={component.onChange}
              onSave={component.onSave}
              readOnly={component.readOnly}
              hideHeader={true} // Add this
              title={component.title} // Add this
            />
          ) : (
            <EnhancedJsonViewer
              data={component.data}
              hideHeader={true} // Add this
              title={component.title} // Add this
            />
          )}
        </div>
      </div>
    </motion.div>
  );

  return (
    <AnimatePresence mode="wait">
      {isMinimized ? minimizedContent : expandedContent}
    </AnimatePresence>
  );
};

// Main Group Component
interface UniversalJsonGroupProps {
  components: JsonComponentConfig[];
  layout?: LayoutType;
  minimizedPosition?: MinimizedPosition;
  className?: string;
  gridMinWidth?: string;
  compact?: boolean;
  showControls?: boolean;
}

export const UniversalJsonGroup: React.FC<UniversalJsonGroupProps> = ({
  components: initialComponents,
  layout: initialLayout = "autoGrid",
  minimizedPosition: initialPosition = "top",
  className,
  gridMinWidth = "350px",
  compact = false,
  showControls: initialShowControls = true,
}) => {
  const [components, setComponents] = useState(initialComponents);
  const [layout, setLayout] = useState<LayoutType>(initialLayout);
  const [minimizedPosition, setMinimizedPosition] =
    useState<MinimizedPosition>(initialPosition);
  const [minimizedStates, setMinimizedStates] = useState<
    Record<string, boolean>
  >({});
  const [expandedStates, setExpandedStates] = useState<Record<string, boolean>>(
    {},
  );
  const [showControls, setShowControls] = useState(initialShowControls);
  const [metrics, setMetrics] = useState<Record<string, JsonMetrics>>({});

  useEffect(() => {
    const newMetrics = components.reduce((acc, component) => {
      try {
        const componentMetrics = component.data
          ? safeCalculateJsonMetrics(component.data)
          : null;
        return {
          ...acc,
          [component.id]: componentMetrics,
        };
      } catch (error) {
        console.warn(
          `Error calculating metrics for component ${component.id}:`,
          error,
        );
        return acc;
      }
    }, {});
    setMetrics(newMetrics);
  }, [components]);

  const handleDragEnd = (result: any) => {
    if (!result.destination) return;

    const items = Array.from(components);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setComponents(items);
  };

  const handleMinimizeChange = (id: string, isMinimized: boolean) => {
    setMinimizedStates((prev) => ({
      ...prev,
      [id]: isMinimized,
    }));
  };

  const handleExpandChange = (id: string, expanded: boolean) => {
    setExpandedStates((prev) => ({
      ...prev,
      [id]: expanded,
    }));
  };

  const getLayoutClassName = () => {
    const baseClasses = {
      grid: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
      autoGrid: "grid",
      rows: "flex flex-col",
      columns: "flex flex-row flex-wrap",
    };

    const gapSize = compact ? "gap-2" : "gap-4";
    return cn(baseClasses[layout], gapSize);
  };

  return (
    <div className={cn("space-y-4", className)}>
      {showControls && (
        <LayoutControls
          layout={layout}
          onLayoutChange={setLayout}
          minimizedPosition={minimizedPosition}
          onPositionChange={setMinimizedPosition}
          showControls={showControls}
          onShowControlsChange={setShowControls}
        />
      )}

      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable
          droppableId="components"
          direction={layout === "columns" ? "horizontal" : "vertical"}
        >
          {(provided) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className={getLayoutClassName()}
              style={
                layout === "autoGrid"
                  ? {
                      gridTemplateColumns: `repeat(auto-fill, minmax(${gridMinWidth}, 1fr))`,
                    }
                  : undefined
              }
            >
              {components.map((component, index) => (
                <Draggable
                  key={component.id}
                  draggableId={component.id}
                  index={index}
                >
                  {(provided) => {
                    const { style, ...draggableProps } =
                      provided.draggableProps;
                    return (
                      <div
                        ref={provided.innerRef}
                        {...draggableProps}
                        {...provided.dragHandleProps}
                        style={style as React.CSSProperties | undefined}
                      >
                        <ComponentItem
                          component={component}
                          isMinimized={minimizedStates[component.id]}
                          onMinimizeChange={(minimized) =>
                            handleMinimizeChange(component.id, minimized)
                          }
                          isExpanded={expandedStates[component.id]}
                          onExpandChange={(expanded) =>
                            handleExpandChange(component.id, expanded)
                          }
                          metrics={metrics[component.id]}
                        />
                      </div>
                    );
                  }}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
};

export default UniversalJsonGroup;
