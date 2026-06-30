"use client";

import React, { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { EnhancedEditableJsonViewer } from "@/components/ui/JsonComponents/JsonEditor";
import {
  Plus,
  Trash2,
  Code2,
  Table2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { ControlParam, ControlParamType, ControlsSchema } from "../types";
import {
  TOOL_CHOICE_OPTIONS,
  REASONING_EFFORT_OPTIONS,
  REASONING_SUMMARY_OPTIONS,
  THINKING_LEVEL_OPTIONS,
} from "@/types/python-generated/llm-enums";

// ─── Known controls catalog ───────────────────────────────────────────────────
// Each entry defines what fields are relevant so the UI can render appropriate inputs.

type KnownControlKind =
  | "number_range" // min/max/default numeric slider-style
  | "integer_range" // same but integer
  | "boolean" // simple on/off toggle
  | "feature_flag" // has `allowed` + optional `default`
  | "enum" // predefined enum options
  | "array" // string array (e.g. stop_sequences)
  | "integer_dim"; // width/height-style integer

interface KnownControlMeta {
  label: string;
  kind: KnownControlKind;
  description: string;
  defaultMin?: number;
  defaultMax?: number;
  enumOptions?: string[];
}

const KNOWN_CONTROLS: Record<string, KnownControlMeta> = {
  // ── Core generation params ──
  temperature: {
    label: "Temperature",
    kind: "number_range",
    description: "Randomness of output (0 = deterministic)",
    defaultMin: 0,
    defaultMax: 2,
  },
  max_tokens: {
    label: "Max Tokens",
    kind: "integer_range",
    description: "Legacy token limit for older APIs",
    defaultMin: 1,
    defaultMax: 128000,
  },
  max_output_tokens: {
    label: "Max Output Tokens",
    kind: "integer_range",
    description: "Maximum tokens to generate",
    defaultMin: 1,
    defaultMax: 128000,
  },
  top_p: {
    label: "Top P",
    kind: "number_range",
    description: "Nucleus sampling probability mass",
    defaultMin: 0,
    defaultMax: 1,
  },
  top_k: {
    label: "Top K",
    kind: "integer_range",
    description: "Top-K sampling pool size",
    defaultMin: 0,
    defaultMax: 500,
  },
  thinking_budget: {
    label: "Thinking Budget",
    kind: "integer_range",
    description: "Token budget for extended thinking",
    defaultMin: 0,
    defaultMax: 100000,
  },
  reasoning_effort: {
    label: "Reasoning Effort",
    kind: "enum",
    description: "Reasoning depth level",
    enumOptions: [...REASONING_EFFORT_OPTIONS],
  },
  verbosity: {
    label: "Verbosity",
    kind: "enum",
    description: "Response verbosity level",
    enumOptions: ["low", "medium", "high"],
  },
  reasoning_summary: {
    label: "Reasoning Summary",
    kind: "enum",
    description: "How to include reasoning summary",
    enumOptions: [...REASONING_SUMMARY_OPTIONS],
  },
  output_format: {
    label: "Output Format",
    kind: "enum",
    description: "Response format (mapped to response_format)",
    enumOptions: ["text", "json_schema", "json_object"],
  },
  response_format: {
    label: "Response Format",
    kind: "enum",
    description: "Structured output format",
    enumOptions: ["text", "json_schema", "json_object"],
  },
  tool_choice: {
    label: "Tool Choice",
    kind: "enum",
    description: "How the model selects tools",
    enumOptions: [...TOOL_CHOICE_OPTIONS],
  },
  stop_sequences: {
    label: "Stop Sequences",
    kind: "array",
    description: "Sequences that stop generation",
  },

  // ── Boolean toggles ──
  stream: {
    label: "Stream",
    kind: "boolean",
    description: "Enable streaming responses",
  },
  store: {
    label: "Store",
    kind: "boolean",
    description: "Persist response in API storage",
  },
  parallel_tool_calls: {
    label: "Parallel Tool Calls",
    kind: "boolean",
    description: "Allow parallel tool execution",
  },
  include_thoughts: {
    label: "Include Thoughts",
    kind: "boolean",
    description: "Include reasoning thoughts in response",
  },

  // ── Feature flags (allowed) ──
  tools: {
    label: "Tools",
    kind: "feature_flag",
    description: "Enable function/tool calling",
  },
  image_urls: {
    label: "Image URLs",
    kind: "feature_flag",
    description: "Allow image URL inputs",
  },
  file_urls: {
    label: "File URLs",
    kind: "feature_flag",
    description: "Allow file URL inputs",
  },
  internal_web_search: {
    label: "Internal Web Search",
    kind: "feature_flag",
    description: "Enable built-in web search grounding",
  },
  internal_url_context: {
    label: "Internal URL Context",
    kind: "feature_flag",
    description: "Enable URL context fetching",
  },
  youtube_videos: {
    label: "YouTube Videos",
    kind: "feature_flag",
    description: "Allow YouTube video inputs",
  },
  disable_safety_checker: {
    label: "Disable Safety",
    kind: "feature_flag",
    description: "Disable content safety checks",
  },

  // ── Image/Video model controls ──
  n: {
    label: "N (count)",
    kind: "integer_range",
    description: "Number of outputs to generate",
    defaultMin: 1,
    defaultMax: 8,
  },
  seed: {
    label: "Seed",
    kind: "integer_range",
    description: "Random seed for reproducibility",
    defaultMin: 0,
    defaultMax: 2147483647,
  },
  steps: {
    label: "Steps",
    kind: "integer_range",
    description: "Diffusion steps",
    defaultMin: 1,
    defaultMax: 150,
  },
  width: {
    label: "Width",
    kind: "integer_dim",
    description: "Output image width in pixels",
  },
  height: {
    label: "Height",
    kind: "integer_dim",
    description: "Output image height in pixels",
  },
  guidance_scale: {
    label: "Guidance Scale",
    kind: "number_range",
    description: "How closely to follow the prompt",
    defaultMin: 0,
    defaultMax: 30,
  },
  negative_prompt: {
    label: "Negative Prompt",
    kind: "feature_flag",
    description: "Allow negative prompt input",
  },
  fps: {
    label: "FPS",
    kind: "integer_range",
    description: "Frames per second for video",
    defaultMin: 1,
    defaultMax: 60,
  },
  seconds: {
    label: "Seconds",
    kind: "integer_range",
    description: "Duration for video generation",
    defaultMin: 1,
    defaultMax: 60,
  },
  output_quality: {
    label: "Output Quality",
    kind: "integer_range",
    description: "Output quality (0-100)",
    defaultMin: 0,
    defaultMax: 100,
  },
  image_loras: {
    label: "Image LoRAs",
    kind: "feature_flag",
    description: "Allow LoRA image inputs",
  },
  frame_images: {
    label: "Frame Images",
    kind: "feature_flag",
    description: "Allow frame image inputs",
  },
  reference_images: {
    label: "Reference Images",
    kind: "feature_flag",
    description: "Allow reference image inputs",
  },
};

const KNOWN_KEYS = new Set(Object.keys(KNOWN_CONTROLS));

// Group ordering for display
const GROUPS: { label: string; keys: string[] }[] = [
  {
    label: "Core Generation",
    keys: [
      "temperature",
      "max_tokens",
      "max_output_tokens",
      "top_p",
      "top_k",
      "thinking_budget",
      "reasoning_effort",
      "verbosity",
      "reasoning_summary",
      "output_format",
      "response_format",
      "tool_choice",
      "stop_sequences",
    ],
  },
  {
    label: "Toggles",
    keys: ["stream", "store", "parallel_tool_calls", "include_thoughts"],
  },
  {
    label: "Feature Flags",
    keys: [
      "tools",
      "image_urls",
      "file_urls",
      "internal_web_search",
      "internal_url_context",
      "youtube_videos",
      "disable_safety_checker",
      "negative_prompt",
      "image_loras",
      "frame_images",
      "reference_images",
    ],
  },
  {
    label: "Image / Video",
    keys: [
      "n",
      "seed",
      "steps",
      "width",
      "height",
      "guidance_scale",
      "fps",
      "seconds",
      "output_quality",
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Flatten a raw enum option value to a string key/display value.
 * Mirrors the same logic in useModelControls — objects with a `type` property
 * are flattened to their `type` string (e.g. { type: "json_object" } → "json_object").
 */
function flattenEnumOption(option: unknown): string {
  if (
    option !== null &&
    typeof option === "object" &&
    "type" in (option as Record<string, unknown>)
  ) {
    return String((option as Record<string, unknown>).type);
  }
  return String(option);
}

/** Ensure all enum values in a param are flat strings, deduplicating after flattening. */
function flattenEnumOptions(options: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const o of options) {
    const flat = flattenEnumOption(o);
    if (!seen.has(flat)) {
      seen.add(flat);
      result.push(flat);
    }
  }
  return result;
}

function buildDefaultParam(key: string): ControlParam {
  const meta = KNOWN_CONTROLS[key];
  if (!meta) return {};
  switch (meta.kind) {
    case "number_range":
      return { type: "number", min: meta.defaultMin, max: meta.defaultMax };
    case "integer_range":
    case "integer_dim":
      return { type: "integer", min: meta.defaultMin, max: meta.defaultMax };
    case "boolean":
      return { type: "boolean", default: true };
    case "feature_flag":
      return { allowed: true };
    case "enum": {
      const flatOpts = meta.enumOptions
        ? flattenEnumOptions(meta.enumOptions)
        : undefined;
      return { enum: flatOpts, default: flatOpts?.[0] };
    }
    case "array":
      return { type: "array", items: { type: "string" } };
    default:
      return {};
  }
}

// ─── Known control field renderer ────────────────────────────────────────────

function KnownControlField({
  controlKey,
  param,
  meta,
  enabled,
  onEnable,
  onDisable,
  onUpdate,
}: {
  controlKey: string;
  param: ControlParam | undefined;
  meta: KnownControlMeta;
  enabled: boolean;
  onEnable: (key: string) => void;
  onDisable: (key: string) => void;
  onUpdate: (key: string, param: ControlParam) => void;
}) {
  const update = (patch: Partial<ControlParam>) => {
    onUpdate(controlKey, {
      ...(param ?? buildDefaultParam(controlKey)),
      ...patch,
    });
  };

  return (
    <div
      className={`flex items-center gap-3 py-1.5 px-3 transition-colors ${
        enabled ? "" : "opacity-40 hover:opacity-60"
      }`}
    >
      {/* Toggle */}
      <Switch
        checked={enabled}
        onCheckedChange={(v) =>
          v ? onEnable(controlKey) : onDisable(controlKey)
        }
        id={`known-${controlKey}`}
        className="shrink-0"
      />

      {/* Key + description — fixed width so inputs align */}
      <div className="w-52 shrink-0 min-w-0">
        <div className="text-xs font-mono font-medium text-foreground leading-tight">
          {controlKey}
        </div>
        <div className="text-[10px] text-muted-foreground leading-tight truncate">
          {meta.description}
        </div>
      </div>

      {/* Value inputs — only when enabled */}
      <div className="flex-1 min-w-0">
        {enabled && param && (
          <ControlParamInputs
            controlKey={controlKey}
            param={param}
            meta={meta}
            onUpdate={update}
          />
        )}
      </div>
    </div>
  );
}

function ControlParamInputs({
  controlKey,
  param,
  meta,
  onUpdate,
}: {
  controlKey: string;
  param: ControlParam;
  meta: KnownControlMeta;
  onUpdate: (patch: Partial<ControlParam>) => void;
}) {
  switch (meta.kind) {
    case "number_range":
    case "integer_range":
    case "integer_dim": {
      const isInt = meta.kind !== "number_range";
      return (
        <div className="flex items-center gap-2">
          <Chip label="min">
            <Input
              type="number"
              value={param.min ?? ""}
              onChange={(e) =>
                onUpdate({
                  min:
                    e.target.value !== "" ? Number(e.target.value) : undefined,
                })
              }
              className="h-6 text-xs w-16 px-1.5"
              step={isInt ? 1 : 0.01}
            />
          </Chip>
          <Chip label="max">
            <Input
              type="number"
              value={param.max ?? ""}
              onChange={(e) =>
                onUpdate({
                  max:
                    e.target.value !== "" ? Number(e.target.value) : undefined,
                })
              }
              className="h-6 text-xs w-16 px-1.5"
              step={isInt ? 1 : 0.01}
            />
          </Chip>
          <Chip label="default">
            <Input
              type="number"
              value={param.default !== undefined ? String(param.default) : ""}
              onChange={(e) =>
                onUpdate({
                  default:
                    e.target.value !== "" ? Number(e.target.value) : undefined,
                })
              }
              className="h-6 text-xs w-16 px-1.5"
              step={isInt ? 1 : 0.01}
            />
          </Chip>
          <Chip label="req">
            <Switch
              checked={param.required ?? false}
              onCheckedChange={(v) => onUpdate({ required: v || undefined })}
              className="scale-75"
            />
          </Chip>
        </div>
      );
    }

    case "boolean": {
      return (
        <div className="flex items-center gap-2">
          <Chip label="default">
            <Select
              value={
                param.default !== undefined ? String(param.default) : "__none__"
              }
              onValueChange={(v) =>
                onUpdate({
                  default: v === "__none__" ? undefined : v === "true",
                })
              }
            >
              <SelectTrigger className="h-6 text-xs w-20 px-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                <SelectItem value="true">true</SelectItem>
                <SelectItem value="false">false</SelectItem>
              </SelectContent>
            </Select>
          </Chip>
        </div>
      );
    }

    case "feature_flag": {
      return (
        <div className="flex items-center gap-2">
          <Chip label="allowed">
            <Switch
              checked={param.allowed ?? true}
              onCheckedChange={(v) => onUpdate({ allowed: v })}
              className="scale-75"
            />
          </Chip>
          <Chip label="default">
            <Select
              value={
                param.default !== undefined ? String(param.default) : "__none__"
              }
              onValueChange={(v) =>
                onUpdate({
                  default: v === "__none__" ? undefined : v === "true",
                })
              }
            >
              <SelectTrigger className="h-6 text-xs w-20 px-1.5">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                <SelectItem value="true">true</SelectItem>
                <SelectItem value="false">false</SelectItem>
              </SelectContent>
            </Select>
          </Chip>
        </div>
      );
    }

    case "enum": {
      const rawOptions = param.enum ?? meta.enumOptions ?? [];
      const enumOptions = flattenEnumOptions(rawOptions);
      return (
        <div className="flex items-center gap-2 flex-wrap">
          <Chip label="default">
            <Select
              value={
                param.default !== undefined ? String(param.default) : "__none__"
              }
              onValueChange={(v) =>
                onUpdate({ default: v === "__none__" ? undefined : v })
              }
            >
              <SelectTrigger className="h-6 text-xs w-28 px-1.5">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {enumOptions.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Chip>
          <Chip label="options">
            <Input
              value={enumOptions.join(", ")}
              onChange={(e) => {
                const vals = e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
                onUpdate({ enum: vals.length > 0 ? vals : undefined });
              }}
              className="h-6 text-xs font-mono w-52 px-1.5"
            />
          </Chip>
        </div>
      );
    }

    case "array": {
      return (
        <div className="flex items-center gap-2">
          <Chip label="maxItems">
            <Input
              type="number"
              value={param.maxItems ?? ""}
              onChange={(e) =>
                onUpdate({
                  maxItems:
                    e.target.value !== "" ? Number(e.target.value) : undefined,
                })
              }
              className="h-6 text-xs w-16 px-1.5"
            />
          </Chip>
        </div>
      );
    }

    default:
      return null;
  }
}

/** Compact inline label + input chip */
function Chip({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide whitespace-nowrap">
        {label}
      </span>
      {children}
    </div>
  );
}

// ─── Unknown (custom) control row ─────────────────────────────────────────────

function CustomControlRow({
  controlKey,
  param,
  onUpdate,
  onDelete,
  onRename,
}: {
  controlKey: string;
  param: ControlParam;
  onUpdate: (key: string, param: ControlParam) => void;
  onDelete: (key: string) => void;
  onRename: (oldKey: string, newKey: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingKey, setEditingKey] = useState(controlKey);

  React.useEffect(() => {
    setEditingKey(controlKey);
  }, [controlKey]);

  const update = (patch: Partial<ControlParam>) =>
    onUpdate(controlKey, { ...param, ...patch });

  const handleKeyBlur = () => {
    const trimmed = editingKey.trim();
    if (trimmed && trimmed !== controlKey) onRename(controlKey, trimmed);
    else setEditingKey(controlKey);
  };

  return (
    <div className="border rounded-md overflow-hidden bg-card">
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/40 select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="shrink-0 text-muted-foreground">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </span>
        <span onClick={(e) => e.stopPropagation()} className="shrink-0">
          <Input
            value={editingKey}
            onChange={(e) => setEditingKey(e.target.value)}
            onBlur={handleKeyBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleKeyBlur();
              e.stopPropagation();
            }}
            onClick={(e) => e.stopPropagation()}
            className="h-6 text-xs font-mono w-40 bg-transparent border-transparent hover:border-input focus:border-input px-1"
          />
        </span>
        <div className="flex items-center gap-1 flex-wrap flex-1 min-w-0 text-xs text-muted-foreground">
          {param.type && (
            <Badge variant="outline" className="text-xs h-5 px-1.5">
              {param.type}
            </Badge>
          )}
          {param.enum && (
            <Badge variant="outline" className="text-xs h-5 px-1.5 font-mono">
              enum[{param.enum.length}]
            </Badge>
          )}
          {param.allowed !== undefined && (
            <Badge variant="outline" className="text-xs h-5 px-1.5">
              allowed={String(param.allowed)}
            </Badge>
          )}
          {param.default !== undefined && (
            <Badge variant="outline" className="text-xs h-5 px-1.5 font-mono">
              default={JSON.stringify(param.default)}
            </Badge>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(controlKey);
          }}
          className="shrink-0 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="border-t px-3 py-3 bg-muted/20 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-0.5">
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select
                value={param.type ?? "__none__"}
                onValueChange={(v) =>
                  update({
                    type:
                      v === "__none__" ? undefined : (v as ControlParamType),
                  })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="(none)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">(none)</SelectItem>
                  {(
                    [
                      "boolean",
                      "number",
                      "integer",
                      "string",
                      "array",
                      "object",
                    ] as ControlParamType[]
                  ).map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-0.5">
              <Label className="text-xs text-muted-foreground">Default</Label>
              <Input
                value={
                  param.default !== undefined
                    ? JSON.stringify(param.default)
                    : ""
                }
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    update({ default: undefined });
                    return;
                  }
                  try {
                    update({ default: JSON.parse(raw) });
                  } catch {
                    update({ default: raw });
                  }
                }}
                placeholder='e.g. 1, true, "low"'
                className="h-8 text-xs font-mono"
              />
            </div>
            <div className="space-y-0.5">
              <Label className="text-xs text-muted-foreground">Min</Label>
              <Input
                type="number"
                value={param.min ?? ""}
                onChange={(e) =>
                  update({
                    min:
                      e.target.value !== ""
                        ? Number(e.target.value)
                        : undefined,
                  })
                }
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-0.5">
              <Label className="text-xs text-muted-foreground">Max</Label>
              <Input
                type="number"
                value={param.max ?? ""}
                onChange={(e) =>
                  update({
                    max:
                      e.target.value !== ""
                        ? Number(e.target.value)
                        : undefined,
                  })
                }
                className="h-8 text-xs"
              />
            </div>
          </div>
          <div className="space-y-0.5">
            <Label className="text-xs text-muted-foreground">
              Enum values (comma-separated)
            </Label>
            <Input
              value={param.enum?.join(", ") ?? ""}
              onChange={(e) => {
                const vals = e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
                update({ enum: vals.length > 0 ? vals : undefined });
              }}
              className="h-8 text-xs font-mono"
            />
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch
                checked={param.allowed ?? false}
                onCheckedChange={(v) => update({ allowed: v })}
                id={`${controlKey}-allowed`}
              />
              <Label htmlFor={`${controlKey}-allowed`} className="text-xs">
                Allowed
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={param.required ?? false}
                onCheckedChange={(v) => update({ required: v || undefined })}
                id={`${controlKey}-required`}
              />
              <Label htmlFor={`${controlKey}-required`} className="text-xs">
                Required
              </Label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Group section ────────────────────────────────────────────────────────────

function GroupSection({
  group,
  controls,
  onEnable,
  onDisable,
  onUpdate,
}: {
  group: { label: string; keys: string[] };
  controls: ControlsSchema;
  onEnable: (key: string) => void;
  onDisable: (key: string) => void;
  onUpdate: (key: string, param: ControlParam) => void;
}) {
  const [open, setOpen] = useState(true);
  const enabledCount = group.keys.filter((k) => k in controls).length;

  return (
    <div className="border rounded-md overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2 bg-muted/30 hover:bg-muted/50 text-xs font-semibold select-none"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          {group.label}
        </div>
        <Badge variant="secondary" className="text-xs font-mono h-5 px-1.5">
          {enabledCount}/{group.keys.length}
        </Badge>
      </button>

      {open && (
        <div className="divide-y divide-border">
          {group.keys.map((key) => {
            const meta = KNOWN_CONTROLS[key];
            if (!meta) return null;
            return (
              <KnownControlField
                key={key}
                controlKey={key}
                param={controls[key]}
                meta={meta}
                enabled={key in controls}
                onEnable={onEnable}
                onDisable={onDisable}
                onUpdate={onUpdate}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main ControlsEditor ──────────────────────────────────────────────────────

interface ControlsEditorProps {
  controls: ControlsSchema | null;
  onSave: (controls: ControlsSchema) => Promise<void>;
  onChange?: (controls: ControlsSchema) => void;
}

const CUSTOM_SUGGESTIONS = [
  "temperature",
  "max_tokens",
  "top_p",
  "top_k",
  "stream",
  "tools",
].filter((k) => !KNOWN_KEYS.has(k)); // fallback — won't show known ones

export default function ControlsEditor({
  controls,
  onSave,
  onChange,
}: ControlsEditorProps) {
  const [mode, setMode] = useState<"structured" | "raw">("structured");
  const [localControls, setLocalControls] = useState<ControlsSchema>(
    controls ?? {},
  );
  const [newControlKey, setNewControlKey] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    setLocalControls(controls ?? {});
    setHasChanges(false);
  }, [controls]);

  // Split known vs custom
  const { knownControls, customControls } = useMemo(() => {
    const known: ControlsSchema = {};
    const custom: ControlsSchema = {};
    for (const [k, v] of Object.entries(localControls)) {
      if (KNOWN_KEYS.has(k)) known[k] = v;
      else custom[k] = v;
    }
    return { knownControls: known, customControls: custom };
  }, [localControls]);

  const notify = useCallback(
    (next: ControlsSchema) => {
      onChange?.(next);
    },
    [onChange],
  );

  const enableKnown = useCallback(
    (key: string) => {
      setLocalControls((prev) => {
        const next = { ...prev, [key]: buildDefaultParam(key) };
        notify(next);
        return next;
      });
      setHasChanges(true);
    },
    [notify],
  );

  const disableKnown = useCallback(
    (key: string) => {
      setLocalControls((prev) => {
        const next = { ...prev };
        delete next[key];
        notify(next);
        return next;
      });
      setHasChanges(true);
    },
    [notify],
  );

  const updateControl = useCallback(
    (key: string, param: ControlParam) => {
      setLocalControls((prev) => {
        const next = { ...prev, [key]: param };
        notify(next);
        return next;
      });
      setHasChanges(true);
    },
    [notify],
  );

  const deleteCustom = useCallback(
    (key: string) => {
      setLocalControls((prev) => {
        const next = { ...prev };
        delete next[key];
        notify(next);
        return next;
      });
      setHasChanges(true);
    },
    [notify],
  );

  const renameCustom = useCallback(
    (oldKey: string, newKey: string) => {
      setLocalControls((prev) => {
        const entries = Object.entries(prev);
        const idx = entries.findIndex(([k]) => k === oldKey);
        if (idx === -1) return prev;
        entries[idx] = [newKey, entries[idx][1]];
        const next = Object.fromEntries(entries);
        notify(next);
        return next;
      });
      setHasChanges(true);
    },
    [notify],
  );

  const addCustom = (key: string) => {
    const trimmed = key.trim();
    if (!trimmed || trimmed in localControls) return;
    if (KNOWN_KEYS.has(trimmed)) {
      enableKnown(trimmed);
    } else {
      setLocalControls((prev) => {
        const next = { ...prev, [trimmed]: {} };
        notify(next);
        return next;
      });
      setHasChanges(true);
    }
    setNewControlKey("");
    setShowSuggestions(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(localControls);
      setHasChanges(false);
    } finally {
      setSaving(false);
    }
  };

  const handleRawSave = async (data: object | string) => {
    if (typeof data === "string") return;
    const next = data as ControlsSchema;
    setLocalControls(next);
    setHasChanges(false);
    notify(next);
    await onSave(next);
  };

  const customKeys = Object.keys(customControls);
  const totalEnabled = Object.keys(localControls).length;

  // Suggestions: all unset known controls + unset unknowns matching input
  const suggestions = useMemo(() => {
    const lq = newControlKey.toLowerCase();
    const knownSuggestions = Object.keys(KNOWN_CONTROLS).filter(
      (k) => !(k in localControls) && (lq === "" || k.includes(lq)),
    );
    const customSuggestions = CUSTOM_SUGGESTIONS.filter(
      (k) => !(k in localControls) && k.includes(lq),
    );
    return [...knownSuggestions, ...customSuggestions];
  }, [newControlKey, localControls]);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Badge variant="secondary" className="text-xs font-mono">
            {totalEnabled} enabled
          </Badge>
          {hasChanges && (
            <Badge
              variant="outline"
              className="text-xs bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400"
            >
              unsaved
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs gap-1"
            onClick={() =>
              setMode(mode === "structured" ? "raw" : "structured")
            }
          >
            {mode === "structured" ? (
              <>
                <Code2 className="h-3.5 w-3.5" /> Raw JSON
              </>
            ) : (
              <>
                <Table2 className="h-3.5 w-3.5" /> Structured
              </>
            )}
          </Button>
        </div>
      </div>

      {mode === "raw" ? (
        <EnhancedEditableJsonViewer
          data={localControls}
          onSave={handleRawSave}
          hideHeader={false}
        />
      ) : (
        <div className="space-y-3">
          {/* Known control groups */}
          {GROUPS.map((group) => (
            <GroupSection
              key={group.label}
              group={group}
              controls={localControls}
              onEnable={enableKnown}
              onDisable={disableKnown}
              onUpdate={updateControl}
            />
          ))}

          {/* Custom / unknown controls */}
          {(customKeys.length > 0 || true) && (
            <>
              <Separator />
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Additional Controls
                  </span>
                  {customKeys.length > 0 && (
                    <Badge variant="outline" className="text-xs h-5 px-1.5">
                      {customKeys.length}
                    </Badge>
                  )}
                </div>

                {customKeys.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {customKeys.map((key) => (
                      <CustomControlRow
                        key={key}
                        controlKey={key}
                        param={customControls[key]}
                        onUpdate={updateControl}
                        onDelete={deleteCustom}
                        onRename={renameCustom}
                      />
                    ))}
                  </div>
                )}

                {/* Add control input */}
                <div className="relative">
                  <div className="flex gap-2">
                    <Input
                      value={newControlKey}
                      onChange={(e) => {
                        setNewControlKey(e.target.value);
                        setShowSuggestions(true);
                      }}
                      onFocus={() => setShowSuggestions(true)}
                      onBlur={() =>
                        setTimeout(() => setShowSuggestions(false), 150)
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addCustom(newControlKey);
                      }}
                      placeholder="Add control by name…"
                      className="h-8 text-xs font-mono flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 px-3 text-xs gap-1 shrink-0"
                      onClick={() => addCustom(newControlKey)}
                    >
                      <Plus className="h-3.5 w-3.5" /> Add
                    </Button>
                  </div>

                  {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute top-full left-0 z-20 w-full max-h-48 overflow-auto bg-popover border rounded-md shadow-lg mt-1">
                      {suggestions.map((s) => (
                        <button
                          key={s}
                          type="button"
                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent flex items-center gap-2"
                          onMouseDown={() => addCustom(s)}
                        >
                          <span className="font-mono">{s}</span>
                          {KNOWN_KEYS.has(s) && (
                            <span className="text-muted-foreground">
                              {KNOWN_CONTROLS[s].label}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
