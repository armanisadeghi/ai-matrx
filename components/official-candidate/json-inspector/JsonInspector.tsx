"use client";

import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Braces,
  CheckCircle2,
  ChevronLeft,
  Compass,
  Copy,
  FilePen,
  ListTree,
  Minus,
  Plus,
  Scissors,
} from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  cleanJson,
  defaultJsonExpandDepth,
  formatJson,
  formatJsonAtExpandDepth,
  getJsonStructuralDepth,
} from "@/utils/json/json-cleaner-utility";
import { cn } from "@/lib/utils";

const PaneFallback = () => (
  <div className="p-2 text-xs text-muted-foreground">Loading…</div>
);

const RawJsonExplorer = dynamic(
  () => import("@/components/official/json-explorer/RawJsonExplorer"),
  { ssr: false, loading: () => <PaneFallback /> },
);

const JsonTreeViewer = dynamic(
  () =>
    import("@/components/official/json-explorer/JsonTreeViewer").then((m) => ({
      default: m.JsonTreeViewer,
    })),
  { ssr: false, loading: () => <PaneFallback /> },
);

const JsonTruncator = dynamic(
  () =>
    import("@/components/official-candidate/json-truncator/JsonTruncator").then(
      (m) => ({ default: m.JsonTruncator }),
    ),
  { ssr: false, loading: () => <PaneFallback /> },
);

const JsonEditorPane = dynamic(
  () => import("./JsonEditorPane").then((m) => ({ default: m.JsonEditorPane })),
  { ssr: false, loading: () => <PaneFallback /> },
);

export type JsonInspectorView =
  | "json"
  | "explorer"
  | "tree"
  | "truncator"
  | "edit";

/** Raw JSON tab expand depth: 0 = minified, max = fully pretty-printed. */
export type JsonRawExpandDepth = number;

export interface JsonInspectorProps {
  /** Any JSON-serializable value to inspect. */
  data: unknown;
  /** Optional label rendered to the left of the tabs (e.g. a slice/key name). */
  label?: React.ReactNode;
  /** When provided, renders a back chevron that calls this on click. */
  onBack?: () => void;
  /** Tooltip for the back chevron. */
  backLabel?: string;
  /** Initial view. Defaults to "json". */
  defaultView?: JsonInspectorView;
  /**
   * When provided, an additional "Edit" tab appears with a real JSON text
   * editor (CodeMirror 6 — JSON syntax, inline lint squigglies). The handler
   * is called with the parsed value on **blur** when the buffer holds valid
   * JSON. Local edits never propagate up keystroke-by-keystroke and never
   * cause re-renders that move the caret.
   */
  onUpdate?: (next: unknown) => void;
  /** When true (default), the edit tab is read-only. Ignored without onUpdate. */
  editorReadOnly?: boolean;
  /** Forwarded to the outer wrapper. */
  className?: string;
}

// Every interactive cell in the header is the same 20×20 square. Differences
// are limited to background/border (active tab, list border, etc.) so the
// buttons read as a single uniform row.
const CELL_CLS =
  "shrink-0 h-5 w-5 flex items-center justify-center rounded transition-colors";

const ICON_BUTTON_CLS = cn(
  CELL_CLS,
  "text-muted-foreground hover:text-foreground hover:bg-muted",
);

const TRIGGER_CLS = cn(
  CELL_CLS,
  "rounded-none border-r border-border last:border-r-0",
  "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
  "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none",
);

const ICON_CLS = "h-3.5 w-3.5";

const PANE_CLS =
  "flex-1 min-h-0 overflow-auto mt-0 border-none outline-none ring-0 bg-gray-50 dark:bg-zinc-900";

const JSON_PANE_CLS = cn(
  PANE_CLS,
  "overflow-hidden flex flex-col data-[state=active]:flex data-[state=active]:flex-col",
);

const RAW_DEPTH_BTN_CLS = cn(
  "inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] leading-none min-w-[1.35rem] transition-colors",
  "text-muted-foreground hover:text-foreground hover:bg-muted",
);

const RAW_DEPTH_BTN_ACTIVE_CLS = "bg-muted text-foreground font-medium";

const RAW_DEPTH_STEPPER_BTN_CLS = cn(
  CELL_CLS,
  "w-4 text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40",
);

const TRUNCATOR_PANE_CLS =
  "flex-1 min-h-0 overflow-hidden mt-0 border-none outline-none ring-0 data-[state=active]:flex data-[state=active]:flex-col";

