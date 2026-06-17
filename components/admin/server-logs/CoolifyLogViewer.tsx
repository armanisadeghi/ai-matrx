"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { JsonTreeViewer } from "@/components/official/json-explorer/JsonTreeViewer";
import { JsonTruncator } from "@/components/official-candidate/json-truncator/JsonTruncator";
import {
  RefreshCw,
  Loader2,
  AlertCircle,
  Terminal,
  Search,
  SplitSquareHorizontal,
  PanelLeft,
  Filter,
  X,
  Info,
  FileText,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { formatAbsoluteDate, formatRelativeTime } from "@/utils/datetime";
import {
  parseLogLines,
  applyFilters,
  extractModules,
  extractEndpoints,
  filterEndpointsForDisplay,
  defaultFilters,
  ALL_LEVELS,
  ALL_CATEGORIES,
  ALL_URGENCIES,
  MODULE_NONE,
  NOISE_EXCLUDE_PRESETS,
  DEFAULT_NOISE_EXCLUDES,
  type ParsedLogLine,
  type LogFilters,
  type LogNoiseExcludes,
  type LogLevel,
  type LogCategory,
  type LogUrgency,
} from "@/features/server-logs/log-rules";

// ─── App registry ─────────────────────────────────────────────────────────────

export const APPS = [
  {
    key: "ai-dream-server",
    label: "AI Dream Server",
    env: "production",
    source: "coolify" as const,
  },
  {
    key: "ai-dream-server-dev",
    label: "AI Dream Server",
    env: "development",
    source: "coolify" as const,
  },
  {
    key: "scraper-service",
    label: "Scraper Service",
    env: "production",
    source: "coolify" as const,
  },
  {
    key: "scraper-service-dev",
    label: "Scraper Service",
    env: "development",
    source: "coolify" as const,
  },
  {
    key: "matrx-ai",
    label: "Matrx AI",
    env: "production",
    source: "coolify" as const,
  },
  {
    key: "matrx-ai-dev",
    label: "Matrx AI",
    env: "development",
    source: "coolify" as const,
  },
  {
    key: "local-python-run",
    label: "Python Server",
    env: "localhost",
    source: "local" as const,
  },
  {
    key: "local-python-dev",
    label: "Python Server (dev log)",
    env: "localhost",
    source: "local" as const,
  },
] as const;

export type AppKey = (typeof APPS)[number]["key"];

function logsApiUrl(appKey: AppKey, lines: number): string {
  const app = APPS.find((a) => a.key === appKey);
  const base =
    app?.source === "local"
      ? "/api/admin/local-logs"
      : "/api/admin/coolify-logs";
  return `${base}?app=${appKey}&lines=${lines}`;
}

const LINE_OPTIONS = [50, 100, 200, 500, 1000, 2000, 5000, 10000];
const NOISE_EXCLUDES_STORAGE_KEY = "matrx:server-log-noise-excludes";

function loadNoiseExcludes(): LogNoiseExcludes {
  if (typeof window === "undefined") return { ...DEFAULT_NOISE_EXCLUDES };
  try {
    const raw = window.localStorage.getItem(NOISE_EXCLUDES_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_NOISE_EXCLUDES };
    const parsed = JSON.parse(raw) as Partial<LogNoiseExcludes> & {
      adminDb?: boolean;
    };
    return {
      cloudFiles: parsed.cloudFiles ?? DEFAULT_NOISE_EXCLUDES.cloudFiles,
      healthChecks: parsed.healthChecks ?? DEFAULT_NOISE_EXCLUDES.healthChecks,
      admin: parsed.admin ?? parsed.adminDb ?? DEFAULT_NOISE_EXCLUDES.admin,
      replaySweep: parsed.replaySweep ?? DEFAULT_NOISE_EXCLUDES.replaySweep,
      wakeListener: parsed.wakeListener ?? DEFAULT_NOISE_EXCLUDES.wakeListener,
      autoIngestListener:
        parsed.autoIngestListener ?? DEFAULT_NOISE_EXCLUDES.autoIngestListener,
    };
  } catch {
    return { ...DEFAULT_NOISE_EXCLUDES };
  }
}

function persistNoiseExcludes(excludes: LogNoiseExcludes) {
  try {
    window.localStorage.setItem(
      NOISE_EXCLUDES_STORAGE_KEY,
      JSON.stringify(excludes),
    );
  } catch {
    // localStorage full or disabled
  }
}

function noiseExcludesActive(excludes: LogNoiseExcludes): boolean {
  return NOISE_EXCLUDE_PRESETS.some((preset) => excludes[preset.key]);
}
const POLL_INTERVALS = [
  { value: 0, label: "Manual only" },
  { value: 5000, label: "Every 5s" },
  { value: 10000, label: "Every 10s" },
  { value: 30000, label: "Every 30s" },
  { value: 60000, label: "Every 60s" },
  { value: 120000, label: "Every 2min" },
  { value: 300000, label: "Every 5min" },
  { value: 600000, label: "Every 10min" },
  { value: 1200000, label: "Every 20min" },
  { value: 3600000, label: "Every hour" },
];

type LogResponse = {
  app: string;
  uuid: string;
  lines: number;
  logs: string;
  fetched_at: string;
  error?: string;
};

type ViewMode = "log-only" | "split" | "json-only" | "raw";
type JsonTab = "explorer" | "truncator" | "plain";

// ─── Level / Category display helpers ────────────────────────────────────────

const LEVEL_COLORS: Record<LogLevel, string> = {
  DEBUG: "bg-muted text-muted-foreground",
  INFO: "bg-info/15 text-info",
  WARNING: "bg-warning/15 text-warning",
  ERROR: "bg-destructive/15 text-destructive",
  CRITICAL: "bg-destructive/20 text-destructive font-semibold",
  UNKNOWN: "bg-muted text-muted-foreground",
};

const LEVEL_DISPLAY: Record<LogLevel, string> = {
  DEBUG: "DEBUG",
  INFO: "INFO",
  WARNING: "WARN",
  ERROR: "ERROR",
  CRITICAL: "CRIT",
  UNKNOWN: "???",
};

const CATEGORY_LABELS: Record<LogCategory, string> = {
  request: "Request",
  stream: "Stream",
  auth: "Auth",
  compat: "Compat",
  database: "DB",
  system: "System",
  error: "Error",
  "ai-execution": "AI",
  cx: "CX",
  config: "Config",
  "json-payload": "JSON",
  general: "General",
  unknown: "???",
};

const URGENCY_LABELS: Record<LogUrgency, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
  unknown: "???",
};

