"use client";

import React, { lazy, Suspense, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Copy,
  FileSpreadsheet,
  FileText,
  ListTree,
  Code2,
  Compass,
  FileJson,
  StretchHorizontal,
  Plus,
  TableProperties,
  MoreHorizontal,
  AlignJustify,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/styles/themes/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import IconButton from "@/components/official/IconButton";
import AdvancedMenu, {
  type MenuItem,
} from "@/components/official/AdvancedMenu";
import { useAdvancedMenu } from "@/hooks/use-advanced-menu";
import {
  parseJsonSafe,
  detectTabular,
  rowsToCsv,
  rowsToNdjson,
  rowsToXlsx,
  downloadText,
  defaultJsonFilename,
} from "@/components/mardown-display/blocks/json/json-tabular-utils";
import { stringifyCompact } from "@/components/mardown-display/blocks/json/json-compact-stringify";

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
 * the user switch to Tree, Table (when tabular), or Path Explorer.
 *
 * JSON-specific extras (save-to-table, NDJSON/CSV/XLSX downloads) feed
 * through CodeBlock's unified kebab menu via `extraMenuItems`. Non-code
 * views render their own header using the same AdvancedMenu pattern.
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
  // Local override for the displayed/edited text when the parent has not
  // wired up `onCodeChange`. When the parent IS wired up, reformat actions
  // call `onCodeChange` directly so the change persists wherever the block
  // is consumed — and this override stays null.
  const [formatOverride, setFormatOverride] = useState<string | null>(null);

  // The text we actually show / pass through to CodeBlock. Local override
  // takes precedence; otherwise we use whatever the parent gave us. As
  // soon as the parent's `content` changes (e.g. external edit / new
  // payload), the override is dropped on the next render below.
  const effectiveContent = formatOverride ?? content;

  // Clear the local override whenever the parent ships fresh content so
  // we don't show stale reformatted text on top of a real update.
  const lastSeenContentRef = useRef(content);
  if (lastSeenContentRef.current !== content) {
    lastSeenContentRef.current = content;
    if (formatOverride !== null) setFormatOverride(null);
  }

  // One-shot parse + tabular detection per content change. Skipped during
  // streaming since the content is by definition incomplete.
  const parsed = useMemo(() => {
    if (isStreamActive) return { ok: false as const };
    return parseJsonSafe(effectiveContent);
  }, [effectiveContent, isStreamActive]);

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

  // Build the JSON-specific menu items. Computed unconditionally so hook
  // ordering stays stable when the parse result flips.
  const jsonMenuItems: MenuItem[] = useMemo(() => {
    if (!parsed.ok) return [];
    const data = parsed.value;
    const items: MenuItem[] = [];
    const base = defaultJsonFilename();

    if (tabular.isTabular) {
      items.push({
        key: "save-new-table",
        icon: Plus,
        iconColor: "text-emerald-600 dark:text-emerald-400",
        label: "Save as new table…",
        description: "Create a fresh data table from these rows",
        category: "Data",
        showToast: false,
        action: () => setSaveNewOpen(true),
      });
      items.push({
        key: "append-table",
        icon: TableProperties,
        iconColor: "text-emerald-600 dark:text-emerald-400",
        label: "Append to existing table…",
        description: "Map columns and insert into one of your tables",
        category: "Data",
        showToast: false,
        action: () => setAppendOpen(true),
      });
    }

    if (Array.isArray(data)) {
      items.push({
        key: "download-ndjson",
        icon: FileText,
        label: "Download as NDJSON",
        description: "One object per line",
        category: "Download",
        showToast: false,
        action: () =>
          downloadText(
            `${base}.ndjson`,
            rowsToNdjson(data as unknown[]),
            "application/x-ndjson",
          ),
      });
    }

    if (tabular.isTabular) {
      items.push({
        key: "download-csv",
        icon: FileSpreadsheet,
        label: "Download as CSV",
        description: `${tabular.rows.length} rows × ${tabular.columns.length} cols`,
        category: "Download",
        showToast: false,
        action: () =>
          downloadText(
            `${base}.csv`,
            rowsToCsv(tabular.rows, tabular.columns),
            "text/csv",
          ),
      });
      items.push({
        key: "download-xlsx",
        icon: FileSpreadsheet,
        label: "Download as Excel (.xlsx)",
        description: "Best for spreadsheets",
        category: "Download",
        showToast: false,
        action: () => {
          void rowsToXlsx(tabular.rows, tabular.columns, `${base}.xlsx`);
        },
      });
    }

    return items;
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

  // Canonical formattings of the current parsed value. `null` when the
  // payload is unparseable (streaming / invalid) — the early-return below
  // handles that case, but we still need the hooks unconditionally so the
  // hook order stays stable.
  const compactForm = useMemo(() => {
    if (!parsed.ok) return null;
    try {
      return stringifyCompact(parsed.value, { maxWidth: 100, indent: 2 });
    } catch {
      return null;
    }
  }, [parsed]);
  const expandedForm = useMemo(() => {
    if (!parsed.ok) return null;
    try {
      return JSON.stringify(parsed.value, null, 2);
    } catch {
      return null;
    }
  }, [parsed]);

  const isCompactFormatted =
    compactForm !== null && effectiveContent.trim() === compactForm.trim();

  // Apply a new formatting. Persists upstream via `onCodeChange` when the
  // parent has wired it up; otherwise updates the local override so the
  // toggle still works for read-only consumers.
  const applyFormat = (next: string) => {
    if (next === effectiveContent) return;
    if (onCodeChange) {
      if (formatOverride !== null) setFormatOverride(null);
      onCodeChange(next);
    } else {
      setFormatOverride(next);
    }
  };

  const formatMenuItems: MenuItem[] = useMemo(() => {
    const items: MenuItem[] = [];
    if (compactForm) {
      items.push({
        key: "format-compact",
        icon: AlignJustify,
        iconColor: "text-sky-600 dark:text-sky-400",
        label: "Compact formatting",
        description:
          "Inline leaf objects and arrays that fit on one line. Updates the JSON text.",
        category: "Format",
        showToast: false,
        disabled: isCompactFormatted,
        action: () => applyFormat(compactForm),
      });
    }
    if (expandedForm) {
      items.push({
        key: "format-expanded",
        icon: Code2,
        iconColor: "text-sky-600 dark:text-sky-400",
        label: "Standard formatting",
        description: "Two-space pretty-print. Updates the JSON text.",
        category: "Format",
        showToast: false,
        disabled:
          !isCompactFormatted &&
          effectiveContent.trim() === expandedForm.trim(),
        action: () => applyFormat(expandedForm),
      });
    }
    return items;
    // applyFormat closes over the latest values via the deps above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compactForm, expandedForm, isCompactFormatted, effectiveContent]);

  const fullMenuItems = useMemo(
    () => [...formatMenuItems, ...jsonMenuItems],
    [formatMenuItems, jsonMenuItems],
  );

  // Fallback: streaming or unparseable → original CodeBlock with no extras.
  if (!parsed.ok) {
    return (
      <div
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
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
      </div>
    );
  }

  const data = parsed.value;

  const toggleFormat = () => {
    if (isCompactFormatted) {
      if (expandedForm) applyFormat(expandedForm);
    } else {
      if (compactForm) applyFormat(compactForm);
    }
  };

  const viewToggle = (
    <div className="flex items-center gap-1">
      <ViewToggle
        mode={mode}
        onChange={setMode}
        tabularAvailable={tabular.isTabular}
      />
      {mode === "code" && compactForm && expandedForm && (
        <FormatToggleButton
          isCompact={isCompactFormatted}
          onToggle={toggleFormat}
        />
      )}
    </div>
  );

  const tabularCaption =
    tabular.isTabular &&
    `${tabular.rows.length} row${tabular.rows.length === 1 ? "" : "s"} × ${tabular.columns.length} col${tabular.columns.length === 1 ? "" : "s"}`;

  // Stop click / mousedown propagation at the block root so interactions
  // inside the JSON UI (view toggle, format toggle, kebab, editor focus)
  // don't bubble up to parents that treat a click on their content as
  // "switch to edit mode" (e.g. agent-builder preview surfaces). The JSON
  // block is its own self-contained interactive surface — child clicks
  // belong to it, not to a wrapping container's onClick.
  const stopBubble = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      onClick={stopBubble}
      onMouseDown={stopBubble}
      onMouseUp={stopBubble}
      onDoubleClick={stopBubble}
    >
      {mode === "code" ? (
        <Suspense fallback={<PaneFallback label="Loading code…" />}>
          <CodeBlock
            code={effectiveContent}
            language="json"
            className={className}
            isStreamActive={isStreamActive}
            allowEdit={allowEdit}
            customBuiltinKeys={customBuiltinKeys}
            onCodeChange={
              onCodeChange
                ? (next) => {
                    if (formatOverride !== null) setFormatOverride(null);
                    onCodeChange(next);
                  }
                : (next) => setFormatOverride(next)
            }
            headerLeftSlot={viewToggle}
            extraMenuItems={fullMenuItems}
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
            toggle={viewToggle}
            menuItems={fullMenuItems}
            caption={mode === "table" ? tabularCaption || "" : ""}
            content={effectiveContent}
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
    </div>
  );
};

interface FormatToggleButtonProps {
  isCompact: boolean;
  onToggle: () => void;
}

/**
 * Tiny one-shot button that flips the underlying JSON text between
 * standard 2-space pretty-print and the compact (horizontal-where-it-fits)
 * formatting. Lives next to the view-mode toggle when in Code view.
 *
 * This is an EDIT, not a view change: the new text flows through
 * `onCodeChange` to the parent (or to local state for read-only blocks),
 * so wherever the JSON is persisted, the persisted text reflects the
 * chosen formatting.
 */
const FormatToggleButton: React.FC<FormatToggleButtonProps> = ({
  isCompact,
  onToggle,
}) => {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            aria-label={isCompact ? "Expand JSON" : "Compact JSON"}
            className={cn(
              "h-6 w-6 flex items-center justify-center rounded transition-colors",
              "text-muted-foreground hover:text-foreground hover:bg-muted",
              "border border-border/50 bg-background/50",
            )}
          >
            <AlignJustify className="h-3 w-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {isCompact
            ? "Reformat to standard pretty-print (updates the text)"
            : "Reformat to compact (inlines leaf objects, updates the text)"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
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
  toggle: React.ReactNode;
  menuItems: MenuItem[];
  caption: string;
  content: string;
}

/**
 * Header for non-code JSON views (Tree / Table / Path). Mirrors the
 * 2-icon-plus-kebab pattern used by `CodeBlock` so the experience is
 * consistent regardless of mode. Copy is always available; everything
 * else (downloads, save-to-table) lives in the kebab menu.
 */
const JsonViewHeader: React.FC<JsonViewHeaderProps> = ({
  toggle,
  menuItems,
  caption,
  content,
}) => {
  const menu = useAdvancedMenu();
  const kebabRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success("Copied JSON to clipboard");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Failed to copy");
    }
  };

  // Always-present copy entry, so the non-code view header has the same
  // affordances as the code-mode header (4 icons + kebab).
  const fullMenuItems: MenuItem[] = [
    {
      key: "copy-json",
      icon: Copy,
      label: "Copy JSON",
      category: "Copy",
      showToast: false,
      action: handleCopy,
    },
    ...menuItems,
  ];

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
      <div className="flex items-center gap-0.5">
        <IconButton
          icon={Copy}
          tooltip={copied ? "Copied!" : "Copy JSON"}
          size="sm"
          variant="ghost"
          onClick={handleCopy}
          tooltipSide="bottom"
        />
        <div ref={kebabRef} onClick={(e) => e.stopPropagation()}>
          <IconButton
            icon={MoreHorizontal}
            tooltip="More actions"
            size="sm"
            variant="ghost"
            tooltipSide="bottom"
            onClick={() => {
              if (kebabRef.current) menu.open(kebabRef.current);
            }}
          />
        </div>
        <AdvancedMenu
          {...menu.menuProps}
          anchorElement={menu.anchorElement}
          items={fullMenuItems}
          title="JSON actions"
          position="bottom-right"
          width="260px"
          maxWidth="300px"
        />
      </div>
    </div>
  );
};

export default JsonBlock;
