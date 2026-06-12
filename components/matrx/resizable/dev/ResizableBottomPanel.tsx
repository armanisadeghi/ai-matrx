"use client";

import React from "react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/matrx/resizable";
import { Button } from "@/components/ui/button";
import { ChevronUp, ChevronDown, Maximize2, Minimize2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { type Layout } from "react-resizable-panels";
import { pct } from "@/components/matrx/resizable/pct";

const SPACER_ID = "dev-bottom-spacer";
const CONTENT_ID = "dev-bottom-content";

interface ResizableBottomPanelProps {
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

const ResizableBottomPanel: React.FC<ResizableBottomPanelProps> = ({
  className = "",
  defaultExpanded = false,
  isExpanded: controlledExpanded,
  onExpandedChange,
  defaultSize = 50,
  minSize = 5,
  maxSize = 95,
  header,
  children,
  expandButtonProps = {
    label: "Expand Panel",
    className: "fixed bottom-4 right-4",
  },
}) => {
  const [localExpanded, setLocalExpanded] = React.useState(defaultExpanded);
  const [isFullScreen, setIsFullScreen] = React.useState(false);
  const [lastSize, setLastSize] = React.useState(defaultSize);
  const [preFullScreenSize, setPreFullScreenSize] = React.useState<
    number | null
  >(null);
  const isExpanded = controlledExpanded ?? localExpanded;

  const handleToggle = () => {
    const newValue = !isExpanded;
    setLocalExpanded(newValue);
    onExpandedChange?.(newValue);
  };

  const handleFullScreenToggle = () => {
    setIsFullScreen((prev) => {
      if (!prev) {
        setPreFullScreenSize(lastSize);
      } else {
        if (preFullScreenSize !== null) {
          setLastSize(preFullScreenSize);
        }
      }
      return !prev;
    });
  };

  const handlePanelResize = (layout: Layout) => {
    const v = layout[CONTENT_ID];
    if (!isFullScreen && v != null && v >= minSize && v <= maxSize) {
      setLastSize(v);
    }
  };

  const getPanelSizes = () => {
    if (isFullScreen) {
      return {
        topPanel: {
          defaultSize: pct(0),
          minSize: pct(0),
          maxSize: pct(0),
        },
        bottomPanel: {
          defaultSize: pct(100),
          minSize: pct(100),
          maxSize: pct(100),
        },
      };
    }

    const currentSize = preFullScreenSize ?? lastSize;

    return {
      topPanel: {
        defaultSize: pct(100 - currentSize),
        minSize: pct(100 - maxSize),
        maxSize: pct(100 - minSize),
      },
      bottomPanel: {
        defaultSize: pct(currentSize),
        minSize: pct(minSize),
        maxSize: pct(maxSize),
      },
    };
  };

  if (!isExpanded) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <Button
          variant="outline"
          size="sm"
          onClick={handleToggle}
          className="bg-background border shadow-md h-6 px-2 py-1 text-xs"
        >
          <ChevronUp className="h-3 w-3 mr-1" />
          {expandButtonProps.label}
        </Button>
      </div>
    );
  }

  const panelSizes = getPanelSizes();

  return (
    <div
      className={cn("fixed inset-x-0 bottom-0 z-[100]", className)}
      style={{
        height: "100dvh",
        willChange: "transform",
        isolation: "isolate",
      }}
    >
      <ResizablePanelGroup
        orientation="vertical"
        className="h-full min-h-0"
        onLayoutChanged={handlePanelResize}
        style={{
          touchAction: "none",
          userSelect: "none",
        }}
      >
        <ResizablePanel
          id={SPACER_ID}
          {...panelSizes.topPanel}
          style={{ visibility: isFullScreen ? "hidden" : "visible" }}
        >
          <div className="h-full" />
        </ResizablePanel>

        <ResizableHandle
          withHandle
          size="lg"
          style={{ visibility: isFullScreen ? "hidden" : "visible" }}
          className="hover:cursor-row-resize active:cursor-row-resize"
        />

        <ResizablePanel id={CONTENT_ID} {...panelSizes.bottomPanel}>
          <Card
            className="h-full border-t shadow-lg"
            style={{
              touchAction: "pan-y",
              transform: "translate3d(0,0,0)",
            }}
          >
            <div
              className="border-b p-3 flex items-center justify-between bg-background sticky top-0"
              style={{ zIndex: 10 }}
            >
              <div className="flex-1">{header}</div>
              <div className="flex gap-2">
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleToggle}
                  className="h-6 px-2"
                >
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <div
              className="overflow-auto"
              style={{
                height: "calc(100% - 48px)",
                touchAction: "pan-y",
              }}
            >
              {children}
            </div>
          </Card>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

export default ResizableBottomPanel;
