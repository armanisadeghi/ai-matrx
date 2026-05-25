"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import {
  Save,
  AlertTriangle,
  Eye,
  Trash2,
  WrenchIcon,
  Settings2,
  Code2,
  SlidersHorizontal,
  ClipboardCopy,
  Plus,
  X,
  Braces,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useModelControls,
  ControlDefinition,
  NormalizedControls,
} from "@/features/agents/hooks/useModelControls";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import {
  selectAgentSettings,
  selectAgentModelId,
  selectAgentTools,
  selectAgentOutputSchema,
} from "@/features/agents/redux/agent-definition/selectors";
import {
  setAgentSettings,
  setAgentField,
  setAgentTools,
} from "@/features/agents/redux/agent-definition/slice";
import { selectAllModels } from "@/features/ai-models/redux/modelRegistrySlice";
import { SmartModelSelect } from "@/features/ai-models/components/smart/SmartModelSelect";
import type {
  LLMParams,
  FeLlmParams,
} from "@/features/agents/types/agent-api-types";
import type { ModelConstraint } from "@/features/ai-models/types";
import { useConfigValidation } from "./validation/useConfigValidation";
import type { ValidationIssue } from "./validation/types";
import {
  applyAllFixableIssues,
  applyFixForIssue,
  canFixIssue,
} from "./validation/apply-fix";
import {
  analyzeModelChange,
  type ModelChangePlan,
} from "./reconciliation/analyze";
import { ModelChangeReconciliation } from "./reconciliation/ModelChangeReconciliation";
import { SettingsJsonEditor } from "./json/SettingsJsonEditor";
import { OutputSchemaTab } from "./output-schema/OutputSchemaTab";
import { validateOutputSchema } from "./output-schema/validateOutputSchema";
import {
  buildSettingsRows,
  type SettingsRow,
} from "@/lib/redux/slices/agent-settings/settings-catalogue";
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

// ── Tab type ─────────────────────────────────────────────────────────────────
type SettingsTab =
  | "settings"
  | "raw"
  | "raw-edit"
  | "model-config"
  | "output-schema";

// NOTE: media inputs (image_input, start_image, end_image, mask, etc.) do
// NOT belong on agent settings — they're per-run user inputs that flow
// through user message parts. See MEDIA_GENERATION_SETTINGS.md §13 for
// the architecture. The AgentSettingMediaPicker component is kept as a
// building block for the user-input side (where the engineer-overridable
// equivalents will be configured), not used here.

// ── NumberInput ──────────────────────────────────────────────────────────────
interface NumberInputProps {
  value: number;
  onChange: (val: number) => void;
  onSliderChange?: (val: number) => void;
  min?: number;
  max?: number;
  step?: number;
  isInteger?: boolean;
  disabled?: boolean;
  withSlider?: boolean;
}

// ── FallbackValueInput ───────────────────────────────────────────────────────
// Used when the selected model has no control schema for a key but the key
// still exists in settings. Shape-aware editor (boolean / number / string /
// JSON) so users can always edit what's there even when we can't validate it.
interface FallbackValueInputProps {
  settingKey: string;
  value: unknown;
  disabled?: boolean;
  onChange: (value: unknown) => void;
}

function FallbackValueInput({
  settingKey,
  value,
  disabled,
  onChange,
}: FallbackValueInputProps) {
  const [draft, setDraft] = useState<string>(() =>
    value === undefined || value === null
      ? ""
      : typeof value === "string"
        ? value
        : typeof value === "number" || typeof value === "boolean"
          ? String(value)
          : JSON.stringify(value),
  );
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(
      value === undefined || value === null
        ? ""
        : typeof value === "string"
          ? value
          : typeof value === "number" || typeof value === "boolean"
            ? String(value)
            : JSON.stringify(value),
    );
    setJsonError(null);
  }, [value]);

  if (typeof value === "boolean") {
    return (
      <div className="flex items-center gap-2">
        <Checkbox
          id={`fallback-${settingKey}`}
          checked={value}
          onCheckedChange={(c) => onChange(c === true)}
          disabled={disabled}
          className="cursor-pointer"
        />
        <Label
          htmlFor={`fallback-${settingKey}`}
          className="text-xs text-muted-foreground cursor-pointer"
        >
          {value ? "true" : "false"}
        </Label>
      </div>
    );
  }

  if (typeof value === "number") {
    return (
      <Input
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => {
          const n = parseFloat(e.target.value);
          if (Number.isFinite(n)) onChange(n);
          else setDraft(String(value));
        }}
        disabled={disabled}
        className="h-7 text-xs"
      />
    );
  }

  if (value !== null && typeof value === "object") {
    return (
      <div className="flex flex-col gap-1">
        <Textarea
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            try {
              JSON.parse(e.target.value);
              setJsonError(null);
            } catch (err) {
              setJsonError(err instanceof Error ? err.message : "Invalid JSON");
            }
          }}
          onBlur={(e) => {
            try {
              const parsed = JSON.parse(e.target.value);
              onChange(parsed);
              setJsonError(null);
            } catch {
              // Keep draft; user can fix or revert.
            }
          }}
          disabled={disabled}
          className="text-xs font-mono"
          spellCheck={false}
          style={{ minHeight: 48 }}
        />
        {jsonError && (
          <p className="text-[10px] text-orange-600 dark:text-orange-400">
            {jsonError}
          </p>
        )}
      </div>
    );
  }

  // string (default)
  return (
    <Input
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="h-7 text-xs"
      placeholder={`Value for ${settingKey}`}
      style={{ fontSize: "16px" }}
    />
  );
}

function NumberInput({
  value,
  onChange,
  onSliderChange,
  min,
  max,
  step = 1,
  isInteger = false,
  disabled = false,
  withSlider = false,
}: NumberInputProps) {
  const [draft, setDraft] = useState<string>(() => String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = (raw: string) => {
    if (raw === "" || raw === "-") return;
    const parsed = isInteger ? parseInt(raw, 10) : parseFloat(raw);
    if (!isNaN(parsed)) onChange(parsed);
    else setDraft(String(value));
  };

  if (withSlider) {
    return (
      <div className="grid grid-cols-[1fr_4rem] items-center gap-2">
        <Slider
          min={min}
          max={max}
          step={step}
          value={[value]}
          onValueChange={(val) => {
            onSliderChange?.(val[0]);
            setDraft(String(val[0]));
          }}
          disabled={disabled}
        />
        <Input
          type="text"
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          disabled={disabled}
          className="h-7 px-2 text-xs"
        />
      </div>
    );
  }

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      disabled={disabled}
      className="h-7 px-2 text-xs w-full"
    />
  );
}

