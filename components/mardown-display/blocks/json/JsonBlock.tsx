"use client";

import React, { lazy, Suspense, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Braces,
  FileSpreadsheet,
  FileText,
  ListTree,
  Code2,
  Compass,
  Database,
  FileJson,
  StretchHorizontal,
  ChevronDown,
  Plus,
  TableProperties,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/styles/themes/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  parseJsonSafe,
  detectTabular,
  rowsToCsv,
  rowsToNdjson,
  rowsToXlsx,
  downloadText,
  defaultJsonFilename,
} from "@/components/mardown-display/blocks/json/json-tabular-utils";
import type { CodeBlockDownloadOption } from "@/features/code-editor/components/code-block/CodeBlockHeader";

// Lazy-loaded — these are heavy and most JSON blocks never reach beyond
// the default Code view.
const CodeBlock = lazy(
  () => import("@/features/code-editor/components/code-block/CodeBlock"),
);
const JsonTableView = dynamic(
  () => import("@/components/mardown-display/blocks/json/JsonTableView"),
  { ssr: false, loading: () => <PaneFallback label="Loading table…" /> },
);
const JsonTreeViewer = dynamic(
  () =>
    import("@/components/official/json-explorer/JsonTreeViewer").then((m) => ({
      default: m.JsonTreeViewer,
    })),
  { ssr: false, loading: () => <PaneFallback label="Loading tree…" /> },
);
const RawJsonExplorer = dynamic(
  () => import("@/components/official/json-explorer/RawJsonExplorer"),
  { ssr: false, loading: () => <PaneFallback label="Loading explorer…" /> },
);
const JsonToTableDialog = dynamic(
  () =>
    import("@/components/mardown-display/blocks/json/JsonToTableDialog").then(
      (m) => ({ default: m.JsonToTableDialog }),
    ),
  { ssr: false, loading: () => null },
);
const AppendToTableDialog = dynamic(
  () =>
    import("@/components/mardown-display/blocks/json/AppendToTableDialog").then(
      (m) => ({ default: m.AppendToTableDialog }),
    ),
  { ssr: false, loading: () => null },
);

function PaneFallback({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="p-4 text-xs text-muted-foreground italic">{label}</div>
  );
}

type ViewMode = "code" | "tree" | "table" | "explorer";

interface JsonBlockProps {
  content: string;
  className?: string;
  isStreamActive?: boolean;
  allowEdit?: boolean;
  customBuiltinKeys?: string[];
  onCodeChange?: (newCode: string) => void;
}

/**
 * JSON-aware wrapper around CodeBlock. Default view is the standard code
 * editor (zero regression); a small view-mode toggle in the header lets
 * the user switch to Tree, Table (when tabular), or Path Explorer. The
 * download button becomes a multi-format menu (.json, .ndjson, .csv, .xlsx).
 *
 * If JSON parsing fails or the content is mid-stream, falls back to a
 * plain CodeBlock with no view toggle — the user keeps the original
 * experience, just without the extras.
 */
