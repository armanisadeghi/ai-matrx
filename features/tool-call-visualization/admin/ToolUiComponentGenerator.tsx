"use client";

import React, { useState, useCallback, useEffect } from "react";
import {
  Zap,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Save,
  Eye,
  Database,
  Gem,
  FlaskConical,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  X,
  BookmarkCheck,
  ThumbsUp,
  Copy,
  ClipboardList,
  HardDrive,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useToolComponentAgent } from "./hooks/useToolComponentAgent";
import { COMPONENT_GENERATOR_PROMPT_ID } from "./tool-ui-generator-prompt";

import type {
  ToolLifecycleEntry,
  ToolLifecycleStatus,
} from "@/features/agents/types/request.types";
import type { ToolEventPayload } from "@/types/python-generated/stream-events";
import { ToolCallVisualization } from "@/features/tool-call-visualization/components/ToolCallVisualization";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GeneratorProps {
  tools: Array<{
    id: string;
    name: string;
    description: string;
    category?: string | null;
    output_schema?: unknown;
    parameters?: unknown;
    source_kind?: string | null;
    managed_by_server_id?: string | null;
    tags?: string[] | null;
    icon?: string | null;
    is_active?: boolean | null;
    /** Matches `tool_def.version` in the database (integer). */
    version?: number;
  }>;
  onComplete?: () => void;
  /** When provided, skips step 1 and pre-selects this tool automatically */
  preselectedToolName?: string;
}

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

interface CxToolCallEntry {
  id: string;
  tool_name: string;
  call_id: string;
  status: string;
  arguments: Record<string, unknown>;
  output: string | null;
  output_type: string | null;
  duration_ms: number;
  started_at: string;
  completed_at: string;
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
  contract_version: 1 | 2;
}

type WizardStep =
  | "select-tool"
  | "select-data"
  | "generate"
  | "review"
  | "saved";

// ─── Draft persistence ────────────────────────────────────────────────────────

const DRAFT_KEY_PREFIX = "tool-ui-generator-draft:";

function saveDraft(
  toolName: string,
  component: GeneratedComponent,
  rawResponse: string,
) {
  try {
    localStorage.setItem(
      `${DRAFT_KEY_PREFIX}${toolName}`,
      JSON.stringify({ component, rawResponse, savedAt: Date.now() }),
    );
  } catch {
    /* quota exceeded — silently ignore */
  }
}

