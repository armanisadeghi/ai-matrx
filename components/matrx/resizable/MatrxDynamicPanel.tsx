"use client";

import React from "react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/matrx/resizable";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Maximize2,
  Minimize2,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Move,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  type GroupImperativeHandle,
  type Layout,
} from "react-resizable-panels";
import { useIsMobile } from "@/hooks/use-mobile";
import type { CSSProperties } from "react";

type PanelPosition = "left" | "right" | "top" | "bottom";

interface PositionControlProps {
  position: PanelPosition;
  onPositionChange: (newPosition: PanelPosition) => void;
  isVertical: boolean;
}

const PositionControl: React.FC<PositionControlProps> = ({
  position,
  onPositionChange,
}) => {
  const positionIcons = {
    left: ArrowLeft,
    right: ArrowRight,
    top: ArrowUp,
    bottom: ArrowDown,
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 px-2">
              <Move className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="z-[200]" sideOffset={8}>
            {(Object.keys(positionIcons) as PanelPosition[]).map((pos) => {
              const Icon = positionIcons[pos];
              return (
                <DropdownMenuItem
                  key={pos}
                  onClick={() => onPositionChange(pos)}
                  className={cn("gap-2", position === pos && "bg-accent")}
                >
                  <Icon className="h-3 w-3" />
                  <span className="capitalize">{pos}</span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </TooltipTrigger>
      <TooltipContent>Change panel position</TooltipContent>
    </Tooltip>
  );
};

interface MatrxDynamicPanelProps {
  initialPosition?: PanelPosition;
  className?: string;
  defaultExpanded?: boolean;
  isExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  defaultSize?: number;
  minSize?: number;
  maxSize?: number;
  header?: React.ReactNode;
  children: React.ReactNode;
  expandButtonProps?: {
    label?: string;
    className?: string;
  };
}

const MatrxDynamicPanel: React.FC<MatrxDynamicPanelProps> = ({
  initialPosition = "right",
  className = "",
  defaultExpanded = false,
  isExpanded: controlledExpanded,
  onExpandedChange,
  defaultSize = 15,
  minSize = 1,
  maxSize = 100,
  header,
  children,
  expandButtonProps = {
    label: "Expand Panel",
    className: undefined,
  },
}) => {
  const [localExpanded, setLocalExpanded] = React.useState(defaultExpanded);
  const [isFullScreen, setIsFullScreen] = React.useState(false);
  const [lastSize, setLastSize] = React.useState(defaultSize);
  const [preFullScreenSize, setPreFullScreenSize] = React.useState<
    number | null
  >(defaultSize);
  const [currentPosition, setCurrentPosition] =
    React.useState<PanelPosition>(initialPosition);
  const isExpanded = controlledExpanded ?? localExpanded;
  const isMobile = useIsMobile();

  const panelGroupRef = React.useRef<GroupImperativeHandle | null>(null);
  const isVertical = currentPosition === "top" || currentPosition === "bottom";
  const isStartPosition =
    currentPosition === "left" || currentPosition === "top";

  React.useEffect(() => {
    setCurrentPosition(initialPosition);
  }, [initialPosition]);

  const handlePositionChange = (newPosition: PanelPosition) => {
    setCurrentPosition(newPosition);
  };

  const handleToggle = () => {
    const newValue = !isExpanded;
    setLocalExpanded(newValue);
    onExpandedChange?.(newValue);
  };

  const handleFullScreenToggle = () => {
    setIsFullScreen((prev) => {
      if (!prev) {
        setPreFullScreenSize(lastSize);
        return true;
      }
      return false;
    });
  };

  const handlePanelResize = (layout: Layout) => {
    const contentSize = layout["dynamic-content"];
    if (
      contentSize != null &&
      contentSize >= minSize &&
      contentSize <= maxSize
    ) {
      setLastSize(contentSize);
    }
  };

  const getPanelSizes = () => {
    // Mobile is always full screen when expanded
    // v4: numeric values = pixels, strings = percentages
    if (isFullScreen || isMobile) {
      return {
        contentPanel: {
          defaultSize: "100%",
          minSize: "100%",
          maxSize: "100%",
        },
        spacerPanel: {
          defaultSize: "0%",
          minSize: "0%",
          maxSize: "0%",
        },
      };
    }

    const currentSize = preFullScreenSize ?? lastSize;

    return {
      contentPanel: {
        defaultSize: `${currentSize}%`,
        minSize: `${minSize}%`,
        maxSize: `${maxSize}%`,
      },
      spacerPanel: {
        defaultSize: `${100 - currentSize}%`,
        minSize: `${100 - maxSize}%`,
        maxSize: `${100 - minSize}%`,
      },
    };
  };

  const handleStyles = (
    isVertical: boolean,
    isFullScreen: boolean,
  ): CSSProperties => ({
    visibility:
      isFullScreen || isMobile ? ("hidden" as const) : ("visible" as const),
    ...(isVertical
      ? {
          width: "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }
      : {}),
  });

  const getPositionStyles = () => {
    // Mobile: full screen panels, desktop: resizable panels
    const positionMap = {
      left: {
        container: isMobile ? "fixed inset-0" : "fixed inset-y-0 left-0",
        dimensions: isMobile
          ? { width: "100dvw", height: "100dvh" }
          : { width: "100dvw" },
        button: "left-4 top-[calc(var(--header-height)+1rem)]",
        panel: "left-0",
        border: "border-r",
        chevron: {
          collapsed: ChevronRight,
          expanded: ChevronLeft,
        },
      },
      right: {
        container: isMobile ? "fixed inset-0" : "fixed inset-y-0 right-0",
        dimensions: isMobile
          ? { width: "100dvw", height: "100dvh" }
          : { width: "100dvw" },
        button: "right-4 top-[calc(var(--header-height)+1rem)]",
        panel: "right-0",
        border: "border-l",
        chevron: {
          collapsed: ChevronLeft,
          expanded: ChevronRight,
        },
      },
      top: {
        container: isMobile ? "fixed inset-0" : "fixed inset-x-0 top-0",
        dimensions: isMobile
          ? { width: "100dvw", height: "100dvh" }
          : { height: "100dvh" },
        button: "top-[calc(var(--header-height)+1rem)] left-4",
        panel: "top-0",
        border: "border-b",
        chevron: {
          collapsed: ChevronDown,
          expanded: ChevronUp,
        },
      },
      bottom: {
        container: isMobile ? "fixed inset-0" : "fixed inset-x-0 bottom-0",
        dimensions: isMobile
          ? { width: "100dvw", height: "100dvh" }
          : { height: "100dvh" },
        button: cn("bottom-4 right-4", isMobile && "pb-safe"),
        panel: "bottom-0",
        border: "border-t",
        chevron: {
          collapsed: ChevronUp,
          expanded: ChevronDown,
        },
      },
    };

    return positionMap[currentPosition];
  };

  if (!isExpanded) {
    const styles = getPositionStyles();
    const ChevronIcon = styles.chevron.collapsed;

    return (
      <div
        className={cn(
          `fixed ${styles.button} z-50`,
          expandButtonProps.className,
        )}
      >
        <Button
          variant="outline"
          size="sm"
          onClick={handleToggle}
          className="bg-background border shadow-md h-6 px-2 py-1 text-xs"
        >
          <ChevronIcon className="h-3 w-3 mr-1" />
          {expandButtonProps.label}
        </Button>
      </div>
    );
  }

  const panelSizes = getPanelSizes();
  const styles = getPositionStyles();
  const ChevronIcon = styles.chevron.expanded;

  const panels = [
    <ResizablePanel
      key="spacer"
      id="dynamic-spacer"
      {...panelSizes.spacerPanel}
      style={{
        visibility: isFullScreen || isMobile ? "hidden" : "visible",
        touchAction: "none",
        pointerEvents: "none",
      }}
    >
      <div className="h-full" />
    </ResizablePanel>,

    <ResizableHandle
      key="handle"
      withHandle
      size="lg"
      style={handleStyles(isVertical, isFullScreen)}
      className={cn(
        isVertical
          ? "hover:cursor-row-resize active:cursor-row-resize"
          : "hover:cursor-col-resize active:cursor-col-resize",
      )}
    />,

    <ResizablePanel
      key="content"
      id="dynamic-content"
      {...panelSizes.contentPanel}
    >
      <Card
        className={cn(
          "shadow-lg",
          styles.border,
          isMobile ? "h-dvh" : "h-full",
          isMobile && currentPosition === "bottom" && "pb-safe",
        )}
        style={{
          touchAction: "pan-y",
          transform: "translate3d(0,0,0)",
          pointerEvents: "auto",
        }}
      >
        <div
          className={cn(
            "border-b px-3 py-2 flex items-center bg-background sticky top-0 scrollbar-none",
            isVertical ? "justify-between" : "flex-wrap gap-0",
            isMobile && "pt-[calc(var(--header-height)+0.75rem)]",
          )}
          style={{ zIndex: 10 }}
        >
          <div className={isVertical ? "flex-1" : "flex-1 min-w-[200px]"}>
            {header}
          </div>
          <TooltipProvider delayDuration={200}>
            <div className="flex flex-shrink-0">
              {!isMobile && (
                <>
                  <PositionControl
                    position={currentPosition}
                    onPositionChange={handlePositionChange}
                    isVertical={isVertical}
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleFullScreenToggle}
                        className="h-6 px-2"
                      >
                        {isFullScreen ? (
                          <Minimize2 className="h-3 w-3" />
                        ) : (
                          <Maximize2 className="h-3 w-3" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {isFullScreen ? "Exit full screen" : "Enter full screen"}
                    </TooltipContent>
                  </Tooltip>
                </>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleToggle}
                    className="h-6 px-2"
                  >
                    <ChevronIcon className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Collapse panel</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
        <div
          className={cn(
            "overflow-auto scrollbar-none",
            isMobile && currentPosition === "bottom" && "pb-safe",
          )}
          style={{
            height: isMobile
              ? "calc(100dvh - var(--header-height) - 48px)"
              : "calc(100% - 48px)",
            touchAction: "pan-y",
          }}
        >
          {children}
        </div>
      </Card>
    </ResizablePanel>,
  ];

  return (
    <div
      className={cn(styles.container, "z-[100]", className)}
      style={{
        ...styles.dimensions,
        willChange: "transform",
        isolation: "isolate",
        pointerEvents: "none",
      }}
    >
      <ResizablePanelGroup
        groupRef={panelGroupRef}
        orientation={isVertical ? "vertical" : "horizontal"}
        className="h-full"
        onLayoutChanged={handlePanelResize}
        style={{
          touchAction: "none",
          userSelect: "none",
        }}
      >
        {isStartPosition ? panels.reverse() : panels}
      </ResizablePanelGroup>
    </div>
  );
};

export default MatrxDynamicPanel;