// ── HighlightedJson ──────────────────────────────────────────────────────────
// A read-only syntax-highlighted JSON viewer with a floating copy button.
interface HighlightedJsonProps {
  value: Record<string, unknown>;
  highlightKeys?: Record<string, "error" | "warning" | "info">;
}

function HighlightedJson({ value, highlightKeys = {} }: HighlightedJsonProps) {
  const [copied, setCopied] = useState(false);

  const raw = useMemo(() => JSON.stringify(value, null, 2), [value]);
  const lines = useMemo(() => raw.split("\n"), [raw]);

  const handleCopy = () => {
    navigator.clipboard.writeText(raw).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="relative group">
      {/* Copy button — floats top-right, visible on hover */}
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity
          flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium
          bg-card border border-border text-muted-foreground hover:text-foreground
          shadow-sm"
      >
        {copied ? "Copied!" : "Copy"}
      </button>

      <pre
        className="text-xs font-mono leading-5 overflow-auto rounded p-3 select-text
          bg-zinc-100 dark:bg-zinc-800
          text-zinc-800 dark:text-zinc-200"
      >
        {lines.map((line, i) => {
          const keyMatch = line.match(/^\s*"([^"]+)":/);
          const key = keyMatch?.[1];
          const highlight = key ? highlightKeys[key] : undefined;
          const colored = colorizeJsonLine(line);

          if (highlight) {
            const cls =
              highlight === "error"
                ? "bg-red-100 dark:bg-red-950/50 border-l-4 border-red-500 dark:border-red-400"
                : highlight === "warning"
                  ? "bg-yellow-100 dark:bg-yellow-900 border-l-4 border-yellow-500 dark:border-yellow-400"
                  : "bg-blue-100 dark:bg-blue-950/40 border-l-4 border-blue-500 dark:border-blue-400";
            return (
              <span key={i} className={`block -mx-3 px-3 ${cls}`}>
                <span dangerouslySetInnerHTML={{ __html: colored }} />
                {"\n"}
              </span>
            );
          }

          return (
            <span key={i}>
              <span dangerouslySetInnerHTML={{ __html: colored }} />
              {"\n"}
            </span>
          );
        })}
      </pre>
    </div>
  );
}

/** Tokenize a single JSON line into colored HTML spans. Works for both light and dark. */
function colorizeJsonLine(line: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return line
    .replace(
      /("(?:[^"\\]|\\.)*")\s*:/g, // key
      (_, k) =>
        `<span class="text-sky-700 dark:text-sky-400">${esc(k)}</span>:`,
    )
    .replace(
      /:\s*("(?:[^"\\]|\\.)*")/g, // string value
      (_, v) =>
        `: <span class="text-emerald-700 dark:text-emerald-400">${esc(v)}</span>`,
    )
    .replace(
      /:\s*(\btrue\b|\bfalse\b)/g, // boolean
      (_, v) =>
        `: <span class="text-violet-700 dark:text-violet-400">${v}</span>`,
    )
    .replace(
      /:\s*(\bnull\b)/g, // null
      (_, v) => `: <span class="text-zinc-500">${v}</span>`,
    )
    .replace(
      /:\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g, // number
      (_, v) =>
        `: <span class="text-amber-700 dark:text-amber-400">${v}</span>`,
    );
}

// ── IssueTable ────────────────────────────────────────────────────────────────

interface IssueTableProps {
  issues: ValidationIssue[];
  diagnosticPayload?: Record<string, unknown>;
  onView: (key: string) => void;
  onRemove: (key: string) => void;
  onFixEnum: (key: string) => void;
  onFixAll?: () => void;
  onRemoveAllUnknown?: () => void;
  onResetAll?: () => void;
  fixableCount?: number;
  unknownCount?: number;
}