function loadDraft(toolName: string): {
  component: GeneratedComponent;
  rawResponse: string;
  savedAt: number;
} | null {
  try {
    const raw = localStorage.getItem(`${DRAFT_KEY_PREFIX}${toolName}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearDraft(toolName: string) {
  try {
    localStorage.removeItem(`${DRAFT_KEY_PREFIX}${toolName}`);
  } catch {
    /* ignore */
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extract a named section's code block content from the hybrid response format. */
function extractSectionCode(text: string, section: string): string {
  // Primary: ## SECTION_NAME (optional spaces/newlines) ```lang\nCODE\n```
  // Handles: spaces in header, optional lang tag, CRLF, trailing content after closing ```
  const primary = new RegExp(
    `##\\s*${section}\\s*[\\r\\n]+\`\`\`(?:jsx|js|tsx|ts|javascript|typescript)?[^\\n]*[\\r\\n]([\\s\\S]*?)\`\`\``,
    "i",
  );
  const primaryMatch = text.match(primary);
  if (primaryMatch) return primaryMatch[1].trim();

  // Fallback: look for the section header anywhere (e.g. "OVERLAY CODE" vs "OVERLAY_CODE")
  const relaxedSection = section.replace(/_/g, "[_\\s]");
  const fallback = new RegExp(
    `##\\s*${relaxedSection}\\s*[\\r\\n]+\`\`\`(?:jsx|js|tsx|ts|javascript|typescript)?[^\\n]*[\\r\\n]([\\s\\S]*?)\`\`\``,
    "i",
  );
  const fallbackMatch = text.match(fallback);
  if (fallbackMatch) return fallbackMatch[1].trim();

  return "";
}

/**
 * Parse the AI response into a GeneratedComponent.
 *
 * Tries two formats in order:
 *   1. HYBRID (new): ## METADATA json block + ## SECTION_NAME jsx blocks
 *   2. LEGACY (old): single ```json block or bare {...} containing all fields
 *
 * IMPORTANT: Never returns null when we have any usable code. A missing
 * tool_name is filled in by the caller from context (we always know the tool).
 * Partial results are returned rather than discarding expensive AI output.
 */
function extractJsonFromResponse(
  text: string,
  fallbackToolName = "",
): GeneratedComponent | null {
  // ── 1. Hybrid format ───────────────────────────────────────────────────
  const metaMatch = text.match(/##\s+METADATA\s*\n```json\s*\n([\s\S]*?)```/i);
  if (metaMatch) {
    let meta: Partial<GeneratedComponent> = {};
    try {
      meta = JSON.parse(metaMatch[1].trim()) as Partial<GeneratedComponent>;
    } catch {
      // Metadata block malformed — still extract code sections below
    }

    const inline_code = extractSectionCode(text, "INLINE_CODE");
    const overlay_code = extractSectionCode(text, "OVERLAY_CODE");
    const utility_code = extractSectionCode(text, "UTILITY_CODE");
    const header_subtitle_code = extractSectionCode(
      text,
      "HEADER_SUBTITLE_CODE",
    );
    const header_extras_code = extractSectionCode(text, "HEADER_EXTRAS_CODE");

    // Only discard if there is literally no code at all
    if (!inline_code && !overlay_code && !utility_code) {
      // Fall through to legacy parser
    } else {
      return {
        tool_name: meta.tool_name || fallbackToolName,
        display_name: meta.display_name || fallbackToolName,
        results_label: meta.results_label || "Results",
        keep_expanded_on_stream: meta.keep_expanded_on_stream ?? false,
        allowed_imports: meta.allowed_imports ?? ["react", "lucide-react"],
        version: meta.version ?? "2.0.0",
        contract_version: meta.contract_version === 1 ? 1 : 2,
        inline_code,
        overlay_code,
        utility_code,
        header_subtitle_code,
        header_extras_code,
      };
    }
  }

  // ── 2. Legacy format (backward compat) ────────────────────────────────
  const jsonBlockMatch = text.match(/```json\s*\n?([\s\S]*?)```/);
  if (jsonBlockMatch) {
    try {
      const parsed = JSON.parse(
        jsonBlockMatch[1].trim(),
      ) as Partial<GeneratedComponent>;
      if (parsed.inline_code) {
        return {
          tool_name: parsed.tool_name || fallbackToolName,
          display_name: parsed.display_name || fallbackToolName,
          results_label: parsed.results_label || "Results",
          keep_expanded_on_stream: parsed.keep_expanded_on_stream ?? false,
          allowed_imports: parsed.allowed_imports ?? ["react", "lucide-react"],
          version: parsed.version ?? "2.0.0",
          contract_version: parsed.contract_version === 1 ? 1 : 2,
          inline_code: parsed.inline_code || "",
          overlay_code: parsed.overlay_code || "",
          utility_code: parsed.utility_code || "",
          header_subtitle_code: parsed.header_subtitle_code || "",
          header_extras_code: parsed.header_extras_code || "",
        };
      }
    } catch {
      // fall through
    }
  }

  // ── 3. Bare object match ───────────────────────────────────────────────
  const braceMatch = text.match(/\{[\s\S]*"inline_code"[\s\S]*\}/);
  if (braceMatch) {
    try {
      const parsed = JSON.parse(braceMatch[0]) as Partial<GeneratedComponent>;
      if (parsed.inline_code) {
        return {
          tool_name: parsed.tool_name || fallbackToolName,
          display_name: parsed.display_name || fallbackToolName,
          results_label: parsed.results_label || "Results",
          keep_expanded_on_stream: parsed.keep_expanded_on_stream ?? false,
          allowed_imports: parsed.allowed_imports ?? ["react", "lucide-react"],
          version: parsed.version ?? "2.0.0",
          contract_version: parsed.contract_version === 1 ? 1 : 2,
          inline_code: parsed.inline_code || "",
          overlay_code: parsed.overlay_code || "",
          utility_code: parsed.utility_code || "",
          header_subtitle_code: parsed.header_subtitle_code || "",
          header_extras_code: parsed.header_extras_code || "",
        };
      }
    } catch {
      // fall through
    }
  }

  return null;
}

function argsPreview(args: Record<string, unknown>): string {
  const keys = Object.keys(args);
  if (keys.length === 0) return "No arguments";
  return (
    keys
      .slice(0, 3)
      .map((k) => {
        const v = args[k];
        const display =
          typeof v === "string" ? `"${v.slice(0, 30)}"` : JSON.stringify(v);
        return `${k}: ${display}`;
      })
      .join(", ") + (keys.length > 3 ? ", …" : "")
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface SampleCardProps {
  sample: ToolTestSample;
  selected: boolean;
  onToggle: () => void;
}

function SampleCard({ sample, selected, onToggle }: SampleCardProps) {
  return (
    <button
      onClick={onToggle}
      className={`w-full text-left p-3 rounded-lg border transition-all ${
        selected
          ? "border-primary bg-primary/5 dark:bg-primary/10"
          : "border-border hover:border-border/80 hover:bg-muted/30"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
              selected ? "bg-primary border-primary" : "border-border"
            }`}
          >
            {selected && (
              <CheckCircle className="w-3 h-3 text-primary-foreground" />
            )}
          </div>
          <span className="text-xs font-mono text-muted-foreground truncate">
            {argsPreview(sample.arguments)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {sample.use_for_component && (
            <Badge
              variant="secondary"
              className="text-[10px] gap-0.5 h-4 px-1.5"
            >
              <BookmarkCheck className="h-2.5 w-2.5" />
              Tagged
            </Badge>
          )}
          {sample.is_success === true && (
            <Badge
              variant="outline"
              className="text-[10px] h-4 px-1.5 text-success border-success/40"
            >
              <ThumbsUp className="h-2.5 w-2.5 mr-0.5" />
              Pass
            </Badge>
          )}
          <span className="text-[10px] text-muted-foreground">
            {formatDistanceToNow(new Date(sample.created_at), {
              addSuffix: true,
            })}
          </span>
        </div>
      </div>
      <div className="mt-1.5 text-[10px] text-muted-foreground">
        {sample.raw_stream_events?.length ?? 0} stream events
        {sample.admin_comments && (
          <span className="ml-2 italic">
            "{sample.admin_comments.slice(0, 60)}"
          </span>
        )}
      </div>
    </button>
  );
}

interface DbEntryCardProps {
  entry: CxToolCallEntry;
  selected: boolean;
  onToggle: () => void;
}

function DbEntryCard({ entry, selected, onToggle }: DbEntryCardProps) {
  const outputPreview = entry.output
    ? entry.output.slice(0, 100) + (entry.output.length > 100 ? "…" : "")
    : "No output";
  return (
    <button
      onClick={onToggle}
      className={`w-full text-left p-3 rounded-lg border transition-all ${
        selected
          ? "border-primary bg-primary/5 dark:bg-primary/10"
          : "border-border hover:border-border/80 hover:bg-muted/30"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
              selected ? "bg-primary border-primary" : "border-border"
            }`}
          >
            {selected && (
              <CheckCircle className="w-3 h-3 text-primary-foreground" />
            )}
          </div>
          <span className="text-xs font-mono text-muted-foreground truncate">
            {argsPreview(entry.arguments)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[10px] font-mono text-muted-foreground">
            {(entry.duration_ms / 1000).toFixed(1)}s
          </span>
          <span className="text-[10px] text-muted-foreground">
            {formatDistanceToNow(new Date(entry.completed_at), {
              addSuffix: true,
            })}
          </span>
        </div>
      </div>
      <div className="mt-1.5 text-[10px] text-muted-foreground font-mono truncate">
        {outputPreview}
      </div>
    </button>
  );
}

interface CodeBlockProps {
  code: string;
  label: string;
}

function CodeBlock({ code, label }: CodeBlockProps) {
  if (!code) {
    return (
      <p className="text-xs text-muted-foreground italic py-4 text-center">
        Not generated
      </p>
    );
  }
  return (
    <pre className="text-xs bg-muted/40 dark:bg-slate-900 p-3 rounded-lg overflow-auto max-h-[350px] whitespace-pre-wrap font-mono leading-relaxed">
      {code}
    </pre>
  );
}

interface RawResponseProps {
  text: string;
}

function RawResponse({ text }: RawResponseProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-lg border border-border">
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
      >
        <span>Raw model response</span>
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5" />
        )}
      </button>
      {expanded && (
        <div className="border-t border-border">
          <pre className="text-xs p-3 font-mono whitespace-pre-wrap overflow-auto max-h-[400px] text-muted-foreground">
            {text}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Live Preview ─────────────────────────────────────────────────────────────

interface LivePreviewProps {
  toolName: string;
  rawStreamEvents: unknown[];
}

function buildPreviewEntry(
  toolName: string,
  rawStreamEvents: unknown[],
): ToolLifecycleEntry[] {
  const events = rawStreamEvents as ToolEventPayload[];
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

  const completedResult =
    (completedEvent?.data as Record<string, unknown> | undefined)?.result ??
    null;
  const lastWithMessage = [...events].reverse().find((e) => e.message);
  const lastWithData = [...events]
    .reverse()
    .find((e) => e.data && Object.keys(e.data).length > 0);

  return [
    {
      callId,
      toolName,
      displayName: toolName,
      status,
      arguments: args,
      startedAt: new Date().toISOString(),
      completedAt: completedEvent ? new Date().toISOString() : null,
      latestMessage: lastWithMessage?.message ?? null,
      latestData:
        (lastWithData?.data as Record<string, unknown> | undefined) ?? null,
      result: completedResult,
      resultPreview:
        completedResult != null ? String(completedResult).slice(0, 200) : null,
      errorType: errorEvent ? "tool_error" : null,
      errorMessage: errorEvent?.message ?? null,
      isDelegated: false,
      events,
    },
  ];
}

function LivePreview({ toolName, rawStreamEvents }: LivePreviewProps) {
  const entries = buildPreviewEntry(toolName, rawStreamEvents);

  if (entries.length === 0 || entries[0].events.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-xs text-muted-foreground gap-2">
        <Eye className="w-4 h-4 opacity-40" />
        No usable output in this sample
      </div>
    );
  }

  return <ToolCallVisualization entries={entries} />;
}

// ─── Step Progress Bar ────────────────────────────────────────────────────────

const STEPS: { key: WizardStep; label: string }[] = [
  { key: "select-tool", label: "Select Tool" },
  { key: "select-data", label: "Select Data" },
  { key: "generate", label: "Generate" },
  { key: "review", label: "Review" },
  { key: "saved", label: "Saved" },
];

function StepProgress({ current }: { current: WizardStep }) {
  const currentIdx = STEPS.findIndex((s) => s.key === current);
  return (
    <div className="flex items-center gap-1.5 text-xs flex-wrap">
      {STEPS.map((s, i) => (
        <React.Fragment key={s.key}>
          {i > 0 && (
            <ArrowRight className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />
          )}
          <Badge
            variant={
              current === s.key
                ? "default"
                : i < currentIdx
                  ? "secondary"
                  : "outline"
            }
            className="text-[10px]"
          >
            {i + 1}. {s.label}
          </Badge>
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ToolUiComponentGenerator({
  tools,
  onComplete,
  preselectedToolName,
}: GeneratorProps) {
  const { toast } = useToast();
  const agent = useToolComponentAgent();

  const [step, setStep] = useState<WizardStep>(
    preselectedToolName ? "select-data" : "select-tool",
  );
  const [selectedToolName, setSelectedToolName] = useState(
    preselectedToolName ?? "",
  );

  // Data fetching state
  const [testSamples, setTestSamples] = useState<ToolTestSample[]>([]);
  const [dbEntries, setDbEntries] = useState<CxToolCallEntry[]>([]);
  const [isFetchingData, setIsFetchingData] = useState(false);

  // Selection state
  const [selectedSampleIds, setSelectedSampleIds] = useState<Set<string>>(
    new Set(),
  );
  const [selectedDbEntryIds, setSelectedDbEntryIds] = useState<Set<string>>(
    new Set(),
  );
  const [userInstructions, setUserInstructions] = useState("");

  // Generation state
  const [generatedComponent, setGeneratedComponent] =
    useState<GeneratedComponent | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState("");

  // Save state
  const [isSaving, setIsSaving] = useState(false);
  const [savedSampleStreamEvents, setSavedSampleStreamEvents] = useState<
    unknown[]
  >([]);
  const [saveError, setSaveError] = useState<{
    title: string;
    detail: string;
    raw?: string;
  } | null>(null);
  const [hasDraft, setHasDraft] = useState(false);

  const selectedTool = tools.find((t) => t.name === selectedToolName);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchDataForTool = useCallback(
    async (toolName: string, toolId: string) => {
      setIsFetchingData(true);
      setTestSamples([]);
      setDbEntries([]);
      setSelectedSampleIds(new Set());
      setSelectedDbEntryIds(new Set());

      try {
        const [samplesResult, dbResult] = await Promise.all([
          supabase
            .schema("tool").from("test_sample")
            .select("*")
            .or(`tool_name.eq.${toolName},tool_id.eq.${toolId}`)
            .order("created_at", { ascending: false })
            .limit(10),
          supabase
            .from("cx_tool_call")
            .select(
              "id, tool_name, call_id, status, arguments, output, output_type, duration_ms, started_at, completed_at",
            )
            .eq("tool_name", toolName)
            .eq("status", "completed")
            .not("output", "is", null)
            .order("completed_at", { ascending: false })
            .limit(5),
        ]);

        const samples = (samplesResult.data ?? []) as ToolTestSample[];
        const entries = (dbResult.data ?? []) as CxToolCallEntry[];
        setTestSamples(samples);
        setDbEntries(entries);

        // Auto-select samples tagged for component use
        const taggedIds = new Set(
          samples
            .filter((s) => s.use_for_component || s.is_success === true)
            .map((s) => s.id),
        );
        setSelectedSampleIds(
          taggedIds.size > 0
            ? taggedIds
            : new Set(samples.slice(0, 1).map((s) => s.id)),
        );

        // Auto-select first db entry
        if (entries.length > 0) {
          setSelectedDbEntryIds(new Set([entries[0].id]));
        }
      } catch (err) {
        toast({
          title: "Error loading data",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
      } finally {
        setIsFetchingData(false);
      }
    },
    [toast],
  );

  // Auto-fetch when preselectedToolName is provided
  useEffect(() => {
    if (preselectedToolName && selectedTool) {
      fetchDataForTool(selectedTool.name, selectedTool.id);
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check for a saved draft when the tool is known
  useEffect(() => {
    const toolName = selectedToolName || preselectedToolName || "";
    if (!toolName) return;
    const draft = loadDraft(toolName);
    setHasDraft(!!draft);
  }, [selectedToolName, preselectedToolName]);

  // ── Step 1: Tool selection ─────────────────────────────────────────────────

  const handleToolSelected = () => {
    if (!selectedToolName || !selectedTool) {
      toast({ title: "Select a tool", variant: "destructive" });
      return;
    }
    fetchDataForTool(selectedTool.name, selectedTool.id);
    setStep("select-data");
  };

  // ── Step 2: Data selection → Generate ─────────────────────────────────────

  const handleGenerate = async () => {
    if (!selectedTool) return;

    const selectedSamples = testSamples.filter((s) =>
      selectedSampleIds.has(s.id),
    );
    const selectedEntries = dbEntries.filter((e) =>
      selectedDbEntryIds.has(e.id),
    );

    // Require at least one sample for stream data
    if (selectedSamples.length === 0) {
      toast({
        title: "No stream samples selected",
        description: "Select at least one test sample to provide stream data.",
        variant: "destructive",
      });
      return;
    }

    // Build db entry data: prefer cx_tool_call output, fall back to final_payload
    let dbEntryData: unknown;
    if (selectedEntries.length > 0) {
      dbEntryData = selectedEntries.map((e) => {
        try {
          return JSON.parse(e.output ?? "null");
        } catch {
          return e.output;
        }
      });
    } else {
      // Fallback: use final_payload from test samples
      dbEntryData = selectedSamples.map((s) => s.final_payload).filter(Boolean);
    }

    // Save sample stream events for live preview after generation
    const firstSample = selectedSamples[0];
    setSavedSampleStreamEvents(firstSample.raw_stream_events ?? []);

    agent.reset();
    setRawResponse("");
    setGeneratedComponent(null);
    setParseError(null);
    setStep("generate");

    const variables: Record<string, string> = {
      complete_tool_object: JSON.stringify(selectedTool, null, 2),
      output_schema: JSON.stringify(selectedTool.output_schema ?? {}, null, 2),
      sample_stream: JSON.stringify(
        selectedSamples.map((s) => s.raw_stream_events),
        null,
        2,
      ),
      sample_database_entry: JSON.stringify(dbEntryData, null, 2),
    };

    const fullText = await agent.execute({
      agentId: COMPONENT_GENERATOR_PROMPT_ID,
      variables,
      userInput: userInstructions.trim() || undefined,
    });

    if (fullText) {
      setRawResponse(fullText);
      const toolNameForDraft = selectedToolName || preselectedToolName || "";
      const parsed = extractJsonFromResponse(fullText, toolNameForDraft);
      if (parsed) {
        setGeneratedComponent(parsed);
        setParseError(null);
        // Persist draft immediately — protects against save failure
        saveDraft(toolNameForDraft, parsed, fullText);
        setHasDraft(true);
      } else {
        setParseError(
          "Could not extract any component code from the model's response. " +
            "Review the raw response below — you may copy the code manually into the editor.",
        );
        // Still save the raw response so it's recoverable
        saveDraft(
          toolNameForDraft,
          {
            tool_name: toolNameForDraft,
            display_name: toolNameForDraft,
            results_label: "Results",
            inline_code: "",
            overlay_code: "",
            utility_code: "",
            header_extras_code: "",
            header_subtitle_code: "",
            keep_expanded_on_stream: false,
            allowed_imports: [],
            version: "2.0.0",
            contract_version: 2,
          },
          fullText,
        );
        setHasDraft(true);
      }
    }

    setStep("review");
  };

  // ── Step 4: Save (upsert — create or update existing) ────────────────────

  const handleSave = async () => {
    if (!generatedComponent) return;

    setIsSaving(true);
    setSaveError(null);
    try {
      const toolRecord = tools.find(
        (t) => t.name === generatedComponent.tool_name,
      );

      // Check for an existing component so we can PUT instead of POST
      let existingId: string | null = null;
      try {
        const checkRes = await fetch(
          `/api/admin/tool-ui-components?tool_name=${encodeURIComponent(generatedComponent.tool_name)}`,
        );
        if (checkRes.ok) {
          const checkData = (await checkRes.json()) as {
            components?: Array<{ id: string }>;
          };
          if (checkData.components && checkData.components.length > 0) {
            existingId = checkData.components[0].id;
          }
        }
      } catch {
        // Network error on check — attempt POST anyway
      }

      const url = existingId
        ? `/api/admin/tool-ui-components/${existingId}`
        : "/api/admin/tool-ui-components";
      const method = existingId ? "PUT" : "POST";

      const payload = {
        ...generatedComponent,
        tool_id: toolRecord?.id ?? null,
        language: "tsx",
        is_active: true,
        notes: `${existingId ? "Updated" : "Created"} by AI Component Generator`,
      };

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let errTitle = `HTTP ${response.status}`;
        let errDetail = "Unknown error";
        try {
          const errData = (await response.json()) as {
            error?: string;
            details?: string;
            message?: string;
          };
          errTitle = errData.error || errTitle;
          errDetail = errData.details || errData.message || errDetail;
        } catch {
          /* body not json */
        }
        throw Object.assign(new Error(errTitle), { detail: errDetail });
      }

      // Success — clear draft
      clearDraft(generatedComponent.tool_name);
      setHasDraft(false);
      toast({
        title: `Component ${existingId ? "updated" : "saved"}`,
        description: "It will be active on the next tool use.",
      });
      setStep("saved");
      onComplete?.();
    } catch (err) {
      const e = err as Error & { detail?: string };
      setSaveError({
        title: e.message || "Save failed",
        detail:
          e.detail ||
          "The component could not be saved. Your draft is preserved in local storage — you can retry or copy the code manually.",
        raw: rawResponse,
      });
    } finally {
      setIsSaving(false);
    }
  };

  // ── Reset ─────────────────────────────────────────────────────────────────

  const handleReset = () => {
    agent.reset();
    setStep("select-tool");
    setSelectedToolName("");
    setTestSamples([]);
    setDbEntries([]);
    setSelectedSampleIds(new Set());
    setSelectedDbEntryIds(new Set());
    setUserInstructions("");
    setGeneratedComponent(null);
    setParseError(null);
    setRawResponse("");
    setSavedSampleStreamEvents([]);
    setSaveError(null);
    setHasDraft(false);
  };

  // ── Draft recovery ────────────────────────────────────────────────────────

  const handleRestoreDraft = () => {
    const toolName = selectedToolName || preselectedToolName || "";
    const draft = loadDraft(toolName);
    if (!draft) return;
    setGeneratedComponent(draft.component);
    setRawResponse(draft.rawResponse);
    setSaveError(null);
    setParseError(null);
    setStep("review");
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 p-1">
      {!preselectedToolName && <StepProgress current={step} />}

      {/* ── Draft recovery banner ─────────────────────────────────────── */}
      {hasDraft && step !== "review" && step !== "saved" && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-warning/10 border border-warning/30">
          <HardDrive className="w-4 h-4 text-warning flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-warning">
              Unsaved draft detected
            </p>
            <p className="text-[11px] text-muted-foreground">
              A previous AI generation was not saved. You can restore it.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1 flex-shrink-0"
            onClick={handleRestoreDraft}
          >
            <ClipboardList className="w-3 h-3" />
            Restore Draft
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 flex-shrink-0"
            onClick={() => {
              clearDraft(selectedToolName || preselectedToolName || "");
              setHasDraft(false);
            }}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      )}

      {/* ── Save Error Dialog ─────────────────────────────────────────── */}
      <Dialog
        open={!!saveError}
        onOpenChange={(open) => {
          if (!open) setSaveError(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Save Failed — Your Work Is Safe
            </DialogTitle>
            <DialogDescription>
              The component could not be saved to the database. Your draft is
              preserved in local storage — close this dialog and retry, or copy
              the code manually.
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

            {saveError?.raw && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">
                    Full AI Response (copy &amp; paste into the Edit Code tab if
                    needed)
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[11px] gap-1"
                    onClick={() => {
                      navigator.clipboard
                        .writeText(saveError.raw ?? "")
                        .then(() => {
                          toast({ title: "Copied to clipboard" });
                        })
                        .catch(() => {
                          toast({
                            title: "Copy failed",
                            description:
                              "Use Ctrl+A / Cmd+A to select the text below manually.",
                            variant: "destructive",
                          });
                        });
                    }}
                  >
                    <Copy className="w-3 h-3" />
                    Copy All
                  </Button>
                </div>
                <pre className="text-[11px] bg-muted/40 p-3 rounded-lg overflow-auto max-h-[300px] whitespace-pre-wrap font-mono">
                  {saveError.raw}
                </pre>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                onClick={() => {
                  setSaveError(null);
                  handleSave();
                }}
                disabled={isSaving}
                className="gap-1.5"
              >
                {isSaving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                Retry Save
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSaveError(null)}
              >
                Close &amp; Keep Draft
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Step 1: Select Tool ───────────────────────────────────────── */}
      {step === "select-tool" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Database className="w-4 h-4" />
              Select Tool
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs mb-1.5 block">
                Choose a tool to generate a UI component for
              </Label>
              <Select
                value={selectedToolName}
                onValueChange={setSelectedToolName}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a tool…" />
                </SelectTrigger>
                <SelectContent>
                  {tools.map((tool) => (
                    <SelectItem key={tool.name} value={tool.name}>
                      <span className="font-mono text-xs">{tool.name}</span>
                      {tool.category && (
                        <span className="text-xs text-muted-foreground ml-2">
                          [{tool.category}]
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedTool && (
              <div className="p-3 bg-muted/30 rounded-lg text-xs space-y-1.5 border border-border">
                <div className="font-medium font-mono">{selectedTool.name}</div>
                <div className="text-muted-foreground">
                  {selectedTool.description}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {selectedTool.category && (
                    <Badge variant="outline" className="text-[10px]">
                      {selectedTool.category}
                    </Badge>
                  )}
                  {selectedTool.output_schema ? (
                    <Badge variant="secondary" className="text-[10px]">
                      Has output schema
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-[10px] text-warning border-warning/40"
                    >
                      No output schema
                    </Badge>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button
                onClick={handleToolSelected}
                disabled={!selectedToolName}
                size="sm"
              >
                Next
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2: Select Data ───────────────────────────────────────── */}
      {step === "select-data" && (
        <div className="space-y-4">
          {isFetchingData ? (
            <div className="flex items-center justify-center py-12 gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading saved data for {selectedToolName}…
            </div>
          ) : (
            <>
              {/* No samples warning */}
              {testSamples.length === 0 && (
                <div className="flex items-start gap-3 p-4 rounded-lg bg-warning/10 border border-warning/30">
                  <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">No test samples saved</p>
                    <p className="text-xs text-muted-foreground">
                      Run this tool on the{" "}
                      <a
                        href="/demos/api-tests/tool-testing"
                        target="_blank"
                        className="underline text-primary"
                      >
                        Tool Testing page
                      </a>{" "}
                      and save a sample first. Samples provide the stream data
                      the AI needs to generate accurate components.
                    </p>
                  </div>
                </div>
              )}

              {/* Summary row when preselected (collapsed view) */}
              {preselectedToolName ? (
                <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground py-1">
                  <span className="flex items-center gap-1.5">
                    <FlaskConical className="w-3.5 h-3.5" />
                    <span className="font-medium text-foreground">
                      {selectedSampleIds.size}
                    </span>{" "}
                    of {testSamples.length} samples selected
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5" />
                    <span className="font-medium text-foreground">
                      {selectedDbEntryIds.size}
                    </span>{" "}
                    of {dbEntries.length} db entries selected
                  </span>
                  {dbEntries.length === 0 && testSamples.length > 0 && (
                    <span className="text-warning">
                      ↳ Using final_payload fallback
                    </span>
                  )}
                  <button
                    onClick={() => {
                      /* show advanced — handled by toggle below */
                    }}
                    className="ml-auto text-[11px] underline text-primary"
                    style={{ display: "none" }}
                  />
                </div>
              ) : (
                <>
                  {/* Full sample selection cards (standalone mode) */}
                  {testSamples.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <FlaskConical className="w-4 h-4" />
                          Stream Samples
                          <Badge variant="outline" className="text-[10px] ml-1">
                            {testSamples.length}
                          </Badge>
                          <span className="text-xs font-normal text-muted-foreground ml-auto">
                            {selectedSampleIds.size} selected
                          </span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {testSamples.map((sample) => (
                          <SampleCard
                            key={sample.id}
                            sample={sample}
                            selected={selectedSampleIds.has(sample.id)}
                            onToggle={() =>
                              setSelectedSampleIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(sample.id)) next.delete(sample.id);
                                else next.add(sample.id);
                                return next;
                              })
                            }
                          />
                        ))}
                      </CardContent>
                    </Card>
                  )}
                  {dbEntries.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Database className="w-4 h-4" />
                          Database Entries
                          <Badge variant="outline" className="text-[10px] ml-1">
                            {dbEntries.length}
                          </Badge>
                          <span className="text-xs font-normal text-muted-foreground ml-auto">
                            {selectedDbEntryIds.size} selected
                          </span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {dbEntries.map((entry) => (
                          <DbEntryCard
                            key={entry.id}
                            entry={entry}
                            selected={selectedDbEntryIds.has(entry.id)}
                            onToggle={() =>
                              setSelectedDbEntryIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(entry.id)) next.delete(entry.id);
                                else next.add(entry.id);
                                return next;
                              })
                            }
                          />
                        ))}
                      </CardContent>
                    </Card>
                  )}
                  {dbEntries.length === 0 && testSamples.length > 0 && (
                    <p className="text-xs text-muted-foreground px-1">
                      No <span className="font-mono">cx_tool_call</span> entries
                      found — <span className="font-mono">final_payload</span>{" "}
                      from test samples will be used as fallback.
                    </p>
                  )}
                </>
              )}

              {/* Instructions */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Additional Instructions (Optional) …
                </Label>
                <Textarea
                  value={userInstructions}
                  onChange={(e) => setUserInstructions(e.target.value)}
                  placeholder="e.g., Use a card grid layout, emphasize the score field, add a copy button…"
                  className="text-xs min-h-[72px] resize-none"
                  style={{ fontSize: "16px" }}
                />
              </div>

              <div className="flex items-center justify-between">
                {!preselectedToolName && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setStep("select-tool")}
                  >
                    <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
                    Back
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={handleGenerate}
                  disabled={selectedSampleIds.size === 0 || isFetchingData}
                  className={preselectedToolName ? "w-full" : ""}
                >
                  <Zap className="w-3.5 h-3.5 mr-1.5" />
                  Generate Component
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Step 3 + 4: Generating → Review (single persistent panel) ── */}
      {(step === "generate" || step === "review") && (
        <div className="space-y-4">
          {/* Header row */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {agent.isStreaming ? (
                <>
                  <Gem className="w-4 h-4 animate-pulse text-primary" />
                  <span className="text-sm font-medium">Generating…</span>
                </>
              ) : step === "review" && parseError ? (
                <>
                  <AlertTriangle className="w-4 h-4 text-warning" />
                  <span className="text-sm font-medium">
                    Parse failed — review the response below
                  </span>
                </>
              ) : step === "review" ? (
                <>
                  <CheckCircle className="w-4 h-4 text-success" />
                  <span className="text-sm font-medium">
                    Component ready to save
                  </span>
                </>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {agent.isStreaming && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={agent.cancel}
                  className="text-xs h-7 gap-1"
                >
                  <X className="w-3 h-3" />
                  Cancel
                </Button>
              )}
              {step === "review" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setStep("select-data");
                    agent.reset();
                  }}
                  className="text-xs h-7 gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  Regenerate
                </Button>
              )}
              {step === "review" && generatedComponent && (
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="h-7 text-xs gap-1"
                >
                  {isSaving ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Save className="w-3 h-3" />
                  )}
                  {isSaving ? "Saving…" : "Save to Database"}
                </Button>
              )}
            </div>
          </div>

          {agent.error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-xs text-destructive">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {agent.error}
            </div>
          )}

          {/* ── Always-visible MarkdownStream ────────────────────── */}
          {/* This stays visible throughout generate AND review.      */}
          {/* Even on parse failure the admin sees the full response. */}
          <div className="rounded-lg border border-border bg-muted/20 overflow-hidden">
            <div className="px-3 py-2 border-b border-border flex items-center justify-between">
              <span className="text-[11px] font-medium text-muted-foreground">
                Model response
              </span>
              {step === "review" && rawResponse && (
                <span className="text-[11px] text-muted-foreground font-mono">
                  {rawResponse.length.toLocaleString()} chars
                </span>
              )}
            </div>
            <div className="p-4 min-h-[200px] max-h-full overflow-y-auto">
              {agent.accumulatedText || rawResponse ? (
                <MarkdownStream
                  content={agent.accumulatedText || rawResponse}
                  isStreamActive={agent.isStreaming}
                />
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  Waiting for model response…
                </p>
              )}
            </div>
          </div>

          {/* ── Parsed component tabs (only when parse succeeded) ── */}
          {step === "review" && generatedComponent && (
            <Card>
              <CardContent className="pt-4 space-y-4">
                {/* Metadata row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground block">Tool</span>
                    <p className="font-mono font-medium">
                      {generatedComponent.tool_name}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">
                      Display Name
                    </span>
                    <p className="font-medium">
                      {generatedComponent.display_name}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">
                      Results Label
                    </span>
                    <p className="font-medium">
                      {generatedComponent.results_label || "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">
                      Keep Expanded
                    </span>
                    <p className="font-medium">
                      {generatedComponent.keep_expanded_on_stream
                        ? "Yes"
                        : "No"}
                    </p>
                  </div>
                </div>

                {/* Code tabs */}
                <Tabs defaultValue="inline">
                  <TabsList>
                    <TabsTrigger value="inline" className="text-xs">
                      Inline
                    </TabsTrigger>
                    <TabsTrigger value="overlay" className="text-xs">
                      Overlay
                    </TabsTrigger>
                    <TabsTrigger value="utility" className="text-xs">
                      Utility
                    </TabsTrigger>
                    <TabsTrigger value="headers" className="text-xs">
                      Headers
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="inline">
                    <CodeBlock
                      code={generatedComponent.inline_code}
                      label="inline_code"
                    />
                  </TabsContent>
                  <TabsContent value="overlay">
                    <CodeBlock
                      code={generatedComponent.overlay_code}
                      label="overlay_code"
                    />
                  </TabsContent>
                  <TabsContent value="utility">
                    <CodeBlock
                      code={generatedComponent.utility_code}
                      label="utility_code"
                    />
                  </TabsContent>
                  <TabsContent value="headers" className="space-y-3">
                    <div>
                      <Label className="text-[10px] text-muted-foreground mb-1 block">
                        header_subtitle_code
                      </Label>
                      <CodeBlock
                        code={generatedComponent.header_subtitle_code}
                        label="header_subtitle_code"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground mb-1 block">
                        header_extras_code
                      </Label>
                      <CodeBlock
                        code={generatedComponent.header_extras_code}
                        label="header_extras_code"
                      />
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Step 5: Saved + Live Preview ──────────────────────────────── */}
      {step === "saved" && (
        <div className="space-y-4">
          <Card className="border-success/30 bg-success/5">
            <CardContent className="pt-6 text-center space-y-2">
              <CheckCircle className="w-10 h-10 text-success mx-auto" />
              <h3 className="text-base font-semibold">Component Saved</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                The UI component for{" "}
                <span className="font-mono font-medium">
                  {selectedToolName}
                </span>{" "}
                is now active. It will render automatically the next time this
                tool is used in chat.
              </p>
            </CardContent>
          </Card>

          {/* Live preview */}
          {savedSampleStreamEvents.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  Live Preview
                  <Badge variant="secondary" className="text-[10px]">
                    New component
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">
                  Preview uses the first selected sample's stream data. The
                  component is fetched fresh from the database.
                </p>
                <LivePreview
                  toolName={selectedToolName}
                  rawStreamEvents={savedSampleStreamEvents}
                />
              </CardContent>
            </Card>
          )}

          <div className="flex justify-center">
            <Button variant="outline" size="sm" onClick={handleReset}>
              Generate Another
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
