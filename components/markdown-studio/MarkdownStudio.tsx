// components/markdown-studio/MarkdownStudio.tsx
// The user-facing Markdown Studio playground. Two top-level modes —
// Studio (live editor + preview) and Analysis (parser drift report) —
// share a single content buffer so switching between them never loses
// the user's work. Loading a sample syncs the textarea + flags that
// sample as the "loaded" baseline; subsequent edits keep the baseline
// link but mark the buffer as dirty.

"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Bookmark,
  Eye,
  FlaskConical,
  GitCompare,
  Loader2,
  Save,
  SaveAll,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { detectRenderBlocks } from "@/components/admin/markdown-tester/utils/detect-render-blocks";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { useMarkdownAutosave } from "@/components/admin/markdown-tester/useMarkdownAutosave";
import { EditorPanel } from "./EditorPanel";
import { PreviewPanel } from "./PreviewPanel";
import { AnalysisView } from "./AnalysisView";
import { SampleLibrarySheet } from "./SampleLibrarySheet";
import { TemplatesPalette } from "./TemplatesPalette";
import { useUserMarkdownSamples } from "./useUserMarkdownSamples";
import type { UserMarkdownSample } from "./user-samples-service";
import type { StudioTemplate } from "./templates";

type StudioMode = "studio" | "analysis";

const EMPTY = "";

