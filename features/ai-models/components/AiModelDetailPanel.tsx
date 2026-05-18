"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { extractErrorMessage } from "@/utils/errors";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  X,
  CheckCircle2,
  Save,
  LogOut,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  AlertTriangle,
  PanelRight,
} from "lucide-react";
import AiModelForm from "./AiModelForm";
import JsonFieldEditor from "./JsonFieldEditor";
import ControlsEditor from "./ControlsEditor";
import ConstraintsEditor from "./ConstraintsEditor";
import ModelUsageAudit from "./ModelUsageAudit";
import { aiModelService } from "../service";
import ModelPricingEditor from "@/features/ai-models/components/ModelPricingEditor";
import type {
  AiModel,
  AiModelFormData,
  AiProvider,
  ControlsSchema,
  ModelConstraint,
  PricingTier,
  ProviderModelEntry,
} from "../types";

interface AiModelDetailPanelProps {
  model: AiModel | null;
  isNew: boolean;
  providers: AiProvider[];
  allModels: AiModel[];
  onClose: () => void;
  onSaved: (model: AiModel) => void;
  onDeleted: (id: string) => void;
}

function rowToFormData(row: AiModel): AiModelFormData {
  return {
    name: row.name ?? "",
    common_name: row.common_name ?? "",
    model_class: row.model_class ?? "",
    provider: row.provider ?? "",
    api_class: row.api_class ?? "",
    context_window:
      row.context_window != null ? String(row.context_window) : "",
    max_tokens: row.max_tokens != null ? String(row.max_tokens) : "",
    model_provider: row.model_provider ?? "",
    is_deprecated: row.is_deprecated ?? false,
    is_primary: row.is_primary ?? false,
    is_premium: row.is_premium ?? false,
    pricing: row.pricing ?? [],
    mid_fallback_id: row.mid_fallback_id ?? "",
    guest_fallback_id: row.guest_fallback_id ?? "",
  };
}

const EMPTY_FORM: AiModelFormData = {
  name: "",
  common_name: "",
  model_class: "",
  provider: "",
  api_class: "",
  context_window: "",
  max_tokens: "",
  model_provider: "",
  is_deprecated: false,
  is_primary: false,
  is_premium: false,
  pricing: [],
  mid_fallback_id: "",
  guest_fallback_id: "",
};

// ─── Provider Data tab components ─────────────────────────────────────────

