"use client";

import { useState, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Activity,
  Eye,
  FileText,
  ShieldCheck,
  FileJson,
  Copy,
  Check,
  X,
  Timer,
  Loader2,
  Save,
  ThumbsUp,
  ThumbsDown,
  Minus,
  BookmarkCheck,
  Gauge,
  Code2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { StreamEventTimeline } from "./StreamEventTimeline";
import { SchemaValidator, validateAgainstSchema } from "./SchemaValidator";
import { CostEstimateTable } from "./CostEstimateTable";
import { ToolRendererPreview } from "@/features/tool-call-visualization/testing/ToolRendererPreview";
import { useSaveSample } from "../hooks/useSaveSample";
import type { TypedStreamEvent } from "@/types/python-generated/stream-events";
import type { ToolStreamEvent, FinalPayload, ExecutionStatus } from "@/features/tool-call-visualization/testing/types";

// ─── Copy button ────────────────────────────────────────────────────────────

function CopyButton({
  content,
  label = "Copy",
}: {
  content: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 text-xs px-2 gap-1"
      onClick={handleCopy}
      disabled={!content}
    >
      {copied ? (
        <Check className="h-3 w-3 text-success" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
      {copied ? "Copied" : label}
    </Button>
  );
}

// ─── Save Sample Popover ─────────────────────────────────────────────────────

type SuccessVote = "yes" | "no" | null;

interface SaveSamplePopoverProps {
  disabled: boolean;
  onSave: (opts: {
    adminComments: string;
    isSuccess: boolean | null;
    useForComponent: boolean;
  }) => Promise<void>;
  isSaving: boolean;
  savedId: string | null;
}

function SaveSamplePopover({
  disabled,
  onSave,
  isSaving,
  savedId,
}: SaveSamplePopoverProps) {
  const [open, setOpen] = useState(false);
  const [adminComments, setAdminComments] = useState("");
  const [successVote, setSuccessVote] = useState<SuccessVote>(null);
  const [useForComponent, setUseForComponent] = useState(false);

  const handleSave = async () => {
    await onSave({
      adminComments: adminComments.trim() || "",
      isSuccess:
        successVote === "yes" ? true : successVote === "no" ? false : null,
      useForComponent,
    });
    setOpen(false);
  };

  if (savedId) {
    return (
      <div className="flex items-center gap-1 text-[10px] text-success font-medium">
        <BookmarkCheck className="h-3 w-3" />
        Saved
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-6 w-6 p-0"
          disabled={disabled}
          title="Save sample"
        >
          <Save className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="end">
        <div className="space-y-3">
          <p className="text-xs font-semibold">Save Test Sample</p>

          {/* Success vote */}
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">
              Success?
            </Label>
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant={successVote === "yes" ? "default" : "outline"}
                className="h-7 text-xs px-2.5 gap-1 flex-1"
                onClick={() =>
                  setSuccessVote(successVote === "yes" ? null : "yes")
                }
              >
                <ThumbsUp className="h-3 w-3" />
                Yes
              </Button>
              <Button
                size="sm"
                variant={successVote === null ? "secondary" : "outline"}
                className="h-7 text-xs px-2.5 gap-1 flex-1"
                onClick={() => setSuccessVote(null)}
              >
                <Minus className="h-3 w-3" />
                Unset
              </Button>
              <Button
                size="sm"
                variant={successVote === "no" ? "destructive" : "outline"}
                className="h-7 text-xs px-2.5 gap-1 flex-1"
                onClick={() =>
                  setSuccessVote(successVote === "no" ? null : "no")
                }
              >
                <ThumbsDown className="h-3 w-3" />
                No
              </Button>
            </div>
          </div>

          {/* Admin comments */}
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">
              Comments
            </Label>
            <Textarea
              placeholder="Notes about this sample response…"
              value={adminComments}
              onChange={(e) => setAdminComments(e.target.value)}
              className="text-xs min-h-[64px] resize-none"
            />
          </div>

          {/* Use for component */}
          <div className="flex items-center justify-between">
            <Label
              className="text-[11px] text-muted-foreground cursor-pointer"
              htmlFor="use-for-component"
            >
              Use for component
            </Label>
            <Switch
              id="use-for-component"
              checked={useForComponent}
              onCheckedChange={setUseForComponent}
              className="scale-75 origin-right"
            />
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs px-2"
              onClick={() => setOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs px-3 gap-1"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="h-3 w-3" />
                  Save
                </>
              )}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface ResultsPanelProps {
  toolName: string;
  toolId?: string | null;
  toolSchema?: Record<string, unknown> | null;
  args: Record<string, unknown>;
  toolEvents: ToolStreamEvent[];
  rawLines: TypedStreamEvent[];
  finalPayload: FinalPayload | null;
  rawJsonLog: string;
  executionStatus: ExecutionStatus;
  errorMessage: string | null;
  onClear: () => void;
  authToken?: string | null;
}

export function ResultsPanel({
  toolName,
  toolId,
  toolSchema,
  args,
  toolEvents,
  rawLines,
  finalPayload,
  rawJsonLog,
  executionStatus,
  errorMessage,
  onClear,
  authToken,
}: ResultsPanelProps) {
  const isRunning =
    executionStatus === "running" || executionStatus === "connecting";
  const isComplete = executionStatus === "complete";
  const isError = executionStatus === "error";
  const duration = finalPayload?.output?.full_result?.duration_ms;
  const canSave = (isComplete || isError) && !!finalPayload;

  // Schema — prefer the tool-level schema (available immediately on selection),
  // fall back to what comes back in the execution metadata
  const activeSchema =
    toolSchema ?? finalPayload?.metadata?.output_schema ?? null;
  const schemaOutput = finalPayload?.output?.full_result?.output ?? null;
  const toolSuccess = finalPayload?.output?.full_result?.success ?? false;
  const schemaValidation = useMemo(() => {
    if (
      !activeSchema ||
      !toolSuccess ||
      schemaOutput === null ||
      schemaOutput === undefined
    )
      return null;
    return validateAgainstSchema(schemaOutput, activeSchema);
  }, [schemaOutput, activeSchema, toolSuccess]);

  const { save, isSaving, savedId, reset } = useSaveSample(authToken);

  const handleSave = async (opts: {
    adminComments: string;
    isSuccess: boolean | null;
    useForComponent: boolean;
  }) => {
    try {
      await save({
        toolName,
        toolId: toolId ?? null,
        arguments: args,
        rawStreamEvents: rawLines,
        finalPayload,
        adminComments: opts.adminComments || null,
        isSuccess: opts.isSuccess,
        useForComponent: opts.useForComponent,
      });
      toast.success("Sample saved", {
        description: opts.useForComponent
          ? "Marked for component development."
          : undefined,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save sample");
    }
  };

  // Reset saved state when a new execution starts
  if (isRunning && savedId) reset();

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-1.5 border-b gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold flex-shrink-0">Results</span>
          {isRunning && (
            <Badge
              variant="secondary"
              className="text-[10px] px-1.5 py-0 gap-1"
            >
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              Running
            </Badge>
          )}
          {isComplete && (
            <Badge
              variant="default"
              className="text-[10px] px-1.5 py-0 gap-1 bg-primary text-foreground"
            >
              <Check className="h-2.5 w-2.5" />
              Complete
            </Badge>
          )}
          {isError && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
              Error
            </Badge>
          )}
          {duration !== undefined && (
            <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
              <Timer className="h-2.5 w-2.5" />
              {(duration / 1000).toFixed(2)}s
            </span>
          )}
          {finalPayload?.metadata?.call_id && (
            <span
              className="text-[10px] text-muted-foreground font-mono truncate max-w-[160px]"
              title={finalPayload.metadata.call_id}
            >
              {finalPayload.metadata.call_id}
            </span>
          )}
          {schemaValidation !== null && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex-shrink-0 flex items-center">
                  {schemaValidation.valid ? (
                    <CheckCircle2 className="h-3 w-3 text-success" />
                  ) : (
                    <XCircle className="h-3 w-3 text-destructive" />
                  )}
                </span>
              </TooltipTrigger>
              <TooltipContent className="text-xs">
                {schemaValidation.valid
                  ? "Output matches registered schema"
                  : "Output does not match schema"}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {finalPayload?.metadata?.cost_estimate && (
            <span className="text-[10px] text-muted-foreground font-mono">
              ~
              {finalPayload.metadata.cost_estimate.estimated_tokens.toLocaleString()}{" "}
              tokens
            </span>
          )}
          <SaveSamplePopover
            disabled={!canSave}
            onSave={handleSave}
            isSaving={isSaving}
            savedId={savedId}
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={onClear}
            className="h-6 text-xs px-1.5"
            disabled={isRunning}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {errorMessage && (
        <div className="flex-shrink-0 mx-3 mt-2 p-2.5 bg-destructive/10 border border-destructive/20 rounded text-xs text-destructive">
          <span className="font-semibold">Error: </span>
          <span className="font-mono">{errorMessage}</span>
        </div>
      )}

      {/* Tabs */}
      <Tabs
        defaultValue="stream"
        className="flex-1 flex flex-col overflow-hidden min-h-0 px-3 pt-2"
      >
        <TabsList className="grid w-full grid-cols-7 h-8 flex-shrink-0">
          <TabsTrigger value="stream" className="text-[10px] gap-1">
            <Activity className="h-3 w-3" />
            Events
          </TabsTrigger>
          <TabsTrigger value="rendered" className="text-[10px] gap-1">
            <Eye className="h-3 w-3" />
            Rendered
          </TabsTrigger>
          <TabsTrigger value="model-facing" className="text-[10px] gap-1">
            <FileText className="h-3 w-3" />
            Model
          </TabsTrigger>
          <TabsTrigger value="schema" className="text-[10px] gap-1">
            <ShieldCheck className="h-3 w-3" />
            Schema
          </TabsTrigger>
          <TabsTrigger value="output" className="text-[10px] gap-1">
            <Code2 className="h-3 w-3" />
            Output
          </TabsTrigger>
          <TabsTrigger value="usage" className="text-[10px] gap-1">
            <Gauge className="h-3 w-3" />
            Usage
          </TabsTrigger>
          <TabsTrigger value="json" className="text-[10px] gap-1">
            <FileJson className="h-3 w-3" />
            JSON
          </TabsTrigger>
        </TabsList>

        {/* Stream Events */}
        <TabsContent
          value="stream"
          className="flex-1 overflow-hidden mt-2 rounded border bg-card"
        >
          <StreamEventTimeline
            toolEvents={toolEvents}
            rawLines={rawLines}
            isRunning={isRunning}
          />
        </TabsContent>

        {/* Rendered Result (via tool renderer system) */}
        <TabsContent
          value="rendered"
          className="flex-1 overflow-y-auto mt-2 rounded border bg-card"
        >
          <ToolRendererPreview
            toolName={toolName}
            args={args}
            toolEvents={toolEvents}
            finalPayload={finalPayload}
            isRunning={isRunning}
          />
        </TabsContent>

        {/* Model-Facing Result */}
        <TabsContent
          value="model-facing"
          className="flex-1 flex flex-col overflow-hidden mt-2 rounded border bg-muted/30"
        >
          <div className="flex justify-between items-center px-3 py-1.5 border-b flex-shrink-0">
            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
              Model-Facing Result
            </span>
            <CopyButton
              content={finalPayload?.output?.model_facing_result?.content ?? ""}
              label="Copy"
            />
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 p-3">
            {finalPayload?.output?.model_facing_result ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    variant={
                      finalPayload.output.model_facing_result.is_error
                        ? "destructive"
                        : "outline"
                    }
                    className="text-[10px]"
                  >
                    {finalPayload.output.model_facing_result.is_error
                      ? "Error"
                      : "Success"}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    call_id: {finalPayload.output.model_facing_result.call_id}
                  </span>
                </div>
                <pre className="text-xs font-mono whitespace-pre-wrap text-foreground/80 bg-muted/50 rounded p-3 border border-border">
                  {finalPayload.output.model_facing_result.content}
                </pre>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-8">
                No model-facing result yet. Execute a tool to see results.
              </p>
            )}
          </div>
        </TabsContent>

        {/* Schema Validation */}
        <TabsContent
          value="schema"
          className="flex-1 overflow-hidden mt-2 rounded border bg-card"
        >
          <SchemaValidator
            output={schemaOutput}
            schema={activeSchema}
            success={toolSuccess}
            schemaOnly
          />
        </TabsContent>

        {/* Raw Output */}
        <TabsContent
          value="output"
          className="flex-1 overflow-hidden mt-2 rounded border bg-card"
        >
          <SchemaValidator
            output={schemaOutput}
            schema={activeSchema}
            success={toolSuccess}
            outputOnly
          />
        </TabsContent>

        {/* Usage Estimate */}
        <TabsContent
          value="usage"
          className="flex-1 overflow-y-auto mt-2 rounded border bg-card"
        >
          <CostEstimateTable
            costEstimate={finalPayload?.metadata?.cost_estimate ?? null}
          />
        </TabsContent>

        {/* JSON Stream */}
        <TabsContent
          value="json"
          className="flex-1 flex flex-col overflow-hidden mt-2 rounded border bg-muted/30"
        >
          <div className="flex justify-between items-center px-3 py-1.5 border-b flex-shrink-0">
            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
              Raw NDJSON Stream
            </span>
            <CopyButton content={rawJsonLog} label="Copy JSON" />
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 p-3">
            <pre className="text-[10px] font-mono whitespace-pre-wrap text-foreground/70">
              {rawJsonLog || "No JSON data yet..."}
            </pre>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
