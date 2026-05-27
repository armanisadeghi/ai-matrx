"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Eye,
  RefreshCw,
  Send,
  Loader2,
  Rainbow,
  X,
  AlertTriangle,
  CheckCircle,
  FlaskConical,
  Play,
  FastForward,
  Copy,
  HardDrive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/utils/supabase/client";
import { formatDistanceToNow } from "date-fns";
import MarkdownStream from "@/components/MarkdownStream";
import { useToolComponentAgent } from "@/features/tool-call-visualization/admin/hooks/useToolComponentAgent";
import { COMPONENT_GENERATOR_PROMPT_ID } from "@/features/tool-call-visualization/admin/tool-ui-generator-prompt";
import type {
  ToolLifecycleEntry,
  ToolLifecycleStatus,
} from "@/features/agents/types/request.types";
import type { ToolEventPayload } from "@/types/python-generated/stream-events";
import { ToolCallVisualization } from "@/features/tool-call-visualization/components/ToolCallVisualization";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ToolTestSample {
  id: string;
  tool_id: string | null;
  tool_name: string;
  tested_by: string | null;
  arguments: Record<string, unknown>;
  raw_stream_events: unknown[];
  final_payload: Record<string, unknown> | null;
  admin_comments: string | null;
  is_success: boolean | null;
  use_for_component: boolean;
  created_at: string;
}

interface GeneratedComponent {
  tool_name: string;
  display_name: string;
  results_label: string;
  inline_code: string;
  overlay_code: string;
  utility_code: string;
  header_extras_code: string;
  header_subtitle_code: string;
  keep_expanded_on_stream: boolean;
  allowed_imports: string[];
  version: string;
}

interface ToolComponentPreviewProps {
  tool: {
    id: string;
    name: string;
    description: string;
    output_schema?: unknown;
    parameters?: unknown;
  };
  /** Called when a revised component should be saved */
  onSaveRevision?: (component: GeneratedComponent) => Promise<void>;
}

// ─── Sample → ToolLifecycleEntry converter ────────────────────────────────────

/**
 * Converts raw_stream_events + final_payload into a ToolLifecycleEntry[]
 * that ToolCallVisualization (v2 contract) can render directly.
 */
function buildToolLifecycleEntry(
  toolName: string,
  rawStreamEvents: unknown[],
  finalPayload: Record<string, unknown> | null,
  visibleEventCount?: number,
): ToolLifecycleEntry[] {
  const allEvents = rawStreamEvents as ToolEventPayload[];
  const events =
    visibleEventCount !== undefined
      ? allEvents.slice(0, visibleEventCount)
      : allEvents;

  const callId = events.find((e) => e.call_id)?.call_id ?? "preview";
  const args =
    (events.find((e) => e.event === "tool_started")?.data as
      | Record<string, unknown>
      | undefined) ?? {};

  const completedEvent = events.find((e) => e.event === "tool_completed");
  const errorEvent = events.find((e) => e.event === "tool_error");

  const statusMap: Record<string, ToolLifecycleStatus> = {
    tool_started: "started",
    tool_progress: "progress",
    tool_step: "step",
    tool_result_preview: "result_preview",
    tool_completed: "completed",
    tool_error: "error",
  };
  const lastEvent = [...events].reverse().find((e) => e.event in statusMap);
  const status: ToolLifecycleStatus = lastEvent
    ? (statusMap[lastEvent.event] ?? "started")
    : "started";

  const lastWithMessage = [...events].reverse().find((e) => e.message);
  const lastWithData = [...events]
    .reverse()
    .find((e) => e.data && Object.keys(e.data).length > 0);

  const completedResult = (
    completedEvent?.data as Record<string, unknown> | undefined
  )?.result;
  const fp = finalPayload as {
    output?: { full_result?: { output?: unknown } };
  } | null;
  const result =
    completedResult !== undefined
      ? completedResult
      : (fp?.output?.full_result?.output ?? null);

  const startEvent = events.find((e) => e.event === "tool_started");
  const startedAt = startEvent?.timestamp
    ? new Date(startEvent.timestamp * 1000).toISOString()
    : new Date().toISOString();
  const completedAt = completedEvent?.timestamp
    ? new Date(completedEvent.timestamp * 1000).toISOString()
    : null;

  return [
    {
      callId,
      toolName,
      displayName: toolName,
      status,
      arguments: args,
      startedAt,
      completedAt,
      latestMessage: lastWithMessage?.message ?? null,
      latestData:
        (lastWithData?.data as Record<string, unknown> | undefined) ?? null,
      result,
      resultPreview: result != null ? String(result).slice(0, 200) : null,
      errorType: errorEvent ? "tool_error" : null,
      errorMessage: errorEvent?.message ?? null,
      isDelegated: events.some((e) => e.event === "tool_delegated"),
      events,
    },
  ];
}