const URGENCY_COLORS: Record<LogUrgency, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-warning/15 text-warning",
  high: "bg-destructive/15 text-destructive",
  critical: "bg-destructive/20 text-destructive font-semibold",
  unknown: "bg-muted text-muted-foreground",
};

// ─── Log line renderer ────────────────────────────────────────────────────────

function AgeGutter({
  timestamp,
  gutterColor,
  alignTop = false,
}: {
  timestamp: string | null;
  gutterColor: string;
  alignTop?: boolean;
}) {
  const label = timestamp
    ? formatRelativeTime(timestamp, { style: "long", fallback: "" })
    : "";
  return (
    <span
      title={timestamp ? formatAbsoluteDate(timestamp) : undefined}
      className={`select-none shrink-0 w-[6.75rem] text-right pr-2 font-sans text-[10px] leading-5 border-r border-neutral-800 mr-2 text-neutral-500 whitespace-nowrap ${gutterColor} ${alignTop ? "pt-1.5" : ""}`}
    >
      {label || "—"}
    </span>
  );
}

interface LogLineProps {
  line: ParsedLogLine;
  /** Bumps on a timer so relative age strings stay fresh. */
  timeTick: number;
  /** 1-based display index among visible lines */
  displayIndex: number;
  selected: boolean;
  /** True if this line falls inside the current selection range */
  inSelection: boolean;
  /** True if this is the click-anchor (first clicked line) of the selection */
  isAnchor: boolean;
  onSelect: (line: ParsedLogLine) => void;
  /** lineIndex of the raw parsed line, shift = extend range */
  onRangeClick: (lineIndex: number, shift: boolean) => void;
}

const LogLine = React.memo(function LogLine({
  line,
  timeTick,
  displayIndex,
  selected,
  inSelection,
  isAnchor,
  onSelect,
  onRangeClick,
}: LogLineProps) {
  void timeTick;
  if (line.raw.trim() === "") {
    return <div className="h-1" />;
  }

  const handleClick = (e: React.MouseEvent) => {
    if (e.shiftKey) {
      onRangeClick(line.lineIndex, true);
    } else {
      onRangeClick(line.lineIndex, false);
      onSelect(line);
    }
  };

  // Background priority: anchor > in-range > selected-for-json > hover
  const bgClass = isAnchor
    ? "bg-blue-800/35 ring-1 ring-inset ring-blue-500"
    : inSelection
      ? "bg-blue-900/20 ring-1 ring-inset ring-blue-800/40"
      : selected
        ? "bg-blue-950/30"
        : "hover:bg-white/5";

  const gutterColor = isAnchor
    ? "text-blue-400"
    : inSelection
      ? "text-blue-700"
      : "text-neutral-700";

  // Shared gutter style — fixed width so log text always starts at the same column
  const lineGutter = (
    <span
      className={`select-none shrink-0 w-12 text-right pr-2 font-mono text-[10px] tabular-nums leading-5 border-r border-neutral-800 mr-2 ${gutterColor}`}
    >
      {displayIndex}
    </span>
  );

  const isContinuation = line.isJsonContinuation;

  if (isContinuation) {
    return (
      <div
        className={`flex items-start cursor-pointer transition-colors opacity-75 ${line.bgColor} ${bgClass}`}
        onClick={handleClick}
      >
        <AgeGutter timestamp={line.timestamp} gutterColor={gutterColor} />
        {lineGutter}
        <span
          className={`flex-1 font-mono text-xs leading-5 whitespace-pre-wrap break-all py-0 ${line.color}`}
        >
          {line.raw}
        </span>
      </div>
    );
  }

  const hasMetadata =
    line.level !== "UNKNOWN" ||
    line.module ||
    line.timestamp ||
    line.httpStatus != null;

  return (
    <div
      className={`flex items-start cursor-pointer transition-colors ${line.bgColor} ${bgClass}`}
      onClick={handleClick}
    >
      <AgeGutter
        timestamp={line.timestamp}
        gutterColor={gutterColor}
        alignTop={hasMetadata}
      />
      {/* Line number gutter — aligned to first row of content */}
      <span
        className={`select-none shrink-0 w-12 text-right pr-2 font-mono text-[10px] tabular-nums border-r border-neutral-800 mr-2 ${gutterColor} ${hasMetadata ? "pt-1.5" : "leading-5"}`}
      >
        {displayIndex}
      </span>

      {/* Content column */}
      <div className="flex flex-col flex-1 pt-1.5 pb-0.5 min-w-0">
        {hasMetadata && (
          <div className="flex flex-wrap items-center gap-1.5 mb-0.5 font-sans">
            {line.level !== "UNKNOWN" && (
              <span
                className={`text-[10px] px-1.5 py-px rounded font-medium tabular-nums ${LEVEL_COLORS[line.level]}`}
              >
                {LEVEL_DISPLAY[line.level]}
              </span>
            )}
            {line.category !== "general" &&
              line.category !== "unknown" &&
              line.category !== "json-payload" && (
                <span className={`text-[10px] font-medium ${line.color}`}>
                  {CATEGORY_LABELS[line.category]}
                </span>
              )}
            {line.module && (
              <>
                <span className="text-neutral-700 text-[10px]">·</span>
                <span className="text-[10px] text-neutral-500">
                  {line.module}
                </span>
              </>
            )}
            {line.httpStatus != null && (
              <>
                <span className="text-neutral-700 text-[10px]">·</span>
                <span
                  className={`text-[10px] px-1 rounded font-medium ${
                    line.httpStatus >= 500
                      ? "bg-red-900/60 text-red-300"
                      : line.httpStatus >= 400
                        ? "bg-amber-900/60 text-amber-300"
                        : "bg-green-900/60 text-green-300"
                  }`}
                >
                  {line.httpStatus}
                </span>
              </>
            )}
            {line.timestamp && (
              <>
                <span className="text-neutral-700 text-[10px]">·</span>
                <span className="text-[10px] text-neutral-600 tabular-nums">
                  {line.timestamp}
                </span>
              </>
            )}
          </div>
        )}
        <div
          className={`font-mono text-xs leading-5 whitespace-pre-wrap break-all ${line.color}`}
        >
          {line.raw}
        </div>
      </div>
    </div>
  );
});