export function MarkdownStudio() {
  const [content, setContent] = useState(EMPTY);
  const [mode, setMode] = useState<StudioMode>("studio");
  const [loadedSampleId, setLoadedSampleId] = useState<string | null>(null);
  const [loadedSampleName, setLoadedSampleName] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saveDialog, setSaveDialog] = useState<{
    open: boolean;
    intent: "save" | "fork";
  }>({ open: false, intent: "save" });
  const [saving, setSaving] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);

  const { create, update, samples } = useUserMarkdownSamples();
  const { loadAutosave } = useMarkdownAutosave(content);
  const loadedSample = useMemo(
    () => samples.find((s) => s.id === loadedSampleId) ?? null,
    [loadedSampleId, samples],
  );

  // Restore autosave on first mount.
  useEffect(() => {
    loadAutosave().then((saved) => {
      if (saved) {
        setContent(saved);
      }
    });
  }, [loadAutosave]);

  // Track dirty when content diverges from the loaded sample.
  useEffect(() => {
    if (!loadedSample) {
      setIsDirty(content.length > 0);
      return;
    }
    setIsDirty(content !== loadedSample.content);
  }, [content, loadedSample]);

  const handleChange = useCallback((value: string) => {
    setContent(value);
  }, []);

  const handleClear = useCallback(() => {
    setContent(EMPTY);
    setLoadedSampleId(null);
    setLoadedSampleName(null);
  }, []);

  const handleLoadTemplate = useCallback((template: StudioTemplate) => {
    setContent(template.content);
    setLoadedSampleId(null);
    setLoadedSampleName(template.title);
    toast.success(`Loaded template: ${template.title}`);
  }, []);

  const handleLoadSample = useCallback((sample: UserMarkdownSample) => {
    setContent(sample.content);
    setLoadedSampleId(sample.id);
    setLoadedSampleName(sample.name);
  }, []);

  // Save flow ───────────────────────────────────────────────────────────
  const openSaveDialog = (intent: "save" | "fork") => {
    setSaveDialog({ open: true, intent });
  };

  const handleSaveAs = async (name: string) => {
    setSaving(true);
    try {
      const created = await create({
        name,
        description: "",
        content,
        detected_blocks: detectRenderBlocks(content),
      });
      setLoadedSampleId(created.id);
      setLoadedSampleName(created.name);
      toast.success(`Saved "${created.name}" to your library`);
      setSaveDialog({ open: false, intent: "save" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleQuickUpdate = async () => {
    if (!loadedSample) return;
    setSaving(true);
    try {
      const updated = await update(loadedSample.id, {
        content,
        detected_blocks: detectRenderBlocks(content),
      });
      setLoadedSampleName(updated.name);
      toast.success(`Updated "${updated.name}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  // Sync-scroll between textarea and preview (cheap proportional sync).
  const isSyncingRef = useRef(false);
  const handleEditorScroll = useCallback(() => {
    if (isSyncingRef.current) return;
    const ta = textareaRef.current;
    const pv = previewScrollRef.current;
    if (!ta || !pv) return;
    isSyncingRef.current = true;
    const taMax = ta.scrollHeight - ta.clientHeight;
    const pvMax = pv.scrollHeight - pv.clientHeight;
    if (taMax > 0) pv.scrollTop = (ta.scrollTop / taMax) * pvMax;
    requestAnimationFrame(() => {
      isSyncingRef.current = false;
    });
  }, []);

  // Keyboard shortcuts: ⌘S save, ⌘E run analysis, ⌘. toggle modes.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === "s" && !e.shiftKey) {
        e.preventDefault();
        if (loadedSample && isDirty) void handleQuickUpdate();
        else if (content.trim()) openSaveDialog("save");
      } else if (e.key === "s" && e.shiftKey) {
        e.preventDefault();
        if (content.trim()) openSaveDialog("fork");
      } else if (e.key === ".") {
        e.preventDefault();
        setMode((m) => (m === "studio" ? "analysis" : "studio"));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [loadedSample, isDirty, content, handleQuickUpdate]);

  const contentLabel = loadedSampleName ?? (content.trim() ? "Untitled" : "Empty");

  return (
    <div className="flex h-full w-full flex-col bg-textured">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="border-b border-border/70 bg-background/70 backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 via-primary/10 to-transparent text-primary">
              <FlaskConical className="h-4 w-4" />
            </div>
            <div className="leading-tight">
              <h1 className="text-sm font-semibold tracking-tight">
                Markdown Studio
              </h1>
              <p className="text-[10px] text-muted-foreground">
                Live block detection · parser drift analysis
              </p>
            </div>
          </div>

          <div className="ml-3 flex items-center gap-1 rounded-lg border border-border bg-background/40 p-0.5">
            <ModeTab
              icon={<Eye className="h-3.5 w-3.5" />}
              label="Studio"
              active={mode === "studio"}
              onClick={() => setMode("studio")}
            />
            <ModeTab
              icon={<GitCompare className="h-3.5 w-3.5" />}
              label="Analysis"
              active={mode === "analysis"}
              onClick={() => setMode("analysis")}
            />
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <SampleLibrarySheet
              loadedSampleId={loadedSampleId}
              onLoad={handleLoadSample}
            />
            <TemplatesPalette onSelect={handleLoadTemplate} />
            {loadedSample ? (
              <Button
                variant={isDirty ? "default" : "secondary"}
                size="sm"
                onClick={handleQuickUpdate}
                disabled={!isDirty || saving}
                className="h-8 gap-1.5 text-xs font-medium"
                title="Update the loaded sample (⌘S)"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <SaveAll className="h-3.5 w-3.5" />
                )}
                {isDirty ? "Update" : "Saved"}
              </Button>
            ) : (
              <Button
                variant="default"
                size="sm"
                onClick={() => openSaveDialog("save")}
                disabled={!content.trim() || saving}
                className="h-8 gap-1.5 text-xs font-medium"
                title="Save to your library (⌘S)"
              >
                <Save className="h-3.5 w-3.5" />
                Save
              </Button>
            )}
            {loadedSample && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openSaveDialog("fork")}
                disabled={!content.trim() || saving}
                className="h-8 px-2 text-xs"
                title="Save as a new sample (⇧⌘S)"
              >
                Fork
              </Button>
            )}
          </div>
        </div>

        {/* Status strip — current sample name, dirty indicator */}
        <div className="flex items-center gap-2 border-t border-border/50 bg-muted/20 px-4 py-1.5 text-[11px]">
          <Bookmark className="h-3 w-3 text-muted-foreground" />
          <span className="text-muted-foreground">Loaded:</span>
          <span className="font-medium">{contentLabel}</span>
          {loadedSample && (
            <Badge
              variant="outline"
              className="h-4 px-1.5 text-[10px] font-normal"
            >
              from library
            </Badge>
          )}
          {isDirty && (
            <Badge
              variant="outline"
              className="h-4 px-1.5 text-[10px] font-normal border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
            >
              unsaved changes
            </Badge>
          )}
          <span className="ml-auto text-muted-foreground font-mono">
            ⌘S save · ⇧⌘S fork · ⌘. switch view
          </span>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────── */}
      <main className="flex-1 min-h-0 overflow-hidden">
        {mode === "studio" ? (
          <div className="grid h-full grid-cols-1 gap-3 p-3 lg:grid-cols-2">
            <EditorPanel
              content={content}
              onChange={handleChange}
              onClear={handleClear}
              onScroll={handleEditorScroll}
              textareaRef={textareaRef}
            />
            <PreviewPanel content={content} ref={previewScrollRef} />
          </div>
        ) : (
          <AnalysisView content={content} contentLabel={contentLabel} />
        )}
      </main>

      {/* ── Save dialog ─────────────────────────────────────────────── */}
      <TextInputDialog
        open={saveDialog.open}
        onOpenChange={(o) => {
          if (!o && !saving) setSaveDialog({ open: false, intent: "save" });
        }}
        title={
          saveDialog.intent === "fork"
            ? "Fork into a new sample"
            : "Save to your library"
        }
        description={
          saveDialog.intent === "fork"
            ? `Branch "${loadedSampleName ?? "this sample"}" — the original stays untouched.`
            : "Give this sample a name. We'll auto-detect the block types from the content."
        }
        placeholder="e.g. Mixed code + table"
        defaultValue={
          saveDialog.intent === "fork" && loadedSampleName
            ? `${loadedSampleName} (copy)`
            : ""
        }
        confirmLabel="Save sample"
        busy={saving}
        onConfirm={handleSaveAs}
      />
    </div>
  );
}

function ModeTab({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-foreground text-background shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
