"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  Database,
  ChevronRight,
  Copy,
  Check,
  Eye,
  Loader2,
  ChevronDown,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectInstance } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { selectUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import { selectInstanceResources } from "@/features/agents/redux/execution-system/instance-resources/instance-resources.selectors";
import { selectResolvedVariables } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import { makeSelectAssembledRequest } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import type { AssembledAgentStartRequest } from "@/features/agents/types/request.types";

interface ResourceDebugIndicatorProps {
  /** Agent execution conversation id (legacy admin debug still stores this as `runId`). */
  conversationId: string;
  onClose: () => void;
}

type IndicatorSize = "small" | "large" | "preview";

interface Position {
  x: number;
  y: number;
}

function formatAssembledUserInput(
  userInput: AssembledAgentStartRequest["user_input"],
): string {
  if (userInput === undefined) return "";
  if (typeof userInput === "string") return userInput;
  try {
    return JSON.stringify(userInput, null, 2);
  } catch {
    return String(userInput);
  }
}

export const ResourceDebugIndicator: React.FC<ResourceDebugIndicatorProps> = ({
  conversationId,
  onClose,
}) => {
  const instance = useAppSelector((state) =>
    selectInstance(conversationId)(state),
  );
  const resources = useAppSelector(selectInstanceResources(conversationId));
  const chatInput = useAppSelector((state) =>
    selectUserInputText(conversationId)(state),
  );
  const variables = useAppSelector(selectResolvedVariables(conversationId));

  const assembledRequestSelector = useMemo(
    () => makeSelectAssembledRequest(conversationId),
    [conversationId],
  );
  const assembledRequest = useAppSelector(assembledRequestSelector);

  const [size, setSize] = useState<IndicatorSize>("small");
  const [position, setPosition] = useState<Position>({ x: 50, y: 85 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<Position>({ x: 0, y: 0 });
  const indicatorRef = useRef<HTMLDivElement>(null);

  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(
    new Set(),
  );
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [previewData, setPreviewData] = useState<{
    fullMessage: string;
    variables: Record<string, unknown>;
  } | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
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

  const toggleExpanded = (index: number) => {
    setExpandedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const copyToClipboard = async (data: unknown, index: number) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(resources, null, 2));
      setCopiedIndex(-1);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const generateMessagePreview = () => {
    if (!instance) {
      console.error("Instance not found");
      return;
    }

    setIsGeneratingPreview(true);
    try {
      setPreviewData({
        fullMessage:
          formatAssembledUserInput(assembledRequest?.user_input) || chatInput,
        variables,
      });
      setSize("preview");
    } catch (error) {
      console.error("Failed to generate preview:", error);
    } finally {
      setIsGeneratingPreview(false);
    }
  };

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
        <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-600 text-white shadow-lg">
          <Database size={14} />
          <span className="text-xs font-semibold">RESOURCES</span>
          <span className="text-[10px] bg-green-700 px-1 rounded">
            {resources.length}
          </span>

          <button
            onClick={(e) => {
              e.stopPropagation();
              setSize("large");
            }}
            className="p-0 rounded hover:bg-green-700"
            title="Expand"
          >
            <ChevronRight size={12} />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="p-0 rounded hover:bg-green-700"
            title="Close"
          >
            <X size={12} />
          </button>
        </div>
      </div>
    );
  }

  if (size === "preview" && previewData) {
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
        <Card className="w-[800px] max-h-[80dvh] shadow-2xl">
          <div
            className="flex items-center justify-between p-3 border-b cursor-move bg-muted/50"
            onMouseDown={handleMouseDown}
          >
            <div className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-green-600" />
              <h3 className="font-semibold">Assembled user_input Preview</h3>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSize("large")}
                className="p-1 rounded hover:bg-muted"
                title="Back to resources"
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

          <ScrollArea className="max-h-[calc(80dvh-60px)]">
            <div className="p-4 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold">
                    user_input (assembleRequest)
                  </h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      await navigator.clipboard.writeText(
                        previewData.fullMessage,
                      );
                      setCopiedIndex(-2);
                      setTimeout(() => setCopiedIndex(null), 2000);
                    }}
                  >
                    {copiedIndex === -2 ? (
                      <>
                        <Check className="w-3 h-3 mr-1 text-green-500" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3 mr-1" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>
                <div className="text-xs bg-muted p-3 rounded-lg max-h-[50dvh] overflow-y-auto">
                  <pre className="whitespace-pre-wrap break-words font-mono">
                    {previewData.fullMessage || "(empty)"}
                  </pre>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-2">
                  Resolved variables
                </h4>
                <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto">
                  {JSON.stringify(previewData.variables, null, 2)}
                </pre>
              </div>
            </div>
          </ScrollArea>
        </Card>
      </div>
    );
  }

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
      <Card className="w-96 max-h-[80dvh] shadow-2xl">
        <div
          className="flex items-center justify-between p-3 border-b cursor-move bg-muted/50"
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-green-600" />
            <h3 className="font-semibold">Resources ({resources.length})</h3>
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

        <ScrollArea className="max-h-[calc(60dvh-60px)]">
          <div className="p-2 space-y-1">
            {resources.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No resources attached
              </div>
            ) : (
              resources.map((resource, index) => {
                const isExpanded = expandedIndices.has(index);
                const isCopied = copiedIndex === index;
                const payload = resource.finalPayload ?? resource.source;

                return (
                  <div
                    key={resource.resourceId}
                    className="border rounded overflow-hidden"
                  >
                    <div
                      className="flex items-center justify-between px-2 py-1.5 cursor-pointer hover:bg-muted/50"
                      onClick={() => toggleExpanded(index)}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        {isExpanded ? (
                          <ChevronDown size={14} />
                        ) : (
                          <ChevronRight size={14} />
                        )}
                        <span className="text-xs font-medium">
                          {resource.blockType}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          #{index + 1}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          void copyToClipboard(payload, index);
                        }}
                      >
                        {isCopied ? (
                          <Check size={12} className="text-green-500" />
                        ) : (
                          <Copy size={12} />
                        )}
                      </Button>
                    </div>
                    {isExpanded && (
                      <div className="px-2 pb-2">
                        <pre className="text-[10px] bg-muted p-2 rounded overflow-x-auto max-h-32 overflow-y-auto">
                          {JSON.stringify(payload, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        {resources.length > 0 && (
          <div className="p-2 border-t bg-muted/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">
                {resources.length} resource{resources.length !== 1 ? "s" : ""}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={copyAll}
              >
                {copiedIndex === -1 ? (
                  <>
                    <Check size={12} className="mr-1 text-green-500" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy size={12} className="mr-1" />
                    Copy All
                  </>
                )}
              </Button>
            </div>
            <Button
              size="sm"
              className="w-full h-7 text-xs"
              onClick={generateMessagePreview}
              disabled={isGeneratingPreview}
            >
              {isGeneratingPreview ? (
                <>
                  <Loader2 size={12} className="mr-1.5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Eye size={12} className="mr-1.5" />
                  Preview user_input
                </>
              )}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
};