export const JsonBlock: React.FC<JsonBlockProps> = ({
  content,
  className,
  isStreamActive = false,
  allowEdit = true,
  customBuiltinKeys = [],
  onCodeChange,
}) => {
  const [mode, setMode] = useState<ViewMode>("code");
  const [saveNewOpen, setSaveNewOpen] = useState(false);
  const [appendOpen, setAppendOpen] = useState(false);

  // One-shot parse + tabular detection per content change. Skipped during
  // streaming since the content is by definition incomplete.
  const parsed = useMemo(() => {
    if (isStreamActive) return { ok: false as const };
    return parseJsonSafe(content);
  }, [content, isStreamActive]);

  const tabular = useMemo(() => {
    if (!parsed.ok) {
      return {
        isTabular: false,
        rows: [] as Record<string, unknown>[],
        columns: [] as string[],
        source: "none" as const,
      };
    }
    return detectTabular(parsed.value);
  }, [parsed]);

  // Download options must be computed unconditionally — otherwise React's
  // hook ordering would change when the parse result flips. When parse
  // fails, the array is empty and never gets passed downstream.
  const downloadOptions: CodeBlockDownloadOption[] = useMemo(() => {
    if (!parsed.ok) return [];
    const data = parsed.value;
    const opts: CodeBlockDownloadOption[] = [];
    const base = defaultJsonFilename();
    if (Array.isArray(data)) {
      opts.push({
        label: "Download as NDJSON",
        icon: FileText,
        description: "One object per line",
        onClick: () =>
          downloadText(
            `${base}.ndjson`,
            rowsToNdjson(data as unknown[]),
            "application/x-ndjson",
          ),
      });
    }
    if (tabular.isTabular) {
      opts.push({
        label: "Download as CSV",
        icon: FileSpreadsheet,
        description: `${tabular.rows.length} rows × ${tabular.columns.length} cols`,
        onClick: () =>
          downloadText(
            `${base}.csv`,
            rowsToCsv(tabular.rows, tabular.columns),
            "text/csv",
          ),
      });
      opts.push({
        label: "Download as Excel (.xlsx)",
        icon: FileSpreadsheet,
        description: "Best for spreadsheets",
        onClick: () => {
          void rowsToXlsx(tabular.rows, tabular.columns, `${base}.xlsx`);
        },
      });
    }
    return opts;
  }, [parsed, tabular]);

  const suggestedTableName = useMemo(() => {
    if (!tabular.isTabular) return "";
    if (tabular.source === "wrapped-array" && tabular.wrapperKey) {
      return tabular.wrapperKey
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
    return "JSON Data";
  }, [tabular]);

  // Fallback path: streaming or unparseable → original CodeBlock with no extras.
  if (!parsed.ok) {
    return (
      <Suspense fallback={<PaneFallback label="Loading code…" />}>
        <CodeBlock
          code={content}
          language="json"
          className={className}
          isStreamActive={isStreamActive}
          allowEdit={allowEdit}
          customBuiltinKeys={customBuiltinKeys}
          onCodeChange={onCodeChange}
        />
      </Suspense>
    );
  }

  const data = parsed.value;

  // View-mode toggle injected into the CodeBlock header (Code mode) or
  // rendered standalone (other modes). One source of truth so the user can
  // round-trip between modes without losing position.
  const viewToggle = (
    <ViewToggle
      mode={mode}
      onChange={setMode}
      tabularAvailable={tabular.isTabular}
    />
  );

  // Save-to-table actions are offered whenever the JSON looks tabular.
  // The dropdown collapses two related actions (new vs. append) into a
  // single header button so the toolbar stays compact.
  const saveButton = tabular.isTabular ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
          onClick={(e) => e.stopPropagation()}
        >
          <Database className="h-3.5 w-3.5 mr-1" />
          <span className="text-xs">Save to Table</span>
          <ChevronDown className="h-3 w-3 ml-1 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[9999] w-64">
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            setSaveNewOpen(true);
          }}
          className="flex items-start gap-2 cursor-pointer"
        >
          <Plus className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="flex flex-col">
            <span>Save as new table…</span>
            <span className="text-[10px] text-muted-foreground">
              Create a fresh data table from these rows
            </span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            setAppendOpen(true);
          }}
          className="flex items-start gap-2 cursor-pointer"
        >
          <TableProperties className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="flex flex-col">
            <span>Append to existing table…</span>
            <span className="text-[10px] text-muted-foreground">
              Map columns and insert rows into one of your tables
            </span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  const tabularCaption =
    tabular.isTabular &&
    `${tabular.rows.length} row${tabular.rows.length === 1 ? "" : "s"} × ${tabular.columns.length} col${tabular.columns.length === 1 ? "" : "s"}`;

  return (
    <>
      {mode === "code" ? (
        <Suspense fallback={<PaneFallback label="Loading code…" />}>
          <CodeBlock
            code={content}
            language="json"
            className={className}
            isStreamActive={isStreamActive}
            allowEdit={allowEdit}
            customBuiltinKeys={customBuiltinKeys}
            onCodeChange={onCodeChange}
            headerLeftSlot={viewToggle}
            headerActionsSlot={saveButton}
            downloadOptions={downloadOptions}
          />
        </Suspense>
      ) : (
        <div
          className={cn(
            "w-full my-4 rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-700 bg-background",
            className,
          )}
        >
          <JsonViewHeader
            mode={mode}
            toggle={viewToggle}
            saveButton={saveButton}
            downloadOptions={downloadOptions}
            caption={mode === "table" ? tabularCaption || "" : ""}
          />
          <div className="bg-card">
            {mode === "tree" && (
              <div className="max-h-[600px] overflow-auto">
                <JsonTreeViewer data={data} />
              </div>
            )}
            {mode === "table" && tabular.isTabular && (
              <JsonTableView
                rows={tabular.rows}
                columns={tabular.columns}
                caption={tabularCaption}
              />
            )}
            {mode === "explorer" && (
              <div className="max-h-[600px] overflow-auto">
                <RawJsonExplorer pageData={data} />
              </div>
            )}
          </div>
        </div>
      )}
      {saveNewOpen && tabular.isTabular && (
        <JsonToTableDialog
          open={saveNewOpen}
          onOpenChange={setSaveNewOpen}
          rows={tabular.rows}
          columns={tabular.columns}
          suggestedName={suggestedTableName}
        />
      )}
      {appendOpen && tabular.isTabular && (
        <AppendToTableDialog
          open={appendOpen}
          onOpenChange={setAppendOpen}
          rows={tabular.rows}
          columns={tabular.columns}
        />
      )}
    </>
  );
};

