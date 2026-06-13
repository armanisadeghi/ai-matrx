"use client";

/**
 * MermaidWorkbench — the canvas editing surface for mermaid artifacts.
 *
 * One backbone, three views of the same diagram:
 *   Diagram (tap-to-edit) | Outline (structured rows) | Code (raw source)
 * plus undo/redo, render options, export, version history, and
 * session-versioned autosave. Structural modes are gated by the adapter
 * fidelity check; everything else works for every diagram type.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Code2,
  Download,
  History,
  ListTree,
  Loader2,
  Palette,
  Redo2,
  Shapes,
  MessageSquare,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectMermaidPreferences } from "@/lib/redux/preferences/userPreferenceSelectors";
import {
  canvasArtifactService,
  type CanvasArtifactRow,
} from "@/features/canvas/services/canvasArtifactService";
import { cn } from "@/lib/utils";

import { getCatalogEntry } from "../catalog";
import { extractMermaidTitle } from "../diagram-type";
import {
  copyMermaidSource,
  downloadMermaidPng,
  downloadMermaidSource,
  downloadMermaidSvg,
  saveMermaidToWorkspace,
} from "../export";
import { renderMermaid } from "../runtime";
import {
  resolveMermaidTheme,
  type MermaidArtifactMetadata,
  type MermaidLayout,
  type MermaidLook,
  type MermaidOptionPreferences,
  type MermaidThemePreference,
} from "../types";
import { createMermaidEditorScope } from "@/features/surfaces/manifests/mermaid-editor.manifest";
import { getFeaturedCatalogEntries } from "../catalog";
import { CodeModePane } from "../code/CodeModePane";
import { OutlineModePane } from "../outline/OutlineModePane";
import { VisualModePane } from "../visual/VisualModePane";
import { AgentEditRail } from "./AgentEditRail";
import { registerMermaidEditor } from "./editor-bridge";
import { useMermaidArtifactSave } from "./useMermaidArtifactSave";
import { useMermaidEditor, type WorkbenchMode } from "./useMermaidEditor";

const THEME_CHOICES: MermaidThemePreference[] = ["auto", "default", "dark", "forest", "neutral", "base"];
const LOOK_CHOICES: MermaidLook[] = ["classic", "handDrawn"];
const LAYOUT_CHOICES: MermaidLayout[] = ["dagre", "elk"];

export interface MermaidWorkbenchProps {
  source: string;
  metadata?: {
    title?: string | React.ReactNode;
    canvasItemId?: string;
    artifactVersion?: number;
    sourceMessageId?: string;
    conversationId?: string;
    mermaid?: Record<string, unknown>;
  };
}

export default function MermaidWorkbench({ source: initialSource, metadata }: MermaidWorkbenchProps) {
  const { state, dispatch } = useMermaidEditor(initialSource);
  const appMode = useAppSelector((s) => s.theme.mode);
  const userPrefs = useAppSelector(selectMermaidPreferences);

  const artifactMeta = (metadata?.mermaid ?? {}) as MermaidArtifactMetadata;
  const [options, setOptions] = useState<MermaidOptionPreferences>({
    theme: artifactMeta.theme ?? userPrefs.theme,
    look: artifactMeta.look ?? userPrefs.look,
    layout: artifactMeta.layout ?? userPrefs.layout,
  });
  const renderOptions = {
    theme: resolveMermaidTheme(options.theme, appMode),
    look: options.look,
    layout: options.layout,
  };

  const catalog = getCatalogEntry(state.diagramType);
  const TypeIcon = catalog.icon;
  const title =
    extractMermaidTitle(state.source) ??
    (typeof metadata?.title === "string" ? metadata.title : null) ??
    catalog.label;

  // ── Artifact identity: explicit id, or resolve via the source message ────
  const [canvasItemId, setCanvasItemId] = useState<string | undefined>(metadata?.canvasItemId);
  useEffect(() => {
    if (canvasItemId || !metadata?.sourceMessageId) return;
    let cancelled = false;
    canvasArtifactService.getByMessage(metadata.sourceMessageId).then((rows) => {
      if (cancelled) return;
      const mermaidRows = rows.filter((r) => r.type === "mermaid");
      const stored = (r: CanvasArtifactRow) =>
        typeof r.content === "object" && r.content ? (r.content as { data?: unknown }).data : null;
      const match =
        mermaidRows.find((r) => stored(r) === initialSource) ??
        (mermaidRows.length === 1 ? mermaidRows[0] : undefined);
      if (match) setCanvasItemId(match.id);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Session-versioned autosave ───────────────────────────────────────────
  const saveMetadata: MermaidArtifactMetadata = {
    diagramType: state.diagramType,
    title,
    theme: options.theme,
    look: options.look,
    layout: options.layout,
  };
  const { saveState, scheduleSave, flush, version } = useMermaidArtifactSave({
    canvasItemId,
    title,
    metadata: saveMetadata,
    conversationId: metadata?.conversationId,
  });

  const lastQueuedRef = useRef(state.source);
  useEffect(() => {
    if (state.source !== state.baselineSource && state.source !== lastQueuedRef.current) {
      lastQueuedRef.current = state.source;
      scheduleSave(state.source);
    }
  }, [state.source]);

  // Options changes persist with the next content save; nudge one if clean.
  const optionsKey = `${options.theme}|${options.look}|${options.layout}`;
  const lastOptionsRef = useRef(optionsKey);
  useEffect(() => {
    if (lastOptionsRef.current !== optionsKey) {
      lastOptionsRef.current = optionsKey;
      scheduleSave(state.source);
    }
  }, [optionsKey]);

  // ── Editor bridge (AI edits + context-menu collaborators) ───────────────
  const bridgeKey = canvasItemId ?? `draft:${metadata?.sourceMessageId ?? "new"}`;
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });
  useEffect(() => {
    return registerMermaidEditor(bridgeKey, {
      getSource: () => stateRef.current.source,
      applySource: (next) => dispatch({ type: "APPLY_EXTERNAL_SOURCE", source: next }),
    });
  }, [bridgeKey]);

  // ── Keyboard undo/redo (visual + outline; code mode uses CodeMirror's) ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (stateRef.current.mode === "code") return;
      const target = e.target as HTMLElement | null;
      if (target && /^(input|textarea|select)$/i.test(target.tagName)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "REDO" : "UNDO" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── AI edit rail ─────────────────────────────────────────────────────────
  const [aiOpen, setAiOpen] = useState(false);
  const buildScope = useCallback(() => {
    const s = stateRef.current;
    const diagnostics =
      s.outcome?.status === "invalid"
        ? s.outcome.diagnostics
        : s.outcome?.status === "ok"
          ? s.outcome.doc.warnings
          : [];
    return createMermaidEditorScope({
      diagram_source: s.source,
      diagram_type: s.diagramType,
      diagram_title: title,
      editor_mode: s.mode,
      validation_state:
        s.outcome?.status === "ok"
          ? "valid"
          : s.outcome?.status === "invalid"
            ? "invalid"
            : "unknown",
      validation_errors: diagnostics.map((d) => ({ line: d.line, message: d.message })),
      selected_node_text: selectedLabel(s),
      available_diagram_types: getFeaturedCatalogEntries().map((e) => e.type),
      canvas_item_id: canvasItemId,
      version: version ?? undefined,
      conversation_id: metadata?.conversationId,
    });
  }, [title, canvasItemId, version, metadata?.conversationId]);

  const structuralOk = state.outcome?.status === "ok";
  const doc = state.outcome?.status === "ok" ? state.outcome.doc : null;
  const codeOnlyReason =
    state.outcome?.status === "code-only"
      ? `This diagram uses advanced syntax — ${state.outcome.reason}. Edit it in Code, or ask AI to change it.`
      : !state.adapter
        ? `${catalog.label}s don't support structural editing yet. Edit in Code, or ask AI to change it.`
        : undefined;

  // ── Export: render fresh from current source (no DOM dependency) ────────
  const exportSvg = async (): Promise<string | null> => {
    try {
      const { svg } = await renderMermaid(state.source, renderOptions);
      return svg;
    } catch {
      toast.error("The diagram has errors — fix it before exporting an image");
      return null;
    }
  };

  // ── Version history ──────────────────────────────────────────────────────
  const [history, setHistory] = useState<CanvasArtifactRow[] | null>(null);
  const loadHistory = async () => {
    if (!canvasItemId) return;
    const rows = await canvasArtifactService.getVersionHistory(canvasItemId);
    setHistory(rows.sort((a, b) => b.version - a.version));
  };
  const restoreVersion = (row: CanvasArtifactRow) => {
    const stored =
      typeof row.content === "object" && row.content
        ? (row.content as { data?: unknown }).data
        : null;
    if (typeof stored !== "string" || !stored.trim()) {
      toast.error("That version has no readable content");
      return;
    }
    dispatch({ type: "APPLY_EXTERNAL_SOURCE", source: stored });
    toast.success(`Restored version ${row.version} — saving as a new version`);
  };

  const modeButton = (mode: WorkbenchMode, Icon: typeof Shapes, label: string, requiresStructural: boolean) => {
    const disabled = requiresStructural && !structuralOk;
    const button = (
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={() => dispatch({ type: "SET_MODE", mode })}
        className={cn(
          "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors sm:flex-none",
          state.mode === mode
            ? "bg-card text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
          disabled && "cursor-not-allowed opacity-40",
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </button>
    );
    if (!disabled) return button;
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-60 text-xs">
          {codeOnlyReason}
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex h-full min-h-0 flex-col bg-background">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-2 py-1.5">
          <div className="flex w-full items-center rounded-lg bg-muted p-0.5 sm:w-auto">
            {modeButton("visual", Shapes, "Diagram", true)}
            {modeButton("outline", ListTree, "Outline", true)}
            {modeButton("code", Code2, "Code", false)}
          </div>

          <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <TypeIcon className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="hidden truncate sm:inline">{catalog.label}</span>
            {version && version > 1 ? (
              <span className="rounded border border-border bg-muted px-1 py-px text-[10px]">v{version}</span>
            ) : null}
          </div>

          <div className="ml-auto flex items-center gap-0.5">
            <SaveIndicator state={saveState} onRetry={flush} />

            <button
              type="button"
              aria-label="Edit with AI"
              onClick={() => setAiOpen((v) => !v)}
              className={cn(
                "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors",
                aiOpen
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">AI</span>
            </button>

            <button
              type="button"
              aria-label="Undo"
              disabled={state.undoStack.length === 0}
              onClick={() => dispatch({ type: "UNDO" })}
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="Redo"
              disabled={state.redoStack.length === 0}
              onClick={() => dispatch({ type: "REDO" })}
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
            >
              <Redo2 className="h-3.5 w-3.5" />
            </button>

            {/* Render options */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Diagram style"
                  className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Palette className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel className="text-xs">Theme</DropdownMenuLabel>
                {THEME_CHOICES.map((theme) => (
                  <DropdownMenuItem key={theme} onClick={() => setOptions((o) => ({ ...o, theme }))}>
                    <span className="flex-1 capitalize">{theme}</span>
                    {options.theme === theme && <Check className="h-3.5 w-3.5" />}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs">Style</DropdownMenuLabel>
                {LOOK_CHOICES.map((look) => (
                  <DropdownMenuItem key={look} onClick={() => setOptions((o) => ({ ...o, look }))}>
                    <span className="flex-1">{look === "handDrawn" ? "Hand-drawn" : "Classic"}</span>
                    {options.look === look && <Check className="h-3.5 w-3.5" />}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs">Layout</DropdownMenuLabel>
                {LAYOUT_CHOICES.map((layout) => (
                  <DropdownMenuItem key={layout} onClick={() => setOptions((o) => ({ ...o, layout }))}>
                    <span className="flex-1 uppercase">{layout}</span>
                    {options.layout === layout && <Check className="h-3.5 w-3.5" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Export */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Export"
                  className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={async () => {
                    const svg = await exportSvg();
                    if (svg) downloadMermaidSvg(svg, title);
                  }}
                >
                  Download SVG
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    const svg = await exportSvg();
                    if (!svg) return;
                    try {
                      await downloadMermaidPng(svg, title);
                    } catch (err) {
                      console.error("[MermaidWorkbench] PNG export failed", err);
                      toast.error("PNG export failed");
                    }
                  }}
                >
                  Download PNG
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => downloadMermaidSource(state.source, title)}>
                  Download source (.mmd)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    await copyMermaidSource(state.source);
                    toast.success("Diagram source copied");
                  }}
                >
                  Copy source
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    const svg = await exportSvg();
                    if (!svg) return;
                    try {
                      await saveMermaidToWorkspace({ svg, source: state.source, title });
                      toast.success("Saved to your files (Diagrams folder)");
                    } catch (err) {
                      console.error("[MermaidWorkbench] save to files failed", err);
                      toast.error("Could not save to your files");
                    }
                  }}
                >
                  Save to my files
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Version history */}
            {canvasItemId && (
              <DropdownMenu onOpenChange={(open) => open && void loadHistory()}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Version history"
                    className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <History className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-72 w-56 overflow-y-auto">
                  <DropdownMenuLabel className="text-xs">Versions</DropdownMenuLabel>
                  {history === null ? (
                    <div className="flex justify-center py-3">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : history.length === 0 ? (
                    <p className="px-2 py-2 text-xs text-muted-foreground">No saved versions yet</p>
                  ) : (
                    history.map((row) => (
                      <DropdownMenuItem key={row.id} onClick={() => restoreVersion(row)}>
                        <span className="flex-1">Version {row.version}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {row.created_at ? new Date(row.created_at).toLocaleDateString() : ""}
                        </span>
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* Mode pane + optional AI rail (rail stacks below on mobile) */}
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <div className="min-h-0 flex-1">
            {state.mode === "visual" && (
              <VisualModePane
                source={state.source}
                options={renderOptions}
                doc={doc}
                selection={state.selection}
                dispatch={dispatch}
              />
            )}
            {state.mode === "outline" && (
              <OutlineModePane doc={doc} unavailableReason={codeOnlyReason} dispatch={dispatch} />
            )}
            {state.mode === "code" && (
              <CodeModePane source={state.source} options={renderOptions} dispatch={dispatch} />
            )}
          </div>
          {aiOpen && (
            <AgentEditRail
              source={state.source}
              buildScope={buildScope}
              onApply={(next) => dispatch({ type: "APPLY_EXTERNAL_SOURCE", source: next })}
              onClose={() => setAiOpen(false)}
            />
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

/** Label of the selected node/edge, for the AI scope's selected_node_text. */
function selectedLabel(state: {
  selection: { kind: "node" | "edge"; id: string } | null;
  outcome: { status: string } | null;
}): string | undefined {
  const sel = state.selection;
  if (!sel || state.outcome?.status !== "ok") return undefined;
  const doc = (state.outcome as { doc?: unknown }).doc as
    | { nodes?: Array<{ id: string; label: string }>; edges?: Array<{ id: string; label?: string }> }
    | undefined;
  if (!doc) return undefined;
  if (sel.kind === "node") return doc.nodes?.find((n) => n.id === sel.id)?.label;
  return doc.edges?.find((e) => e.id === sel.id)?.label;
}

function SaveIndicator({ state, onRetry }: { state: string; onRetry: () => void }) {
  if (state === "saving") {
    return (
      <span className="flex items-center gap-1 px-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Saving
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="flex items-center gap-1 px-1.5 text-xs text-muted-foreground">
        <Check className="h-3 w-3" />
        Saved
      </span>
    );
  }
  if (state === "error") {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-1 rounded px-1.5 text-xs text-destructive hover:bg-destructive/10"
      >
        <TriangleAlert className="h-3 w-3" />
        Retry save
      </button>
    );
  }
  if (state === "dirty") {
    return <span className="px-1.5 text-xs text-muted-foreground">Unsaved</span>;
  }
  return null;
}
