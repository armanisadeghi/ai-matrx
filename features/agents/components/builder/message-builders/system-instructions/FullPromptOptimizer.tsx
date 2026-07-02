/**
 * Full Prompt Optimizer Component
 *
 * EXPERIMENTAL: Provides AI-powered optimization of the entire prompt object
 * including messages, variables, settings, and metadata.
 *
 * Relocated from features/prompts to features/agents so that the agent builder
 * has no dependency on the deprecated features/prompts tree.
 */

"use client";

import React, { useState, useEffect, useMemo } from "react";
// TODO(prompt-to-agent-sweep): re-enable useAppDispatch when handleOptimize is re-wired
// TODO(prompt-to-agent-sweep): re-add supabase import when re-wiring to agent.definition
// import { v4 as uuidv4 } from "uuid";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Rainbow,
  Check,
  X,
  Loader2,
  Copy,
  AlertTriangle,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import MarkdownStream from "@/components/MarkdownStream";
import CodeBlock from "@/features/code-editor/components/code-block/CodeBlock";
import { extractJsonFromText } from "@/features/agents/utils/json-extraction";
import { useAppSelector } from "@/lib/redux/hooks";

// ---------------------------------------------------------------------------
// Minimal normalization helpers (inlined from features/prompts/utils so this
// file has no dependency on the deprecated features/prompts tree).
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePromptMessagesFromDb(
  value: unknown,
): Array<{ role: string; content: string }> {
  if (!Array.isArray(value)) return [];
  const out: Array<{ role: string; content: string }> = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const role = item.role;
    const content = item.content;
    if (typeof role !== "string" || typeof content !== "string") continue;
    out.push({ role, content });
  }
  return out;
}

function normalizePromptSettingsFromDb(
  value: unknown,
): Record<string, unknown> {
  if (!isRecord(value)) return {};
  return value;
}

// ---------------------------------------------------------------------------

interface FullPromptOptimizerProps {
  isOpen: boolean;
  onClose: () => void;
  // Opaque object — only ever JSON.stringify'd for display or handed back to
  // the caller verbatim; never parsed against a concrete shape here.
  currentPromptObject: unknown;
  onAccept: (optimizedObject: unknown) => void;
  onAcceptAsCopy?: (optimizedObject: unknown) => void;
}

const FULL_OPTIMIZER_PROMPT_ID = "8b7a674a-07ba-43fc-a750-f189c242e70b";

