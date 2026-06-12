"use client";

import React, { useState, useRef, useEffect } from "react";
import { Bug, ChevronRight, X } from "lucide-react";
import { SystemPromptDebugModal } from "./SystemPromptDebugModal";
import type { DebugData } from "./SystemPromptDebugModal";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

interface DebugIndicatorProps {
  debugData: DebugData | null;
  onClose: () => void;
}

type IndicatorSize = "small" | "large";

interface Position {
  x: number;
  y: number;
}

export const DebugIndicator: React.FC<DebugIndicatorProps> = ({
  debugData,
  onClose,
}) => {
  const [size, setSize] = useState<IndicatorSize>("small");
  const [position, setPosition] = useState<Position>({ x: 50, y: 45 }); // Below admin indicator
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<Position>({ x: 0, y: 0 });
  const indicatorRef = useRef<HTMLDivElement>(null);

  // Drag handling
  const handleMouseDown = (e: React.MouseEvent) => {
    // Don't drag if clicking on buttons or interactive elements
    const target = e.target as HTMLElement;
    if (target.tagName === "BUTTON" || target.closest("button")) {
      return;
    }

    e.stopPropagation();
    if (indicatorRef.current) {
      const rect = indicatorRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
      setIsDragging(true);
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    } else {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  // Small indicator
  if (size === "small") {
    return (
      <div
        ref={indicatorRef}
        style={{
          position: "fixed",
          left: `${position.x}px`,
          top: `${position.y}px`,
          zIndex: 9999,
          userSelect: "none",
          cursor: isDragging ? "grabbing" : "move",
          transition: isDragging ? "none" : "all 0.2s ease",
          filter: "drop-shadow(0 4px 8px rgba(0, 0, 0, 0.25))",
        }}
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-600 text-white shadow-lg">
          <Bug size={14} />
          <span className="text-xs font-semibold">DEBUG</span>

          {/* Expand button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSize("large");
            }}
            className="p-0 rounded hover:bg-amber-700"
            title="Expand debug info"
          >
            <ChevronRight size={12} />
          </button>

          {/* Close button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="p-0 rounded hover:bg-amber-700"
            title="Close debug indicator"
          >
            <X size={12} />
          </button>
        </div>
      </div>
    );
  }

  // Large indicator - full modal content
  return (
    <div
      ref={indicatorRef}
      style={{
        position: "fixed",
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 9999,
        userSelect: "none",
        transition: isDragging ? "none" : "all 0.2s ease",
      }}
    >
      <Card className="w-[600px] max-h-[80dvh] shadow-2xl">
        {/* Header - draggable */}
        <div
          className="flex items-center justify-between p-3 border-b cursor-move bg-muted/50"
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-2">
            <Bug className="h-5 w-5 text-amber-600" />
            <h3 className="font-semibold">
              Debug: {debugData?.promptName || "Unknown"}
            </h3>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSize("small")}
              className="p-1 rounded hover:bg-muted"
              title="Minimize"
            >
              <ChevronRight size={16} className="rotate-180" />
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-destructive/20"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content - scrollable */}
        <ScrollArea className="max-h-[calc(80dvh-60px)]">
          <div className="p-4 space-y-4">
            {debugData ? (
              <>
                {/* Selected Text */}
                {debugData.selectedText && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                      Selected Text
                      <Badge variant="secondary">
                        {debugData.selectedText.length} chars
                      </Badge>
                    </h4>
                    <div className="bg-muted p-3 rounded-lg text-sm font-mono whitespace-pre-wrap max-h-24 overflow-y-auto">
                      {debugData.selectedText}
                    </div>
                  </div>
                )}

                {/* Available Context */}
                <div>
                  <h4 className="text-sm font-semibold mb-2">
                    Available Context
                  </h4>
                  <div className="bg-muted p-3 rounded-lg">
                    <pre className="text-xs font-mono overflow-x-auto">
                      {JSON.stringify(debugData.availableContext, null, 2)}
                    </pre>
                  </div>
                </div>

                {/* Resolved Variables */}
                <div>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    Resolved Variables
                    <Badge>
                      {Object.keys(debugData.resolvedVariables).length}{" "}
                      variables
                    </Badge>
                  </h4>
                  <div className="space-y-2">
                    {Object.entries(debugData.resolvedVariables).map(
                      ([key, value]) => (
                        <div key={key} className="border rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <code className="text-sm font-semibold text-primary">
                              {"{{" + key + "}}"}
                            </code>
                            <Badge variant="outline" className="text-xs">
                              {typeof value === "string"
                                ? `${value.length} chars`
                                : typeof value}
                            </Badge>
                          </div>
                          <div className="bg-muted p-2 rounded text-xs font-mono max-h-24 overflow-y-auto whitespace-pre-wrap">
                            {typeof value === "string"
                              ? value
                              : JSON.stringify(value, null, 2)}
                          </div>
                        </div>
                      ),
                    )}
                    {Object.keys(debugData.resolvedVariables).length === 0 && (
                      <div className="text-sm text-muted-foreground italic">
                        No variables resolved
                      </div>
                    )}
                  </div>
                </div>

                {/* Metadata */}
                {debugData.metadata && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Metadata</h4>
                    <div className="bg-muted p-3 rounded-lg">
                      <pre className="text-xs font-mono overflow-x-auto">
                        {JSON.stringify(debugData.metadata, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-sm text-muted-foreground italic">
                No debug data available
              </div>
            )}
          </div>
        </ScrollArea>
      </Card>
    </div>
  );
};
