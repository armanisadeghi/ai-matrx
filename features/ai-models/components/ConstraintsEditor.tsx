"use client";

import React, { useState, useEffect } from "react";
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
import { Separator } from "@/components/ui/separator";
import { EnhancedEditableJsonViewer } from "@/components/ui/JsonComponents/JsonEditor";
import {
  Plus,
  Trash2,
  Code2,
  Table2,
  AlertTriangle,
  ArrowDown,
  X,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type {
  ModelConstraint,
  UnconditionalConstraint,
  UnconditionalRule,
  ConditionalConstraint,
  ConditionOp,
  FieldCondition,
} from "../types";
import { isConditionalConstraint } from "../types";

// ─── Known fields ───────────────────────────────────────────────────────────

const KNOWN_FIELDS: Record<string, string> = {
  temperature: "Temperature",
  max_tokens: "Max Tokens",
  max_output_tokens: "Max Output Tokens",
  top_p: "Top P",
  top_k: "Top K",
  thinking_budget: "Thinking Budget",
  reasoning_effort: "Reasoning Effort",
  verbosity: "Verbosity",
  reasoning_summary: "Reasoning Summary",
  output_format: "Output Format",
  response_format: "Response Format",
  tool_choice: "Tool Choice",
  stop_sequences: "Stop Sequences",
  stream: "Stream",
  store: "Store",
  parallel_tool_calls: "Parallel Tool Calls",
  include_thoughts: "Include Thoughts",
  tools: "Tools",
  image_urls: "Image URLs",
  file_urls: "File URLs",
  internal_web_search: "Internal Web Search",
  internal_url_context: "Internal URL Context",
  youtube_videos: "YouTube Videos",
  n: "N (count)",
  seed: "Seed",
  steps: "Steps",
  width: "Width",
  height: "Height",
  guidance_scale: "Guidance Scale",
  negative_prompt: "Negative Prompt",
  disable_safety_checker: "Disable Safety",
};
const KNOWN_FIELD_KEYS = Object.keys(KNOWN_FIELDS);

const RULES: { value: UnconditionalRule; label: string }[] = [
  { value: "required", label: "Required" },
  { value: "fixed", label: "Fixed" },
  { value: "min", label: "Min" },
  { value: "max", label: "Max" },
  { value: "one_of", label: "One of" },
  { value: "forbidden", label: "Forbidden" },
];

const OPS: { value: ConditionOp; label: string; short: string }[] = [
  { value: "eq", label: "= equals", short: "=" },
  { value: "neq", label: "!= not equal", short: "!=" },
  { value: "gt", label: "> greater than", short: ">" },
  { value: "gte", label: ">= greater or equal", short: ">=" },
  { value: "lt", label: "< less than", short: "<" },
  { value: "lte", label: "<= less or equal", short: "<=" },
  { value: "in", label: "in list", short: "in" },
  { value: "not_in", label: "not in list", short: "!in" },
  { value: "exists", label: "exists", short: "?" },
  { value: "not_exists", label: "not exists", short: "!?" },
];

const SEVERITIES: {
  value: "error" | "warning" | "info";
  label: string;
  cls: string;
}[] = [
  { value: "error", label: "Error", cls: "text-red-600 dark:text-red-400" },
  {
    value: "warning",
    label: "Warn",
    cls: "text-amber-600 dark:text-amber-400",
  },
  { value: "info", label: "Info", cls: "text-blue-600 dark:text-blue-400" },
];

const NO_VALUE_RULES = new Set<UnconditionalRule>(["required", "forbidden"]);
const NO_VALUE_OPS = new Set<ConditionOp>(["exists", "not_exists"]);
const NUMERIC_OPS = new Set<ConditionOp>(["gt", "gte", "lt", "lte"]);
const LIST_OPS = new Set<ConditionOp>(["in", "not_in"]);

function makeId(parts: string[]): string {
  return parts
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-");
}

// ─── FieldCombobox ──────────────────────────────────────────────────────────

function FieldCombobox({
  value,
  onChange,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const filtered = KNOWN_FIELD_KEYS.filter((k) => {
    const q = (filter || value || "").toLowerCase();
    return !q || k.includes(q) || KNOWN_FIELDS[k].toLowerCase().includes(q);
  });

  return (
    <div className={`relative ${className}`}>
      <Input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setFilter(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setFilter(value);
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="field…"
        className="h-7 text-xs font-mono"
      />
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 z-40 w-full max-h-44 overflow-auto bg-popover border rounded-md shadow-lg mt-0.5">
          {filtered.slice(0, 25).map((k) => (
            <button
              key={k}
              type="button"
              className="w-full text-left px-2 py-1 text-xs hover:bg-accent flex items-center gap-1.5"
              onMouseDown={() => {
                onChange(k);
                setOpen(false);
              }}
            >
              <span className="font-mono">{k}</span>
              <span className="text-muted-foreground text-[10px]">
                {KNOWN_FIELDS[k]}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tag chips for one_of / in / not_in ─────────────────────────────────────

function TagInput({
  values,
  onChange,
}: {
  values: unknown[];
  onChange: (v: unknown[]) => void;
}) {
  const [input, setInput] = useState("");
  const add = () => {
    const t = input.trim();
    if (!t) return;
    const parsed =
      t === "true"
        ? true
        : t === "false"
          ? false
          : isNaN(Number(t))
            ? t
            : Number(t);
    onChange([...values, parsed]);
    setInput("");
  };
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {values.map((v, i) => (
        <Badge
          key={i}
          variant="secondary"
          className="text-[10px] h-5 gap-0.5 pr-0.5 font-mono"
        >
          {String(v)}
          <button
            type="button"
            onClick={() => onChange(values.filter((_, idx) => idx !== i))}
            className="hover:text-destructive ml-0.5"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </Badge>
      ))}
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        placeholder="+ value"
        className="h-6 text-[10px] font-mono w-20 min-w-16 flex-1"
      />
    </div>
  );
}

// ─── Inline value input (compact, one row) ──────────────────────────────────

function InlineValue({
  op,
  value,
  onChange,
}: {
  op: ConditionOp | UnconditionalRule;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (
    NO_VALUE_RULES.has(op as UnconditionalRule) ||
    NO_VALUE_OPS.has(op as ConditionOp)
  )
    return null;

  if (op === "one_of" || LIST_OPS.has(op as ConditionOp)) {
    return (
      <TagInput
        values={Array.isArray(value) ? value : []}
        onChange={onChange}
      />
    );
  }

  if (NUMERIC_OPS.has(op as ConditionOp) || op === "min" || op === "max") {
    return (
      <Input
        type="number"
        value={typeof value === "number" ? value : ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? undefined : Number(e.target.value))
        }
        placeholder="0"
        className="h-7 text-xs font-mono w-full"
      />
    );
  }

  // eq/neq/fixed: bool, number, or string
  if (typeof value === "boolean") {
    return (
      <div className="flex items-center gap-1.5">
        <Switch
          checked={value}
          onCheckedChange={onChange}
          className="scale-75"
        />
        <span className="text-xs font-mono w-10">{String(value)}</span>
        <button
          type="button"
          onClick={() => onChange(0)}
          className="text-[9px] text-muted-foreground hover:text-foreground underline"
        >
          num
        </button>
        <button
          type="button"
          onClick={() => onChange("")}
          className="text-[9px] text-muted-foreground hover:text-foreground underline"
        >
          str
        </button>
      </div>
    );
  }
  if (typeof value === "number") {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          value={value}
          onChange={(e) =>
            onChange(e.target.value === "" ? 0 : Number(e.target.value))
          }
          className="h-7 text-xs font-mono flex-1 min-w-16"
        />
        <button
          type="button"
          onClick={() => onChange(true)}
          className="text-[9px] text-muted-foreground hover:text-foreground underline"
        >
          bool
        </button>
        <button
          type="button"
          onClick={() => onChange("")}
          className="text-[9px] text-muted-foreground hover:text-foreground underline"
        >
          str
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <Input
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        placeholder="value"
        className="h-7 text-xs font-mono flex-1 min-w-16"
      />
      <button
        type="button"
        onClick={() => onChange(true)}
        className="text-[9px] text-muted-foreground hover:text-foreground underline"
      >
        bool
      </button>
      <button
        type="button"
        onClick={() => onChange(0)}
        className="text-[9px] text-muted-foreground hover:text-foreground underline"
      >
        num
      </button>
    </div>
  );
}

// ─── Condition row: field | op | value  (single line) ───────────────────────

function ConditionRow({
  label,
  condition,
  onChange,
}: {
  label: string;
  condition: FieldCondition;
  onChange: (c: FieldCondition) => void;
}) {
  const needsValue = !NO_VALUE_OPS.has(condition.op);
  return (
    <div className="flex items-center gap-1.5 min-h-[28px]">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground w-10 shrink-0">
        {label}
      </span>
      <FieldCombobox
        value={condition.field}
        className="flex-[3] min-w-0"
        onChange={(field) => onChange({ ...condition, field })}
      />
      <Select
        value={condition.op}
        onValueChange={(op: ConditionOp) => {
          const u: FieldCondition = { ...condition, op };
          if (NO_VALUE_OPS.has(op)) delete u.value;
          else if (LIST_OPS.has(op) && !Array.isArray(condition.value))
            u.value = [];
          onChange(u);
        }}
      >
        <SelectTrigger className="h-7 text-xs flex-[2] min-w-0 font-mono">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPS.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs">
              <span className="font-mono mr-1">{o.short}</span>
              <span className="text-muted-foreground">{o.label}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {needsValue && (
        <div className="flex-[3] min-w-0">
          <InlineValue
            op={condition.op}
            value={condition.value}
            onChange={(v) => onChange({ ...condition, value: v })}
          />
        </div>
      )}
    </div>
  );
}

// ─── Unconditional row ──────────────────────────────────────────────────────

function UnconditionalRow({
  constraint,
  onChange,
  onDelete,
}: {
  constraint: UnconditionalConstraint;
  onChange: (c: UnconditionalConstraint) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const sev = SEVERITIES.find((s) => s.value === constraint.severity);
  const needsValue = !NO_VALUE_RULES.has(constraint.rule);

  return (
    <div className="border rounded-md bg-card">
      {/* Main row */}
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-muted-foreground hover:text-foreground shrink-0"
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </button>
        <Badge
          variant="outline"
          className="text-[9px] h-4 px-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 shrink-0"
        >
          Simple
        </Badge>
        <FieldCombobox
          value={constraint.field}
          className="flex-[3] min-w-0"
          onChange={(field) =>
            onChange({
              ...constraint,
              field,
              id: constraint.id || makeId([field, constraint.rule]),
            })
          }
        />
        <Select
          value={constraint.rule}
          onValueChange={(rule: UnconditionalRule) => {
            const u = { ...constraint, rule };
            if (NO_VALUE_RULES.has(rule)) delete u.value;
            else if (rule === "one_of" && !Array.isArray(constraint.value))
              u.value = [];
            if (
              !constraint.id ||
              constraint.id === makeId([constraint.field, constraint.rule])
            )
              u.id = makeId([constraint.field, rule]);
            onChange(u);
          }}
        >
          <SelectTrigger className="h-7 text-xs flex-[2] min-w-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RULES.map((r) => (
              <SelectItem key={r.value} value={r.value} className="text-xs">
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {needsValue && (
          <div className="flex-[3] min-w-0">
            <InlineValue
              op={constraint.rule}
              value={constraint.value}
              onChange={(v) => onChange({ ...constraint, value: v })}
            />
          </div>
        )}
        {!needsValue && <div className="flex-[3]" />}
        <Select
          value={constraint.severity}
          onValueChange={(s: "error" | "warning" | "info") =>
            onChange({ ...constraint, severity: s })
          }
        >
          <SelectTrigger
            className={`h-7 text-xs w-[72px] shrink-0 ${sev?.cls ?? ""}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SEVERITIES.map((s) => (
              <SelectItem
                key={s.value}
                value={s.value}
                className={`text-xs ${s.cls}`}
              >
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
      {/* Expanded detail row */}
      {expanded && (
        <div className="flex items-center gap-1.5 px-2 pb-1.5 pt-0">
          <div className="w-4 shrink-0" />
          <Input
            value={constraint.message}
            placeholder="Message…"
            onChange={(e) =>
              onChange({ ...constraint, message: e.target.value })
            }
            className="h-6 text-[11px] flex-1"
          />
          <Input
            value={constraint.id}
            placeholder="ID (auto)"
            onChange={(e) => onChange({ ...constraint, id: e.target.value })}
            className="h-6 text-[11px] font-mono text-muted-foreground w-48 shrink-0"
          />
        </div>
      )}
    </div>
  );
}

// ─── Conditional row ────────────────────────────────────────────────────────

function ConditionalRow({
  constraint,
  onChange,
  onDelete,
}: {
  constraint: ConditionalConstraint;
  onChange: (c: ConditionalConstraint) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const sev = SEVERITIES.find((s) => s.value === constraint.severity);

  return (
    <div className="border rounded-md bg-card">
      {/* Header + When row */}
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-muted-foreground hover:text-foreground shrink-0"
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </button>
        <Badge
          variant="outline"
          className="text-[9px] h-4 px-1 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800 shrink-0"
        >
          If/Then
        </Badge>
        <div className="flex-1 min-w-0">
          <ConditionRow
            label="When"
            condition={constraint.when}
            onChange={(when) => onChange({ ...constraint, when })}
          />
        </div>
        <Select
          value={constraint.severity}
          onValueChange={(s: "error" | "warning" | "info") =>
            onChange({ ...constraint, severity: s })
          }
        >
          <SelectTrigger
            className={`h-7 text-xs w-[72px] shrink-0 ${sev?.cls ?? ""}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SEVERITIES.map((s) => (
              <SelectItem
                key={s.value}
                value={s.value}
                className={`text-xs ${s.cls}`}
              >
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
      {/* Require row */}
      <div className="flex items-center gap-1.5 px-2 pb-1.5 pt-0">
        <div className="w-4 shrink-0 flex justify-center">
          <ArrowDown className="h-3 w-3 text-muted-foreground" />
        </div>
        <div className="w-[34px] shrink-0" />
        <div className="flex-1 min-w-0">
          <ConditionRow
            label="Then"
            condition={constraint.require}
            onChange={(require) => onChange({ ...constraint, require })}
          />
        </div>
        <div className="w-[72px] shrink-0" />
        <div className="w-6 shrink-0" />
      </div>
      {/* Expanded: message + id */}
      {expanded && (
        <div className="flex items-center gap-1.5 px-2 pb-1.5 pt-0">
          <div className="w-4 shrink-0" />
          <Input
            value={constraint.message}
            placeholder="Message…"
            onChange={(e) =>
              onChange({ ...constraint, message: e.target.value })
            }
            className="h-6 text-[11px] flex-1"
          />
          <Input
            value={constraint.id}
            placeholder="ID (auto)"
            onChange={(e) => onChange({ ...constraint, id: e.target.value })}
            className="h-6 text-[11px] font-mono text-muted-foreground w-48 shrink-0"
          />
        </div>
      )}
    </div>
  );
}

// ─── Main editor ────────────────────────────────────────────────────────────

interface ConstraintsEditorProps {
  constraints: ModelConstraint[] | null;
  onSave: (constraints: ModelConstraint[]) => Promise<void>;
  onChange?: (constraints: ModelConstraint[]) => void;
}

export default function ConstraintsEditor({
  constraints,
  onSave,
  onChange,
}: ConstraintsEditorProps) {
  const toArray = (
    v: ModelConstraint[] | null | undefined,
  ): ModelConstraint[] => (Array.isArray(v) ? v : []);

  const [local, setLocal] = useState<ModelConstraint[]>(() =>
    toArray(constraints),
  );
  const [mode, setMode] = useState<"structured" | "raw">("structured");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLocal(toArray(constraints));
  }, [constraints]);

  const hasChanges =
    JSON.stringify(local) !== JSON.stringify(constraints ?? []);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(local);
    } catch (err) {
      console.error("Failed to save constraints", err);
    } finally {
      setSaving(false);
    }
  };

  const rawSave = async (data: object | string) => {
    if (!Array.isArray(data)) return;
    const parsed = data as ModelConstraint[];
    setSaving(true);
    try {
      await onSave(parsed);
      setLocal(parsed);
      onChange?.(parsed);
    } catch (err) {
      console.error("Failed to save constraints (raw)", err);
    } finally {
      setSaving(false);
    }
  };

  const updateAt = (i: number, c: ModelConstraint) =>
    setLocal((p) => {
      const next = p.map((x, j) => (j === i ? c : x));
      onChange?.(next);
      return next;
    });
  const deleteAt = (i: number) =>
    setLocal((p) => {
      const next = p.filter((_, j) => j !== i);
      onChange?.(next);
      return next;
    });

  const addSimple = () =>
    setLocal((p) => {
      const next = [
        ...p,
        {
          id: "",
          rule: "required" as UnconditionalRule,
          field: "",
          severity: "error" as const,
          message: "",
        },
      ];
      onChange?.(next);
      return next;
    });
  const addConditional = () =>
    setLocal((p) => {
      const next = [
        ...p,
        {
          id: "",
          when: { field: "", op: "gt" as ConditionOp, value: 0 },
          require: { field: "", op: "eq" as ConditionOp, value: true },
          severity: "error" as const,
          message: "",
        },
      ];
      onChange?.(next);
      return next;
    });

  const simpleCount = local.filter((c) => !isConditionalConstraint(c)).length;
  const condCount = local.filter((c) => isConditionalConstraint(c)).length;

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="secondary" className="text-[10px] font-mono h-5">
            {local.length} constraint{local.length !== 1 ? "s" : ""}
          </Badge>
          {simpleCount > 0 && (
            <Badge
              variant="outline"
              className="text-[9px] h-4 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
            >
              {simpleCount} simple
            </Badge>
          )}
          {condCount > 0 && (
            <Badge
              variant="outline"
              className="text-[9px] h-4 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400"
            >
              {condCount} conditional
            </Badge>
          )}
          {hasChanges && (
            <Badge
              variant="outline"
              className="text-[9px] h-4 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400"
            >
              unsaved
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] gap-1"
            onClick={() =>
              setMode(mode === "structured" ? "raw" : "structured")
            }
          >
            {mode === "structured" ? (
              <>
                <Code2 className="h-3 w-3" /> JSON
              </>
            ) : (
              <>
                <Table2 className="h-3 w-3" /> UI
              </>
            )}
          </Button>
        </div>
      </div>

      {mode === "raw" ? (
        <EnhancedEditableJsonViewer
          data={local}
          onSave={rawSave}
          hideHeader={false}
        />
      ) : (
        <div className="space-y-1.5">
          {local.length === 0 && (
            <div className="text-center py-6 text-xs text-muted-foreground">
              No constraints. Add one below.
            </div>
          )}

          {local.map((c, i) =>
            isConditionalConstraint(c) ? (
              <ConditionalRow
                key={`${c.id}-${i}`}
                constraint={c}
                onChange={(u) => updateAt(i, u)}
                onDelete={() => deleteAt(i)}
              />
            ) : (
              <UnconditionalRow
                key={`${c.id}-${i}`}
                constraint={c as UnconditionalConstraint}
                onChange={(u) => updateAt(i, u)}
                onDelete={() => deleteAt(i)}
              />
            ),
          )}

          <Separator className="my-1" />

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-xs gap-1"
              onClick={addSimple}
            >
              <Plus className="h-3 w-3" /> Simple
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-xs gap-1"
              onClick={addConditional}
            >
              <Plus className="h-3 w-3" /> Conditional
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