const EDITOR_PANE_CLS =
  "flex-1 min-h-0 overflow-hidden mt-0 border-none outline-none ring-0 data-[state=active]:flex data-[state=active]:flex-col bg-white dark:bg-zinc-900";

export function JsonInspector({
  data,
  label,
  onBack,
  backLabel = "Back",
  defaultView = "json",
  onUpdate,
  editorReadOnly = false,
  className,
}: JsonInspectorProps) {
  const editable = typeof onUpdate === "function";
  const prettyJson = useMemo(() => formatJson(data, 2), [data]);
  const maxExpandDepth = useMemo(
    () => getJsonStructuralDepth(cleanJson(data)),
    [data],
  );
  const truncatorValue = useMemo(
    () => (typeof data === "string" ? data : JSON.stringify(data, null, 2)),
    [data],
  );

  // The local Tabs primitive force-mounts every TabsContent (preserves panel
  // state across switches). Track which views have been activated so the
  // dynamically-imported heavy panels only load on first visit, then stay
  // mounted afterwards.
  const [value, setValue] = useState<JsonInspectorView>(defaultView);
  const [seen, setSeen] = useState<Set<JsonInspectorView>>(
    () => new Set<JsonInspectorView>([defaultView]),
  );
  const [copied, setCopied] = useState(false);
  const [expandDepth, setExpandDepth] = useState(() =>
    defaultJsonExpandDepth(data),
  );

  useEffect(() => {
    setExpandDepth((current) => Math.min(current, maxExpandDepth));
  }, [maxExpandDepth]);

  const rawJsonText = useMemo(
    () => formatJsonAtExpandDepth(data, expandDepth),
    [data, expandDepth],
  );

  const depthLabel =
    expandDepth <= 0
      ? "Compact"
      : expandDepth >= maxExpandDepth
        ? "Full"
        : String(expandDepth);

  const showDepthToolbar = maxExpandDepth > 0;
  const showDepthStepper = maxExpandDepth > 5;
  const depthOptions = useMemo(
    () => Array.from({ length: maxExpandDepth + 1 }, (_, depth) => depth),
    [maxExpandDepth],
  );

  const handleValueChange = (next: string) => {
    const v = next as JsonInspectorView;
    setValue(v);
    setSeen((prev) => {
      if (prev.has(v)) return prev;
      const updated = new Set(prev);
      updated.add(v);
      return updated;
    });
  };

  const handleCopy = async () => {
    const text = value === "json" ? rawJsonText : prettyJson;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Failed to copy JSON:", err);
    }
  };

  return (
    <div
      className={cn(
        "h-full flex flex-col bg-white dark:bg-zinc-800 rounded-lg overflow-hidden min-h-0",
        className,
      )}
    >
      <Tabs
        value={value}
        onValueChange={handleValueChange}
        className="flex-1 flex flex-col min-h-0 overflow-hidden"
      >
        <div className="flex items-center gap-1.5 px-1.5 py-1 border-b border-border flex-shrink-0">
          {onBack && (
            <button
              onClick={onBack}
              className={ICON_BUTTON_CLS}
              title={backLabel}
              aria-label={backLabel}
            >
              <ChevronLeft className={ICON_CLS} />
            </button>
          )}
          {label !== undefined && label !== null && label !== "" && (
            <h2 className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate shrink-0">
              {label}
            </h2>
          )}
          <TabsList className="h-auto shrink-0 gap-0 rounded border border-border bg-transparent p-0 overflow-hidden">
            <TabsTrigger
              className={TRIGGER_CLS}
              value="json"
              title="Formatted JSON"
              aria-label="Formatted JSON"
            >
              <Braces className={ICON_CLS} />
            </TabsTrigger>
            <TabsTrigger
              className={TRIGGER_CLS}
              value="explorer"
              title="Path Explorer"
              aria-label="Path Explorer"
            >
              <Compass className={ICON_CLS} />
            </TabsTrigger>
            <TabsTrigger
              className={TRIGGER_CLS}
              value="tree"
              title="Tree Viewer"
              aria-label="Tree Viewer"
            >
              <ListTree className={ICON_CLS} />
            </TabsTrigger>
            <TabsTrigger
              className={TRIGGER_CLS}
              value="truncator"
              title="Truncator"
              aria-label="Truncator"
            >
              <Scissors className={ICON_CLS} />
            </TabsTrigger>
            {editable && (
              <TabsTrigger
                className={TRIGGER_CLS}
                value="edit"
                title="Edit JSON"
                aria-label="Edit JSON"
              >
                <FilePen className={ICON_CLS} />
              </TabsTrigger>
            )}
          </TabsList>
          <div className="flex-1" />
          <button
            onClick={handleCopy}
            className={ICON_BUTTON_CLS}
            title={copied ? "Copied" : "Copy JSON"}
            aria-label="Copy JSON"
          >
            {copied ? (
              <CheckCircle2 className={cn(ICON_CLS, "text-green-500")} />
            ) : (
              <Copy className={ICON_CLS} />
            )}
          </button>
        </div>

        <TabsContent value="json" className={JSON_PANE_CLS}>
          {showDepthToolbar && (
            <div className="flex items-center gap-0.5 px-1.5 py-0.5 border-b border-border flex-shrink-0 bg-white dark:bg-zinc-800">
              {showDepthStepper ? (
                <>
                  <button
                    type="button"
                    onClick={() => setExpandDepth(0)}
                    className={cn(
                      RAW_DEPTH_BTN_CLS,
                      expandDepth === 0 && RAW_DEPTH_BTN_ACTIVE_CLS,
                    )}
                    title="Compact — single line"
                    aria-label="Compact JSON"
                    aria-pressed={expandDepth === 0}
                  >
                    Compact
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandDepth((depth) => Math.max(0, depth - 1))
                    }
                    disabled={expandDepth <= 0}
                    className={RAW_DEPTH_STEPPER_BTN_CLS}
                    title="Collapse one level"
                    aria-label="Collapse one level"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span
                    className="px-1 text-[10px] tabular-nums text-muted-foreground"
                    title={`Expand depth ${expandDepth} of ${maxExpandDepth}`}
                  >
                    {depthLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandDepth((depth) =>
                        Math.min(maxExpandDepth, depth + 1),
                      )
                    }
                    disabled={expandDepth >= maxExpandDepth}
                    className={RAW_DEPTH_STEPPER_BTN_CLS}
                    title="Expand one level"
                    aria-label="Expand one level"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpandDepth(maxExpandDepth)}
                    className={cn(
                      RAW_DEPTH_BTN_CLS,
                      expandDepth >= maxExpandDepth && RAW_DEPTH_BTN_ACTIVE_CLS,
                    )}
                    title="Full — expand every level"
                    aria-label="Full JSON"
                    aria-pressed={expandDepth >= maxExpandDepth}
                  >
                    Full
                  </button>
                </>
              ) : (
                depthOptions.map((depth) => {
                  const label =
                    depth === 0
                      ? "Compact"
                      : depth === maxExpandDepth
                        ? "Full"
                        : String(depth);
                  return (
                    <button
                      key={depth}
                      type="button"
                      onClick={() => setExpandDepth(depth)}
                      className={cn(
                        RAW_DEPTH_BTN_CLS,
                        expandDepth === depth && RAW_DEPTH_BTN_ACTIVE_CLS,
                      )}
                      title={
                        depth === 0
                          ? "Compact — single line"
                          : depth === maxExpandDepth
                            ? "Full — expand every level"
                            : `Expand ${depth} level${depth === 1 ? "" : "s"}`
                      }
                      aria-label={`JSON depth ${label}`}
                      aria-pressed={expandDepth === depth}
                    >
                      {label}
                    </button>
                  );
                })
              )}
            </div>
          )}
          <pre
            className={cn(
              "flex-1 min-h-0 overflow-auto p-2 text-xs text-gray-800 dark:text-gray-300",
              expandDepth <= 0
                ? "whitespace-pre"
                : "whitespace-pre-wrap break-words",
            )}
          >
            {rawJsonText}
          </pre>
        </TabsContent>

        <TabsContent value="explorer" className={PANE_CLS}>
          {seen.has("explorer") ? (
            <RawJsonExplorer pageData={data} />
          ) : (
            <PaneFallback />
          )}
        </TabsContent>

        <TabsContent value="tree" className={PANE_CLS}>
          {seen.has("tree") ? <JsonTreeViewer data={data} /> : <PaneFallback />}
        </TabsContent>

        <TabsContent value="truncator" className={TRUNCATOR_PANE_CLS}>
          {seen.has("truncator") ? (
            <JsonTruncator
              initialValue={truncatorValue}
              tabbed
              defaultTab="fields"
              className="flex-1 min-h-0"
              allowLayoutToggle
            />
          ) : (
            <PaneFallback />
          )}
        </TabsContent>

        {editable && (
          <TabsContent value="edit" className={EDITOR_PANE_CLS}>
            {seen.has("edit") ? (
              <JsonEditorPane
                value={data}
                onUpdate={onUpdate}
                readOnly={editorReadOnly}
              />
            ) : (
              <PaneFallback />
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

export default JsonInspector;