// ─── Filter section with ALL / CLEAR ─────────────────────────────────────────

interface ToggleGroupProps<T extends string> {
  label: string;
  all: T[];
  active: Set<T>;
  colorMap?: Record<string, string>;
  labelMap?: Record<string, string>;
  onToggle: (v: T) => void;
  onAll: () => void;
  onClear: () => void;
}

function ToggleGroup<T extends string>({
  label,
  all,
  active,
  colorMap,
  labelMap,
  onToggle,
  onAll,
  onClear,
}: ToggleGroupProps<T>) {
  const isAll = active.size === all.length;
  const isClear = active.size === 0;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-neutral-500 text-[10px] uppercase tracking-wide w-16 shrink-0">
        {label}
      </span>
      <button
        onClick={onAll}
        className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-all
          ${isAll ? "border-neutral-500 text-neutral-200 bg-white/10" : "border-neutral-700 text-neutral-600 hover:text-neutral-400"}`}
      >
        ALL
      </button>
      <button
        onClick={onClear}
        className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-all
          ${isClear ? "border-red-600 text-red-400 bg-red-950/30" : "border-neutral-700 text-neutral-600 hover:text-neutral-400"}`}
      >
        CLEAR
      </button>
      <div className="w-px h-3 bg-neutral-700 shrink-0" />
      {all.map((v) => (
        <button
          key={v}
          onClick={() => onToggle(v)}
          className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all
            ${colorMap?.[v] ?? "bg-white/10 text-neutral-300"}
            ${active.has(v) ? "opacity-100" : "opacity-20 grayscale"}`}
        >
          {labelMap?.[v] ?? v}
        </button>
      ))}
    </div>
  );
}

// ─── Noise exclude toggles ────────────────────────────────────────────────────

interface NoiseExcludeTogglesProps {
  excludes: LogNoiseExcludes;
  onChange: (next: LogNoiseExcludes) => void;
  compact?: boolean;
}

function NoiseExcludeToggles({
  excludes,
  onChange,
  compact = false,
}: NoiseExcludeTogglesProps) {
  return (
    <div
      className={`flex items-center gap-1 ${compact ? "flex-wrap" : "flex-wrap gap-1.5"}`}
    >
      {!compact && (
        <span className="text-neutral-500 shrink-0 mr-1">Hide noise:</span>
      )}
      {NOISE_EXCLUDE_PRESETS.map((preset) => {
        const hidden = excludes[preset.key];
        const showing = !hidden;
        return (
          <button
            key={preset.key}
            type="button"
            title={
              hidden
                ? `${preset.description} — hidden, click to show`
                : `${preset.description} — visible, click to hide`
            }
            onClick={() =>
              onChange({ ...excludes, [preset.key]: !excludes[preset.key] })
            }
            className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-all whitespace-nowrap
              ${
                showing
                  ? "border-cyan-600 text-cyan-200 bg-cyan-950/50"
                  : "border-neutral-600 text-neutral-300 bg-neutral-800/80 hover:border-neutral-500 hover:text-neutral-200"
              }`}
          >
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Filter panel ─────────────────────────────────────────────────────────────

interface FilterPanelProps {
  filters: LogFilters;
  onChange: (f: LogFilters) => void;
  availableModules: string[];
  availableEndpoints: string[];
  totalLines: number;
  visibleLines: number;
}

function FilterPanel({
  filters,
  onChange,
  availableModules,
  availableEndpoints,
  totalLines,
  visibleLines,
}: FilterPanelProps) {
  const isFiltered =
    filters.levels.size < ALL_LEVELS.length ||
    filters.categories.size < ALL_CATEGORIES.length ||
    filters.urgencies.size < ALL_URGENCIES.length ||
    filters.modulesCleared ||
    filters.modules.size > 0 ||
    filters.endpointsCleared ||
    filters.endpoints.size > 0 ||
    filters.search.trim() !== "" ||
    !filters.showJsonPayloads ||
    noiseExcludesActive(filters.noiseExcludes);

  const setLevels = (s: Set<LogLevel>) => onChange({ ...filters, levels: s });
  const setCats = (s: Set<LogCategory>) =>
    onChange({ ...filters, categories: s });
  const setUrgs = (s: Set<LogUrgency>) =>
    onChange({ ...filters, urgencies: s });
  const setMods = (s: Set<string>, cleared = false) =>
    onChange({ ...filters, modules: s, modulesCleared: cleared });
  const setEps = (s: Set<string>, cleared = false) =>
    onChange({ ...filters, endpoints: s, endpointsCleared: cleared });

  return (
    <div className="flex flex-col gap-2.5 px-3 py-2.5 bg-neutral-900 border-b border-neutral-800 text-xs">
      <div className="flex items-center gap-2">
        <Search className="h-3.5 w-3.5 text-neutral-500 shrink-0" />
        <Input
          placeholder="Search raw logs…"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          className="h-7 text-xs bg-neutral-800 border-neutral-700 placeholder:text-neutral-600 flex-1"
        />
        <span className="text-neutral-500 shrink-0 whitespace-nowrap tabular-nums">
          {visibleLines} / {totalLines}
        </span>
        {isFiltered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(defaultFilters())}
            className="h-7 px-2 text-neutral-400 hover:text-white shrink-0"
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Reset all
          </Button>
        )}
      </div>

      <NoiseExcludeToggles
        excludes={filters.noiseExcludes}
        onChange={(noiseExcludes) => onChange({ ...filters, noiseExcludes })}
      />

      <ToggleGroup<LogLevel>
        label="Level"
        all={ALL_LEVELS}
        active={filters.levels}
        colorMap={LEVEL_COLORS}
        labelMap={LEVEL_DISPLAY}
        onToggle={(l) => {
          const s = new Set(filters.levels);
          s.has(l) ? s.delete(l) : s.add(l);
          setLevels(s);
        }}
        onAll={() => setLevels(new Set(ALL_LEVELS))}
        onClear={() => setLevels(new Set())}
      />

      <ToggleGroup<LogCategory>
        label="Category"
        all={ALL_CATEGORIES}
        active={filters.categories}
        labelMap={CATEGORY_LABELS}
        onToggle={(c) => {
          const s = new Set(filters.categories);
          s.has(c) ? s.delete(c) : s.add(c);
          setCats(s);
        }}
        onAll={() => setCats(new Set(ALL_CATEGORIES))}
        onClear={() => setCats(new Set())}
      />

      <ToggleGroup<LogUrgency>
        label="Urgency"
        all={ALL_URGENCIES}
        active={filters.urgencies}
        labelMap={URGENCY_LABELS}
        colorMap={URGENCY_COLORS}
        onToggle={(u) => {
          const s = new Set(filters.urgencies);
          s.has(u) ? s.delete(u) : s.add(u);
          setUrgs(s);
        }}
        onAll={() => setUrgs(new Set(ALL_URGENCIES))}
        onClear={() => setUrgs(new Set())}
      />

      {availableModules.length > 0 &&
        (() => {
          const activeModules =
            !filters.modulesCleared && filters.modules.size === 0
              ? new Set(availableModules)
              : filters.modules;
          return (
            <ToggleGroup<string>
              label="Module"
              all={availableModules}
              active={activeModules}
              labelMap={Object.fromEntries(
                availableModules.map((m) => [m, m === MODULE_NONE ? "???" : m]),
              )}
              colorMap={Object.fromEntries(
                availableModules.map((m) => [
                  m,
                  m === MODULE_NONE
                    ? "bg-neutral-800 text-neutral-400"
                    : "bg-indigo-900/40 text-indigo-300",
                ]),
              )}
              onToggle={(m) => {
                const current =
                  !filters.modulesCleared && filters.modules.size === 0
                    ? new Set(availableModules)
                    : new Set(filters.modules);
                current.has(m) ? current.delete(m) : current.add(m);
                if (current.size === availableModules.length) {
                  setMods(new Set(), false);
                } else {
                  setMods(current, current.size === 0);
                }
              }}
              onAll={() => setMods(new Set(), false)}
              onClear={() => setMods(new Set(), true)}
            />
          );
        })()}

      {availableEndpoints.length > 0 &&
        (() => {
          const activeEndpoints =
            !filters.endpointsCleared && filters.endpoints.size === 0
              ? new Set(availableEndpoints)
              : filters.endpoints;
          return (
            <ToggleGroup<string>
              label="Endpoint"
              all={availableEndpoints}
              active={activeEndpoints}
              colorMap={Object.fromEntries(
                availableEndpoints.map((ep) => [
                  ep,
                  "bg-cyan-900/30 text-cyan-300",
                ]),
              )}
              onToggle={(ep) => {
                const current =
                  !filters.endpointsCleared && filters.endpoints.size === 0
                    ? new Set(availableEndpoints)
                    : new Set(filters.endpoints);
                current.has(ep) ? current.delete(ep) : current.add(ep);
                if (current.size === availableEndpoints.length) {
                  setEps(new Set(), false);
                } else {
                  setEps(current, current.size === 0);
                }
              }}
              onAll={() => setEps(new Set(), false)}
              onClear={() => setEps(new Set(), true)}
            />
          );
        })()}
    </div>
  );
}

