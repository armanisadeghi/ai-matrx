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
import { pct } from "@/components/matrx/resizable/pct";

interface BasePanelProps {
  className?: string;
  header?: React.ReactNode;
  children: React.ReactNode;
  onClose: () => void;
  onFullScreen?: () => void;
}

interface ResizableBottomPanelProps extends BasePanelProps {
  defaultSize?: number;
  minSize?: number;
  maxSize?: number;
}

// Collapsed button component
const ExpandButton = ({
  onClick,
  label = "Expand Panel",
}: {
  onClick: () => void;
  label?: string;
}) => (
  <div className="fixed bottom-4 right-4 z-50">
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className="bg-background border shadow-md h-6 px-2 py-1 text-xs"
    >
      <ChevronUp className="h-3 w-3 mr-1" />
      {label}
    </Button>
  </div>
);

// Full screen version
export const FullScreenPanel: React.FC<BasePanelProps> = ({
  className = "",
  header,
  children,
  onClose,
}) => (
  <div className="fixed inset-0 z-50">
    <Card className="h-full border shadow-lg">
      <div className="border-b p-3 flex items-center justify-between bg-background sticky top-0">
        <div className="flex-1">{header}</div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-6 px-2"
          >
            <Minimize2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <div className="overflow-auto h-[calc(100%-48px)]">{children}</div>
    </Card>
  </div>
);

// Resizable bottom panel version
export const ResizableBottomPanel: React.FC<ResizableBottomPanelProps> = ({
  className = "",
  defaultSize = 40,
  minSize = 20,
  maxSize = 80,
  header,
  children,
  onClose,
  onFullScreen,
}) => (
  <div className="fixed inset-x-0 bottom-0 z-50 min-h-0">
    <ResizablePanelGroup
      orientation="vertical"
      className="h-[50dvh] min-h-0 w-full"
    >
      <ResizablePanel
        defaultSize={pct(100 - defaultSize)}
        minSize={pct(100 - maxSize)}
        maxSize={pct(100 - minSize)}
      >
        <div className="h-full" />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel
        defaultSize={pct(defaultSize)}
        minSize={pct(minSize)}
        maxSize={pct(maxSize)}
      >
        <Card className="h-full border-t shadow-lg">
          <div className="border-b p-3 flex items-center justify-between bg-background sticky top-0">
            <div className="flex-1">{header}</div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onFullScreen}
                className="h-6 px-2"
              >
                <Maximize2 className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="h-6 px-2"
              >
                <ChevronDown className="h-3 w-3" />
              </Button>
            </div>
          </div>
          <div className="overflow-auto h-[calc(100%-48px)]">{children}</div>
        </Card>
      </ResizablePanel>
    </ResizablePanelGroup>
  </div>
);

// Main wrapper component that handles the state
interface BottomPanelProps extends Omit<
  ResizableBottomPanelProps,
  "onClose" | "onFullScreen"
> {
  defaultExpanded?: boolean;
  expandButtonLabel?: string;
}

const BottomPanel: React.FC<BottomPanelProps> = ({
  defaultExpanded = false,
  expandButtonLabel = "Expand Panel",
  ...props
}) => {
  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded);
  const [isFullScreen, setIsFullScreen] = React.useState(false);

  if (!isExpanded) {
    return (
      <ExpandButton
        onClick={() => setIsExpanded(true)}
        label={expandButtonLabel}
      />
    );
  }

  if (isFullScreen) {
    return (
      <FullScreenPanel {...props} onClose={() => setIsFullScreen(false)} />
    );
  }

  return (
    <ResizableBottomPanel
      {...props}
      onClose={() => setIsExpanded(false)}
      onFullScreen={() => setIsFullScreen(true)}
    />
  );
};

export default BottomPanel;
