"use client";

/**
 * JsonTruncator
 *
 * A self-contained JSON payload reducer. Paste any JSON and selectively:
 *   - Truncate long strings (keep lead + tail, replace middle with a marker)
 *   - Slice repeating arrays down to the first N items
 *   - Stub out entire arrays/objects with a brevity placeholder
 *
 * Props:
 *   initialValue        – optional pre-loaded JSON string
 *   tabbed              – render the three panels as tabs instead of columns (default false)
 *   defaultTab          – which tab to show first: "input" | "fields" | "output" (default "input")
 *   className           – forwarded to the root wrapper
 *   defaultAutoThreshold – initial char threshold for auto string-truncation (default 100)
 *   defaultArrayKeep    – initial N items to keep when auto-slicing repeating arrays (default 3)
 *   defaultMaxDepth     – initial max nesting depth; null = unlimited (default)
 *   allowLayoutToggle   – show a column/tab toggle button in the header (default false)
 */

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { BasicInput } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { NumberStepper } from "@/components/official-candidate/NumberStepper";
import {
  Copy,
  ChevronRight,
  ChevronDown,
  Scissors,
  RefreshCw,
  AlertCircle,
  Check,
  FileJson,
  Trash2,
  Search,
  X,
  PackageX,
  Zap,
  List,
  Layers,
  LayoutPanelLeft,
  Rows3,
} from "lucide-react";

// ─── Public types (exported so consumers can reference them) ─────────────────

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonTruncatorTab = "input" | "fields" | "output";

export interface JsonTruncatorProps {
  initialValue?: string;
  /** Start in tabbed layout. Can be toggled at runtime if allowLayoutToggle is true. Default false. */
  tabbed?: boolean;
  defaultTab?: JsonTruncatorTab;
  className?: string;
  /** Default auto-truncate threshold for strings (chars). Defaults to 100. */
  defaultAutoThreshold?: number;
  /** Default number of items to keep when auto-slicing repeating arrays. Defaults to 3. */
  defaultArrayKeep?: number;
  /** Initial max nesting depth to render. null = unlimited (default). */
  defaultMaxDepth?: number | null;
  /** Show a toggle button in the header that lets the user switch between column and tabbed layouts. Default false. */
  allowLayoutToggle?: boolean;
}

// ─── Internal types ───────────────────────────────────────────────────────────

interface FieldEntry {
  path: string[];
  pathStr: string;
  keyName: string;
  type: "string" | "array" | "object";
  size: number;
  charCount: number;
  value: JsonValue;
}

interface TruncateOpts {
  leadChars: number;
  tailChars: number;
  replacement: string;
}