// ─── Selection / copy status bar ─────────────────────────────────────────────

interface SelectionBarProps {
  anchor: number | null;
  tail: number | null;
  selectedCount: number;
  copied: boolean;
  onCopy: () => void;
  onClear: () => void;
  onSelectAll: () => void;
}

function SelectionBar({
  anchor,
  tail,
  selectedCount,
  copied,
  onCopy,
  onClear,
  onSelectAll,
}: SelectionBarProps) {
  const hasRange = anchor !== null && tail !== null;

  return (
    <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-blue-950/50 border-b border-blue-800/50 text-xs">
      <span className="text-blue-400 font-medium tabular-nums">
        {hasRange
          ? `${selectedCount} lines selected`
          : anchor !== null
            ? "Shift+click to extend range"
            : ""}
      </span>
      {hasRange && (
        <>
          <span className="text-blue-700">·</span>
          <span className="text-neutral-500 tabular-nums">
            lines {Math.min(anchor!, tail!) + 1}–{Math.max(anchor!, tail!) + 1}
          </span>
        </>
      )}
      <div className="flex-1" />
      <button
        onClick={onSelectAll}
        className="text-neutral-400 hover:text-white text-[10px] px-2 py-0.5 rounded border border-neutral-700 hover:border-neutral-500 transition-colors"
      >
        Select all visible
      </button>
      {anchor !== null && (
        <button
          onClick={onClear}
          className="text-neutral-500 hover:text-red-400 text-[10px] px-2 py-0.5 rounded border border-neutral-700 hover:border-red-800 transition-colors"
        >
          <X className="h-2.5 w-2.5 inline mr-1" />
          Clear
        </button>
      )}
      <button
        onClick={onCopy}
        className={`flex items-center gap-1 text-[10px] px-3 py-1 rounded font-medium transition-colors ${
          copied
            ? "bg-green-700 text-white"
            : "bg-blue-700 hover:bg-blue-600 text-white"
        }`}
      >
        {copied ? (
          <>
            <Check className="h-3 w-3" /> Copied!
          </>
        ) : (
          <>
            <Copy className="h-3 w-3" /> Copy {hasRange ? "selection" : "all"}
          </>
        )}
      </button>
    </div>
  );
}