function CapNode({
  label,
  value,
  depth = 0,
}: {
  label: string;
  value: unknown;
  depth?: number;
}) {
  const [open, setOpen] = React.useState(depth < 1);
  if (value === null || value === undefined) return null;

  if (typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>);
    const isSingleSupported =
      entries.length === 1 && entries[0][0] === "supported";
    if (isSingleSupported) {
      const supported = entries[0][1] as boolean;
      return (
        <div className="flex items-center gap-2 py-0.5">
          <span
            className="text-xs text-muted-foreground w-40 shrink-0 truncate"
            title={label}
          >
            {label}
          </span>
          <Badge
            variant="outline"
            className={`text-[10px] h-4 px-1 ${supported ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-300" : "bg-muted text-muted-foreground"}`}
          >
            {supported ? "supported" : "no"}
          </Badge>
        </div>
      );
    }
    return (
      <div className="py-0.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 text-xs hover:text-foreground text-foreground/80 font-medium"
        >
          {open ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          {label}
          <span className="text-[10px] text-muted-foreground font-normal ml-1">
            ({entries.length} fields)
          </span>
        </button>
        {open && (
          <div className="ml-4 pl-2 border-l border-border mt-0.5">
            {entries.map(([k, v]) => (
              <CapNode key={k} label={k} value={v} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 py-0.5">
      <span
        className="text-xs text-muted-foreground w-40 shrink-0 truncate"
        title={label}
      >
        {label}
      </span>
      <span className="text-xs font-mono">{String(value)}</span>
    </div>
  );
}

function InlineCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground"
      title="Copy JSON"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

function ProviderDataTab({
  model,
  providers,
}: {
  model: AiModel;
  providers: AiProvider[];
}) {
  const [viewMode, setViewMode] = React.useState<"structured" | "json">(
    "structured",
  );

  // Find the provider and the matching entry in its cache
  const matchedProvider = providers.find(
    (p) =>
      p.id === model.model_provider ||
      (model.provider &&
        p.name?.toLowerCase() === model.provider.toLowerCase()),
  );
  const providerEntry: ProviderModelEntry | undefined =
    matchedProvider?.provider_models_cache?.models.find(
      (m) => m.id === model.name,
    );

  if (!matchedProvider) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-muted-foreground">
        <p>No provider linked to this model.</p>
        <p className="text-xs">Set the Provider field in the Details tab.</p>
      </div>
    );
  }

  if (!matchedProvider.provider_models_cache) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          No cached data for <strong>{matchedProvider.name}</strong>.
        </p>
        <p className="text-xs text-muted-foreground">
          Go to Provider Sync to fetch their model list.
        </p>
      </div>
    );
  }

  if (!providerEntry) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Model{" "}
          <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
            {model.name}
          </code>{" "}
          was not found in {matchedProvider.name}&apos;s cached model list.
        </p>
        <p className="text-xs text-muted-foreground">
          The model may have been renamed, deprecated, or not yet synced.
        </p>
      </div>
    );
  }

  const jsonStr = JSON.stringify(providerEntry, null, 2);
  const formatNum = (n?: number | null) =>
    n == null ? "—" : n.toLocaleString();
  const formatDate = (d?: string) => {
    if (!d) return "—";
    try {
      return new Date(d).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return d;
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Sub-header */}
      <div className="shrink-0 flex items-center justify-between px-1 pb-2 border-b mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {matchedProvider.name} · synced{" "}
            {new Date(
              matchedProvider.provider_models_cache.fetched_at,
            ).toLocaleDateString()}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant={viewMode === "structured" ? "secondary" : "ghost"}
            className="h-6 px-2 text-[10px]"
            onClick={() => setViewMode("structured")}
          >
            Structured
          </Button>
          <Button
            type="button"
            size="sm"
            variant={viewMode === "json" ? "secondary" : "ghost"}
            className="h-6 px-2 text-[10px]"
            onClick={() => setViewMode("json")}
          >
            Raw JSON
          </Button>
          <InlineCopyButton text={jsonStr} />
        </div>
      </div>

      {viewMode === "json" ? (
        <div className="flex-1 overflow-auto">
          <pre className="text-[11px] font-mono text-foreground whitespace-pre-wrap break-all leading-relaxed">
            {jsonStr}
          </pre>
        </div>
      ) : (
        <div className="flex-1 overflow-auto space-y-4">
          {/* Core fields */}
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Core Fields
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <div>
                <p className="text-[10px] text-muted-foreground">
                  Display Name
                </p>
                <p className="text-xs font-medium">
                  {providerEntry.display_name ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Type</p>
                <p className="text-xs font-mono">
                  {String(providerEntry.type ?? "—")}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">
                  Context Window
                </p>
                <p className="text-xs font-mono">
                  {formatNum(providerEntry.max_input_tokens)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">
                  Max Output Tokens
                </p>
                <p className="text-xs font-mono">
                  {formatNum(providerEntry.max_tokens)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Released</p>
                <p className="text-xs">
                  {formatDate(providerEntry.created_at)}
                </p>
              </div>
            </div>
          </section>

          {/* Capabilities */}
          {providerEntry.capabilities &&
            typeof providerEntry.capabilities === "object" && (
              <section>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Capabilities (from {matchedProvider.name})
                </p>
                <div className="border rounded-md p-3 bg-muted/20">
                  {Object.entries(
                    providerEntry.capabilities as Record<string, unknown>,
                  ).map(([k, v]) => (
                    <CapNode key={k} label={k} value={v} depth={0} />
                  ))}
                </div>
              </section>
            )}

          {/* Additional fields */}
          {(() => {
            const known = new Set([
              "id",
              "display_name",
              "created_at",
              "type",
              "max_input_tokens",
              "max_tokens",
              "capabilities",
            ]);
            const extra = Object.entries(providerEntry).filter(
              ([k]) => !known.has(k),
            );
            if (!extra.length) return null;
            return (
              <section>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Additional Fields
                </p>
                <div className="space-y-1.5">
                  {extra.map(([k, v]) => (
                    <div key={k} className="flex items-start gap-3">
                      <span className="text-xs text-muted-foreground w-32 shrink-0">
                        {k}
                      </span>
                      <span className="text-xs font-mono break-all">
                        {typeof v === "object"
                          ? JSON.stringify(v, null, 2)
                          : String(v)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ─── Schema & error helpers ────────────────────────────────────────────────

/**
 * Every column that exists in the ai_model table.
 * Derived from database.types.ts — these are the ONLY fields Supabase accepts.
 */
const AI_MODEL_COLUMNS = new Set([
  "id",
  "name",
  "common_name",
  "model_class",
  "provider",
  "api_class",
  "context_window",
  "max_tokens",
  "model_provider",
  "is_deprecated",
  "is_primary",
  "is_premium",
  "pricing",
  "endpoints",
  "capabilities",
  "controls",
  "constraints",
  "mid_fallback_id",
  "guest_fallback_id",
]);

/** Strip any keys not in AI_MODEL_COLUMNS and return { cleaned, unknownKeys } */
function stripUnknownColumns(obj: Record<string, unknown>): {
  cleaned: Record<string, unknown>;
  unknownKeys: string[];
} {
  const cleaned: Record<string, unknown> = {};
  const unknownKeys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (AI_MODEL_COLUMNS.has(k)) cleaned[k] = v;
    else unknownKeys.push(k);
  }
  return { cleaned, unknownKeys };
}

// ─── Raw JSON validation result ────────────────────────────────────────────

type RawJsonIssue =
  | { kind: "parse"; message: string; line: number | null; col: number | null }
  | { kind: "unknown_fields"; fields: string[] };

/** Validate the raw JSON text and return issues (empty = valid) */
function validateRawJson(text: string): RawJsonIssue[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const msg = extractErrorMessage(err);
    const m = msg.match(/line\s+(\d+)\s+column\s+(\d+)/i);
    return [
      {
        kind: "parse",
        message: msg,
        line: m ? parseInt(m[1], 10) : null,
        col: m ? parseInt(m[2], 10) : null,
      },
    ];
  }
  if (typeof parsed !== "object" || !parsed || Array.isArray(parsed)) {
    return [
      {
        kind: "parse",
        message: "Root value must be a JSON object",
        line: null,
        col: null,
      },
    ];
  }
  const { unknownKeys } = stripUnknownColumns(
    parsed as Record<string, unknown>,
  );
  if (unknownKeys.length > 0)
    return [{ kind: "unknown_fields", fields: unknownKeys }];
  return [];
}

// ─── Raw JSON issue display ────────────────────────────────────────────────

function RawJsonIssuePanel({
  text,
  issues,
}: {
  text: string;
  issues: RawJsonIssue[];
}) {
  if (issues.length === 0) return null;

  return (
    <div className="shrink-0 flex flex-col gap-1.5">
      {issues.map((issue, idx) => {
        if (issue.kind === "parse") {
          const lines = text.split("\n");
          const errorLine = issue.line != null ? issue.line - 1 : -1;
          const CONTEXT = 3;
          const start = Math.max(0, errorLine - CONTEXT);
          const end = Math.min(lines.length - 1, errorLine + CONTEXT);
          const visible = lines.slice(start, end + 1);

          return (
            <div
              key={idx}
              className="rounded-md border border-red-300 dark:border-red-700 overflow-hidden text-[11px] font-mono"
            >
              <div className="flex items-start gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/30 border-b border-red-300 dark:border-red-700">
                <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-red-700 dark:text-red-300">
                    JSON syntax error
                  </span>
                  {issue.line != null && (
                    <span className="ml-2 text-red-500 dark:text-red-400 text-[10px]">
                      line {issue.line}
                      {issue.col != null ? `, col ${issue.col}` : ""}
                    </span>
                  )}
                  <p className="text-red-600 dark:text-red-400 mt-0.5 break-words">
                    {issue.message}
                  </p>
                </div>
              </div>
              {errorLine >= 0 && (
                <div className="overflow-x-auto bg-zinc-950">
                  {visible.map((ln, i) => {
                    const n = start + i;
                    const isErr = n === errorLine;
                    return (
                      <div
                        key={n}
                        className={`flex ${isErr ? "bg-red-950/50" : ""}`}
                      >
                        <span
                          className={`shrink-0 w-9 text-right pr-3 py-0.5 border-r select-none ${isErr ? "text-red-400 border-red-700 bg-red-950/70" : "text-zinc-600 border-zinc-700"}`}
                        >
                          {n + 1}
                        </span>
                        <span
                          className={`px-3 py-0.5 whitespace-pre flex-1 ${isErr ? "text-red-300" : "text-zinc-300"}`}
                        >
                          {ln || " "}
                        </span>
                        {isErr && (
                          <span className="px-1 text-red-500 select-none">
                            ◄
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        }

        if (issue.kind === "unknown_fields") {
          // Find which lines contain these unknown keys and highlight them
          const lines = text.split("\n");
          const badLineNums = new Set<number>();
          issue.fields.forEach((field) => {
            const re = new RegExp(`"${field}"\\s*:`);
            lines.forEach((ln, i) => {
              if (re.test(ln)) badLineNums.add(i);
            });
          });

          return (
            <div
              key={idx}
              className="rounded-md border border-amber-300 dark:border-amber-700 overflow-hidden text-[11px] font-mono"
            >
              <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-300 dark:border-amber-700">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-amber-700 dark:text-amber-300">
                    {issue.fields.length} unknown field
                    {issue.fields.length > 1 ? "s" : ""} — not in the database
                    schema
                  </span>
                  <p className="text-amber-600 dark:text-amber-400 mt-0.5">
                    These will be removed before saving:{" "}
                    {issue.fields.map((f, i) => (
                      <span key={f}>
                        <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">
                          {f}
                        </code>
                        {i < issue.fields.length - 1 ? ", " : ""}
                      </span>
                    ))}
                  </p>
                </div>
              </div>
              {badLineNums.size > 0 && (
                <div className="overflow-x-auto bg-zinc-950">
                  {lines.map((ln, i) => {
                    const isBad = badLineNums.has(i);
                    return (
                      <div
                        key={i}
                        className={`flex ${isBad ? "bg-amber-950/40" : ""}`}
                      >
                        <span
                          className={`shrink-0 w-9 text-right pr-3 py-0.5 border-r select-none ${isBad ? "text-amber-400 border-amber-700 bg-amber-950/60" : "text-zinc-600 border-zinc-700"}`}
                        >
                          {i + 1}
                        </span>
                        <span
                          className={`px-3 py-0.5 whitespace-pre flex-1 ${isBad ? "text-amber-200" : "text-zinc-300"}`}
                        >
                          {ln || " "}
                        </span>
                        {isBad && (
                          <span className="px-1 text-amber-500 select-none">
                            ◄ unknown
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}

// ─── Raw Model JSON tab ────────────────────────────────────────────────────

function RawModelJsonTab({
  model,
  jsonText,
  onJsonChange,
  onReset,
}: {
  model: AiModel | null;
  jsonText: string;
  onJsonChange: (text: string) => void;
  onReset: () => void;
}) {
  const isAddMode = model === null;
  // Live validation — runs on every keystroke (skip on empty placeholder)
  const issues = React.useMemo(
    () => (jsonText.trim() ? validateRawJson(jsonText) : []),
    [jsonText],
  );
  const hasErrors = issues.some((i) => i.kind === "parse");
  const hasWarnings = issues.some((i) => i.kind === "unknown_fields");
  const isDirty = isAddMode
    ? jsonText.trim().length > 0
    : jsonText !== JSON.stringify(model, null, 2);

  return (
    <div className="flex-1 flex flex-col gap-2 min-h-0 overflow-hidden">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <p className="text-[10px] text-muted-foreground">
            {isAddMode
              ? "Paste a complete model JSON object — fields will be validated and unknown columns stripped before creating."
              : "Edit any field directly. Unknown columns are stripped before saving."}
          </p>
          {hasErrors && (
            <span className="text-[10px] font-medium text-red-600 dark:text-red-400">
              · syntax error
            </span>
          )}
          {!hasErrors && hasWarnings && (
            <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
              · unknown fields (will be removed)
            </span>
          )}
          {!hasErrors && !hasWarnings && isDirty && (
            <span className="text-[10px] font-medium text-green-600 dark:text-green-400">
              · valid
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onReset}
            disabled={!isDirty}
            className="h-6 text-xs gap-1 px-2"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </Button>
          <InlineCopyButton text={jsonText} />
        </div>
      </div>

      <textarea
        value={jsonText}
        onChange={(e) => onJsonChange(e.target.value)}
        spellCheck={false}
        placeholder={
          isAddMode
            ? '{\n  "name": "my-model-id",\n  "model_class": "llm",\n  "provider": "openai",\n  ...\n}'
            : undefined
        }
        className={`flex-1 min-h-0 w-full resize-none rounded-md border px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 overflow-auto bg-background placeholder:text-muted-foreground/40 ${
          hasErrors
            ? "border-red-400 dark:border-red-600 focus-visible:ring-red-400"
            : hasWarnings
              ? "border-amber-400 dark:border-amber-600 focus-visible:ring-amber-400"
              : "border-input focus-visible:ring-ring"
        }`}
      />

      <RawJsonIssuePanel text={jsonText} issues={issues} />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────

export default function AiModelDetailPanel({
  model,
  isNew,
  providers,
  allModels,
  onClose,
  onSaved,
  onDeleted,
}: AiModelDetailPanelProps) {
  const [formData, setFormData] = useState<AiModelFormData>(
    isNew ? EMPTY_FORM : model ? rowToFormData(model) : EMPTY_FORM,
  );
  const [baseline, setBaseline] = useState<AiModelFormData>(
    isNew ? EMPTY_FORM : model ? rowToFormData(model) : EMPTY_FORM,
  );

  // Pending edits from JSON-field tabs (controls, constraints, endpoints, capabilities)
  const [pendingControls, setPendingControls] = useState<ControlsSchema | null>(
    null,
  );
  const [pendingConstraints, setPendingConstraints] = useState<
    ModelConstraint[] | null
  >(null);

  // Raw JSON tab state
  const buildRawJson = useCallback(
    () => JSON.stringify(model, null, 2),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model?.id, model],
  );
  const [rawJsonText, setRawJsonText] = useState<string>(() =>
    model ? JSON.stringify(model, null, 2) : "{}",
  );
  const [rawJsonError, setRawJsonError] = useState<string | null>(null);
  const rawJsonDirty = model
    ? rawJsonText !== JSON.stringify(model, null, 2)
    : false;

  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("details");
  const [showDirtyDialog, setShowDirtyDialog] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const formIsDirty = (
    Object.keys({ ...formData, ...baseline }) as Array<keyof AiModelFormData>
  ).some((k) => JSON.stringify(formData[k]) !== JSON.stringify(baseline[k]));

  const isDirty =
    formIsDirty ||
    pendingControls !== null ||
    pendingConstraints !== null ||
    rawJsonDirty;

  useEffect(() => {
    const base = isNew ? EMPTY_FORM : model ? rowToFormData(model) : EMPTY_FORM;
    setFormData(base);
    setBaseline(base);
    setPendingControls(null);
    setPendingConstraints(null);
    setRawJsonText(model ? JSON.stringify(model, null, 2) : "{}");
    setRawJsonError(null);
    setSavedFlash(false);
    setActiveTab("details");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model?.id, isNew]);

  useEffect(
    () => () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    },
    [],
  );

  const requestClose = useCallback(() => {
    if (isDirty) {
      setShowDirtyDialog(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  const displayName = isNew
    ? "New Model"
    : model?.common_name || model?.name || "Model";

  const handleSave = async (): Promise<AiModel | null> => {
    setSaveError(null);

    // Validate raw JSON before attempting a save
    if (rawJsonDirty) {
      const issues = validateRawJson(rawJsonText);
      const parseIssue = issues.find((i) => i.kind === "parse");
      if (parseIssue) {
        setActiveTab("raw-model");
        setSaveError(
          "Fix the JSON syntax error in the Raw JSON tab before saving.",
        );
        return null;
      }
      // Unknown fields are safe — we strip them before the API call
    }

    setSaving(true);
    try {
      let saved: AiModel;

      const usingRawJson =
        rawJsonDirty &&
        rawJsonText.trim() !== "{}" &&
        rawJsonText.trim() !== "";

      if (usingRawJson && isNew) {
        // Create from pasted JSON — strip id + unknown columns
        const parsed = JSON.parse(rawJsonText) as Record<string, unknown>;
        const { id: _id, ...withoutId } = parsed;
        void _id;
        const { cleaned } = stripUnknownColumns(withoutId);
        saved = await aiModelService.create(
          cleaned as Parameters<typeof aiModelService.create>[0],
        );
      } else if (usingRawJson && model) {
        // Update from raw JSON tab — strip id + unknown columns before saving
        const parsed = JSON.parse(rawJsonText) as Record<string, unknown>;
        const { id: _id, ...withoutId } = parsed;
        void _id;
        const { cleaned } = stripUnknownColumns(withoutId);
        saved = await aiModelService.update(
          model.id,
          cleaned as Partial<AiModel>,
        );
      } else {
        const payload = {
          name: formData.name.trim(),
          common_name: formData.common_name.trim() || null,
          model_class: formData.model_class.trim(),
          provider: formData.provider.trim() || null,
          api_class: formData.api_class.trim() || null,
          context_window: formData.context_window
            ? parseInt(formData.context_window)
            : null,
          max_tokens: formData.max_tokens
            ? parseInt(formData.max_tokens)
            : null,
          model_provider: formData.model_provider || null,
          is_deprecated: formData.is_deprecated,
          is_primary: formData.is_primary,
          is_premium: formData.is_premium,
          pricing: formData.pricing.length > 0 ? formData.pricing : null,
          endpoints: model?.endpoints ?? null,
          capabilities: model?.capabilities ?? null,
          controls: pendingControls ?? model?.controls ?? null,
          constraints: pendingConstraints ?? model?.constraints ?? null,
          mid_fallback_id: formData.mid_fallback_id || null,
          guest_fallback_id: formData.guest_fallback_id || null,
        };

        // Cast through unknown — mid_fallback_id / guest_fallback_id aren't
        // in the generated Supabase types yet. Drop the cast after running
        // `pnpm db:generate` to refresh database.types.ts from the live
        // schema (added by aidream migration 0045).
        if (isNew) {
          saved = await aiModelService.create(
            payload as unknown as Parameters<typeof aiModelService.create>[0],
          );
        } else if (model) {
          saved = await aiModelService.update(
            model.id,
            payload as unknown as Partial<AiModel>,
          );
        } else {
          return null;
        }
      }

      const newBase = rowToFormData(saved);
      setBaseline(newBase);
      setFormData(newBase);
      setPendingControls(null);
      setPendingConstraints(null);
      setRawJsonText(JSON.stringify(saved, null, 2));
      setRawJsonError(null);
      setSaveError(null);
      setSavedFlash(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSavedFlash(false), 2500);
      onSaved(saved);
      return saved;
    } catch (err) {
      const msg = extractErrorMessage(err);
      setSaveError(msg);
      console.error("Save failed:", msg, err);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndClose = async () => {
    const saved = await handleSave();
    if (saved) onClose();
  };

  const handleDelete = async () => {
    if (!model) return;
    try {
      await aiModelService.remove(model.id);
      onDeleted(model.id);
    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  // JsonFieldEditor still needs its own direct save (it uses EnhancedEditableJsonViewer internally)
  const handleJsonSave =
    (field: "endpoints" | "capabilities" | "controls" | "constraints") =>
    async (data: object) => {
      if (!model) return;
      const updated = await aiModelService.update(model.id, { [field]: data });
      onSaved(updated);
    };

  const usingRawJsonForNew =
    isNew &&
    activeTab === "raw-model" &&
    rawJsonText.trim().length > 0 &&
    !validateRawJson(rawJsonText).some((i) => i.kind === "parse");

  const canSave =
    usingRawJsonForNew ||
    (formData.name.trim() && formData.model_class.trim() && (isNew || isDirty));

  return (
    <>
      <div className="h-full flex flex-col overflow-hidden bg-card">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b shrink-0 bg-muted/20">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground/60 shrink-0 select-none">
              <PanelRight className="h-3 w-3" />
              Detail
            </span>
            <div className="w-px h-3 bg-border shrink-0" />
            <span className="text-sm font-semibold truncate">
              {displayName}
            </span>
            {isNew && (
              <Badge
                variant="outline"
                className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-600 shrink-0"
              >
                New
              </Badge>
            )}
            {!isNew && model?.is_deprecated && (
              <Badge
                variant="outline"
                className="text-xs bg-red-50 dark:bg-red-900/20 text-red-600 shrink-0"
              >
                Deprecated
              </Badge>
            )}
            {!isNew && model?.is_primary && (
              <Badge
                variant="outline"
                className="text-xs bg-green-50 dark:bg-green-900/20 text-green-600 shrink-0"
              >
                Primary
              </Badge>
            )}
            {isDirty && !saving && (
              <span
                className="w-2 h-2 rounded-full bg-orange-400 shrink-0"
                title="Unsaved changes"
              />
            )}
            {savedFlash && !isDirty && (
              <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 shrink-0">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Saved
              </span>
            )}
          </div>
          <TooltipProvider delayDuration={400}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 shrink-0"
                  onClick={requestClose}
                >
                  <X className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs">
                Close panel
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Tab content area */}
        {isNew ? (
          <Tabs
            value={activeTab === "raw-model" ? "raw-model" : "details"}
            onValueChange={setActiveTab}
            className="flex-1 flex flex-col overflow-hidden min-h-0"
          >
            <div className="border-b px-3 shrink-0">
              <TabsList className="h-9 bg-transparent p-0 gap-0">
                <TabsTrigger
                  value="details"
                  className="h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs px-3"
                >
                  Form
                </TabsTrigger>
                <TabsTrigger
                  value="raw-model"
                  className="h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs px-3"
                >
                  Paste JSON
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent
              value="details"
              className="flex-1 m-0 overflow-auto p-3 space-y-3 min-h-0"
            >
              <AiModelForm
                data={formData}
                providers={providers}
                allModels={allModels}
                isNew
                saving={saving}
                isDirty={isDirty}
                onChange={setFormData}
                onDelete={undefined}
              />
            </TabsContent>
            <TabsContent
              value="raw-model"
              className="flex-1 m-0 p-3 min-h-0 overflow-hidden flex flex-col"
            >
              <RawModelJsonTab
                model={null}
                jsonText={rawJsonText === "{}" ? "" : rawJsonText}
                onJsonChange={(text) => {
                  setRawJsonText(text);
                  setRawJsonError(null);
                  // Try to hydrate the form fields from the pasted JSON
                  try {
                    const parsed = JSON.parse(text) as Record<string, unknown>;
                    const { cleaned } = stripUnknownColumns(parsed);
                    const partial: Partial<AiModelFormData> = {};
                    if (typeof cleaned.name === "string")
                      partial.name = cleaned.name;
                    if (typeof cleaned.common_name === "string")
                      partial.common_name = cleaned.common_name;
                    if (typeof cleaned.model_class === "string")
                      partial.model_class = cleaned.model_class;
                    if (typeof cleaned.provider === "string")
                      partial.provider = cleaned.provider;
                    if (typeof cleaned.api_class === "string")
                      partial.api_class = cleaned.api_class;
                    if (typeof cleaned.model_provider === "string")
                      partial.model_provider = cleaned.model_provider;
                    if (typeof cleaned.context_window === "number")
                      partial.context_window = String(cleaned.context_window);
                    if (typeof cleaned.max_tokens === "number")
                      partial.max_tokens = String(cleaned.max_tokens);
                    if (typeof cleaned.is_deprecated === "boolean")
                      partial.is_deprecated = cleaned.is_deprecated;
                    if (typeof cleaned.is_primary === "boolean")
                      partial.is_primary = cleaned.is_primary;
                    if (typeof cleaned.is_premium === "boolean")
                      partial.is_premium = cleaned.is_premium;
                    if (Array.isArray(cleaned.pricing))
                      partial.pricing = cleaned.pricing as PricingTier[];
                    if (Object.keys(partial).length > 0)
                      setFormData((prev) => ({ ...prev, ...partial }));
                  } catch {
                    /* not valid JSON yet — that's fine */
                  }
                }}
                onReset={() => {
                  setRawJsonText("{}");
                  setRawJsonError(null);
                }}
              />
            </TabsContent>
          </Tabs>
        ) : (
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex-1 flex flex-col overflow-hidden min-h-0"
          >
            <div className="border-b px-3 shrink-0">
              <TabsList className="h-9 bg-transparent p-0 gap-0">
                <TabsTrigger
                  value="details"
                  className="h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs px-3"
                >
                  Details
                  {isDirty && (
                    <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-orange-400 inline-block" />
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="json"
                  className="h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs px-3"
                >
                  JSON Fields
                </TabsTrigger>
                <TabsTrigger
                  value="controls"
                  className="h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs px-3"
                >
                  Controls
                  {model?.controls && (
                    <Badge
                      variant="outline"
                      className="ml-1.5 text-xs h-4 px-1"
                    >
                      {Object.keys(model.controls as object).length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="constraints"
                  className="h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs px-3"
                >
                  Constraints
                  {model?.constraints && model.constraints.length > 0 && (
                    <Badge
                      variant="outline"
                      className="ml-1.5 text-xs h-4 px-1"
                    >
                      {model.constraints.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="pricing"
                  className="h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs px-3"
                >
                  Pricing
                  {formData.pricing.length > 0 && (
                    <Badge
                      variant="outline"
                      className="ml-1.5 text-xs h-4 px-1"
                    >
                      {formData.pricing.length}
                    </Badge>
                  )}
                  {isDirty && activeTab === "pricing" && (
                    <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-orange-400 inline-block" />
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="usage"
                  className="h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs px-3"
                >
                  Usage
                  {model?.is_deprecated && (
                    <span className="ml-1 w-2 h-2 rounded-full bg-amber-500 inline-block" />
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="provider"
                  className="h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs px-3"
                >
                  Provider Data
                  {providers.find(
                    (p) =>
                      p.id === model?.model_provider ||
                      (model?.provider &&
                        p.name?.toLowerCase() ===
                          model?.provider?.toLowerCase()),
                  )?.provider_models_cache && (
                    <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="raw-model"
                  className="h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs px-3"
                >
                  Raw JSON
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent
              value="details"
              className="flex-1 m-0 overflow-auto p-3 min-h-0"
            >
              <AiModelForm
                data={formData}
                providers={providers}
                allModels={allModels}
                isNew={false}
                saving={saving}
                isDirty={isDirty}
                onChange={setFormData}
                onDelete={handleDelete}
              />
            </TabsContent>

            <TabsContent
              value="json"
              className="flex-1 m-0 overflow-auto p-3 space-y-3 min-h-0"
            >
              <JsonFieldEditor
                title="Endpoints"
                data={model?.endpoints}
                onSave={handleJsonSave("endpoints")}
                description="Array of endpoint identifiers"
                defaultExpanded
              />
              <JsonFieldEditor
                title="Capabilities"
                data={model?.capabilities}
                onSave={handleJsonSave("capabilities")}
                description="Supported features (array or object)"
              />
              <JsonFieldEditor
                title="Constraints"
                data={model?.constraints}
                onSave={handleJsonSave("constraints")}
                description="Validation constraints: [{key, rule, value?, message?}]"
              />
            </TabsContent>

            <TabsContent
              value="controls"
              className="flex-1 m-0 overflow-auto p-3 min-h-0"
            >
              <ControlsEditor
                controls={(model?.controls as ControlsSchema) ?? null}
                onSave={async (controls) => {
                  if (!model) return;
                  const updated = await aiModelService.update(model.id, {
                    controls,
                  });
                  onSaved(updated);
                }}
                onChange={(controls) => setPendingControls(controls)}
              />
            </TabsContent>

            <TabsContent
              value="constraints"
              className="flex-1 m-0 overflow-auto p-3 min-h-0"
            >
              <ConstraintsEditor
                constraints={model?.constraints ?? null}
                onSave={async (constraints) => {
                  if (!model) return;
                  const updated = await aiModelService.update(model.id, {
                    constraints,
                  });
                  onSaved(updated);
                }}
                onChange={(constraints) => setPendingConstraints(constraints)}
              />
            </TabsContent>

            <TabsContent
              value="pricing"
              className="flex-1 m-0 overflow-auto p-3 min-h-0"
            >
              <ModelPricingEditor
                tiers={formData.pricing}
                onChange={(tiers: PricingTier[]) =>
                  setFormData({ ...formData, pricing: tiers })
                }
              />
            </TabsContent>

            <TabsContent
              value="usage"
              className="flex-1 m-0 overflow-hidden min-h-0"
            >
              {model && (
                <ModelUsageAudit
                  model={model}
                  allModels={allModels}
                  onReplaceDone={() => {}}
                />
              )}
            </TabsContent>

            <TabsContent
              value="provider"
              className="flex-1 m-0 overflow-auto p-3 min-h-0"
            >
              {model && <ProviderDataTab model={model} providers={providers} />}
            </TabsContent>

            <TabsContent
              value="raw-model"
              className="flex-1 m-0 p-3 min-h-0 overflow-hidden flex flex-col"
            >
              {model && (
                <RawModelJsonTab
                  model={model}
                  jsonText={rawJsonText}
                  onJsonChange={(text) => {
                    setRawJsonText(text);
                    setRawJsonError(null);
                  }}
                  onReset={() => {
                    setRawJsonText(buildRawJson());
                    setRawJsonError(null);
                  }}
                />
              )}
            </TabsContent>
          </Tabs>
        )}

        {/* Persistent footer */}
        <div className="border-t bg-card shrink-0">
          {saveError && (
            <div className="flex items-start gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-red-500" />
              <span className="flex-1 min-w-0 break-words">{saveError}</span>
              <button
                type="button"
                onClick={() => setSaveError(null)}
                className="shrink-0 text-red-400 hover:text-red-600 dark:hover:text-red-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <div className="px-3 py-2 flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-3 text-xs gap-1.5"
              onClick={requestClose}
            >
              <X className="h-3.5 w-3.5" />
              Close
            </Button>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-3 text-xs gap-1.5"
                onClick={() => handleSave()}
                disabled={saving || !canSave}
              >
                <Save className="h-3.5 w-3.5" />
                {saving ? "Saving…" : isNew ? "Create" : "Save"}
              </Button>
              <Button
                size="sm"
                className="h-8 px-3 text-xs gap-1.5 bg-primary hover:bg-primary/90"
                onClick={handleSaveAndClose}
                disabled={saving || !canSave}
              >
                <LogOut className="h-3.5 w-3.5" />
                {saving ? "Saving…" : isNew ? "Create & Close" : "Save & Close"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Dirty-check confirmation dialog */}
      <AlertDialog open={showDirtyDialog} onOpenChange={setShowDirtyDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to <strong>{displayName}</strong>. What
              would you like to do?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel onClick={() => setShowDirtyDialog(false)}>
              Keep Editing
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowDirtyDialog(false);
                onClose();
              }}
              className="bg-destructive hover:bg-destructive/90"
            >
              Discard & Close
            </AlertDialogAction>
            <AlertDialogAction
              onClick={async () => {
                setShowDirtyDialog(false);
                await handleSaveAndClose();
              }}
              className="bg-primary hover:bg-primary/90"
            >
              Save & Close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