interface ArraySliceOpts {
  keepN: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_OPTS: TruncateOpts = {
  leadChars: 45,
  tailChars: 45,
  replacement: "... [TRUNCATED] ...",
};

const DEFAULT_ARRAY_KEEP = 3;
const AUTO_TRUNCATE_LS_KEY = "data-truncator:auto-threshold";
const AUTO_ARRAY_LS_KEY = "data-truncator:auto-array-keep";
const MAX_DEPTH_LS_KEY = "data-truncator:max-depth";
const AUTO_LEAD_CHARS_LS_KEY = "data-truncator:auto-lead-chars";
const AUTO_TAIL_CHARS_LS_KEY = "data-truncator:auto-tail-chars";
const DEFAULT_AUTO_THRESHOLD = 100;

// NumInput is an alias for the shared NumericStepper component.
const NumInput = NumberStepper;

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function getJsonSize(val: JsonValue): number {
  return JSON.stringify(val).length;
}

function getKeyName(path: string[]): string {
  for (let i = path.length - 1; i >= 0; i--) {
    if (!/^\d+$/.test(path[i])) return path[i];
  }
  return path[path.length - 1] ?? "(root)";
}

function formatPath(path: string[]): string {
  if (path.length === 0) return "(root)";
  return path
    .map((p, i) => (/^\d+$/.test(p) ? `[${p}]` : i === 0 ? p : `.${p}`))
    .join("");
}

function collectFields(val: JsonValue, path: string[] = []): FieldEntry[] {
  const entries: FieldEntry[] = [];
  if (typeof val === "string") {
    entries.push({
      path,
      pathStr: formatPath(path),
      keyName: getKeyName(path),
      type: "string",
      size: val.length,
      charCount: val.length,
      value: val,
    });
  } else if (Array.isArray(val)) {
    const charCount = getJsonSize(val);
    if (charCount > 100) {
      entries.push({
        path,
        pathStr: formatPath(path),
        keyName: getKeyName(path),
        type: "array",
        size: val.length,
        charCount,
        value: val,
      });
    }
    val.forEach((item, i) =>
      entries.push(...collectFields(item, [...path, String(i)])),
    );
  } else if (val !== null && typeof val === "object") {
    const charCount = getJsonSize(val);
    if (path.length > 0 && charCount > 100) {
      entries.push({
        path,
        pathStr: formatPath(path),
        keyName: getKeyName(path),
        type: "object",
        size: Object.keys(val).length,
        charCount,
        value: val,
      });
    }
    for (const key of Object.keys(val)) {
      entries.push(
        ...collectFields((val as { [k: string]: JsonValue })[key], [
          ...path,
          key,
        ]),
      );
    }
  }
  return entries;
}

function makeStub(entry: FieldEntry, note: string): JsonValue {
  const base =
    note ||
    (entry.type === "array"
      ? `array with ${entry.size} items — removed for brevity`
      : `object with ${entry.size} keys — removed for brevity`);
  if (entry.type === "array") return [`__removed__: ${base}`];
  return { __removed__: base };
}

function applyTruncation(
  val: JsonValue,
  truncations: Map<string, TruncateOpts>,
  stubs: Map<string, string>,
  arraySlices: Map<string, ArraySliceOpts>,
  path: string[] = [],
  maxDepth: number | null = null,
): JsonValue {
  // Processing order (each rule is independent — all apply regardless of depth):
  //   1. Stubs        — replace entire node with a brevity placeholder
  //   2. String trunc — shorten long string values
  //   3. Array slice  — keep first N items of repeating arrays
  //   4. Max depth    — stop recursing INTO children of containers at this depth
  //                     (primitives at any depth always get rules 1-2 applied)

  const pathStr = formatPath(path);

  // 1. Stubs: replace the whole node regardless of type or depth
  if (stubs.has(pathStr)) {
    const entry: FieldEntry = {
      path,
      pathStr,
      keyName: getKeyName(path),
      type: Array.isArray(val)
        ? "array"
        : val !== null && typeof val === "object"
          ? "object"
          : "string",
      size: Array.isArray(val)
        ? val.length
        : val !== null && typeof val === "object"
          ? Object.keys(val as object).length
          : 0,
      charCount: getJsonSize(val),
      value: val,
    };
    return makeStub(entry, stubs.get(pathStr)!);
  }

  const opts = truncations.get(pathStr);

  // 2. Strings: truncate at any depth — depth limit never suppresses string rules
  if (typeof val === "string") {
    if (opts && val.length > opts.leadChars + opts.tailChars) {
      return (
        val.slice(0, opts.leadChars) +
        opts.replacement +
        val.slice(val.length - opts.tailChars)
      );
    }
    return val;
  }

  // 3 & 4. Containers: apply array-slice rule first, then either recurse or
  //         emit a depth-limit placeholder — never skip the slice rule itself.
  const depthExceeded = maxDepth !== null && path.length >= maxDepth;

  if (Array.isArray(val)) {
    const slice = arraySlices.get(pathStr);
    const items =
      slice && val.length > slice.keepN ? val.slice(0, slice.keepN) : val;
    const trimmed = slice && val.length > slice.keepN;

    if (depthExceeded) {
      // Collapse children but still note if the array was also sliced
      const note = trimmed
        ? `...[showing ${items.length} of ${val.length} items — depth limited]`
        : `...[${val.length} item${val.length !== 1 ? "s" : ""} — depth limited]`;
      return note as unknown as JsonValue;
    }

    const mapped = items.map((item, i) =>
      applyTruncation(
        item,
        truncations,
        stubs,
        arraySlices,
        [...path, String(i)],
        maxDepth,
      ),
    );
    if (trimmed) {
      const removed = val.length - items.length;
      mapped.push(
        `...[${removed} more item${removed !== 1 ? "s" : ""} removed]` as unknown as JsonValue,
      );
    }
    return mapped;
  }

  if (val !== null && typeof val === "object") {
    if (depthExceeded) {
      const keys = Object.keys(val as object);
      return `...{${keys.length} key${keys.length !== 1 ? "s" : ""} — depth limited}` as unknown as JsonValue;
    }
    const result: { [k: string]: JsonValue } = {};
    for (const key of Object.keys(val)) {
      result[key] = applyTruncation(
        (val as { [k: string]: JsonValue })[key],
        truncations,
        stubs,
        arraySlices,
        [...path, key],
        maxDepth,
      );
    }
    return result;
  }

  return val;
}

function findPathOffsetInOutput(output: string, pathStr: string): number {
  if (pathStr === "(root)") return 0;
  const parts = pathStr.match(/[^.[\]]+|\[\d+\]/g) ?? [];
  const last = parts[parts.length - 1];
  if (!last) return -1;
  const key = last.replace(/^\[(\d+)\]$/, "$1");
  const pattern = new RegExp(`"${key}"\\s*:`);
  const m = pattern.exec(output);
  return m ? m.index : -1;
}

// ─── Shape / repeating-array helpers ─────────────────────────────────────────

function shapeOf(val: JsonValue, depth = 0): string {
  if (val === null) return "null";
  if (Array.isArray(val)) return "array";
  if (typeof val === "object") {
    if (depth >= 2) return "object";
    const keys = Object.keys(val).sort();
    return (
      "{" +
      keys
        .map(
          (k) =>
            `${k}:${shapeOf((val as Record<string, JsonValue>)[k], depth + 1)}`,
        )
        .join(",") +
      "}"
    );
  }
  return typeof val;
}

function isRepeatingArray(arr: JsonValue[], threshold: number): boolean {
  if (arr.length <= threshold) return false;
  const firstShape = shapeOf(arr[0]);
  if (firstShape !== "array" && !firstShape.startsWith("{")) return false;
  let matches = 0;
  const checkLen = Math.min(arr.length, 20);
  for (let i = 0; i < checkLen; i++) {
    if (shapeOf(arr[i]) === firstShape) matches++;
  }
  return matches / checkLen >= 0.6;
}

// Measures the maximum nesting depth of a JSON value in a single pass.
// Called once at parse time — never on every render.
function measureDepth(val: JsonValue, current = 0): number {
  if (Array.isArray(val)) {
    if (val.length === 0) return current + 1;
    let max = current + 1;
    for (const item of val) {
      const d = measureDepth(item, current + 1);
      if (d > max) max = d;
    }
    return max;
  }
  if (val !== null && typeof val === "object") {
    const keys = Object.keys(val as object);
    if (keys.length === 0) return current + 1;
    let max = current + 1;
    for (const key of keys) {
      const d = measureDepth(
        (val as Record<string, JsonValue>)[key],
        current + 1,
      );
      if (d > max) max = d;
    }
    return max;
  }
  return current;
}

// ─── SizeBar ──────────────────────────────────────────────────────────────────

function SizeBar({ size, max }: { size: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (size / max) * 100) : 0;
  const color =
    pct > 75 ? "bg-destructive" : pct > 40 ? "bg-warning" : "bg-primary";
  return (
    <div className="h-1 w-12 bg-muted rounded-full overflow-hidden flex-shrink-0">
      <div
        className={`h-full ${color} rounded-full`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ─── ValuePreview ─────────────────────────────────────────────────────────────

function ValuePreview({ value, opts }: { value: string; opts: TruncateOpts }) {
  const { leadChars, tailChars } = opts;
  const len = value.length;
  const willTruncate = len > leadChars + tailChars;

  if (!willTruncate) {
    return (
      <div className="w-full font-mono text-[10px] text-foreground bg-muted/40 rounded border border-border px-2 py-1.5 whitespace-pre-wrap break-all leading-relaxed">
        <span className="text-success">{value}</span>
        <span className="ml-2 text-[9px] text-success/70 normal-case font-sans">
          (short enough — no truncation)
        </span>
      </div>
    );
  }

  const leadText = value.slice(0, leadChars);
  const tailText = value.slice(len - tailChars);
  const removedCount = len - leadChars - tailChars;

  return (
    <div className="w-full font-mono text-[10px] bg-muted/40 rounded border border-border px-2 py-1.5 leading-relaxed break-all">
      <span className="text-primary">{leadText}</span>
      <span className="text-destructive/80 bg-destructive/10 px-0.5 rounded mx-0.5 text-[9px] font-sans not-italic">
        ✂ {removedCount.toLocaleString()} chars removed
      </span>
      <span className="text-primary/60">{tailText}</span>
    </div>
  );
}

// ─── TruncateRow ──────────────────────────────────────────────────────────────

interface TruncateRowProps {
  entry: FieldEntry;
  maxSize: number;
  opts: TruncateOpts | undefined;
  stubNote: string | undefined;
  arraySlice: ArraySliceOpts | undefined;
  checked: boolean;
  onCheck: (pathStr: string, checked: boolean) => void;
  showCheckbox: boolean;
  searchQuery: string;
  onApply: (pathStr: string, opts: TruncateOpts) => void;
  onRemove: (pathStr: string) => void;
  onApplyStub: (pathStr: string, note: string) => void;
  onRemoveStub: (pathStr: string) => void;
  onApplySlice: (pathStr: string, opts: ArraySliceOpts) => void;
  onRemoveSlice: (pathStr: string) => void;
  onHighlight: (pathStr: string) => void;
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-warning/40 text-foreground rounded-sm">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function TruncateRow({
  entry,
  maxSize,
  opts,
  stubNote,
  arraySlice,
  checked,
  onCheck,
  showCheckbox,
  searchQuery,
  onApply,
  onRemove,
  onApplyStub,
  onRemoveStub,
  onApplySlice,
  onRemoveSlice,
  onHighlight,
}: TruncateRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [local, setLocal] = useState<TruncateOpts>(opts ?? DEFAULT_OPTS);
  const [localNote, setLocalNote] = useState(stubNote ?? "");
  const [localKeepN, setLocalKeepN] = useState<number>(
    arraySlice?.keepN ?? DEFAULT_ARRAY_KEEP,
  );

  const active = !!opts;
  const stubbed = stubNote !== undefined;
  const sliced = arraySlice !== undefined;
  const canTruncate = entry.type === "string";
  const canStub = entry.type === "array" || entry.type === "object";
  const canSlice = entry.type === "array";

  useEffect(() => {
    if (opts) setLocal(opts);
  }, [opts]);
  useEffect(() => {
    setLocalNote(stubNote ?? "");
  }, [stubNote]);
  useEffect(() => {
    if (arraySlice) setLocalKeepN(arraySlice.keepN);
  }, [arraySlice]);

  const typeBadge =
    entry.type === "string"
      ? "bg-primary/15 text-primary"
      : entry.type === "array"
        ? "bg-secondary/15 text-secondary"
        : "bg-muted text-muted-foreground";

  const rowBg = stubbed
    ? "bg-destructive/8"
    : sliced
      ? "bg-secondary/8"
      : active
        ? "bg-accent/40"
        : checked
          ? "bg-primary/8"
          : "";

  const handleRowClick = () => {
    if (canTruncate || canStub) {
      setExpanded((e) => !e);
      onHighlight(entry.pathStr);
    }
  };

  return (
    <div className={`border-b border-border ${rowBg} group`}>
      <div className="flex items-center gap-1.5 px-2 py-1 hover:bg-accent/20 select-none text-xs">
        {showCheckbox && (
          <Checkbox
            checked={checked}
            onCheckedChange={(v) => onCheck(entry.pathStr, v === true)}
            onClick={(e) => e.stopPropagation()}
            className="flex-shrink-0"
          />
        )}

        <div
          className="flex items-center gap-1.5 flex-1 min-w-0 cursor-pointer"
          onClick={handleRowClick}
        >
          {canTruncate || canStub ? (
            expanded ? (
              <ChevronDown
                size={11}
                className="text-muted-foreground flex-shrink-0"
              />
            ) : (
              <ChevronRight
                size={11}
                className="text-muted-foreground flex-shrink-0"
              />
            )
          ) : (
            <span className="w-[11px] flex-shrink-0" />
          )}
          <SizeBar size={entry.charCount} max={maxSize} />
          <span className="text-muted-foreground w-14 flex-shrink-0 text-right font-mono">
            {entry.charCount.toLocaleString()}
          </span>
          <span
            className={`px-1 py-0.5 rounded text-[10px] flex-shrink-0 font-mono ${typeBadge}`}
          >
            {entry.type}
          </span>
          <span
            className="font-mono text-foreground truncate flex-1 min-w-0"
            title={entry.pathStr}
          >
            {highlightMatch(entry.pathStr, searchQuery)}
          </span>
        </div>

        {/* Status badges */}
        {stubbed && (
          <span className="text-destructive flex-shrink-0 flex items-center gap-1 text-[10px] group-hover:hidden">
            <PackageX size={10} /> removed
          </span>
        )}
        {sliced && !stubbed && (
          <span className="text-secondary flex-shrink-0 flex items-center gap-1 text-[10px] group-hover:hidden">
            <List size={10} /> sliced
          </span>
        )}
        {active && !stubbed && !sliced && (
          <span className="text-success flex-shrink-0 flex items-center gap-1 text-[10px] group-hover:hidden">
            <Scissors size={10} /> truncated
          </span>
        )}

        {/* Quick-action hover buttons */}
        <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0">
          {canTruncate &&
            (active ? (
              <button
                title="Remove truncation"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(entry.pathStr);
                }}
                className="p-0.5 rounded text-success hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 size={11} />
              </button>
            ) : (
              <button
                title={`Truncate: ${local.leadChars} lead · ${local.tailChars} tail`}
                onClick={(e) => {
                  e.stopPropagation();
                  onApply(entry.pathStr, local);
                }}
                className="p-0.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              >
                <Scissors size={11} />
              </button>
            ))}
          {canSlice &&
            !stubbed &&
            (sliced ? (
              <button
                title="Remove slice"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveSlice(entry.pathStr);
                }}
                className="p-0.5 rounded text-secondary hover:text-muted-foreground hover:bg-muted transition-colors"
              >
                <Trash2 size={11} />
              </button>
            ) : (
              <button
                title={`Keep first ${localKeepN} items`}
                onClick={(e) => {
                  e.stopPropagation();
                  onApplySlice(entry.pathStr, { keepN: localKeepN });
                }}
                className="p-0.5 rounded text-muted-foreground hover:text-secondary hover:bg-secondary/10 transition-colors"
              >
                <List size={11} />
              </button>
            ))}
          {canStub &&
            (stubbed ? (
              <button
                title="Restore (remove stub)"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveStub(entry.pathStr);
                }}
                className="p-0.5 rounded text-destructive hover:text-muted-foreground hover:bg-muted transition-colors"
              >
                <Trash2 size={11} />
              </button>
            ) : (
              <button
                title="Replace with brevity stub"
                onClick={(e) => {
                  e.stopPropagation();
                  onApplyStub(entry.pathStr, "");
                }}
                className="p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <PackageX size={11} />
              </button>
            ))}
        </div>
      </div>

      {/* Expand — string truncation */}
      {expanded && canTruncate && (
        <div className="px-6 py-2 bg-card border-t border-border space-y-2">
          <div className="space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Value preview
                <span className="normal-case font-normal ml-1">
                  — {entry.charCount.toLocaleString()} chars · key:{" "}
                  <code className="text-primary">{entry.keyName}</code>
                </span>
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">
                path: <span className="text-foreground">{entry.pathStr}</span>
              </span>
            </div>
            <ValuePreview value={entry.value as string} opts={local} />
          </div>
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Lead chars
              </label>
              <NumInput
                value={local.leadChars}
                onChange={(v) => setLocal((l) => ({ ...l, leadChars: v }))}
                min={0}
                max={500}
                fallback={0}
                className="h-6"
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Tail chars
              </label>
              <NumInput
                value={local.tailChars}
                onChange={(v) => setLocal((l) => ({ ...l, tailChars: v }))}
                min={0}
                max={500}
                fallback={0}
                className="h-6"
              />
            </div>
            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Replacement text
              </label>
              <BasicInput
                type="text"
                value={local.replacement}
                onChange={(e) =>
                  setLocal((l) => ({ ...l, replacement: e.target.value }))
                }
                className="w-full h-6 px-1.5 py-0 text-xs font-mono"
              />
            </div>
            <div className="flex gap-1.5 flex-shrink-0">
              <button
                onClick={() => onApply(entry.pathStr, local)}
                className="px-2 py-1 bg-primary hover:bg-primary/80 text-primary-foreground rounded text-xs flex items-center gap-1"
              >
                <Scissors size={10} /> Apply
              </button>
              {active && (
                <button
                  onClick={() => onRemove(entry.pathStr)}
                  className="px-2 py-1 bg-muted hover:bg-accent text-muted-foreground rounded text-xs flex items-center gap-1"
                >
                  <Trash2 size={10} /> Remove
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Expand — array: slice + stub */}
      {expanded && canSlice && (
        <div className="px-6 py-2 bg-card border-t border-border space-y-3">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>
              Key: <code className="text-primary">{entry.keyName}</code> ·{" "}
              {entry.size} items · {entry.charCount.toLocaleString()} chars
            </span>
            <span>
              path:{" "}
              <span className="text-foreground font-mono">{entry.pathStr}</span>
            </span>
          </div>
          <div className="space-y-1.5">
            <div className="text-[10px] text-secondary uppercase tracking-wider font-medium flex items-center gap-1">
              <List size={9} /> Keep first N items
            </div>
            <div className="flex items-end gap-3 flex-wrap">
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Keep items
                </label>
                <NumInput
                  value={localKeepN}
                  onChange={setLocalKeepN}
                  min={1}
                  max={entry.size}
                  fallback={DEFAULT_ARRAY_KEEP}
                  className="h-6"
                />
              </div>
              {localKeepN < entry.size && (
                <div className="text-[10px] text-muted-foreground self-end pb-1">
                  → removes{" "}
                  <span className="text-secondary font-mono">
                    {entry.size - localKeepN}
                  </span>{" "}
                  items
                </div>
              )}
              <div className="flex gap-1.5 flex-shrink-0 self-end">
                <button
                  onClick={() =>
                    onApplySlice(entry.pathStr, { keepN: localKeepN })
                  }
                  className="px-2 py-1 bg-secondary/80 hover:bg-secondary text-secondary-foreground rounded text-xs flex items-center gap-1"
                >
                  <List size={10} /> Apply slice
                </button>
                {sliced && (
                  <button
                    onClick={() => onRemoveSlice(entry.pathStr)}
                    className="px-2 py-1 bg-muted hover:bg-accent text-muted-foreground rounded text-xs flex items-center gap-1"
                  >
                    <Trash2 size={10} /> Remove
                  </button>
                )}
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Keeps the first {localKeepN} item{localKeepN !== 1 ? "s" : ""} and
              appends a marker for the rest.
            </p>
          </div>
          <div className="border-t border-border" />
          <div className="space-y-1.5">
            <div className="text-[10px] text-destructive/70 uppercase tracking-wider font-medium flex items-center gap-1">
              <PackageX size={9} /> Remove entire array
            </div>
            <div className="flex items-end gap-3 flex-wrap">
              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Stub note{" "}
                  <span className="normal-case font-normal">
                    (leave blank for auto)
                  </span>
                </label>
                <BasicInput
                  type="text"
                  value={localNote}
                  placeholder={`array with ${entry.size} items — removed for brevity`}
                  onChange={(e) => setLocalNote(e.target.value)}
                  className="w-full h-6 px-1.5 py-0 text-xs font-mono"
                />
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <button
                  onClick={() => onApplyStub(entry.pathStr, localNote)}
                  className="px-2 py-1 bg-destructive/80 hover:bg-destructive text-destructive-foreground rounded text-xs flex items-center gap-1"
                >
                  <PackageX size={10} /> Replace with stub
                </button>
                {stubbed && (
                  <button
                    onClick={() => onRemoveStub(entry.pathStr)}
                    className="px-2 py-1 bg-muted hover:bg-accent text-muted-foreground rounded text-xs flex items-center gap-1"
                  >
                    <Trash2 size={10} /> Restore
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Expand — object stub */}
      {expanded && entry.type === "object" && (
        <div className="px-6 py-2 bg-card border-t border-border space-y-2">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>
              Key: <code className="text-primary">{entry.keyName}</code> ·{" "}
              {entry.size} keys · {entry.charCount.toLocaleString()} chars
            </span>
            <span>
              path:{" "}
              <span className="text-foreground font-mono">{entry.pathStr}</span>
            </span>
          </div>
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Stub note{" "}
                <span className="normal-case font-normal">
                  (leave blank for auto)
                </span>
              </label>
              <BasicInput
                type="text"
                value={localNote}
                placeholder={`object with ${entry.size} keys — removed for brevity`}
                onChange={(e) => setLocalNote(e.target.value)}
                className="w-full h-6 px-1.5 py-0 text-xs font-mono"
              />
            </div>
            <div className="flex gap-1.5 flex-shrink-0">
              <button
                onClick={() => onApplyStub(entry.pathStr, localNote)}
                className="px-2 py-1 bg-destructive/80 hover:bg-destructive text-destructive-foreground rounded text-xs flex items-center gap-1"
              >
                <PackageX size={10} /> Replace with stub
              </button>
              {stubbed && (
                <button
                  onClick={() => onRemoveStub(entry.pathStr)}
                  className="px-2 py-1 bg-muted hover:bg-accent text-muted-foreground rounded text-xs flex items-center gap-1"
                >
                  <Trash2 size={10} /> Restore
                </button>
              )}
            </div>
          </div>
          <p className="w-full text-[10px] text-muted-foreground">
            Replaces the entire object with a single-key marker, preserving JSON
            structure validity.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── BulkApplyBar ─────────────────────────────────────────────────────────────

function BulkApplyBar({
  count,
  onApply,
  onClear,
}: {
  count: number;
  onApply: (opts: TruncateOpts) => void;
  onClear: () => void;
}) {
  const [opts, setOpts] = useState<TruncateOpts>(DEFAULT_OPTS);
  return (
    <div className="border-t border-primary/40 bg-primary/8 px-2 py-1.5 flex-shrink-0">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[10px] font-semibold text-primary">
          {count} selected
        </span>
        <div className="flex-1" />
        <button
          onClick={onClear}
          className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
        >
          <X size={9} /> deselect all
        </button>
      </div>
      <div className="flex items-end gap-2 flex-wrap">
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Lead
          </label>
          <NumInput
            value={opts.leadChars}
            onChange={(v) => setOpts((o) => ({ ...o, leadChars: v }))}
            min={0}
            max={500}
            fallback={0}
            className="h-6"
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Tail
          </label>
          <NumInput
            value={opts.tailChars}
            onChange={(v) => setOpts((o) => ({ ...o, tailChars: v }))}
            min={0}
            max={500}
            fallback={0}
            className="h-6"
          />
        </div>
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Replacement
          </label>
          <BasicInput
            type="text"
            value={opts.replacement}
            onChange={(e) =>
              setOpts((o) => ({ ...o, replacement: e.target.value }))
            }
            className="w-full h-6 px-1.5 py-0 text-[11px] font-mono"
          />
        </div>
        <button
          onClick={() => onApply(opts)}
          className="px-2 py-1 bg-primary hover:bg-primary/80 text-primary-foreground rounded text-xs flex items-center gap-1 flex-shrink-0"
        >
          <Scissors size={10} /> Apply to {count}
        </button>
      </div>
    </div>
  );
}

// ─── Shared controls props type (used by bars + inline strip) ─────────────────

interface ControlsProps {
  autoTruncateEnabled: boolean;
  autoThreshold: number;
  autoLeadChars: number;
  autoTailChars: number;
  onAutoTruncateToggle: () => void;
  onAutoThresholdChange: (v: number) => void;
  onAutoLeadCharsChange: (v: number) => void;
  onAutoTailCharsChange: (v: number) => void;
  autoMatchCount: number;
  autoArrayEnabled: boolean;
  autoArrayKeepN: number;
  onAutoArrayToggle: () => void;
  onAutoArrayKeepNChange: (v: number) => void;
  autoArrayMatchCount: number;
  maxDepth: number | null;
  onMaxDepthChange: (v: number | null) => void;
  actualDepth: number | null;
}

// ─── AutoTruncateBar ──────────────────────────────────────────────────────────

function AutoTruncateBar({
  enabled,
  threshold,
  leadChars,
  tailChars,
  onToggle,
  onThresholdChange,
  onLeadCharsChange,
  onTailCharsChange,
  matchCount,
}: {
  enabled: boolean;
  threshold: number;
  leadChars: number;
  tailChars: number;
  onToggle: () => void;
  onThresholdChange: (v: number) => void;
  onLeadCharsChange: (v: number) => void;
  onTailCharsChange: (v: number) => void;
  matchCount: number;
}) {
  return (
    <div
      className={`flex items-center gap-2 px-2 py-0.5 border-b border-border flex-shrink-0 transition-colors flex-wrap ${enabled ? "bg-primary/8 border-primary/30" : "bg-card"}`}
    >
      <button
        onClick={onToggle}
        title={enabled ? "Disable auto-truncate" : "Enable auto-truncate"}
        className={`flex items-center gap-1.5 text-[11px] font-medium transition-colors px-2 py-0.5 rounded ${enabled ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
      >
        <Zap size={11} /> Auto
      </button>
      <span className="text-[10px] text-muted-foreground">strings &gt;</span>
      <NumInput
        value={threshold}
        onChange={onThresholdChange}
        min={1}
        max={10000}
        fallback={DEFAULT_AUTO_THRESHOLD}
        className="h-5"
      />
      <span className="text-[10px] text-muted-foreground">chars</span>
      <span className="w-px h-3 bg-border" />
      <span className="text-[10px] text-muted-foreground">lead</span>
      <NumInput
        value={leadChars}
        onChange={onLeadCharsChange}
        min={0}
        max={500}
        fallback={DEFAULT_OPTS.leadChars}
        className="h-5"
      />
      <span className="text-[10px] text-muted-foreground">tail</span>
      <NumInput
        value={tailChars}
        onChange={onTailCharsChange}
        min={0}
        max={500}
        fallback={DEFAULT_OPTS.tailChars}
        className="h-5"
      />
      {enabled && matchCount > 0 && (
        <span className="text-[10px] text-primary">{matchCount} affected</span>
      )}
    </div>
  );
}

// ─── AutoArrayBar ─────────────────────────────────────────────────────────────

function AutoArrayBar({
  enabled,
  keepN,
  onToggle,
  onKeepNChange,
  matchCount,
}: {
  enabled: boolean;
  keepN: number;
  onToggle: () => void;
  onKeepNChange: (v: number) => void;
  matchCount: number;
}) {
  return (
    <div
      className={`flex items-center gap-2 px-2 py-0.5 border-b border-border flex-shrink-0 transition-colors ${enabled ? "bg-secondary/8 border-secondary/30" : "bg-card"}`}
    >
      <button
        onClick={onToggle}
        title={enabled ? "Disable auto-slice" : "Enable auto-slice arrays"}
        className={`flex items-center gap-1.5 text-[11px] font-medium transition-colors px-2 py-0.5 rounded ${enabled ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
      >
        <List size={11} /> Arrays
      </button>
      <span className="text-[10px] text-muted-foreground">keep</span>
      <NumInput
        value={keepN}
        onChange={onKeepNChange}
        min={1}
        max={1000}
        fallback={DEFAULT_ARRAY_KEEP}
        className="h-5"
      />
      <span className="text-[10px] text-muted-foreground">items</span>
      {enabled && matchCount > 0 && (
        <span className="text-[10px] text-secondary">{matchCount} sliced</span>
      )}
    </div>
  );
}

// ─── MaxDepthBar ──────────────────────────────────────────────────────────────

function MaxDepthBar({
  maxDepth,
  onMaxDepthChange,
  actualDepth,
}: {
  maxDepth: number | null;
  onMaxDepthChange: (v: number | null) => void;
  actualDepth: number | null;
}) {
  const enabled = maxDepth !== null;
  return (
    <div
      className={`flex items-center gap-2 px-2 py-0.5 border-b border-border flex-shrink-0 transition-colors ${enabled ? "bg-warning/8 border-warning/30" : "bg-card"}`}
    >
      <button
        onClick={() =>
          onMaxDepthChange(enabled ? null : Math.max(1, (actualDepth ?? 4) - 1))
        }
        title={enabled ? "Remove depth limit" : "Enable max depth"}
        className={`flex items-center gap-1.5 text-[11px] font-medium transition-colors px-2 py-0.5 rounded ${enabled ? "bg-warning text-warning-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
      >
        <Layers size={11} /> Depth
      </button>
      {actualDepth !== null && (
        <span className="text-[10px] px-1 rounded bg-muted text-muted-foreground font-mono">
          {actualDepth}lvl
        </span>
      )}
      {enabled ? (
        <>
          <span className="text-[10px] text-muted-foreground">limit</span>
          <NumInput
            value={maxDepth}
            onChange={(v) => onMaxDepthChange(Math.max(1, v))}
            min={1}
            max={50}
            fallback={3}
            className="h-5"
          />
          <span className="text-[10px] text-warning">collapsed</span>
        </>
      ) : (
        <span className="text-[10px] text-muted-foreground">
          {actualDepth !== null ? "no limit" : "unlimited"}
        </span>
      )}
    </div>
  );
}

// ─── InlineControlsBar ────────────────────────────────────────────────────────
// Compact single-row version of all three controls — used in the tabbed header.

function InlineControlsBar({
  autoTruncateEnabled,
  autoThreshold,
  autoLeadChars,
  autoTailChars,
  onAutoTruncateToggle,
  onAutoThresholdChange,
  onAutoLeadCharsChange,
  onAutoTailCharsChange,
  autoMatchCount,
  autoArrayEnabled,
  autoArrayKeepN,
  onAutoArrayToggle,
  onAutoArrayKeepNChange,
  autoArrayMatchCount,
  maxDepth,
  onMaxDepthChange,
  actualDepth,
}: ControlsProps) {
  const depthEnabled = maxDepth !== null;
  const sep = <span className="w-px h-3 bg-border shrink-0" />;
  const lbl = "text-[10px] text-muted-foreground shrink-0";

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto min-w-0 shrink">
      {/* ── Auto-truncate ── */}
      <button
        onClick={onAutoTruncateToggle}
        title={
          autoTruncateEnabled ? "Disable auto-truncate" : "Enable auto-truncate"
        }
        className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 transition-colors ${autoTruncateEnabled ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
      >
        <Zap size={10} /> Auto
      </button>
      <NumInput
        value={autoThreshold}
        onChange={onAutoThresholdChange}
        min={1}
        max={10000}
        fallback={DEFAULT_AUTO_THRESHOLD}
        className="h-5"
      />
      <span className={lbl}>ch</span>
      {sep}
      <span className={lbl}>lead</span>
      <NumInput
        value={autoLeadChars}
        onChange={onAutoLeadCharsChange}
        min={0}
        max={500}
        fallback={DEFAULT_OPTS.leadChars}
        className="h-5"
      />
      <span className={lbl}>tail</span>
      <NumInput
        value={autoTailChars}
        onChange={onAutoTailCharsChange}
        min={0}
        max={500}
        fallback={DEFAULT_OPTS.tailChars}
        className="h-5"
      />
      {autoTruncateEnabled && autoMatchCount > 0 && (
        <span className="text-[10px] text-primary shrink-0">
          {autoMatchCount}×
        </span>
      )}

      {sep}

      {/* ── Array slice ── */}
      <button
        onClick={onAutoArrayToggle}
        title={
          autoArrayEnabled ? "Disable auto-slice" : "Enable auto-slice arrays"
        }
        className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 transition-colors ${autoArrayEnabled ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
      >
        <List size={10} /> Arrays
      </button>
      <NumInput
        value={autoArrayKeepN}
        onChange={onAutoArrayKeepNChange}
        min={1}
        max={1000}
        fallback={DEFAULT_ARRAY_KEEP}
        className="h-5"
      />
      <span className={lbl}>items</span>
      {autoArrayEnabled && autoArrayMatchCount > 0 && (
        <span className="text-[10px] text-secondary shrink-0">
          {autoArrayMatchCount}×
        </span>
      )}

      {sep}

      {/* ── Depth ── */}
      <button
        onClick={() =>
          onMaxDepthChange(
            depthEnabled ? null : Math.max(1, (actualDepth ?? 4) - 1),
          )
        }
        title={depthEnabled ? "Remove depth limit" : "Enable max depth"}
        className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 transition-colors ${depthEnabled ? "bg-warning text-warning-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
      >
        <Layers size={10} /> Depth
      </button>
      {actualDepth !== null && (
        <span className="text-[10px] font-mono text-muted-foreground shrink-0">
          {actualDepth}lvl
        </span>
      )}
      {depthEnabled && (
        <>
          <NumInput
            value={maxDepth}
            onChange={(v) => onMaxDepthChange(Math.max(1, v))}
            min={1}
            max={50}
            fallback={3}
            className="h-5"
          />
          <span className="text-[10px] text-warning shrink-0">deep</span>
        </>
      )}
    </div>
  );
}

// ─── Panel components (pure layout, no state) ─────────────────────────────────
// These are used both in column mode and tabbed mode.

type SortKey = "size" | "path" | "type";

interface InputPanelProps {
  inputText: string;
  setInputText: (v: string) => void;
  handleParse: (v: string) => void;
  parseError: string | null;
  parsed: JsonValue | null;
  totalOriginal: number;
  fieldCount: number;
  autoTruncateEnabled: boolean;
  autoThreshold: number;
  autoLeadChars: number;
  autoTailChars: number;
  setAutoTruncateEnabled: (fn: (prev: boolean) => boolean) => void;
  setAutoThreshold: (v: number) => void;
  setAutoLeadChars: (v: number) => void;
  setAutoTailChars: (v: number) => void;
  setOutputEdited: (v: boolean) => void;
  autoMatchCount: number;
  autoArrayEnabled: boolean;
  autoArrayKeepN: number;
  setAutoArrayEnabled: (fn: (prev: boolean) => boolean) => void;
  setAutoArrayKeepN: (v: number) => void;
  autoArrayMatchCount: number;
  maxDepth: number | null;
  setMaxDepth: (v: number | null) => void;
  actualDepth: number | null;
  /** When false the three control bars are hidden (used in tabbed mode where they live in the header). */
  showControls?: boolean;
  ph: string;
  pl: string;
}

function InputPanel({
  inputText,
  setInputText,
  handleParse,
  parseError,
  parsed,
  totalOriginal,
  fieldCount,
  autoTruncateEnabled,
  autoThreshold,
  autoLeadChars,
  autoTailChars,
  setAutoTruncateEnabled,
  setAutoThreshold,
  setAutoLeadChars,
  setAutoTailChars,
  setOutputEdited,
  autoMatchCount,
  autoArrayEnabled,
  autoArrayKeepN,
  setAutoArrayEnabled,
  setAutoArrayKeepN,
  autoArrayMatchCount,
  maxDepth,
  setMaxDepth,
  actualDepth,
  showControls = true,
  ph,
  pl,
}: InputPanelProps) {
  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className={ph}>
        <span className={pl}>Input JSON</span>
        <div className="flex-1" />
        {inputText && (
          <button
            onClick={() => {
              setInputText("");
              handleParse("");
            }}
            className="text-[10px] text-muted-foreground hover:text-foreground"
          >
            clear
          </button>
        )}
      </div>
      {showControls && (
        <>
          <AutoTruncateBar
            enabled={autoTruncateEnabled}
            threshold={autoThreshold}
            leadChars={autoLeadChars}
            tailChars={autoTailChars}
            onToggle={() => setAutoTruncateEnabled((e) => !e)}
            onThresholdChange={(v) => {
              setAutoThreshold(v);
              setOutputEdited(false);
            }}
            onLeadCharsChange={(v) => {
              setAutoLeadChars(v);
              setOutputEdited(false);
            }}
            onTailCharsChange={(v) => {
              setAutoTailChars(v);
              setOutputEdited(false);
            }}
            matchCount={autoMatchCount}
          />
          <AutoArrayBar
            enabled={autoArrayEnabled}
            keepN={autoArrayKeepN}
            onToggle={() => {
              setAutoArrayEnabled((e) => !e);
              setOutputEdited(false);
            }}
            onKeepNChange={(v) => {
              setAutoArrayKeepN(v);
              setOutputEdited(false);
            }}
            matchCount={autoArrayMatchCount}
          />
          <MaxDepthBar
            maxDepth={maxDepth}
            onMaxDepthChange={(v) => {
              setMaxDepth(v);
              setOutputEdited(false);
            }}
            actualDepth={actualDepth}
          />
        </>
      )}
      <textarea
        className="flex-1 min-h-0 resize-none bg-background text-foreground font-mono text-[11px] px-2 py-1.5 outline-none border-0 leading-relaxed placeholder:text-muted-foreground"
        placeholder="Paste JSON here…"
        value={inputText}
        onChange={(e) => {
          setInputText(e.target.value);
          handleParse(e.target.value);
        }}
        spellCheck={false}
      />
      {parseError && (
        <div className="px-2 py-1 bg-destructive/10 border-t border-destructive/30 text-destructive text-[10px] flex items-center gap-1 flex-shrink-0">
          <AlertCircle size={10} /> {parseError}
        </div>
      )}
      {parsed && !parseError && (
        <div className="px-2 py-1 bg-card border-t border-border text-[10px] text-muted-foreground flex gap-3 flex-shrink-0">
          <span>{totalOriginal.toLocaleString()} chars</span>
          <span>{fieldCount} fields</span>
        </div>
      )}
    </div>
  );
}

interface FieldsPanelProps {
  displayFields: FieldEntry[];
  parsed: JsonValue | null;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  setSelected: (fn: (prev: Set<string>) => Set<string>) => void;
  filterType: "all" | "string" | "array" | "object";
  setFilterType: (v: "all" | "string" | "array" | "object") => void;
  minSize: number;
  setMinSize: (v: number) => void;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  toggleSort: (k: SortKey) => void;
  showCheckboxes: boolean;
  allChecked: boolean;
  someChecked: boolean;
  handleSelectAll: () => void;
  maxSize: number;
  effectiveTruncations: Map<string, TruncateOpts>;
  stubs: Map<string, string>;
  effectiveArraySlices: Map<string, ArraySliceOpts>;
  selected: Set<string>;
  handleCheck: (p: string, c: boolean) => void;
  applyRule: (p: string, o: TruncateOpts) => void;
  removeRule: (p: string) => void;
  applyStub: (p: string, n: string) => void;
  removeStub: (p: string) => void;
  applySlice: (p: string, o: ArraySliceOpts) => void;
  removeSlice: (p: string) => void;
  handleHighlight: (p: string) => void;
  handleBulkApply: (o: TruncateOpts) => void;
  truncations: Map<string, TruncateOpts>;
  arraySlices: Map<string, ArraySliceOpts>;
  autoTruncateEnabled: boolean;
  autoArrayEnabled: boolean;
  autoMatchCount: number;
  autoArrayMatchCount: number;
  handleReset: () => void;
  ph: string;
  pl: string;
  sb: (k: SortKey) => string;
  fb: (t: string) => string;
}

function FieldsPanel({
  displayFields,
  parsed,
  searchQuery,
  setSearchQuery,
  setSelected,
  filterType,
  setFilterType,
  minSize,
  setMinSize,
  sortKey,
  sortDir,
  toggleSort,
  showCheckboxes,
  allChecked,
  someChecked,
  handleSelectAll,
  maxSize,
  effectiveTruncations,
  stubs,
  effectiveArraySlices,
  selected,
  handleCheck,
  applyRule,
  removeRule,
  applyStub,
  removeStub,
  applySlice,
  removeSlice,
  handleHighlight,
  handleBulkApply,
  truncations,
  arraySlices,
  autoTruncateEnabled,
  autoArrayEnabled,
  autoMatchCount,
  autoArrayMatchCount,
  handleReset,
  ph,
  pl,
  sb,
  fb,
}: FieldsPanelProps) {
  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Search */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 bg-card border-b border-border flex-shrink-0">
        <Search size={12} className="text-primary flex-shrink-0" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setSelected(() => new Set());
          }}
          placeholder="Search key name or path…"
          className="flex-1 bg-transparent text-[12px] text-foreground font-mono placeholder:text-muted-foreground outline-none"
          spellCheck={false}
        />
        {searchQuery ? (
          <>
            <span className="text-[10px] text-muted-foreground flex-shrink-0 font-mono">
              {displayFields.length} match
              {displayFields.length !== 1 ? "es" : ""}
            </span>
            <button
              onClick={() => {
                setSearchQuery("");
                setSelected(() => new Set());
              }}
            >
              <X
                size={11}
                className="text-muted-foreground hover:text-foreground"
              />
            </button>
          </>
        ) : null}
      </div>

      {/* Filter bar */}
      <div className={`${ph} flex-wrap gap-y-1`}>
        <span className={pl}>Fields</span>
        <div className="flex-1" />
        {(["all", "string", "array", "object"] as const).map((t) => (
          <button key={t} onClick={() => setFilterType(t)} className={fb(t)}>
            {t}
          </button>
        ))}
        <span className="text-border">|</span>
        <span className="text-[10px] text-muted-foreground">min:</span>
        <NumInput
          value={minSize}
          onChange={setMinSize}
          min={0}
          fallback={0}
          className="w-14 h-5 text-[10px]"
        />
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-1.5 px-2 py-0.5 bg-card/60 border-b border-border flex-shrink-0 text-[10px]">
        {showCheckboxes && (
          <Checkbox
            checked={allChecked ? true : someChecked ? "indeterminate" : false}
            onCheckedChange={() => handleSelectAll()}
            className="flex-shrink-0"
            title={allChecked ? "Deselect all" : "Select all strings in view"}
          />
        )}
        <span className="w-[11px] flex-shrink-0" />
        <span className="w-12 flex-shrink-0" />
        <button
          onClick={() => toggleSort("size")}
          className={`w-14 text-right flex-shrink-0 ${sb("size")}`}
        >
          size {sortKey === "size" ? (sortDir === "desc" ? "↓" : "↑") : ""}
        </button>
        <button
          onClick={() => toggleSort("type")}
          className={`w-12 flex-shrink-0 ${sb("type")}`}
        >
          type {sortKey === "type" ? (sortDir === "desc" ? "↓" : "↑") : ""}
        </button>
        <button
          onClick={() => toggleSort("path")}
          className={`flex-1 text-left ${sb("path")}`}
        >
          path {sortKey === "path" ? (sortDir === "desc" ? "↓" : "↑") : ""}
        </button>
      </div>

      {/* Field list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {displayFields.length === 0 && (
          <div className="px-3 py-8 text-center text-muted-foreground text-xs">
            {parsed
              ? searchQuery
                ? `No fields match "${searchQuery}".`
                : "No fields match filters."
              : "Paste JSON on the left to analyze fields."}
          </div>
        )}
        {displayFields.map((entry) => (
          <TruncateRow
            key={entry.pathStr}
            entry={entry}
            maxSize={maxSize}
            opts={effectiveTruncations.get(entry.pathStr)}
            stubNote={stubs.get(entry.pathStr)}
            arraySlice={effectiveArraySlices.get(entry.pathStr)}
            checked={selected.has(entry.pathStr)}
            onCheck={handleCheck}
            showCheckbox={showCheckboxes}
            searchQuery={searchQuery}
            onApply={applyRule}
            onRemove={removeRule}
            onApplyStub={applyStub}
            onRemoveStub={removeStub}
            onApplySlice={applySlice}
            onRemoveSlice={removeSlice}
            onHighlight={handleHighlight}
          />
        ))}
      </div>

      {/* Bottom status */}
      {selected.size > 0 ? (
        <BulkApplyBar
          count={selected.size}
          onApply={handleBulkApply}
          onClear={() => setSelected(() => new Set())}
        />
      ) : truncations.size > 0 ||
        stubs.size > 0 ||
        arraySlices.size > 0 ||
        autoTruncateEnabled ||
        autoArrayEnabled ? (
        <div className="px-2 py-1 border-t border-border bg-card flex items-center gap-2 flex-shrink-0 flex-wrap">
          <span className="text-[10px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
            {autoTruncateEnabled && autoMatchCount > 0 && (
              <span className="text-primary flex items-center gap-0.5">
                <Zap size={9} />
                {autoMatchCount} auto-str
              </span>
            )}
            {autoArrayEnabled && autoArrayMatchCount > 0 && (
              <span className="text-secondary flex items-center gap-0.5">
                <List size={9} />
                {autoArrayMatchCount} auto-arr
              </span>
            )}
            {truncations.size > 0 && <span>{truncations.size} manual</span>}
            {arraySlices.size > 0 && (
              <span className="text-secondary">{arraySlices.size} sliced</span>
            )}
            {stubs.size > 0 && <span>{stubs.size} stubbed</span>}
          </span>
          <div className="flex-1" />
          <button
            onClick={handleReset}
            className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <RefreshCw size={9} /> Reset manual
          </button>
        </div>
      ) : null}
    </div>
  );
}

interface OutputPanelProps {
  outputText: string;
  setOutputText: (v: string) => void;
  setOutputEdited: (v: boolean) => void;
  setHighlightedOffset: (v: number) => void;
  outputRef: React.RefObject<HTMLTextAreaElement | null>;
  totalOriginal: number;
  totalOutput: number;
  savings: number;
  outputEdited: boolean;
  highlightedOffset: number;
  handleCopy: () => void;
  copied: boolean;
  ph: string;
  pl: string;
}

function OutputPanel({
  outputText,
  setOutputText,
  setOutputEdited,
  setHighlightedOffset,
  outputRef,
  totalOriginal,
  totalOutput,
  savings,
  outputEdited,
  highlightedOffset,
  handleCopy,
  copied,
  ph,
  pl,
}: OutputPanelProps) {
  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className={ph}>
        <span className={pl}>Result</span>
        <div className="flex-1" />
        {totalOriginal > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {totalOutput.toLocaleString()} chars
            {savings > 0 && (
              <span className="text-success ml-1">−{savings}%</span>
            )}
          </span>
        )}
        {outputEdited && (
          <span className="text-[10px] text-warning">manually edited</span>
        )}
        {highlightedOffset >= 0 && (
          <span className="text-[10px] text-primary flex items-center gap-0.5">
            <Search size={9} /> jumped to field
          </span>
        )}
        <button
          onClick={handleCopy}
          disabled={!outputText}
          className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-muted hover:bg-accent rounded border border-border text-foreground disabled:opacity-40"
        >
          {copied ? (
            <Check size={10} className="text-success" />
          ) : (
            <Copy size={10} />
          )}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <textarea
        ref={outputRef}
        className="flex-1 min-h-0 resize-none bg-background text-foreground font-mono text-[11px] px-2 py-1.5 outline-none border-0 leading-relaxed placeholder:text-muted-foreground"
        value={outputText}
        onChange={(e) => {
          setOutputText(e.target.value);
          setOutputEdited(true);
          setHighlightedOffset(-1);
        }}
        spellCheck={false}
        placeholder="Result will appear here…"
      />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function JsonTruncator({
  initialValue = "",
  tabbed = false,
  defaultTab = "input",
  className,
  defaultAutoThreshold = DEFAULT_AUTO_THRESHOLD,
  defaultArrayKeep = DEFAULT_ARRAY_KEEP,
  defaultMaxDepth = null,
  allowLayoutToggle = false,
}: JsonTruncatorProps) {
  const [isTabbed, setIsTabbed] = useState(tabbed);
  const [inputText, setInputText] = useState(initialValue);
  const [parsed, setParsed] = useState<JsonValue | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldEntry[]>([]);
  const [truncations, setTruncations] = useState<Map<string, TruncateOpts>>(
    new Map(),
  );
  const [stubs, setStubs] = useState<Map<string, string>>(new Map());
  const [arraySlices, setArraySlices] = useState<Map<string, ArraySliceOpts>>(
    new Map(),
  );
  const [outputText, setOutputText] = useState("");
  const [copied, setCopied] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("size");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterType, setFilterType] = useState<
    "all" | "string" | "array" | "object"
  >("all");
  const [minSize, setMinSize] = useState(0);
  const [outputEdited, setOutputEdited] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [autoTruncateEnabled, setAutoTruncateEnabled] = useState(false);
  const [autoThreshold, setAutoThreshold] =
    useState<number>(defaultAutoThreshold);
  const [autoLeadChars, setAutoLeadChars] = useState<number>(
    DEFAULT_OPTS.leadChars,
  );
  const [autoTailChars, setAutoTailChars] = useState<number>(
    DEFAULT_OPTS.tailChars,
  );
  const [autoArrayEnabled, setAutoArrayEnabled] = useState(false);
  const [autoArrayKeepN, setAutoArrayKeepN] =
    useState<number>(defaultArrayKeep);
  const [maxDepth, setMaxDepth] = useState<number | null>(defaultMaxDepth);
  const [actualDepth, setActualDepth] = useState<number | null>(null);
  const [highlightedOffset, setHighlightedOffset] = useState<number>(-1);
  const [activeTab, setActiveTab] = useState<JsonTruncatorTab>(defaultTab);

  const outputRef = useRef<HTMLTextAreaElement>(null);

  // Persist / restore auto-settings (localStorage overrides prop defaults when present)
  useEffect(() => {
    const t = localStorage.getItem(AUTO_TRUNCATE_LS_KEY);
    if (t) {
      const v = parseInt(t);
      if (!isNaN(v) && v > 0) setAutoThreshold(v);
    } else {
      setAutoThreshold(defaultAutoThreshold);
    }
    const lead = localStorage.getItem(AUTO_LEAD_CHARS_LS_KEY);
    if (lead) {
      const v = parseInt(lead);
      if (!isNaN(v) && v >= 0) setAutoLeadChars(v);
    }
    const tail = localStorage.getItem(AUTO_TAIL_CHARS_LS_KEY);
    if (tail) {
      const v = parseInt(tail);
      if (!isNaN(v) && v >= 0) setAutoTailChars(v);
    }
    const a = localStorage.getItem(AUTO_ARRAY_LS_KEY);
    if (a) {
      const v = parseInt(a);
      if (!isNaN(v) && v > 0) setAutoArrayKeepN(v);
    } else {
      setAutoArrayKeepN(defaultArrayKeep);
    }
    const d = localStorage.getItem(MAX_DEPTH_LS_KEY);
    if (d === "null") {
      setMaxDepth(null);
    } else if (d !== null) {
      const v = parseInt(d);
      if (!isNaN(v) && v >= 1) setMaxDepth(v);
    } else {
      setMaxDepth(defaultMaxDepth);
    }
  }, [defaultAutoThreshold, defaultArrayKeep, defaultMaxDepth]);
  useEffect(() => {
    localStorage.setItem(AUTO_TRUNCATE_LS_KEY, String(autoThreshold));
  }, [autoThreshold]);
  useEffect(() => {
    localStorage.setItem(AUTO_LEAD_CHARS_LS_KEY, String(autoLeadChars));
  }, [autoLeadChars]);
  useEffect(() => {
    localStorage.setItem(AUTO_TAIL_CHARS_LS_KEY, String(autoTailChars));
  }, [autoTailChars]);
  useEffect(() => {
    localStorage.setItem(AUTO_ARRAY_LS_KEY, String(autoArrayKeepN));
  }, [autoArrayKeepN]);
  useEffect(() => {
    localStorage.setItem(
      MAX_DEPTH_LS_KEY,
      maxDepth === null ? "null" : String(maxDepth),
    );
  }, [maxDepth]);

  // If initialValue changes externally, re-parse
  useEffect(() => {
    if (initialValue) {
      setInputText(initialValue);
      handleParse(initialValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValue]);

  const autoTruncations = useMemo<Map<string, TruncateOpts>>(() => {
    if (!autoTruncateEnabled) return new Map();
    const map = new Map<string, TruncateOpts>();
    const opts: TruncateOpts = {
      leadChars: autoLeadChars,
      tailChars: autoTailChars,
      replacement: DEFAULT_OPTS.replacement,
    };
    for (const f of fields) {
      if (f.type === "string" && f.charCount >= autoThreshold)
        map.set(f.pathStr, opts);
    }
    return map;
  }, [
    autoTruncateEnabled,
    autoThreshold,
    autoLeadChars,
    autoTailChars,
    fields,
  ]);

  const autoArraySlices = useMemo<Map<string, ArraySliceOpts>>(() => {
    if (!autoArrayEnabled) return new Map();
    const map = new Map<string, ArraySliceOpts>();
    for (const f of fields) {
      if (
        f.type === "array" &&
        Array.isArray(f.value) &&
        isRepeatingArray(f.value, autoArrayKeepN)
      ) {
        map.set(f.pathStr, { keepN: autoArrayKeepN });
      }
    }
    return map;
  }, [autoArrayEnabled, autoArrayKeepN, fields]);

  const effectiveTruncations = useMemo<Map<string, TruncateOpts>>(() => {
    const merged = new Map(autoTruncations);
    for (const [k, v] of truncations) merged.set(k, v);
    return merged;
  }, [autoTruncations, truncations]);

  const effectiveArraySlices = useMemo<Map<string, ArraySliceOpts>>(() => {
    const merged = new Map(autoArraySlices);
    for (const [k, v] of arraySlices) merged.set(k, v);
    return merged;
  }, [autoArraySlices, arraySlices]);

  const handleParse = useCallback((text: string) => {
    if (!text.trim()) {
      setParsed(null);
      setFields([]);
      setParseError(null);
      setOutputText("");
      setActualDepth(null);
      return;
    }
    try {
      const val = JSON.parse(text);
      setParsed(val);
      const allFields = collectFields(val);
      allFields.sort((a, b) => b.charCount - a.charCount);
      setFields(allFields);
      setParseError(null);
      setTruncations(new Map());
      setStubs(new Map());
      setArraySlices(new Map());
      setSelected(new Set());
      setOutputText(JSON.stringify(val, null, 2));
      setOutputEdited(false);
      setActualDepth(measureDepth(val));
    } catch (e: unknown) {
      setParseError(e instanceof Error ? e.message : "Invalid JSON");
      setParsed(null);
      setFields([]);
      setActualDepth(null);
    }
  }, []);

  useEffect(() => {
    if (!parsed || outputEdited) return;
    setOutputText(
      JSON.stringify(
        applyTruncation(
          parsed,
          effectiveTruncations,
          stubs,
          effectiveArraySlices,
          [],
          maxDepth,
        ),
        null,
        2,
      ),
    );
  }, [
    effectiveTruncations,
    stubs,
    effectiveArraySlices,
    parsed,
    outputEdited,
    maxDepth,
  ]);

  const applyRule = useCallback((pathStr: string, opts: TruncateOpts) => {
    setOutputEdited(false);
    setTruncations((p) => new Map(p).set(pathStr, opts));
  }, []);
  const removeRule = useCallback((pathStr: string) => {
    setOutputEdited(false);
    setTruncations((p) => {
      const m = new Map(p);
      m.delete(pathStr);
      return m;
    });
  }, []);
  const applyStub = useCallback((pathStr: string, note: string) => {
    setOutputEdited(false);
    setStubs((p) => new Map(p).set(pathStr, note));
  }, []);
  const removeStub = useCallback((pathStr: string) => {
    setOutputEdited(false);
    setStubs((p) => {
      const m = new Map(p);
      m.delete(pathStr);
      return m;
    });
  }, []);
  const applySlice = useCallback((pathStr: string, opts: ArraySliceOpts) => {
    setOutputEdited(false);
    setArraySlices((p) => new Map(p).set(pathStr, opts));
  }, []);
  const removeSlice = useCallback((pathStr: string) => {
    setOutputEdited(false);
    setArraySlices((p) => {
      const m = new Map(p);
      m.delete(pathStr);
      return m;
    });
  }, []);
  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(outputText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [outputText]);
  const handleReset = useCallback(() => {
    setTruncations(new Map());
    setStubs(new Map());
    setArraySlices(new Map());
    setOutputEdited(false);
  }, []);
  const handleCheck = useCallback((pathStr: string, isChecked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (isChecked) next.add(pathStr);
      else next.delete(pathStr);
      return next;
    });
  }, []);
  const handleBulkApply = useCallback(
    (opts: TruncateOpts) => {
      setOutputEdited(false);
      setTruncations((prev) => {
        const next = new Map(prev);
        for (const p of selected) next.set(p, opts);
        return next;
      });
      setSelected(new Set());
    },
    [selected],
  );
  const handleHighlight = useCallback(
    (pathStr: string) => {
      const offset = findPathOffsetInOutput(outputText, pathStr);
      if (offset < 0 || !outputRef.current) return;
      setHighlightedOffset(offset);
      const ta = outputRef.current;
      const lineNumber = (outputText.slice(0, offset).match(/\n/g) ?? [])
        .length;
      ta.scrollTop = Math.max(0, lineNumber * 16 - ta.clientHeight / 2);
      ta.focus();
      ta.setSelectionRange(
        offset,
        offset + Math.min(50, outputText.length - offset),
      );
      // In tabbed mode, switch to output tab
      if (isTabbed) setActiveTab("output");
    },
    [outputText, isTabbed],
  );

  const displayFields = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = fields.filter((f) => {
      if (filterType !== "all" && f.type !== filterType) return false;
      if (f.charCount < minSize) return false;
      if (q)
        return (
          f.keyName.toLowerCase().includes(q) ||
          f.pathStr.toLowerCase().includes(q)
        );
      return true;
    });
    return [...list].sort((a, b) => {
      const cmp =
        sortKey === "size"
          ? a.charCount - b.charCount
          : sortKey === "path"
            ? a.pathStr.localeCompare(b.pathStr)
            : a.type.localeCompare(b.type);
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [fields, filterType, minSize, searchQuery, sortKey, sortDir]);

  const selectableInView = useMemo(
    () =>
      displayFields.filter((f) => f.type === "string").map((f) => f.pathStr),
    [displayFields],
  );
  const allChecked =
    selectableInView.length > 0 &&
    selectableInView.every((p) => selected.has(p));
  const someChecked = selectableInView.some((p) => selected.has(p));
  const handleSelectAll = () => {
    if (allChecked)
      setSelected((p) => {
        const n = new Set(p);
        selectableInView.forEach((s) => n.delete(s));
        return n;
      });
    else
      setSelected((p) => {
        const n = new Set(p);
        selectableInView.forEach((s) => n.add(s));
        return n;
      });
  };

  const maxSize =
    fields.length > 0 ? Math.max(...fields.map((f) => f.charCount)) : 1;
  const autoMatchCount = autoTruncations.size;
  const autoArrayMatchCount = autoArraySlices.size;
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };
  const totalOriginal = parsed ? getJsonSize(parsed) : 0;
  const totalOutput = outputText.length;
  const savings =
    totalOriginal > 0 ? Math.round((1 - totalOutput / totalOriginal) * 100) : 0;
  const showCheckboxes = searchQuery.trim().length > 0 || selected.size > 0;

  // Shared style helpers
  const ph =
    "flex items-center gap-2 px-2 py-1 bg-card border-b border-border flex-shrink-0";
  const pl = "text-[10px] text-muted-foreground uppercase tracking-wider";
  const sb = (k: SortKey) =>
    `hover:text-foreground text-[10px] ${sortKey === k ? "text-foreground" : "text-muted-foreground"}`;
  const fb = (t: string) =>
    `text-[10px] px-1.5 py-0.5 rounded ${filterType === t ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`;

  // Shared panel props bags
  const inputPanelProps: InputPanelProps = {
    inputText,
    setInputText,
    handleParse,
    parseError,
    parsed,
    totalOriginal,
    fieldCount: fields.length,
    autoTruncateEnabled,
    autoThreshold,
    autoLeadChars,
    autoTailChars,
    setAutoTruncateEnabled,
    setAutoThreshold,
    setAutoLeadChars,
    setAutoTailChars,
    setOutputEdited,
    autoMatchCount,
    autoArrayEnabled,
    autoArrayKeepN,
    setAutoArrayEnabled,
    setAutoArrayKeepN,
    autoArrayMatchCount,
    maxDepth,
    setMaxDepth,
    actualDepth,
    ph,
    pl,
  };
  const controlsProps: ControlsProps = {
    autoTruncateEnabled,
    autoThreshold,
    autoLeadChars,
    autoTailChars,
    onAutoTruncateToggle: () => {
      setAutoTruncateEnabled((e) => !e);
      setOutputEdited(false);
    },
    onAutoThresholdChange: (v) => {
      setAutoThreshold(v);
      setOutputEdited(false);
    },
    onAutoLeadCharsChange: (v) => {
      setAutoLeadChars(v);
      setOutputEdited(false);
    },
    onAutoTailCharsChange: (v) => {
      setAutoTailChars(v);
      setOutputEdited(false);
    },
    autoMatchCount,
    autoArrayEnabled,
    autoArrayKeepN,
    onAutoArrayToggle: () => {
      setAutoArrayEnabled((e) => !e);
      setOutputEdited(false);
    },
    onAutoArrayKeepNChange: (v) => {
      setAutoArrayKeepN(v);
      setOutputEdited(false);
    },
    autoArrayMatchCount,
    maxDepth,
    onMaxDepthChange: (v) => {
      setMaxDepth(v);
      setOutputEdited(false);
    },
    actualDepth,
  };
  const fieldsPanelProps: FieldsPanelProps = {
    displayFields,
    parsed,
    searchQuery,
    setSearchQuery,
    setSelected,
    filterType,
    setFilterType,
    minSize,
    setMinSize,
    sortKey,
    sortDir,
    toggleSort,
    showCheckboxes,
    allChecked,
    someChecked,
    handleSelectAll,
    maxSize,
    effectiveTruncations,
    stubs,
    effectiveArraySlices,
    selected,
    handleCheck,
    applyRule,
    removeRule,
    applyStub,
    removeStub,
    applySlice,
    removeSlice,
    handleHighlight,
    handleBulkApply,
    truncations,
    arraySlices,
    autoTruncateEnabled,
    autoArrayEnabled,
    autoMatchCount,
    autoArrayMatchCount,
    handleReset,
    ph,
    pl,
    sb,
    fb,
  };
  const outputPanelProps: OutputPanelProps = {
    outputText,
    setOutputText,
    setOutputEdited,
    setHighlightedOffset,
    outputRef,
    totalOriginal,
    totalOutput,
    savings,
    outputEdited,
    highlightedOffset,
    handleCopy,
    copied,
    ph,
    pl,
  };

  // Shared toggle button — rendered in both headers when allowLayoutToggle is true
  const layoutToggleBtn = allowLayoutToggle ? (
    <button
      onClick={() => setIsTabbed((v) => !v)}
      title={isTabbed ? "Switch to column layout" : "Switch to tabbed layout"}
      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted transition-colors"
    >
      {isTabbed ? (
        <>
          <LayoutPanelLeft size={12} />
          <span>Columns</span>
        </>
      ) : (
        <>
          <Rows3 size={12} />
          <span>Tabs</span>
        </>
      )}
    </button>
  ) : null;

  // ── Tabbed layout ────────────────────────────────────────────────────────────
  if (isTabbed) {
    const tabs: { id: JsonTruncatorTab; label: string }[] = [
      { id: "input", label: "Input" },
      { id: "fields", label: "Fields" },
      { id: "output", label: "Output" },
    ];
    return (
      <div
        className={cn(
          "h-full flex flex-col bg-background text-foreground overflow-hidden",
          className,
        )}
      >
        {/* Single header row: controls | separator | tabs | layout toggle */}
        <div className="flex items-center gap-2 px-2 py-0.5 bg-card border-b border-border flex-shrink-0 min-w-0">
          <InlineControlsBar {...controlsProps} />
          <span className="w-px h-4 bg-border shrink-0" />
          <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5 shrink-0">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded transition-colors whitespace-nowrap",
                  activeTab === t.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          {layoutToggleBtn && (
            <>
              <span className="w-px h-4 bg-border shrink-0" />
              {layoutToggleBtn}
            </>
          )}
        </div>

        {/* Tab content */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {activeTab === "input" && (
            <div className="flex-1 min-h-0 overflow-hidden">
              <InputPanel {...inputPanelProps} showControls={false} />
            </div>
          )}
          {activeTab === "fields" && (
            <div className="flex-1 min-h-0 overflow-hidden">
              <FieldsPanel {...fieldsPanelProps} />
            </div>
          )}
          {activeTab === "output" && (
            <div className="flex-1 min-h-0 overflow-hidden">
              <OutputPanel {...outputPanelProps} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Column layout (default) ──────────────────────────────────────────────────
  return (
    <div
      className={cn(
        "h-full flex flex-col bg-background text-foreground overflow-hidden",
        className,
      )}
    >
      {/* Top bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-card border-b border-border flex-shrink-0">
        <FileJson size={14} className="text-primary" />
        <span className="text-xs font-semibold text-foreground">
          JSON Data Truncator
        </span>
        <div className="flex-1" />
        {layoutToggleBtn}
      </div>

      {/* 3-column layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* LEFT: Input + auto settings */}
        <div className="w-[30%] min-w-0 min-h-0 overflow-hidden border-r border-border">
          <InputPanel {...inputPanelProps} />
        </div>

        {/* CENTER: Fields */}
        <div className="w-[38%] min-w-0 min-h-0 overflow-hidden border-r border-border">
          <FieldsPanel {...fieldsPanelProps} />
        </div>

        {/* RIGHT: Output */}
        <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
          <OutputPanel {...outputPanelProps} />
        </div>
      </div>
    </div>
  );
}

export default JsonTruncator;