// ─── Line range panel ─────────────────────────────────────────────────────────

interface LineRangePanelProps {
  totalFetched: number;
  startOffset: number;
  displayCount: number | null;
  onStartOffset: (n: number) => void;
  onDisplayCount: (n: number | null) => void;
}

function LineRangePanel({
  totalFetched,
  startOffset,
  displayCount,
  onStartOffset,
  onDisplayCount,
}: LineRangePanelProps) {
  const maxOffset = Math.max(0, totalFetched - 1);
  const effectiveEnd =
    displayCount !== null
      ? Math.min(startOffset + displayCount, totalFetched)
      : totalFetched;

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 bg-neutral-900 border-b border-neutral-800 text-xs">
      <span className="text-neutral-500 shrink-0">View range:</span>
      <div className="flex items-center gap-1.5">
        <span className="text-neutral-600">Start</span>
        <Input
          type="number"
          min={0}
          max={maxOffset}
          value={startOffset}
          onChange={(e) => {
            const v = Math.max(
              0,
              Math.min(maxOffset, parseInt(e.target.value) || 0),
            );
            onStartOffset(v);
          }}
          className="h-6 w-20 text-xs bg-neutral-800 border-neutral-700 text-center"
        />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-neutral-600">Count</span>
        <Input
          type="number"
          min={1}
          max={totalFetched}
          value={displayCount ?? ""}
          placeholder="all"
          onChange={(e) => {
            const raw = e.target.value.trim();
            onDisplayCount(raw === "" ? null : Math.max(1, parseInt(raw) || 1));
          }}
          className="h-6 w-20 text-xs bg-neutral-800 border-neutral-700 text-center"
        />
      </div>
      <span className="text-neutral-600 tabular-nums">
        → {startOffset + 1}–{effectiveEnd} of {totalFetched}
      </span>
      <button
        onClick={() => {
          onStartOffset(0);
          onDisplayCount(null);
        }}
        className="ml-auto text-[10px] text-neutral-500 hover:text-white border border-neutral-700 hover:border-neutral-500 px-2 py-0.5 rounded transition-colors"
      >
        Reset
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface CoolifyLogViewerProps {
  initialApp?: AppKey;
  hideAppSelector?: boolean;
}

export default function CoolifyLogViewer({
  initialApp,
  hideAppSelector = false,
}: CoolifyLogViewerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedApp, setSelectedApp] = useState<AppKey>(
    initialApp ?? (searchParams?.get("app") as AppKey) ?? "ai-dream-server",
  );
  const [lineCount, setLineCount] = useState<number>(200);
  const [pollInterval, setPollInterval] = useState<number>(0);
  const [rawLogs, setRawLogs] = useState<string>("");
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("log-only");
  const [showFilters, setShowFilters] = useState(false);
  const [showRange, setShowRange] = useState(false);
  const [filters, setFiltersState] = useState<LogFilters>(() => ({
    ...defaultFilters(),
    noiseExcludes: loadNoiseExcludes(),
  }));
  const setFilters = useCallback((next: LogFilters) => {
    setFiltersState(next);
    persistNoiseExcludes(next.noiseExcludes);
  }, []);
  const [selectedLine, setSelectedLine] = useState<ParsedLogLine | null>(null);

  const [jsonTab, setJsonTab] = useState<JsonTab>("explorer");

  // Selection state — anchor is first click, tail is shift-click endpoint
  const [selAnchor, setSelAnchor] = useState<number | null>(null);
  const [selTail, setSelTail] = useState<number | null>(null);
  const [showSelectionBar, setShowSelectionBar] = useState(false);
  const [copied, setCopied] = useState(false);

  // View range
  const [startOffset, setStartOffset] = useState(0);
  const [displayCount, setDisplayCount] = useState<number | null>(null);

  const logRef = useRef<HTMLDivElement>(null);
  const rawRef = useRef<HTMLPreElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [timeTick, setTimeTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTimeTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const parsedLines = useMemo(() => parseLogLines(rawLogs), [rawLogs]);

  const availableModules = useMemo(
    () => extractModules(parsedLines),
    [parsedLines],
  );
  const availableEndpoints = useMemo(
    () =>
      filterEndpointsForDisplay(
        extractEndpoints(parsedLines),
        filters.noiseExcludes,
      ),
    [parsedLines, filters.noiseExcludes],
  );

  const rangedLines = useMemo(() => {
    if (startOffset === 0 && displayCount === null) return parsedLines;
    const end =
      displayCount !== null
        ? Math.min(startOffset + displayCount, parsedLines.length)
        : parsedLines.length;
    return parsedLines.slice(startOffset, end);
  }, [parsedLines, startOffset, displayCount]);

  const filteredLines = useMemo(
    () => applyFilters(rangedLines, filters),
    [rangedLines, filters],
  );

  const rawLineCount = useMemo(
    () => (rawLogs ? rawLogs.split("\n").length : 0),
    [rawLogs],
  );

  // Compute which filtered lines are inside the selection range
  const selectionSet = useMemo(() => {
    if (selAnchor === null) return new Set<number>();
    const lo = selTail !== null ? Math.min(selAnchor, selTail) : selAnchor;
    const hi = selTail !== null ? Math.max(selAnchor, selTail) : selAnchor;
    return new Set(
      filteredLines
        .filter(
          (l) => l.lineIndex >= lo && l.lineIndex <= hi && l.raw.trim() !== "",
        )
        .map((l) => l.lineIndex),
    );
  }, [selAnchor, selTail, filteredLines]);

  const jsonPanelData = useMemo(() => {
    if (!selectedLine) return null;
    if (selectedLine.jsonData != null) return selectedLine.jsonData;
    const t = selectedLine.raw.trim();
    if (t.startsWith("{") || t.startsWith("[")) {
      try {
        return JSON.parse(t);
      } catch {
        /* ignore */
      }
    }
    return {
      timestamp: selectedLine.timestamp,
      level: selectedLine.level,
      module: selectedLine.module,
      modulePath: selectedLine.modulePath,
      category: selectedLine.category,
      urgency: selectedLine.urgency,
      httpMethod: selectedLine.httpMethod,
      httpPath: selectedLine.httpPath,
      httpStatus: selectedLine.httpStatus,
      httpDuration: selectedLine.httpDuration,
      raw: selectedLine.raw,
    };
  }, [selectedLine]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(logsApiUrl(selectedApp, lineCount), {
        cache: "no-store",
      });
      const data: LogResponse = await res.json();
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
      } else {
        setRawLogs(data.logs);
        setFetchedAt(data.fetched_at);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fetch failed");
    } finally {
      setLoading(false);
    }
  }, [selectedApp, lineCount]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (pollInterval > 0) {
      intervalRef.current = setInterval(fetchLogs, pollInterval);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [pollInterval, fetchLogs]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleAppChange = useCallback(
    (app: AppKey) => {
      setSelectedApp(app);
      if (!hideAppSelector) {
        router.replace(`/administration/server-logs/${app}`, { scroll: false });
      }
    },
    [router, hideAppSelector],
  );

  const scrollToBottom = useCallback(() => {
    const el = viewMode === "raw" ? rawRef.current : logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [viewMode]);

  const scrollToTop = useCallback(() => {
    const el = viewMode === "raw" ? rawRef.current : logRef.current;
    if (el) el.scrollTop = 0;
  }, [viewMode]);

  // Click on a line number gutter region — anchor click or shift-extend
  const handleRangeClick = useCallback(
    (lineIndex: number, shift: boolean) => {
      if (shift && selAnchor !== null) {
        setSelTail(lineIndex);
        setShowSelectionBar(true);
      } else {
        setSelAnchor(lineIndex);
        setSelTail(null);
        setShowSelectionBar(true);
      }
    },
    [selAnchor],
  );

  const handleClearSelection = useCallback(() => {
    setSelAnchor(null);
    setSelTail(null);
    setShowSelectionBar(false);
    setCopied(false);
  }, []);

  const handleSelectAllVisible = useCallback(() => {
    const nonBlank = filteredLines.filter((l) => l.raw.trim() !== "");
    if (nonBlank.length === 0) return;
    setSelAnchor(nonBlank[0].lineIndex);
    setSelTail(nonBlank[nonBlank.length - 1].lineIndex);
    setShowSelectionBar(true);
  }, [filteredLines]);

  const handleCopy = useCallback(() => {
    const linesToCopy =
      selectionSet.size > 0
        ? filteredLines.filter((l) => selectionSet.has(l.lineIndex))
        : filteredLines.filter((l) => l.raw.trim() !== "");

    const text = linesToCopy.map((l) => l.raw).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [filteredLines, selectionSet]);

  const appMeta = APPS.find((a) => a.key === selectedApp);
  const isLivePolling = pollInterval > 0;

  // Count lines in the current selection (visible filtered lines within range)
  const selectionCount = selectionSet.size;

  return (
    <div className="w-full h-full flex flex-col bg-neutral-950 overflow-hidden">
      {/* ── Top toolbar ── */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-neutral-800 bg-neutral-900 flex-wrap">
        {!hideAppSelector && (
          <Select
            value={selectedApp}
            onValueChange={(v) => handleAppChange(v as AppKey)}
          >
            <SelectTrigger className="w-56 h-8 text-xs bg-neutral-800 border-neutral-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {APPS.map((app) => (
                <SelectItem key={app.key} value={app.key} className="text-xs">
                  <span className="flex items-center gap-2">
                    {app.label}
                    <Badge
                      variant="outline"
                      className={
                        app.source === "local"
                          ? "text-[10px] py-0 border-emerald-500/60 text-emerald-400"
                          : app.env === "production"
                            ? "text-[10px] py-0 border-orange-500/60 text-orange-400"
                            : "text-[10px] py-0 border-neutral-500 text-neutral-400"
                      }
                    >
                      {app.source === "local"
                        ? "local"
                        : app.env === "production"
                          ? "prod"
                          : "dev"}
                    </Badge>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={String(lineCount)}
          onValueChange={(v) => setLineCount(parseInt(v, 10))}
        >
          <SelectTrigger className="w-28 h-8 text-xs bg-neutral-800 border-neutral-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LINE_OPTIONS.map((n) => (
              <SelectItem key={n} value={String(n)} className="text-xs">
                {n} lines
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={String(pollInterval)}
          onValueChange={(v) => setPollInterval(parseInt(v, 10))}
        >
          <SelectTrigger className="w-32 h-8 text-xs bg-neutral-800 border-neutral-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {POLL_INTERVALS.map((opt) => (
              <SelectItem
                key={opt.value}
                value={String(opt.value)}
                className="text-xs"
              >
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          onClick={fetchLogs}
          disabled={loading}
          size="sm"
          className="h-8 text-xs bg-blue-700 hover:bg-blue-600 text-white"
        >
          {loading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              Fetching…
            </>
          ) : (
            <>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Refresh
            </>
          )}
        </Button>

        {isLivePolling && (
          <Badge className="h-6 text-[10px] bg-green-900/40 text-green-400 border-green-700">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 mr-1.5 animate-pulse" />
            Live
          </Badge>
        )}

        <div className="flex-1" />

        {viewMode !== "raw" && (
          <NoiseExcludeToggles
            excludes={filters.noiseExcludes}
            onChange={(noiseExcludes) =>
              setFilters({ ...filters, noiseExcludes })
            }
            compact
          />
        )}

        {fetchedAt && (
          <span className="text-[10px] text-neutral-500">
            {new Date(fetchedAt).toLocaleTimeString()}
          </span>
        )}
        <span className="text-[10px] text-neutral-500 tabular-nums">
          {viewMode === "raw"
            ? rawLineCount
            : `${filteredLines.length}/${rawLineCount}`}{" "}
          lines
        </span>

        <Button
          variant="ghost"
          size="sm"
          onClick={scrollToTop}
          className="h-8 px-2 text-neutral-400 hover:text-white"
          title="Scroll to top"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={scrollToBottom}
          className="h-8 px-2 text-neutral-400 hover:text-white"
          title="Scroll to bottom"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>

        {/* Range toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowRange((p) => !p)}
          className={`h-8 px-2 text-xs ${showRange ? "text-white bg-white/10" : "text-neutral-400 hover:text-white"}`}
          title="Set view range"
        >
          <FileText className="h-3.5 w-3.5 mr-1" />
          Range
        </Button>

        {/* Filter toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowFilters((p) => !p)}
          className={`h-8 px-2 text-xs ${showFilters ? "text-white bg-white/10" : "text-neutral-400 hover:text-white"}`}
        >
          <Filter className="h-3.5 w-3.5 mr-1" />
          Filter
        </Button>

        {/* View mode segmented control */}
        <div className="flex items-center gap-0.5 bg-neutral-800 rounded p-0.5">
          {(
            [
              {
                mode: "log-only" as ViewMode,
                icon: <Terminal className="h-3.5 w-3.5" />,
                title: "Parsed log view",
              },
              {
                mode: "split" as ViewMode,
                icon: <SplitSquareHorizontal className="h-3.5 w-3.5" />,
                title: "Split: log + JSON",
              },
              {
                mode: "json-only" as ViewMode,
                icon: <PanelLeft className="h-3.5 w-3.5" />,
                title: "JSON inspector only",
              },
              {
                mode: "raw" as ViewMode,
                icon: <FileText className="h-3.5 w-3.5" />,
                title: "Raw (no parsing)",
              },
            ] as const
          ).map(({ mode, icon, title }) => (
            <Button
              key={mode}
              variant="ghost"
              size="sm"
              title={title}
              onClick={() => setViewMode(mode)}
              className={`h-7 px-2 text-xs rounded-sm ${viewMode === mode ? "bg-white/15 text-white" : "text-neutral-500 hover:text-white"}`}
            >
              {icon}
            </Button>
          ))}
        </div>
      </div>

      {/* ── Range panel ── */}
      {showRange && viewMode !== "raw" && (
        <LineRangePanel
          totalFetched={parsedLines.length}
          startOffset={startOffset}
          displayCount={displayCount}
          onStartOffset={(n) => {
            setStartOffset(n);
            handleClearSelection();
          }}
          onDisplayCount={(n) => {
            setDisplayCount(n);
            handleClearSelection();
          }}
        />
      )}

      {/* ── Filter panel ── */}
      {showFilters && viewMode !== "raw" && (
        <FilterPanel
          filters={filters}
          onChange={setFilters}
          availableModules={availableModules}
          availableEndpoints={availableEndpoints}
          totalLines={rangedLines.length}
          visibleLines={filteredLines.length}
        />
      )}

      {/* ── Selection / copy bar — shown whenever a selection exists ── */}
      {showSelectionBar && viewMode !== "raw" && (
        <SelectionBar
          anchor={selAnchor}
          tail={selTail}
          selectedCount={
            selectionCount ||
            filteredLines.filter((l) => l.raw.trim() !== "").length
          }
          copied={copied}
          onCopy={handleCopy}
          onClear={handleClearSelection}
          onSelectAll={handleSelectAllVisible}
        />
      )}

      {/* ── Error banner ── */}
      {error && (
        <div className="shrink-0 flex items-center gap-3 px-4 py-2 bg-red-950/40 border-b border-red-800 text-red-400 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Info bar ── */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-1 border-b border-neutral-800 bg-neutral-900/50">
        <Terminal className="h-3.5 w-3.5 text-green-500 shrink-0" />
        <span className="text-xs font-mono text-neutral-400">
          {appMeta?.label} ({appMeta?.env}) — last {lineCount} lines
          {isLivePolling && (
            <span className="text-neutral-600">
              {" "}
              · polling every {pollInterval / 1000}s
            </span>
          )}
        </span>
        {viewMode === "raw" && (
          <span className="text-[10px] text-amber-500 ml-2">
            raw mode — no filtering or parsing
          </span>
        )}
        {viewMode !== "raw" && (
          <span className="text-[10px] text-neutral-600 ml-auto">
            Click any line to inspect · Shift+click to extend selection · Copy
            button to copy
          </span>
        )}
        {selectedLine && !showSelectionBar && viewMode !== "raw" && (
          <span className="ml-auto text-[10px] text-blue-400 flex items-center gap-1">
            <Info className="h-3 w-3" />
            Line {selectedLine.lineIndex + 1}
          </span>
        )}
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {viewMode === "raw" && (
          <pre
            ref={rawRef}
            className="flex-1 overflow-auto p-3 text-xs font-mono leading-5 text-neutral-300 whitespace-pre-wrap break-all"
            style={{ scrollbarGutter: "stable" }}
          >
            {!rawLogs ? (
              <span className="text-neutral-600">
                No logs. Select an app and click Refresh.
              </span>
            ) : (
              rawLogs
            )}
          </pre>
        )}

        {(viewMode === "log-only" || viewMode === "split") && (
          <div
            ref={logRef}
            className={`flex flex-col overflow-y-auto min-h-0 py-1 ${viewMode === "split" ? "w-1/2 border-r border-neutral-800" : "w-full"}`}
            style={{ scrollbarGutter: "stable" }}
          >
            {loading && !rawLogs ? (
              <div className="px-4 py-2 text-neutral-500 text-xs font-mono">
                Loading…
              </div>
            ) : !rawLogs ? (
              <div className="px-4 py-2 text-neutral-500 text-xs font-mono">
                No logs. Select an app and click Refresh.
              </div>
            ) : filteredLines.length === 0 ? (
              <div className="px-4 py-2 text-neutral-500 text-xs font-mono">
                No lines match the current filters.
              </div>
            ) : (
              filteredLines.map((line, i) => (
                <LogLine
                  key={line.lineIndex}
                  line={line}
                  timeTick={timeTick}
                  displayIndex={i + 1}
                  selected={selectedLine?.lineIndex === line.lineIndex}
                  inSelection={selectionSet.has(line.lineIndex)}
                  isAnchor={selAnchor === line.lineIndex}
                  onSelect={(l) => {
                    setSelectedLine(l);
                    if (viewMode === "log-only") setViewMode("split");
                  }}
                  onRangeClick={handleRangeClick}
                />
              ))
            )}
          </div>
        )}

        {(viewMode === "split" || viewMode === "json-only") && (
          <div
            className={`flex flex-col min-h-0 overflow-hidden bg-neutral-900 border-l border-neutral-800 ${viewMode === "split" ? "w-1/2" : "w-full"}`}
          >
            {/* ── JSON panel header: tabs + close ── */}
            <div className="shrink-0 flex items-center border-b border-neutral-800 bg-neutral-950">
              <div className="flex items-center flex-1">
                {(
                  [
                    { id: "explorer" as JsonTab, label: "Explorer" },
                    { id: "truncator" as JsonTab, label: "Truncator" },
                    { id: "plain" as JsonTab, label: "Plain JSON" },
                  ] as const
                ).map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => setJsonTab(id)}
                    className={`px-3 py-1.5 text-[11px] font-medium border-b-2 transition-colors ${
                      jsonTab === id
                        ? "border-blue-500 text-blue-400 bg-white/5"
                        : "border-transparent text-neutral-500 hover:text-neutral-300 hover:bg-white/5"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  setViewMode("log-only");
                  setSelectedLine(null);
                }}
                className="shrink-0 p-1.5 mr-1 text-neutral-600 hover:text-white hover:bg-white/10 rounded transition-colors"
                title="Close panel"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* ── JSON panel body ── */}
            {jsonPanelData != null ? (
              <>
                {jsonTab === "explorer" && (
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <JsonTreeViewer data={jsonPanelData} />
                  </div>
                )}
                {jsonTab === "truncator" && (
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <JsonTruncator
                      initialValue={JSON.stringify(jsonPanelData, null, 2)}
                      tabbed
                      defaultTab="fields"
                      className="h-full"
                    />
                  </div>
                )}
                {jsonTab === "plain" && (
                  <pre className="flex-1 min-h-0 overflow-auto p-3 text-xs font-mono leading-5 text-neutral-300 whitespace-pre-wrap break-all">
                    {JSON.stringify(jsonPanelData, null, 2)}
                  </pre>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-neutral-600 text-xs gap-2">
                <PanelLeft className="h-8 w-8 opacity-30" />
                <span>Click a log line to inspect it here</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
