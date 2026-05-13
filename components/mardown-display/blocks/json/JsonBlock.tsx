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

  // Fallback: streaming or unparseable → original CodeBlock with no extras.
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

  const viewToggle = (
    <ViewToggle
      mode={mode}
      onChange={setMode}
      tabularAvailable={tabular.isTabular}
    />
  );

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
            extraMenuItems={jsonMenuItems}
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
            menuItems={jsonMenuItems}
            caption={mode === "table" ? tabularCaption || "" : ""}
            content={content}
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
