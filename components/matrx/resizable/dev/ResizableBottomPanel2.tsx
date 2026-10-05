"use client";

import React from "react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { ChevronUp, ChevronDown, Maximize2, Minimize2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { pct } from "@/components/matrx/resizable/pct";

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

const ResizableBottomPanel2: React.FC<ResizableBottomPanelProps> = ({
  className = "",
  defaultExpanded = false,
  isExpanded: controlledExpanded,
  onExpandedChange,
  defaultSize = 25,
  minSize = 10,
  maxSize = 90,
  header,
  children,
  expandButtonProps = {
    label: "Expand Panel",
    className: "fixed bottom-4 right-4",
  },
}) => {
  const [localExpanded, setLocalExpanded] = React.useState(defaultExpanded);
  const [isFullScreen, setIsFullScreen] = React.useState(false);
  const isExpanded = controlledExpanded ?? localExpanded;

  const handleToggle = () => {
    const newValue = !isExpanded;
    setLocalExpanded(newValue);
    onExpandedChange?.(newValue);
  };

  const handleFullScreenToggle = () => {
    setIsFullScreen(!isFullScreen);
  };

  if (!isExpanded) {
    return (
      <Button
        icon={<ChevronUp />}
        variant="outline"
        onClick={handleToggle}
        className={cn("z-50", expandButtonProps.className)}
      >
        {expandButtonProps.label}
      </Button>
    );
  }

  const containerStyles = isFullScreen
    ? "fixed inset-0 z-50"
    : "fixed bottom-0 left-0 right-0 z-50";

  return (
    <div className={cn(containerStyles, "pointer-events-none", className)}>
      <div
        className={cn(
          "pointer-events-auto min-h-0",
          isFullScreen ? "h-dvh" : "h-[50dvh]",
        )}
      >
        <ResizablePanelGroup orientation="vertical" className="h-full min-h-0">
          {!isFullScreen && (
            <>
              <ResizablePanel
                defaultSize={pct(100 - defaultSize)}
                minSize={pct(100 - maxSize)}
                maxSize={pct(100 - minSize)}
              >
                <div className="h-full pointer-events-none" />
              </ResizablePanel>
              <ResizableHandle withHandle />
            </>
          )}
          <ResizablePanel
            defaultSize={pct(isFullScreen ? 100 : defaultSize)}
            minSize={pct(isFullScreen ? 100 : minSize)}
            maxSize={pct(isFullScreen ? 100 : maxSize)}
          >
            <Card className="h-full border-t shadow-lg overflow-hidden">
              <div className="border-b p-3 flex items-center justify-between bg-background sticky top-0">
                <div className="flex-1">{header}</div>
                <div className="flex gap-2">
                  <Button
                    variant="quiet"
                    onClick={handleFullScreenToggle}
                  >
                    {isFullScreen ? (
                      <Minimize2 className="h-3 w-3" />
                    ) : (
                      <Maximize2 className="h-3 w-3" />
                    )}
                  </Button>
                  <Button
                    variant="quiet"
                    onClick={handleToggle}
                  >
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div className="overflow-auto h-[calc(100%-3.75rem)]">
                {children}
              </div>
            </Card>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
};

export default ResizableBottomPanel2;