// ─── Live Preview (direct ToolCallVisualization, no execute-first gate) ───────

interface LivePreviewRendererProps {
  toolName: string;
  rawStreamEvents: unknown[];
  finalPayload: Record<string, unknown> | null;
  /** When true, reveal items one by one over ~5 s to simulate streaming */
  simulateStream?: boolean;
}

function LivePreviewRenderer({
  toolName,
  rawStreamEvents,
  finalPayload,
  simulateStream,
}: LivePreviewRendererProps) {
  const totalEvents = rawStreamEvents.length;

  // For stream simulation: only expose a growing slice of events
  const [visibleEventCount, setVisibleEventCount] = useState(() =>
    simulateStream ? 1 : totalEvents,
  );
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!simulateStream) {
      setVisibleEventCount(totalEvents);
      return;
    }
    setVisibleEventCount(1);
    const intervalMs = totalEvents > 1 ? 5000 / (totalEvents - 1) : 1000;
    timerRef.current = setInterval(() => {
      setVisibleEventCount((prev) => {
        if (prev >= totalEvents) {
          clearInterval(timerRef.current!);
          return totalEvents;
        }
        return prev + 1;
      });
    }, intervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [simulateStream, rawStreamEvents, finalPayload, totalEvents]);

  const entries = buildToolLifecycleEntry(
    toolName,
    rawStreamEvents,
    finalPayload,
    simulateStream ? visibleEventCount : undefined,
  );

  if (entries.length === 0 || entries[0].events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
        <Eye className="h-6 w-6 opacity-40" />
        <p className="text-xs">No usable output found in this sample</p>
      </div>
    );
  }

  return <ToolCallVisualization entries={entries} />;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ToolComponentPreview({
  tool,
  onSaveRevision,
}: ToolComponentPreviewProps) {
  const { toast } = useToast();
  const agent = useToolComponentAgent();

  const [samples, setSamples] = useState<ToolTestSample[]>([]);
  const [loadingSamples, setLoadingSamples] = useState(true);
  const [selectedSampleId, setSelectedSampleId] = useState<string>("");
  const [revisionInstructions, setRevisionInstructions] = useState("");
  const [isSavingRevision, setIsSavingRevision] = useState(false);
  const [lastRevision, setLastRevision] = useState<GeneratedComponent | null>(
    null,
  );
  const [simulateStream, setSimulateStream] = useState(false);
  const [streamKey, setStreamKey] = useState(0);
  const [saveError, setSaveError] = useState<{
    title: string;
    detail: string;
  } | null>(null);

  const selectedSample = samples.find((s) => s.id === selectedSampleId);

  // ── Load samples ──────────────────────────────────────────────────────────

  const loadSamples = useCallback(async () => {
    setLoadingSamples(true);
    try {
      const { data, error } = await supabase
        .from("tool_test_sample")
        .select("*")
        .or(`tool_name.eq.${tool.name},tool_id.eq.${tool.id}`)
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);
      const list = (data as ToolTestSample[]) ?? [];
      setSamples(list);

      // Auto-select first tagged sample, else first
      const tagged = list.find(
        (s) => s.use_for_component || s.is_success === true,
      );
      setSelectedSampleId(tagged?.id ?? list[0]?.id ?? "");
    } catch (err) {
      toast({
        title: "Failed to load samples",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoadingSamples(false);
    }
  }, [tool.id, tool.name, toast]);

  useEffect(() => {
    loadSamples();
  }, [loadSamples]);

  // ── Revision generation ───────────────────────────────────────────────────

  const handleRevise = async () => {
    if (!selectedSample) {
      toast({ title: "Select a sample first", variant: "destructive" });
      return;
    }
    if (!revisionInstructions.trim()) {
      toast({
        title: "Add revision instructions",
        description: "Describe what you want changed.",
        variant: "destructive",
      });
      return;
    }

    agent.reset();
    setLastRevision(null);

    const variables: Record<string, string> = {
      complete_tool_object: JSON.stringify(tool, null, 2),
      output_schema: JSON.stringify(tool.output_schema ?? {}, null, 2),
      sample_stream: JSON.stringify(
        [selectedSample.raw_stream_events],
        null,
        2,
      ),
      sample_database_entry: JSON.stringify(
        selectedSample.final_payload ?? {},
        null,
        2,
      ),
    };

    const fullText = await agent.execute({
      agentId: COMPONENT_GENERATOR_PROMPT_ID,
      variables,
      userInput: revisionInstructions.trim(),
    });

    if (fullText) {
      const parsed = parseRevision(fullText, tool.name);
      if (parsed) {
        setLastRevision(parsed);
      } else {
        toast({
          title: "Could not parse revision",
          description:
            "Review the response below and copy code to the editor manually.",
          variant: "destructive",
        });
      }
    }
  };

  const handleSaveRevision = async () => {
    if (!lastRevision || !onSaveRevision) return;
    setIsSavingRevision(true);
    setSaveError(null);
    try {
      await onSaveRevision(lastRevision);
      toast({
        title: "Revision saved",
        description: "Component updated. Reload the preview to see changes.",
      });
      setRevisionInstructions("");
      setLastRevision(null);
      agent.reset();
    } catch (err) {
      const e = err as Error & { detail?: string };
      setSaveError({
        title: e.message || "Save failed",
        detail:
          e.detail ||
          "The revision could not be saved. Your generated code is still visible below — copy it manually if needed.",
      });
    } finally {
      setIsSavingRevision(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Save Error Dialog */}
      <Dialog
        open={!!saveError}
        onOpenChange={(open) => {
          if (!open) setSaveError(null);
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Revision Save Failed — Your Work Is Safe
            </DialogTitle>
            <DialogDescription>
              The revision could not be saved. The generated code is still
              visible in the panel below — copy it manually into the Edit Code
              tab if needed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 space-y-1">
              <p className="text-xs font-semibold text-destructive">Error</p>
              <p className="text-xs font-mono text-destructive">
                {saveError?.title}
              </p>
              {saveError?.detail && saveError.detail !== "Unknown error" && (
                <>
                  <p className="text-xs font-semibold text-destructive mt-2">
                    Details
                  </p>
                  <p className="text-xs font-mono text-destructive break-all">
                    {saveError.detail}
                  </p>
                </>
              )}
            </div>
            {agent.accumulatedText && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">
                    Generated code (copy to Edit Code tab)
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[11px] gap-1"
                    onClick={() => {
                      navigator.clipboard
                        .writeText(agent.accumulatedText)
                        .then(() => {
                          toast({ title: "Copied to clipboard" });
                        })
                        .catch(() => {
                          toast({
                            title: "Copy failed",
                            description: "Select the text below manually.",
                            variant: "destructive",
                          });
                        });
                    }}
                  >
                    <Copy className="w-3 h-3" />
                    Copy All
                  </Button>
                </div>
                <pre className="text-[11px] bg-muted/40 p-3 rounded-lg overflow-auto max-h-[250px] whitespace-pre-wrap font-mono">
                  {agent.accumulatedText}
                </pre>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                onClick={() => {
                  setSaveError(null);
                  handleSaveRevision();
                }}
                disabled={isSavingRevision}
                className="gap-1.5"
              >
                {isSavingRevision ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <HardDrive className="w-3.5 h-3.5" />
                )}
                Retry Save
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSaveError(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sample selector */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 flex-shrink-0">
          <FlaskConical className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Sample</span>
        </div>
        {loadingSamples ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading samples…
          </div>
        ) : samples.length === 0 ? (
          <div className="flex items-center gap-1.5 text-xs text-warning">
            <AlertTriangle className="h-3.5 w-3.5" />
            No test samples — run the tool on the{" "}
            <a
              href="/demos/public/api-tests/tool-testing"
              target="_blank"
              className="underline text-primary"
            >
              Tool Testing page
            </a>{" "}
            first.
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-1">
            <Select
              value={selectedSampleId}
              onValueChange={setSelectedSampleId}
            >
              <SelectTrigger className="flex-1 max-w-xs h-8 text-xs">
                <SelectValue placeholder="Select a sample…" />
              </SelectTrigger>
              <SelectContent>
                {samples.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="text-xs">
                      {formatDistanceToNow(new Date(s.created_at), {
                        addSuffix: true,
                      })}
                      {s.use_for_component && " · Tagged"}
                      {s.is_success === true && " · Pass"}
                      {s.admin_comments &&
                        ` · "${s.admin_comments.slice(0, 40)}"`}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadSamples}
              className="h-8 w-8 p-0"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Live Preview */}
      {selectedSample && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Live Preview
              <Badge variant="secondary" className="text-[10px] font-normal">
                {formatDistanceToNow(new Date(selectedSample.created_at), {
                  addSuffix: true,
                })}
              </Badge>
              <div className="ml-auto flex items-center gap-1.5">
                <Button
                  variant={simulateStream ? "default" : "outline"}
                  size="sm"
                  className="h-7 gap-1 text-[11px]"
                  onClick={() => {
                    setSimulateStream((s) => !s);
                    setStreamKey((k) => k + 1);
                  }}
                  title="Simulate streaming — reveals items progressively over 5 s"
                >
                  <FastForward className="h-3 w-3" />
                  Simulate Stream
                </Button>
                {simulateStream && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-[11px]"
                    onClick={() => setStreamKey((k) => k + 1)}
                    title="Replay simulation"
                  >
                    <Play className="h-3 w-3" />
                    Replay
                  </Button>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-4 pb-4">
            <LivePreviewRenderer
              key={streamKey}
              toolName={tool.name}
              rawStreamEvents={selectedSample.raw_stream_events}
              finalPayload={selectedSample.final_payload}
              simulateStream={simulateStream}
            />
          </CardContent>
        </Card>
      )}

      {/* AI Revision panel */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Rainbow className="h-4 w-4" />
            Request AI Revision
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <Textarea
            value={revisionInstructions}
            onChange={(e) => setRevisionInstructions(e.target.value)}
            placeholder="Describe what you want changed. e.g., 'Show results in a card grid with thumbnails instead of a list. Add a copy button for each item. Use green color for success states.'"
            className="text-xs min-h-[96px] resize-none"
            style={{ fontSize: "16px" }}
            disabled={agent.isStreaming}
          />

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleRevise}
              disabled={
                agent.isStreaming ||
                !selectedSampleId ||
                !revisionInstructions.trim()
              }
              className="gap-1.5"
            >
              {agent.isStreaming ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" /> Generate Revision
                </>
              )}
            </Button>
            {agent.isStreaming && (
              <Button
                variant="ghost"
                size="sm"
                onClick={agent.cancel}
                className="gap-1 text-xs h-8"
              >
                <X className="h-3 w-3" /> Cancel
              </Button>
            )}
            {lastRevision && onSaveRevision && (
              <Button
                size="sm"
                variant="default"
                onClick={handleSaveRevision}
                disabled={isSavingRevision}
                className="gap-1.5 ml-auto"
              >
                {isSavingRevision ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-3.5 w-3.5" /> Save Revision
                  </>
                )}
              </Button>
            )}
          </div>

          {agent.error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-xs text-destructive">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              {agent.error}
            </div>
          )}

          {/* Streaming response */}
          {(agent.accumulatedText || lastRevision) && (
            <div className="rounded-lg border border-border bg-muted/20 overflow-hidden">
              <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground">
                  {agent.isStreaming
                    ? "Generating…"
                    : lastRevision
                      ? "Revision ready — review and save"
                      : "Model response"}
                </span>
                {lastRevision && (
                  <Badge variant="secondary" className="text-[10px]">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Parsed
                  </Badge>
                )}
              </div>
              <div className="p-4 max-h-[500px] overflow-y-auto">
                {agent.accumulatedText ? (
                  <MarkdownStream
                    content={agent.accumulatedText}
                    isStreamActive={agent.isStreaming}
                  />
                ) : null}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractSectionCode(text: string, section: string): string {
  const primary = new RegExp(
    `##\\s*${section}\\s*[\\r\\n]+\`\`\`(?:jsx|js|tsx|ts|javascript|typescript)?[^\\n]*[\\r\\n]([\\s\\S]*?)\`\`\``,
    "i",
  );
  const primaryMatch = text.match(primary);
  if (primaryMatch) return primaryMatch[1].trim();

  const relaxedSection = section.replace(/_/g, "[_\\s]");
  const fallback = new RegExp(
    `##\\s*${relaxedSection}\\s*[\\r\\n]+\`\`\`(?:jsx|js|tsx|ts|javascript|typescript)?[^\\n]*[\\r\\n]([\\s\\S]*?)\`\`\``,
    "i",
  );
  const fallbackMatch = text.match(fallback);
  if (fallbackMatch) return fallbackMatch[1].trim();

  return "";
}

function parseRevision(
  text: string,
  fallbackToolName: string,
): GeneratedComponent | null {
  const metaMatch = text.match(/##\s+METADATA\s*\n```json\s*\n([\s\S]*?)```/i);
  if (metaMatch) {
    let meta: Partial<GeneratedComponent> = {};
    try {
      meta = JSON.parse(metaMatch[1].trim()) as Partial<GeneratedComponent>;
    } catch {
      /* ignore */
    }

    const inline_code = extractSectionCode(text, "INLINE_CODE");
    if (inline_code) {
      return {
        tool_name: meta.tool_name || fallbackToolName,
        display_name: meta.display_name || fallbackToolName,
        results_label: meta.results_label || "Results",
        keep_expanded_on_stream: meta.keep_expanded_on_stream ?? false,
        allowed_imports: meta.allowed_imports ?? ["react", "lucide-react"],
        version: meta.version ?? "1.0.0",
        inline_code,
        overlay_code: extractSectionCode(text, "OVERLAY_CODE"),
        utility_code: extractSectionCode(text, "UTILITY_CODE"),
        header_subtitle_code: extractSectionCode(text, "HEADER_SUBTITLE_CODE"),
        header_extras_code: extractSectionCode(text, "HEADER_EXTRAS_CODE"),
      };
    }
  }

  const jsonBlockMatch = text.match(/```json\s*\n?([\s\S]*?)```/);
  if (jsonBlockMatch) {
    try {
      const p = JSON.parse(
        jsonBlockMatch[1].trim(),
      ) as Partial<GeneratedComponent>;
      if (p.inline_code) {
        return {
          tool_name: p.tool_name || fallbackToolName,
          display_name: p.display_name || fallbackToolName,
          results_label: p.results_label || "Results",
          keep_expanded_on_stream: p.keep_expanded_on_stream ?? false,
          allowed_imports: p.allowed_imports ?? ["react", "lucide-react"],
          version: p.version ?? "1.0.0",
          inline_code: p.inline_code,
          overlay_code: p.overlay_code || "",
          utility_code: p.utility_code || "",
          header_subtitle_code: p.header_subtitle_code || "",
          header_extras_code: p.header_extras_code || "",
        };
      }
    } catch {
      /* ignore */
    }
  }

  return null;
}