interface ViewToggleProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
  tabularAvailable: boolean;
}

// Compact on mobile (icon only), label visible from `sm:` upward.
const VIEW_BUTTON =
  "h-6 px-1.5 sm:px-2 flex items-center gap-1 rounded text-xs font-medium transition-colors";

const ViewToggle: React.FC<ViewToggleProps> = ({
  mode,
  onChange,
  tabularAvailable,
}) => {
  const items: Array<{
    id: ViewMode;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    disabled?: boolean;
    tooltip?: string;
  }> = [
    { id: "code", label: "Code", icon: Code2 },
    { id: "tree", label: "Tree", icon: ListTree },
    {
      id: "table",
      label: "Table",
      icon: StretchHorizontal,
      disabled: !tabularAvailable,
      tooltip: tabularAvailable
        ? "View as a table"
        : "Table view available when JSON is an array of objects",
    },
    { id: "explorer", label: "Path", icon: Compass },
  ];

  return (
    <TooltipProvider>
      <div className="flex items-center gap-0.5 rounded-md border border-border/50 bg-background/50 p-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          const active = mode === item.id;
          const button = (
            <button
              key={item.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (!item.disabled) onChange(item.id);
              }}
              disabled={item.disabled}
              className={cn(
                VIEW_BUTTON,
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted",
                item.disabled && "opacity-40 cursor-not-allowed",
              )}
            >
              <Icon className="h-3 w-3" />
              <span className="hidden sm:inline">{item.label}</span>
            </button>
          );
          if (!item.tooltip) return button;
          return (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>{button}</TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {item.tooltip}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
};

interface JsonViewHeaderProps {
  mode: ViewMode;
  toggle: React.ReactNode;
  saveButton: React.ReactNode;
  downloadOptions: CodeBlockDownloadOption[];
  caption: string;
}

const JsonViewHeader: React.FC<JsonViewHeaderProps> = ({
  mode,
  toggle,
  saveButton,
  downloadOptions,
  caption,
}) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-zinc-300 dark:bg-zinc-700 text-xs text-gray-700 dark:text-gray-300">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-1.5 shrink-0">
          <FileJson className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
          <span className="font-mono text-[11px] font-semibold uppercase tracking-wide">
            JSON
          </span>
        </div>
        {toggle}
        {caption && (
          <span className="text-[11px] text-muted-foreground truncate">
            {caption}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        {saveButton}
        {downloadOptions.length > 0 && (
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setOpen((v) => !v)}
            >
              <Braces className="h-3.5 w-3.5 mr-1" />
              Export
            </Button>
            {open && (
              <>
                <div
                  className="fixed inset-0 z-[9998]"
                  onClick={() => setOpen(false)}
                />
                <div className="absolute right-0 top-full mt-1 z-[9999] min-w-[14rem] rounded-md border border-border bg-popover shadow-lg p-1">
                  {downloadOptions.map((opt, idx) => {
                    const Icon = opt.icon;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          opt.onClick();
                          setOpen(false);
                        }}
                        className="w-full flex items-start gap-2 px-2 py-1.5 rounded-sm text-left hover:bg-accent text-xs"
                      >
                        <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <div className="flex flex-col">
                          <span>{opt.label}</span>
                          {opt.description && (
                            <span className="text-[10px] text-muted-foreground">
                              {opt.description}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default JsonBlock;