function IssueTable({
  issues,
  diagnosticPayload,
  onView,
  onRemove,
  onFixEnum,
  onFixAll,
  onRemoveAllUnknown,
  onResetAll,
  fixableCount = 0,
  unknownCount = 0,
}: IssueTableProps) {
  const [copied, setCopied] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  if (issues.length === 0) return null;

  const handleCopyDiagnostic = () => {
    if (!diagnosticPayload) return;
    navigator.clipboard
      .writeText(JSON.stringify(diagnosticPayload, null, 2))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="rounded border border-yellow-400 dark:border-yellow-600 overflow-hidden mb-3">
        {/* Warning section header */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-yellow-50 dark:bg-yellow-950/40 border-b border-yellow-300 dark:border-yellow-700">
          <AlertTriangle className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
          <span className="text-xs font-semibold text-yellow-800 dark:text-yellow-300">
            Settings Warnings
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-[10px] text-yellow-600 dark:text-yellow-500">
              {issues.length} issue{issues.length !== 1 ? "s" : ""} detected
            </span>
            {diagnosticPayload && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleCopyDiagnostic}
                    className="h-5 w-5 flex items-center justify-center rounded text-yellow-600 dark:text-yellow-400 hover:bg-yellow-200 dark:hover:bg-yellow-900/40 transition-colors"
                  >
                    <ClipboardCopy className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {copied ? "Copied!" : "Copy full diagnostic payload"}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Bulk action toolbar */}
        {(onFixAll || onRemoveAllUnknown || onResetAll) && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-yellow-50/40 dark:bg-yellow-950/30 border-b border-yellow-200 dark:border-yellow-800/50 flex-wrap">
            {onFixAll && fixableCount > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[11px] px-2"
                onClick={onFixAll}
                title="Apply the suggested fix to every fixable issue"
              >
                Fix all fixable ({fixableCount})
              </Button>
            )}
            {onRemoveAllUnknown && unknownCount > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[11px] px-2"
                onClick={onRemoveAllUnknown}
                title="Remove every unknown/unsupported key"
              >
                Remove all unknown ({unknownCount})
              </Button>
            )}
            {onResetAll && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[11px] px-2 text-destructive hover:text-destructive ml-auto"
                onClick={() => setResetConfirmOpen(true)}
                title="Clear every setting — starts from an empty object"
              >
                Reset all settings
              </Button>
            )}
          </div>
        )}

        {/* Column headers — 4 columns: setting | detail | type | actions */}
        <div className="grid grid-cols-[120px_1fr_80px_48px] items-center gap-2 px-2.5 py-1 bg-yellow-50/60 dark:bg-yellow-950/20 border-b border-yellow-200 dark:border-yellow-800/50">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-yellow-700 dark:text-yellow-500">
            Setting
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-yellow-700 dark:text-yellow-500">
            Issue Detail
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-yellow-700 dark:text-yellow-500">
            Type
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-yellow-700 dark:text-yellow-500 text-right">
            Options
          </span>
        </div>

        {issues.map((issue, idx) => {
          const isLast = idx === issues.length - 1;
          const isUnrecognized = issue.category === "unrecognized_key";

          return (
            <div
              key={`${issue.ruleId}-${issue.key}`}
              className={`grid grid-cols-[120px_1fr_80px_48px] items-center gap-2 px-2.5 py-1.5 ${
                !isLast
                  ? "border-b border-yellow-200 dark:border-yellow-800/40"
                  : ""
              } ${
                isUnrecognized
                  ? "bg-yellow-50/30 dark:bg-yellow-950/15"
                  : "bg-orange-50/30 dark:bg-orange-950/15"
              }`}
            >
              {/* setting key */}
              <span className="font-mono text-xs text-foreground truncate">
                {issue.key}
              </span>

              {/* detail */}
              <span className="text-xs text-foreground/80 leading-snug">
                {issue.message || "—"}
              </span>

              {/* type — plain text, no badge */}
              <span
                className={`text-xs font-medium ${isUnrecognized ? "text-yellow-700 dark:text-yellow-400" : "text-orange-700 dark:text-orange-400"}`}
              >
                {isUnrecognized ? "Unknown Key" : "Invalid Value"}
              </span>

              {/* actions: View + Remove/Fix */}
              <div className="flex items-center gap-0 flex-shrink-0 justify-end">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-foreground"
                      onClick={() => onView(issue.key)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    View in Raw JSON
                  </TooltipContent>
                </Tooltip>

                {isUnrecognized ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => onRemove(issue.key)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      Remove this key
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-orange-500"
                        onClick={() => onFixEnum(issue.key)}
                      >
                        <WrenchIcon className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      Reset to default value
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset all settings?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears every setting on this agent to an empty object. The
              model stays the same. You can re-enable individual settings
              afterward, or pick defaults from the new model.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setResetConfirmOpen(false);
                onResetAll?.();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Reset everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}

// ── TtsVoiceEditor ───────────────────────────────────────────────────────────

interface SpeakerEntry {
  name: string;
  voice: string;
}

interface TtsVoiceEditorProps {
  voiceEnum: string[];
  ttsValue: unknown;
  multiSpeakerAllowed: boolean;
  maxSpeakers?: number;
  isEnabled: boolean;
  onSave: (ttsVoice: string | SpeakerEntry[], multiSpeaker: boolean) => void;
}

function TtsVoiceEditor({
  voiceEnum,
  ttsValue,
  multiSpeakerAllowed,
  maxSpeakers,
  isEnabled,
  onSave,
}: TtsVoiceEditorProps) {
  const isMulti = Array.isArray(ttsValue);
  const atMax = maxSpeakers !== undefined && maxSpeakers > 0;

  const speakers: SpeakerEntry[] = isMulti
    ? ttsValue.map((s) => ({
        name: typeof s?.name === "string" ? s.name : "",
        voice: typeof s?.voice === "string" ? s.voice : (voiceEnum[0] ?? ""),
      }))
    : [];

  const singleVoice =
    typeof ttsValue === "string" ? ttsValue : (voiceEnum[0] ?? "");

  const switchToMulti = () => {
    const initial: SpeakerEntry[] = [
      { name: "Speaker 1", voice: singleVoice || voiceEnum[0] || "" },
      { name: "Speaker 2", voice: voiceEnum[1] ?? voiceEnum[0] ?? "" },
    ];
    onSave(initial, true);
  };

  const switchToSingle = () => {
    onSave(speakers[0]?.voice || voiceEnum[0] || "", false);
  };

  const updateSpeaker = (idx: number, field: "name" | "voice", val: string) => {
    const next = speakers.map((s, i) =>
      i === idx ? { ...s, [field]: val } : s,
    );
    onSave(next, true);
  };

  const canAddMore = !atMax || speakers.length < maxSpeakers;

  const addSpeaker = () => {
    if (!canAddMore) return;
    onSave(
      [
        ...speakers,
        {
          name: `Speaker ${speakers.length + 1}`,
          voice: voiceEnum[0] ?? "",
        },
      ],
      true,
    );
  };

  const removeSpeaker = (idx: number) => {
    if (speakers.length <= 2) return;
    onSave(
      speakers.filter((_, i) => i !== idx),
      true,
    );
  };

  return (
    <div className="space-y-2.5">
      {/* Mode switch — only shown when model supports multi-speaker */}
      {multiSpeakerAllowed && (
        <div className="flex items-center gap-2">
          <span
            className={`text-xs ${!isMulti ? "font-medium text-foreground" : "text-muted-foreground"}`}
          >
            Single
          </span>
          <Switch
            checked={isMulti}
            onCheckedChange={(checked) =>
              checked ? switchToMulti() : switchToSingle()
            }
            disabled={!isEnabled}
            className="data-[state=checked]:bg-primary"
          />
          <span
            className={`text-xs ${isMulti ? "font-medium text-foreground" : "text-muted-foreground"}`}
          >
            Multi
          </span>
          {isMulti && atMax && (
            <span className="text-[10px] text-muted-foreground ml-1">
              (max {maxSpeakers})
            </span>
          )}
        </div>
      )}

      {/* Voice selection */}
      {!isMulti ? (
        <div>
          {multiSpeakerAllowed && (
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 block">
              Voice
            </Label>
          )}
          <Select
            value={singleVoice}
            onValueChange={(val) => onSave(val, false)}
            disabled={!isEnabled}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue placeholder="Select voice..." />
            </SelectTrigger>
            <SelectContent className="text-xs">
              {voiceEnum.map((v) => (
                <SelectItem key={v} value={v} className="text-xs py-1">
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div>
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 block">
            Voices
          </Label>
          <div className="space-y-1.5">
            {speakers.map((speaker, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <Input
                  value={speaker.name}
                  onChange={(e) => updateSpeaker(idx, "name", e.target.value)}
                  disabled={!isEnabled}
                  className="h-7 text-xs flex-1 min-w-0"
                  placeholder="Name..."
                />
                <Select
                  value={speaker.voice}
                  onValueChange={(val) => updateSpeaker(idx, "voice", val)}
                  disabled={!isEnabled}
                >
                  <SelectTrigger className="h-7 text-xs w-[140px] flex-shrink-0">
                    <SelectValue placeholder="Voice..." />
                  </SelectTrigger>
                  <SelectContent className="text-xs">
                    {voiceEnum.map((v) => (
                      <SelectItem key={v} value={v} className="text-xs py-1">
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeSpeaker(idx)}
                  disabled={!isEnabled || speakers.length <= 2}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs gap-1 text-muted-foreground hover:text-foreground"
              onClick={addSpeaker}
              disabled={!isEnabled || !canAddMore}
            >
              <Plus className="h-3 w-3" />
              Add Speaker
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ModelConfigViewer ─────────────────────────────────────────────────────────
function ModelConfigViewer({
  normalizedControls,
}: {
  normalizedControls: NormalizedControls;
}) {
  const entries = useMemo(() => {
    const result: { key: string; control: ControlDefinition }[] = [];
    Object.entries(normalizedControls).forEach(([key, val]) => {
      if (key === "rawControls" || key === "unmappedControls") return;
      if (val && typeof val === "object" && "type" in val) {
        result.push({ key, control: val as ControlDefinition });
      }
    });
    return result.sort((a, b) => a.key.localeCompare(b.key));
  }, [normalizedControls]);

  const unmapped = useMemo(
    () => Object.entries(normalizedControls.unmappedControls ?? {}),
    [normalizedControls],
  );

  return (
    <div className="space-y-3">
      <p className="text-[10px] text-muted-foreground">
        Parameters this model exposes. These drive which settings appear in the
        Settings tab.
      </p>

      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          No controls defined for this model.
        </p>
      ) : (
        <div className="rounded border border-border overflow-hidden">
          {/* Fixed columns — Range/Options column scrolls horizontally per-row */}
          <div className="grid grid-cols-[1fr_70px_160px_70px] gap-2 px-2.5 py-1 bg-muted/50 border-b border-border">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Key
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Type
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Range / Options
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Default
            </span>
          </div>
          {entries.map(({ key, control }, idx) => {
            const rangeOrOptions =
              control.type === "enum" && control.enum?.length
                ? control.enum.join(", ")
                : control.min !== undefined && control.max !== undefined
                  ? `${control.min} – ${control.max}`
                  : "—";

            return (
              <div
                key={key}
                className={`grid grid-cols-[1fr_70px_160px_70px] gap-2 px-2.5 py-1.5 text-xs items-center ${
                  idx < entries.length - 1 ? "border-b border-border" : ""
                } ${idx % 2 === 0 ? "bg-background" : "bg-muted/20"}`}
              >
                <span className="font-mono text-foreground truncate">
                  {key}
                </span>
                <span className="text-muted-foreground">{control.type}</span>
                {/* scrollable horizontally so long enum lists are never cut off */}
                <div className="overflow-x-auto">
                  <span className="text-muted-foreground text-[10px] whitespace-nowrap">
                    {rangeOrOptions}
                  </span>
                </div>
                <span className="font-mono text-muted-foreground text-[10px] truncate">
                  {control.default !== undefined && control.default !== null
                    ? String(control.default)
                    : "—"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {unmapped.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Unmapped controls
          </p>
          {/* Full JSON, no height cap — everything visible */}
          <pre className="text-[10px] font-mono bg-muted/30 rounded p-2 overflow-x-auto text-muted-foreground whitespace-pre-wrap break-all">
            {JSON.stringify(Object.fromEntries(unmapped), null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── VSCode-style Tab Bar ──────────────────────────────────────────────────────
interface TabBarProps {
  active: SettingsTab;
  onChange: (tab: SettingsTab) => void;
  issueCount: number;
}

function TabBar({ active, onChange, issueCount }: TabBarProps) {
  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    {
      id: "settings",
      label: "Settings",
      icon: <SlidersHorizontal className="h-3 w-3" />,
    },
    {
      id: "raw",
      label: "Raw Settings",
      icon: <Code2 className="h-3 w-3" />,
    },
    {
      id: "raw-edit",
      label: "Raw Editable",
      icon: <Save className="h-3 w-3" />,
    },
    {
      id: "model-config",
      label: "Model Config",
      icon: <Settings2 className="h-3 w-3" />,
    },
    {
      id: "output-schema",
      label: "Output Schema",
      icon: <Braces className="h-3 w-3" />,
    },
  ];

  return (
    <div className="flex border-b border-border flex-shrink-0 -mx-3 px-3">
      {tabs.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors select-none ${
              isActive
                ? "text-foreground border-b-2 border-primary -mb-px"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.id === "settings" && issueCount > 0 && (
              <span className="ml-0.5 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-yellow-500 text-[9px] font-bold text-white leading-none">
                {issueCount > 9 ? "9+" : issueCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── AgentSettingsCore ────────────────────────────────────────────────────────

interface AgentSettingsCoreProps {
  agentId: string;
}

export function AgentSettingsCore({ agentId }: AgentSettingsCoreProps) {
  const dispatch = useAppDispatch();

  const settings = useAppSelector((state) =>
    selectAgentSettings(state, agentId),
  );
  const modelId = useAppSelector((state) => selectAgentModelId(state, agentId));
  const agentTools = useAppSelector((state) =>
    selectAgentTools(state, agentId),
  );
  const models = useAppSelector(selectAllModels);
  const outputSchema = useAppSelector((state) =>
    selectAgentOutputSchema(state, agentId),
  );

  const { normalizedControls, error } = useModelControls(models, modelId ?? "");

  const currentSettings: FeLlmParams = (settings ?? {}) as FeLlmParams;

  const modelConstraints = useMemo(() => {
    if (!modelId) return null;
    const model = models.find((m) => m.id === modelId);
    const raw = model?.constraints;
    if (!Array.isArray(raw) || raw.length === 0) return null;
    return raw as import("@/features/ai-models/types").ModelConstraint[];
  }, [modelId, models]);

  const [activeTab, setActiveTab] = useState<SettingsTab>("settings");

  // Track enabled settings (keys with non-null values)
  const [enabledSettings, setEnabledSettings] = useState<Set<string>>(() => {
    const enabled = new Set<string>();
    Object.entries(currentSettings).forEach(([key, value]) => {
      if (value !== null && value !== undefined) enabled.add(key);
    });
    return enabled;
  });

  useEffect(() => {
    const enabled = new Set<string>();
    Object.entries(currentSettings).forEach(([key, value]) => {
      if (value !== null && value !== undefined) enabled.add(key);
    });
    setEnabledSettings(enabled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const [jsonText, setJsonText] = useState("");

  // ── Validation engine ──────────────────────────────────────────────────────
  const { validation, highlightMap: jsonHighlights } = useConfigValidation({
    settings: currentSettings,
    modelId,
    normalizedControls,
    constraints: modelConstraints,
  });
  const allIssues = validation.issues;

  const diagnosticPayload = useMemo(() => {
    if (allIssues.length === 0) return undefined;
    const model = models.find((m) => m.id === modelId);
    return {
      model_id: modelId,
      model_name: model?.name ?? null,
      raw_settings: currentSettings,
      constraints: modelConstraints,
      issues: allIssues.map((i) => ({
        rule: i.ruleId,
        key: i.key,
        severity: i.severity,
        category: i.category,
        message: i.message,
        current_value: i.value,
        suggestion: i.suggestion,
      })),
    };
  }, [allIssues, modelId, models, currentSettings, modelConstraints]);

  // ── Model change reconciliation ───────────────────────────────────────────
  const [pendingModelChange, setPendingModelChange] = useState<{
    newModelId: string;
    newModelName: string;
    oldModelName: string;
    plan: ModelChangePlan;
  } | null>(null);

  const handleModelChange = (newModelId: string) => {
    if (!newModelId || newModelId === modelId) return;

    const newModel = models.find((m) => m.id === newModelId);
    if (!newModel) {
      dispatch(
        setAgentField({ id: agentId, field: "modelId", value: newModelId }),
      );
      return;
    }

    // `useModelControls` is a pure function despite the "use" prefix — safe to
    // call on-demand for any model, not just the currently selected one.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { normalizedControls: newControls } = useModelControls(
      models,
      newModelId,
    );
    const newConstraints: ModelConstraint[] | null = Array.isArray(
      newModel.constraints,
    )
      ? (newModel.constraints as ModelConstraint[])
      : null;

    const plan = analyzeModelChange(
      currentSettings,
      newModelId,
      newModel,
      newControls,
      newConstraints,
    );

    if (plan.incompatible.length === 0) {
      // No incompatibilities — commit immediately.
      dispatch(
        setAgentField({ id: agentId, field: "modelId", value: newModelId }),
      );
      return;
    }

    const oldModel = models.find((m) => m.id === modelId);
    setPendingModelChange({
      newModelId,
      newModelName: newModel.common_name ?? newModel.name ?? newModelId,
      oldModelName: oldModel?.common_name ?? oldModel?.name ?? "current model",
      plan,
    });
  };

  const handleReconciliationCommit = (nextSettings: LLMParams) => {
    if (!pendingModelChange) return;
    dispatch(
      setAgentField({
        id: agentId,
        field: "modelId",
        value: pendingModelChange.newModelId,
      }),
    );
    dispatch(setAgentSettings({ id: agentId, settings: nextSettings }));
    setPendingModelChange(null);
  };

  const handleReconciliationCancel = () => {
    setPendingModelChange(null);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleSettingChange = (key: keyof FeLlmParams, value: any) => {
    if (!enabledSettings.has(key)) {
      setEnabledSettings(new Set(enabledSettings).add(key));
    }

    if (key === "response_format" && typeof value === "string") {
      if (value === "text" || value === "") {
        const { response_format: _r, ...rest } = currentSettings;
        dispatch(
          setAgentSettings({ id: agentId, settings: rest as LLMParams }),
        );
        return;
      }
      dispatch(
        setAgentSettings({
          id: agentId,
          settings: { ...currentSettings, response_format: { type: value } },
        }),
      );
      return;
    }

    if (key === "include_thoughts") {
      if (value === false) {
        dispatch(
          setAgentSettings({
            id: agentId,
            settings: {
              ...currentSettings,
              include_thoughts: false,
              thinking_budget: -1,
            },
          }),
        );
      } else if (value === true && currentSettings.thinking_budget === -1) {
        dispatch(
          setAgentSettings({
            id: agentId,
            settings: {
              ...currentSettings,
              include_thoughts: true,
              thinking_budget:
                (normalizedControls?.thinking_budget?.default as number) ??
                1024,
            },
          }),
        );
      } else {
        dispatch(
          setAgentSettings({
            id: agentId,
            settings: { ...currentSettings, [key]: value },
          }),
        );
      }
      return;
    }

    dispatch(
      setAgentSettings({
        id: agentId,
        settings: { ...currentSettings, [key]: value },
      }),
    );
  };

  const getControl = (key: string): ControlDefinition | undefined =>
    normalizedControls
      ? (normalizedControls as unknown as Record<string, ControlDefinition>)[
          key
        ]
      : undefined;

  const handleToggleSetting = (key: keyof FeLlmParams, enabled: boolean) => {
    const newEnabled = new Set(enabledSettings);
    if (enabled) {
      newEnabled.add(key);
      const control = getControl(key);
      if (control) {
        let defaultValue: unknown = control.default;
        if (defaultValue === null || defaultValue === undefined) {
          if (control.type === "number" || control.type === "integer") {
            defaultValue = control.min ?? 0;
          } else if (
            control.type === "string" ||
            control.type === "string_array"
          ) {
            defaultValue = "";
          } else if (control.type === "boolean") {
            defaultValue = false;
          } else if (control.type === "enum" && control.enum?.length) {
            defaultValue = control.enum[0];
          } else if (
            control.type === "array" ||
            control.type === "object_array"
          ) {
            defaultValue = [];
          }
        }
        if (key === "response_format" && typeof defaultValue === "string") {
          defaultValue =
            defaultValue === "text" || defaultValue === ""
              ? undefined
              : { type: defaultValue };
        }
        if (defaultValue !== undefined) {
          dispatch(
            setAgentSettings({
              id: agentId,
              settings: { ...currentSettings, [key]: defaultValue },
            }),
          );
        }
      }
    } else {
      newEnabled.delete(key);
      const cleaned = { ...currentSettings };
      delete (cleaned as Record<string, unknown>)[key];
      // When disabling tts_voice, also remove the coupled multi_speaker flag
      if (key === "tts_voice") {
        delete (cleaned as Record<string, unknown>).multi_speaker;
        newEnabled.delete("multi_speaker");
      }
      dispatch(
        setAgentSettings({ id: agentId, settings: cleaned as LLMParams }),
      );
    }
    setEnabledSettings(newEnabled);
  };

  // Build composite JSON payload
  const buildFullSettingsJson = () => {
    const composite: Record<string, unknown> = {};
    if (modelId) composite.model_id = modelId;
    if (agentTools && agentTools.length > 0) composite.tools = agentTools;
    Object.assign(composite, currentSettings);
    return JSON.stringify(composite, null, 2);
  };

  // Sync JSON text whenever tab changes to either raw tab
  useEffect(() => {
    if (activeTab === "raw" || activeTab === "raw-edit") {
      setJsonText(buildFullSettingsJson());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Issue table handlers
  const handleIssueView = (key: string) => {
    void key;
    setJsonText(buildFullSettingsJson());
    setActiveTab("raw");
  };

  const handleIssueRemove = (key: string) => {
    const { [key]: _removed, ...rest } = currentSettings as Record<
      string,
      unknown
    >;
    dispatch(setAgentSettings({ id: agentId, settings: rest as LLMParams }));
  };

  const handleIssueFix = (key: string) => {
    // Find the first issue on this key and route through the shared fix helper.
    const issue = allIssues.find((i) => i.key === key);
    if (!issue) return;
    const next = applyFixForIssue(issue, currentSettings, normalizedControls);
    dispatch(setAgentSettings({ id: agentId, settings: next }));
  };

  // ── Bulk IssueTable handlers ─────────────────────────────────────────────

  const fixableIssues = useMemo(
    () => allIssues.filter((i) => canFixIssue(i, normalizedControls)),
    [allIssues, normalizedControls],
  );
  const unknownIssues = useMemo(
    () => allIssues.filter((i) => i.category === "unrecognized_key"),
    [allIssues],
  );

  const handleFixAll = () => {
    const next = applyAllFixableIssues(
      fixableIssues,
      currentSettings,
      normalizedControls,
    );
    dispatch(setAgentSettings({ id: agentId, settings: next }));
  };

  const handleRemoveAllUnknown = () => {
    const next = { ...currentSettings } as Record<string, unknown>;
    for (const issue of unknownIssues) {
      delete next[issue.key];
    }
    dispatch(setAgentSettings({ id: agentId, settings: next as LLMParams }));
  };

  const handleResetAll = () => {
    dispatch(setAgentSettings({ id: agentId, settings: {} as LLMParams }));
  };

  // ── render helpers ────────────────────────────────────────────────────────

  const renderControlInput = (
    key: keyof FeLlmParams,
    control: ControlDefinition,
    value: unknown,
    isEnabled: boolean,
  ) => {
    let actualValue =
      value ??
      control.default ??
      (control.type === "number" || control.type === "integer"
        ? (control.min ?? 0)
        : "");

    if (
      key === "response_format" &&
      typeof actualValue === "object" &&
      actualValue !== null &&
      "type" in (actualValue as Record<string, unknown>)
    ) {
      actualValue = (actualValue as Record<string, unknown>).type;
    }

    if (control.type === "enum" && control.enum) {
      const storedValue =
        key === "response_format" &&
        typeof value === "object" &&
        value !== null &&
        "type" in (value as Record<string, unknown>)
          ? String((value as Record<string, unknown>).type)
          : (value as string | undefined);
      const isValueMismatch =
        storedValue !== undefined &&
        storedValue !== null &&
        storedValue !== "" &&
        !control.enum.includes(storedValue);

      return (
        <div className="flex items-center gap-1.5 flex-1">
          <Select
            value={isValueMismatch ? "" : (actualValue as string)}
            onValueChange={(val) => handleSettingChange(key, val)}
            disabled={!isEnabled}
          >
            <SelectTrigger className="h-7 text-xs flex-1">
              <SelectValue
                placeholder={isValueMismatch ? `⚠ ${storedValue}` : "Select..."}
              />
            </SelectTrigger>
            <SelectContent className="text-xs">
              {control.enum.map((option) => (
                <SelectItem
                  key={option}
                  value={option}
                  className="text-xs py-1"
                >
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isValueMismatch && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-amber-500 flex-shrink-0 cursor-help">
                    <AlertTriangle className="h-3.5 w-3.5" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs max-w-[220px]">
                  "{storedValue}" is not a recognized option for this model
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      );
    }

    if (control.type === "boolean") {
      const boolId = `bool-agent-${key}`;
      return (
        <div className="flex items-center gap-2">
          <Checkbox
            id={boolId}
            checked={!!actualValue}
            onCheckedChange={(checked) => handleSettingChange(key, checked)}
            disabled={!isEnabled}
            className="cursor-pointer"
          />
          <Label
            htmlFor={boolId}
            className="text-xs text-gray-600 dark:text-gray-400 cursor-pointer"
          >
            {actualValue ? "Enabled" : "Disabled"}
          </Label>
        </div>
      );
    }

    if (
      (control.type === "number" || control.type === "integer") &&
      control.min !== undefined &&
      control.max !== undefined
    ) {
      return (
        <NumberInput
          value={actualValue as number}
          onChange={(val) => handleSettingChange(key, val)}
          onSliderChange={(val) => handleSettingChange(key, val)}
          min={control.min}
          max={control.max}
          step={control.type === "integer" ? 1 : 0.01}
          isInteger={control.type === "integer"}
          disabled={!isEnabled}
          withSlider
        />
      );
    }

    if (control.type === "number" || control.type === "integer") {
      return (
        <NumberInput
          value={actualValue as number}
          onChange={(val) => handleSettingChange(key, val)}
          min={control.min}
          max={control.max}
          step={control.type === "integer" ? 1 : 0.01}
          isInteger={control.type === "integer"}
          disabled={!isEnabled}
        />
      );
    }

    if (control.type === "string_array") {
      const arrayValue = Array.isArray(value)
        ? (value as string[]).join("\n")
        : "";
      return (
        <Textarea
          value={arrayValue}
          onChange={(e) =>
            handleSettingChange(
              key,
              e.target.value.split("\n").filter((s) => s.trim()),
            )
          }
          disabled={!isEnabled}
          className="min-h-[60px] text-xs font-mono disabled:opacity-50"
          placeholder="One value per line..."
        />
      );
    }

    return (
      <input
        type="text"
        value={actualValue as string}
        onChange={(e) => handleSettingChange(key, e.target.value)}
        disabled={!isEnabled}
        className="h-7 px-2 text-xs text-gray-900 dark:text-gray-100 bg-textured border border-border rounded disabled:opacity-50 w-full"
      />
    );
  };

  const renderControl = (
    key: keyof FeLlmParams,
    label: string,
    control: ControlDefinition | null,
  ) => {
    const isEnabled = enabledSettings.has(key);
    const valueRaw = (currentSettings as Record<string, unknown>)[key];
    const checkboxId = `setting-agent-${key}`;
    const keyIssues = validation.issuesByKey[key] ?? [];
    const hasIssue = keyIssues.length > 0;
    const hasControl = !!control;

    // Three-state validity (independent of enabled state, so incompatibility
    // is never hidden):
    //   invalid  — has validation issue(s)
    //   unknown  — no control on the current model → not valid for this model
    //   valid    — control exists and no issues
    const state: "valid" | "invalid" | "unknown" = hasIssue
      ? "invalid"
      : hasControl
        ? "valid"
        : "unknown";

    const firstIssue = keyIssues[0];
    const fixable = !!firstIssue && canFixIssue(firstIssue, normalizedControls);

    const dotClass =
      state === "invalid"
        ? "bg-orange-500"
        : state === "unknown"
          ? "bg-amber-400"
          : "bg-emerald-500";
    const dotTitle =
      state === "invalid"
        ? (firstIssue?.message ?? "Issue detected")
        : state === "unknown"
          ? "Unable to confirm — this model has no schema for this setting"
          : "Valid";

    return (
      <div
        key={key}
        className="flex items-start gap-2 mb-2 rounded px-1 py-1 hover:bg-muted/20"
      >
        {/* Validity dot */}
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={`h-2 w-2 rounded-full shrink-0 mt-2 ${dotClass}`}
                aria-label={dotTitle}
              />
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs max-w-[260px]">
              {dotTitle}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Checkbox + Label */}
        <div
          className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity pt-1 flex-shrink-0"
          onClick={() => handleToggleSetting(key, !isEnabled)}
        >
          <Checkbox
            id={checkboxId}
            checked={isEnabled}
            onCheckedChange={(checked) =>
              handleToggleSetting(key, checked as boolean)
            }
            className="cursor-pointer"
          />
          <Label
            htmlFor={checkboxId}
            className={`text-xs flex-shrink-0 w-36 cursor-pointer ${
              isEnabled
                ? "text-gray-700 dark:text-gray-300"
                : "text-gray-400 dark:text-gray-600"
            }`}
          >
            {label}
          </Label>
        </div>

        {/* Control input (or fallback) */}
        <div
          className={`flex-1 min-w-0 ${!isEnabled ? "opacity-50 pointer-events-none" : ""}`}
        >
          {control ? (
            renderControlInput(key, control, valueRaw, isEnabled)
          ) : (
            <FallbackValueInput
              settingKey={key as string}
              value={valueRaw}
              disabled={!isEnabled}
              onChange={(v) => handleSettingChange(key, v)}
            />
          )}
          {hasIssue && isEnabled && (
            <p className="text-[10px] text-orange-600 dark:text-orange-400 mt-1 leading-tight">
              {firstIssue.message}
            </p>
          )}
        </div>

        {/* Per-row actions */}
        <div className="flex items-center gap-0 shrink-0">
          {fixable && isEnabled && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-orange-500"
                    onClick={() => handleIssueFix(key as string)}
                  >
                    <WrenchIcon className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  Fix automatically
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {isEnabled && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    onClick={() => handleIssueRemove(key as string)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  Remove this setting
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
    );
  };

  // tts_voice gets the dedicated multi-speaker editor when the model supports
  // it; otherwise it degrades to a normal row so it is never hidden.
  const renderVoiceRow = (row: SettingsRow) => {
    const voiceControl = getControl("tts_voice");
    if (!voiceControl || !voiceControl.enum?.length) {
      return renderControl("tts_voice", row.label, getControl("tts_voice") ?? null);
    }
    const voiceEnum = voiceControl.enum ?? [];
    const ttsEnabled = enabledSettings.has("tts_voice");
    const multiControl = getControl("multi_speaker");
    const multiAllowed = !!multiControl;
    const maxSpeakers = multiControl?.max;
    return (
      <div className="mb-2" key="tts_voice">
        <div className="flex items-center gap-3 mb-1">
          <div
            className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => handleToggleSetting("tts_voice", !ttsEnabled)}
          >
            <Checkbox
              id="setting-agent-tts_voice"
              checked={ttsEnabled}
              onCheckedChange={(checked) =>
                handleToggleSetting("tts_voice", checked as boolean)
              }
              className="cursor-pointer"
            />
            <Label
              htmlFor="setting-agent-tts_voice"
              className={`text-xs flex-shrink-0 w-36 cursor-pointer ${
                ttsEnabled
                  ? "text-gray-700 dark:text-gray-300"
                  : "text-gray-400 dark:text-gray-600"
              }`}
            >
              Voice
            </Label>
          </div>
        </div>
        <div
          className={`pl-[calc(1rem+8px+0.75rem)] ${!ttsEnabled ? "opacity-50 pointer-events-none" : ""}`}
        >
          <TtsVoiceEditor
            voiceEnum={voiceEnum}
            ttsValue={(currentSettings as Record<string, unknown>).tts_voice}
            multiSpeakerAllowed={multiAllowed}
            maxSpeakers={maxSpeakers}
            isEnabled={ttsEnabled}
            onSave={(ttsVoice, multi) => {
              dispatch(
                setAgentSettings({
                  id: agentId,
                  settings: {
                    ...currentSettings,
                    tts_voice: ttsVoice,
                    multi_speaker: multi,
                  } as LLMParams,
                }),
              );
            }}
          />
        </div>
      </div>
    );
  };

  const renderSettingRow = (row: SettingsRow) => {
    if (row.key === "tts_voice") return renderVoiceRow(row);
    return renderControl(
      row.key as keyof FeLlmParams,
      row.label,
      (row.control as ControlDefinition | null) ?? null,
    );
  };

  // Every catalogue setting renders, for every model. The model's controls
  // only decorate each row (supported vs. caution) — they never decide whether
  // a row appears. See lib/redux/slices/agent-settings/settings-catalogue.ts.
  const settingGroups = buildSettingsRows(
    normalizedControls as Record<string, unknown> | null,
    currentSettings as Record<string, unknown>,
  );

  // Gentle (non-blocking) reminder: response_format is json_schema but no
  // usable output schema exists yet. Surfaces a nudge on the Settings tab that
  // links to the Output Schema tab. Not enforced — just a hint.
  const responseFormat = (currentSettings as Record<string, unknown>)
    .response_format;
  const wantsJsonSchema =
    responseFormat === "json_schema" ||
    (typeof responseFormat === "object" &&
      responseFormat !== null &&
      (responseFormat as Record<string, unknown>).type === "json_schema");
  const outputSchemaUsable =
    outputSchema != null && validateOutputSchema(outputSchema).ok;
  const showSchemaReminder = wantsJsonSchema && !outputSchemaUsable;

  // ── Early returns ─────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="text-xs text-red-600 dark:text-red-400 px-1 py-2">
        Error loading model controls: {error}
      </div>
    );
  }

  const noControls = !normalizedControls;

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      {!noControls && (
        <TabBar
          active={activeTab}
          onChange={setActiveTab}
          issueCount={allIssues.length}
        />
      )}

      {/* Tab content — fills remaining height */}
      <div
        className={`flex-1 min-h-0 ${activeTab === "raw-edit" || activeTab === "output-schema" ? "flex flex-col" : "overflow-y-auto"} pt-3`}
      >
        {/* ── SETTINGS TAB ───────────────────────────────────────────────── */}
        {(activeTab === "settings" || noControls) && (
          <div className="space-y-1.5">
            {/* Model selector */}
            <div className="flex items-center gap-2 pb-1 border-b border-border">
              <Label className="text-xs text-muted-foreground flex-shrink-0 w-36">
                Model
              </Label>
              <div className="flex-1 flex justify-start">
                <SmartModelSelect
                  value={modelId}
                  onValueChange={handleModelChange}
                />
              </div>
            </div>

            {noControls && (
              <p className="text-xs text-muted-foreground">
                Select a model to see available settings.
              </p>
            )}

            {/* Issue table */}
            {!noControls && allIssues.length > 0 && (
              <IssueTable
                issues={allIssues}
                diagnosticPayload={diagnosticPayload}
                onView={handleIssueView}
                onRemove={handleIssueRemove}
                onFixEnum={handleIssueFix}
                onFixAll={handleFixAll}
                onRemoveAllUnknown={handleRemoveAllUnknown}
                onResetAll={handleResetAll}
                fixableCount={fixableIssues.length}
                unknownCount={unknownIssues.length}
              />
            )}

            {/* Gentle, non-blocking reminder: json_schema selected but no
                usable output schema yet. Whole banner links to the tab. */}
            {!noControls && showSchemaReminder && (
              <button
                type="button"
                onClick={() => setActiveTab("output-schema")}
                className="flex w-full items-start gap-2 rounded-md border border-sky-200 dark:border-sky-900 bg-sky-50 dark:bg-sky-950/30 px-3 py-2 text-left text-xs text-sky-800 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-950/50 transition-colors"
              >
                <Braces className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span className="flex-1 leading-snug">
                  Response format is{" "}
                  <code className="font-mono">json_schema</code>, but{" "}
                  {outputSchema == null
                    ? "no output schema is set"
                    : "the output schema has issues"}
                  . Open the{" "}
                  <span className="font-semibold underline">Output Schema</span>{" "}
                  tab to add one.
                </span>
              </button>
            )}

            {/* Every catalogue setting renders for every model. The model's
                controls only decorate each row (supported vs. caution). A
                setting unsupported by the model is NEVER hidden — it shows a
                caution dot, and when it holds a value it also surfaces in the
                IssueTable above with a one-click fix. */}
            {settingGroups.map((group) =>
              group.rows.length === 0 ? null : (
                <div
                  key={group.id}
                  className={group.label ? "border-t pt-2 mt-2" : undefined}
                >
                  {group.label && (
                    <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      {group.label}
                    </div>
                  )}
                  {group.rows.map(renderSettingRow)}
                </div>
              ),
            )}
          </div>
        )}

        {/* ── RAW SETTINGS TAB (colorful read-only viewer) ───────────────── */}
        {activeTab === "raw" && (
          <div className="flex flex-col gap-2">
            <p className="text-[10px] text-muted-foreground">
              Read-only view of the full effective payload.{" "}
              {allIssues.length > 0 && (
                <span className="text-yellow-600 dark:text-yellow-400">
                  Highlighted lines have issues.
                </span>
              )}
            </p>
            <div className="rounded border border-border overflow-hidden">
              <HighlightedJson
                value={(() => {
                  try {
                    return JSON.parse(buildFullSettingsJson());
                  } catch {
                    return {};
                  }
                })()}
                highlightKeys={jsonHighlights}
              />
            </div>
          </div>
        )}

        {/* ── RAW EDITABLE TAB (forgiving JSON editor) ─────────────────────── */}
        {activeTab === "raw-edit" && (
          <div className="flex flex-col h-full gap-2">
            <p className="text-[10px] text-muted-foreground flex-shrink-0">
              Edit the full JSON payload directly, then apply your changes.
              Trailing commas and <code>// comments</code> are fine.
            </p>

            <SettingsJsonEditor
              initialValue={jsonText}
              onApply={(parsed) => {
                const { model_id, tools, ...llmParams } = parsed;
                if (model_id !== undefined && typeof model_id === "string") {
                  dispatch(
                    setAgentField({
                      id: agentId,
                      field: "modelId",
                      value: model_id,
                    }),
                  );
                }
                if (tools !== undefined && Array.isArray(tools)) {
                  dispatch(
                    setAgentTools({ id: agentId, tools: tools as string[] }),
                  );
                }
                dispatch(
                  setAgentSettings({
                    id: agentId,
                    settings: llmParams as LLMParams,
                  }),
                );
                const newEnabled = new Set<string>();
                Object.entries(llmParams).forEach(([key, value]) => {
                  if (value !== null && value !== undefined)
                    newEnabled.add(key);
                });
                setEnabledSettings(newEnabled);
                setActiveTab("settings");
              }}
              onReset={() => setJsonText(buildFullSettingsJson())}
              minHeight={360}
            />
          </div>
        )}

        {/* ── MODEL CONFIG TAB ───────────────────────────────────────────── */}
        {activeTab === "model-config" && normalizedControls && (
          <ModelConfigViewer normalizedControls={normalizedControls} />
        )}

        {/* ── OUTPUT SCHEMA TAB ──────────────────────────────────────────── */}
        {activeTab === "output-schema" && <OutputSchemaTab agentId={agentId} />}
      </div>

      {/* Model-change reconciliation dialog */}
      {pendingModelChange && (
        <ModelChangeReconciliation
          isOpen={true}
          onClose={handleReconciliationCancel}
          oldModelName={pendingModelChange.oldModelName}
          newModelName={pendingModelChange.newModelName}
          oldSettings={currentSettings}
          plan={pendingModelChange.plan}
          onCommit={handleReconciliationCommit}
        />
      )}
    </div>
  );
}
