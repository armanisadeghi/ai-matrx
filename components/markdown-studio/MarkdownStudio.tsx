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
import { Bookmark } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
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
import PageHeader from "@/features/shell/components/header/PageHeader";
import HeaderToggle from "@/features/shell/components/header/variants/variants/HeaderToggle";
import type { HeaderAction } from "@/features/shell/components/header/variants/types";

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
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);

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

  const contentLabel =
    loadedSampleName ?? (content.trim() ? "Untitled" : "Empty");

  const handlePrimaryAction = useCallback(() => {
    if (saving) return;
    if (loadedSample) {
      if (!isDirty) {
        toast.info("Already saved");
        return;
      }
      void handleQuickUpdate();
    } else {
      if (!content.trim()) {
        toast.info("Nothing to save yet");
        return;
      }
      openSaveDialog("save");
    }
  }, [saving, loadedSample, isDirty, content, handleQuickUpdate]);

  const handleForkAction = useCallback(() => {
    if (!loadedSample || saving) return;
    if (!content.trim()) {
      toast.info("Nothing to fork yet");
      return;
    }
    openSaveDialog("fork");
  }, [loadedSample, saving, content]);

  const headerActions: HeaderAction[] = useMemo(() => {
    const actions: HeaderAction[] = [
      {
        icon: "BookOpen",
        label:
          samples.length > 0 ? `Library (${samples.length})` : "Library",
        onPress: () => setLibraryOpen(true),
      },
      {
        icon: "Layers",
        label: "Templates",
        onPress: () => setTemplatesOpen(true),
      },
      {
        icon: loadedSample ? "SaveAll" : "Save",
        label: loadedSample ? (isDirty ? "Update" : "Saved") : "Save",
        onPress: handlePrimaryAction,
      },
    ];
    if (loadedSample) {
      actions.push({
        icon: "GitFork",
        label: "Fork",
        onPress: handleForkAction,
      });
    }
    return actions;
  }, [
    samples.length,
    loadedSample,
    isDirty,
    handlePrimaryAction,
    handleForkAction,
  ]);

  return (
    <div className="flex h-full w-full flex-col bg-textured">
      <PageHeader>
        <HeaderToggle
          options={[
            { icon: "Eye", label: "Studio", value: "studio" },
            { icon: "GitCompare", label: "Analysis", value: "analysis" },
          ]}
          active={mode}
          onChange={setMode}
          actions={headerActions}
        />
      </PageHeader>

      <div
        className="flex min-h-0 flex-1 flex-col"
        style={{ paddingTop: "var(--shell-header-h)" }}
      >
        {/* Status strip — current sample name, dirty indicator */}
        <div className="flex items-center gap-2 border-b border-border/50 bg-muted/20 px-4 py-1.5 text-[11px]">
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
          <span className="ml-auto hidden text-muted-foreground font-mono sm:inline">
            ⌘S save · ⇧⌘S fork · ⌘. switch view
          </span>
        </div>

        {/* ── Body ─────────────────────────────────────────────────── */}
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
      </div>

      {/* ── Library + templates panels ──────────────────────────────── */}
      <SampleLibrarySheet
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        loadedSampleId={loadedSampleId}
        onLoad={handleLoadSample}
      />
      <TemplatesPalette
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        onSelect={handleLoadTemplate}
      />

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