export function FullPromptOptimizer({
  isOpen,
  onClose,
  currentPromptObject,
  onAccept,
  onAcceptAsCopy,
}: FullPromptOptimizerProps) {
  // TODO(prompt-to-agent-sweep): re-enable when handleOptimize is re-wired
  // const dispatch = useAppDispatch();
  const [additionalGuidance, setAdditionalGuidance] = useState("");
  const [showGuidanceInput, setShowGuidanceInput] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [extractedJson, setExtractedJson] = useState<unknown>(null);
  const [extractionError, setExtractionError] = useState<string | null>(null);

  // Watch streaming text
  const streamingText = useAppSelector((state) => (currentTaskId ? "" : ""));

  const isResponseEnded = useAppSelector((state) =>
    currentTaskId ? true : false,
  );

  // Format current prompt object for display
  const currentPromptJson = useMemo(() => {
    return JSON.stringify(currentPromptObject, null, 2);
  }, [currentPromptObject]);

  // Extract JSON from streaming response when it ends - SILENTLY, never throw
  useEffect(() => {
    if (isResponseEnded && streamingText && isOptimizing) {
      setIsOptimizing(false);

      // Use the safe extraction utility - it never throws
      const result = extractJsonFromText(streamingText);

      if (result.success && result.data) {
        setExtractedJson(result.data);
        setExtractionError(null);
        toast.success("Optimization complete", {
          description: "Review the changes and click Accept to apply",
        });
      } else {
        // Extraction failed, but we still have the raw text visible
        setExtractionError(
          result.error || "Could not extract JSON from response",
        );
        toast.error("Could not extract JSON", {
          description:
            "The raw response is still available below. You may need to manually extract the JSON.",
          duration: 5000,
        });
      }
    }
  }, [isResponseEnded, streamingText, isOptimizing]);

  const handleOptimize = async () => {
    if (!currentPromptObject) {
      toast.error("No prompt object to optimize");
      return;
    }

    // TODO(prompt-to-agent-sweep): public.prompts is graveyarded.
    // Re-wire this to fetch from agent.definition (same UUID, agent_type='builtin'):
    //   supabase.schema("agent").from("definition")
    //     .select("messages, settings").eq("id", FULL_OPTIMIZER_PROMPT_ID).single()
    // Until then surface a clear error rather than a silent Supabase 404.
    toast.error("Full Prompt Optimizer is temporarily unavailable", {
      description:
        "The underlying prompt template is being migrated to the agent system.",
      duration: 6000,
    });
    return;
  };

  const handleAccept = () => {
    if (extractedJson) {
      onAccept(extractedJson);
      handleClose();
      toast.success("Prompt updated", {
        description: "The optimized version has been applied",
      });
    }
  };

  const handleAcceptAsCopy = () => {
    if (extractedJson && onAcceptAsCopy) {
      onAcceptAsCopy(extractedJson);
      handleClose();
      toast.success("Creating new prompt...", {
        description: "Saving optimized version as a new prompt",
      });
    }
  };

  const handleClose = () => {
    setCurrentTaskId(null);
    setAdditionalGuidance("");
    setShowGuidanceInput(false);
    setIsOptimizing(false);
    setExtractedJson(null);
    setExtractionError(null);
    onClose();
  };

  const handleCopyOriginal = () => {
    navigator.clipboard.writeText(currentPromptJson);
    toast.success("Copied original to clipboard");
  };

  const handleCopyOptimized = () => {
    if (extractedJson) {
      navigator.clipboard.writeText(JSON.stringify(extractedJson, null, 2));
      toast.success("Copied extracted JSON to clipboard");
    }
  };

  const handleCopyRawResponse = () => {
    navigator.clipboard.writeText(streamingText);
    toast.success("Copied raw response to clipboard");
  };

  const hasOptimizedObject = extractedJson !== null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-7xl h-[95dvh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Rainbow className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            Full Prompt Optimizer
            <span className="text-xs px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-normal">
              EXPERIMENTAL
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 grid grid-cols-2 gap-4 px-6 overflow-hidden min-h-0 mt-4">
          {/* Original Prompt Object */}
          <div className="flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium">
                Current Prompt Object
              </Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyOriginal}
                className="h-7 w-7 p-0"
                title="Copy to clipboard"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex-1 bg-gray-50 dark:bg-gray-900 border-border rounded-lg overflow-hidden">
              <div className="h-full overflow-y-auto p-3">
                <CodeBlock
                  code={currentPromptJson}
                  language="json"
                  showLineNumbers={true}
                  wrapLines={false}
                  fontSize={12}
                />
              </div>
            </div>
          </div>

          {/* AI Response - Always Visible */}
          <div className="flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium">AI Response</Label>
              {streamingText && !isOptimizing && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyRawResponse}
                  className="h-7 w-7 p-0"
                  title="Copy raw response to clipboard"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <div className="flex-1 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border border-amber-200 dark:border-amber-700 rounded-lg overflow-hidden">
              {isOptimizing ? (
                <div className="p-6 space-y-4 h-full flex flex-col">
                  <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-sm font-medium">
                      Analyzing and optimizing your prompt...
                    </span>
                  </div>

                  {streamingText && (
                    <div className="flex-1 bg-white/50 dark:bg-gray-900/50 rounded-lg overflow-hidden flex flex-col">
                      <div className="p-3 border-b border-border bg-gray-50/50 dark:bg-gray-900/50">
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          Live Response:
                        </p>
                      </div>
                      <div className="flex-1 overflow-y-auto p-4">
                        <MarkdownStream
                          content={streamingText}
                          isStreamActive={true}
                          hideCopyButton={true}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Streaming response...</span>
                  </div>
                </div>
              ) : streamingText ? (
                <div className="h-full flex flex-col overflow-hidden">
                  {/* Show extraction status if there was an error */}
                  {extractionError && (
                    <div className="p-3 bg-amber-100 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 text-xs text-amber-700 dark:text-amber-300">
                        <strong>JSON Extraction Failed:</strong>{" "}
                        {extractionError}
                        <br />
                        <span className="text-amber-600 dark:text-amber-400">
                          The full AI response is displayed below. You can copy
                          it and manually extract the JSON if needed.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Show success status if extraction worked */}
                  {hasOptimizedObject && !extractionError && (
                    <div className="p-3 bg-green-100 dark:bg-green-900/20 border-b border-green-200 dark:border-green-800 flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                      <span className="text-xs text-green-700 dark:text-green-300">
                        JSON successfully extracted. Scroll down to see the
                        extracted data or click "Accept & Replace" to apply
                        changes.
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCopyOptimized}
                        className="h-6 text-xs ml-auto"
                      >
                        <Copy className="h-3 w-3" />
                        Copy JSON
                      </Button>
                    </div>
                  )}

                  {/* Always show the full raw response */}
                  <div className="flex-1 overflow-y-auto p-4 bg-white/50 dark:bg-gray-900/50">
                    <MarkdownStream
                      content={streamingText}
                      isStreamActive={false}
                      hideCopyButton={false}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center p-6">
                  <Rainbow className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-3" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Click "Optimize" to see the AI's response
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Optional Additional Guidance */}
        <div className="px-6 py-3 border-t space-y-2">
          {!showGuidanceInput ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowGuidanceInput(true)}
              className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 h-8"
            >
              + Add additional guidance (optional)
            </Button>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600 dark:text-gray-400">
                Additional Guidance (Optional)
              </Label>
              <Textarea
                value={additionalGuidance}
                onChange={(e) => setAdditionalGuidance(e.target.value)}
                placeholder="e.g., 'Focus on improving variable names' or 'Optimize for better token efficiency'"
                className="text-sm h-16 resize-none"
                disabled={isOptimizing}
              />
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50 dark:bg-gray-900">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {hasOptimizedObject && !isOptimizing && (
              <span className="flex items-center gap-1">
                <Check className="h-3 w-3 text-green-600" />
                Ready to apply
              </span>
            )}
            {extractionError && (
              <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                <X className="h-3 w-3" />
                Extraction failed
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isOptimizing}
            >
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>

            {hasOptimizedObject && !isOptimizing ? (
              <>
                <Button variant="outline" onClick={handleOptimize}>
                  <Rainbow className="h-4 w-4 mr-2" />
                  Re-optimize
                </Button>
                {onAcceptAsCopy && (
                  <Button
                    variant="outline"
                    onClick={handleAcceptAsCopy}
                    className="border-green-300 dark:border-green-700 text-green-700 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-950"
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Save as Copy
                  </Button>
                )}
                <Button
                  onClick={handleAccept}
                  className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700"
                >
                  <Check className="h-4 w-4 mr-2" />
                  Accept & Replace
                </Button>
              </>
            ) : (
              <Button
                onClick={handleOptimize}
                disabled={isOptimizing || !currentPromptObject}
                className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700"
              >
                {isOptimizing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Optimizing...
                  </>
                ) : (
                  <>
                    <Rainbow className="h-4 w-4 mr-2" />
                    Optimize Full Prompt
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
