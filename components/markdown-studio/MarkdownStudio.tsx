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
  useEffectEvent,
} from "react";
import { useSearchParams } from "next/navigation";
import { Bookmark, Info, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { RichContent } from "@/components/rich-content/RichContent";
import { recordToast, toast } from "@/lib/toast";
import { detectRenderBlocks } from "@/components/admin/markdown-tester/utils/detect-render-blocks";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { useMarkdownAutosave } from "@/components/admin/markdown-tester/useMarkdownAutosave";
import { printMarkdownContent } from "@/features/conversation/utils/markdown-print";
import { EditorPanel } from "./EditorPanel";
import { PreviewPanel, type PreviewMode } from "./PreviewPanel";
import { AnnotateView } from "./AnnotateView";
import { SourcePickerPanel } from "./lab/SourcePickerPanel";
import {
  STUDIO_SOURCES,
  isStudioSourceKind,
  type LoadedStudioContent,
  type StudioSourceKind,
} from "./lab/content-sources";
import { syncPaneScroll } from "./lab/sync-scroll";
import { syncStudioSourceUrl } from "./lab/studio-url";
import { loadStudioSource } from "./lab/content-sources";
import { isRecordUnavailableError } from "@/lib/records/recordUnavailable";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import type { ContentSource } from "@/features/rich-document/types";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";
import { AnalysisView } from "./AnalysisView";
import { StudioEditorMode } from "./StudioEditorMode";
import { SampleLibrarySheet } from "./SampleLibrarySheet";
import { TemplatesPalette } from "./TemplatesPalette";
import { useUserMarkdownSamples } from "./useUserMarkdownSamples";
import type { UserMarkdownSample } from "./user-samples-service";
import type { StudioTemplate } from "./templates";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import type { SurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createMarkdownStudioScope } from "@/features/surfaces/manifests/markdown-studio.manifest";
import PageHeader from "@/features/shell/components/header/PageHeader";
import HeaderToggle from "@/features/shell/components/header/variants/variants/HeaderToggle";
import type { HeaderAction } from "@/features/shell/components/header/variants/types";

/**
 * The studio's two modes — the ONE vocabulary. `StudioMode` derives from it, so
 * the header toggle (typed through `active`/`onChange`) and the `view_mode`
 * surface write handler, which validates against this array rather than
 * re-typed literals, can never drift apart.
 */
export const MARKDOWN_STUDIO_MODES = ["studio", "analysis", "editor", "annotate"] as const;
type StudioMode = (typeof MARKDOWN_STUDIO_MODES)[number];

const EMPTY = "";
const RAW_SOURCE: ContentSource = { type: "raw" };

export function MarkdownStudio() {
  const [content, setContent] = useState(EMPTY);
  const [mode, setMode] = useState<StudioMode>("studio");
  const [loadedSampleId, setLoadedSampleId] = useState<string | null>(null);
  const [loadedSampleName, setLoadedSampleName] = useState<string | null>(null);
  const [saveDialog, setSaveDialog] = useState<{
    open: boolean;
    intent: "save" | "fork";
  }>({ open: false, intent: "save" });
  const [saving, setSaving] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  // Below lg only one pane shows; opening real content jumps to the preview.
  const [mobilePane, setMobilePane] = useState<"source" | "preview">("source");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("rendered");
  // The real record currently loaded (read-only copy), if any.
  const [loadedSource, setLoadedSource] = useState<LoadedStudioContent | null>(
    null,
  );
  const [sourceLoading, setSourceLoading] = useState<string | null>(null);
  // A requested record that could not be read — rendered through AccessGate.
  const [sourceGate, setSourceGate] = useState<{
    kind: StudioSourceKind;
    token: string;
    id: string;
    error: unknown;
  } | null>(null);
  const isAdmin = useAppSelector(selectIsSuperAdmin);
  const searchParams = useSearchParams();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);

  const { create, update, samples } = useUserMarkdownSamples();
  const { loadAutosave } = useMarkdownAutosave("markdown-studio", content);
  const loadedSample = useMemo(
    () => samples.find((s) => s.id === loadedSampleId) ?? null,
    [loadedSampleId, samples],
  );

  // Restore autosave on first mount.
  useEffect(() => {
    // A deep link names the content to open — never overwrite it with the
    // autosaved buffer.
    if (new URLSearchParams(window.location.search).get("source")) return;
    loadAutosave().then((saved) => {
      if (saved) {
        setContent(saved);
      }
    });
  }, [loadAutosave]);

  // Dirty = the buffer diverges from the loaded sample (derived, never stored).
  const isDirty = loadedSample
    ? content !== loadedSample.content
    : content.length > 0;

  const handleChange = useCallback((value: string) => {
    setContent(value);
  }, []);

  const clearSourceParams = () => syncStudioSourceUrl(null);

  const handleClear = () => {
    setContent(EMPTY);
    setLoadedSampleId(null);
    setLoadedSampleName(null);
    setLoadedSource(null);
    setSourceGate(null);
    clearSourceParams();
  };

  const handleLoadTemplate = useCallback((template: StudioTemplate) => {
    setContent(template.content);
    setLoadedSampleId(null);
    setLoadedSampleName(template.title);
    setLoadedSource(null);
    setSourceGate(null);
    syncStudioSourceUrl(null);
    toast.success(`Loaded template: ${template.title}`);
  }, []);

  const handleLoadSample = useCallback((sample: UserMarkdownSample) => {
    setContent(sample.content);
    setLoadedSampleId(sample.id);
    setLoadedSampleName(sample.name);
    setLoadedSource(null);
    setSourceGate(null);
    syncStudioSourceUrl(null);
  }, []);

  // Real-content sources ────────────────────────────────────────────────
  // Last `kind:id` a deep link (or a pick) resolved — a re-render or our own
  // URL update never reloads the same record.
  const deepLinkHandledRef = useRef<string | null>(null);
  // READ-ONLY: the record is copied into the buffer; nothing writes back.
  const loadFromSource = async (kind: StudioSourceKind, id: string) => {
    const def = STUDIO_SOURCES[kind];
    setSourceLoading(def.label);
    try {
      const loaded = await loadStudioSource(kind, id);
      setSourceGate(null);
      setContent(loaded.content);
      setLoadedSampleId(null);
      setLoadedSampleName(loaded.title);
      setLoadedSource(loaded);
      setMobilePane("preview");
      deepLinkHandledRef.current = `${kind}:${id}`;
      syncStudioSourceUrl({ kind, id });
    } catch (err) {
      // An absent record is never a toast and never database text: the
      // platform's AccessGate asks which of deleted / missing / no access /
      // signed out it really is and says it in plain words, with a way on.
      if (isRecordUnavailableError(err)) {
        deepLinkHandledRef.current = `${kind}:${id}`;
        setSourceGate({ token: err.token ?? def.token, id, error: err, kind });
        syncStudioSourceUrl({ kind, id });
      } else {
        // loadStudioSource only ever throws "We couldn't …" sentences here.
        toast.error(err instanceof Error ? err.message : `We couldn't open this ${def.label.toLowerCase()}.`);
      }
    } finally {
      setSourceLoading(null);
    }
  };

  // Deep link: /markdown-studio?source=<kind>&id=<uuid> opens that record.
  const deepLinkKind = searchParams.get("source");
  const deepLinkId = searchParams.get("id");
  const openDeepLink = useEffectEvent(
    (kind: StudioSourceKind, id: string) => void loadFromSource(kind, id),
  );
  useEffect(() => {
    if (!isStudioSourceKind(deepLinkKind) || !deepLinkId) return;
    const key = `${deepLinkKind}:${deepLinkId}`;
    if (deepLinkHandledRef.current === key) return;
    deepLinkHandledRef.current = key;
    openDeepLink(deepLinkKind, deepLinkId);
  }, [deepLinkKind, deepLinkId]);

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
      recordToast.success(
        { type: "markdown_sample", id: created.id, title: created.name },
        `Saved "${created.name}" to your library`,
      );
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
      recordToast.success(
        {
          type: "markdown_sample",
          id: loadedSample.id,
          title: updated.name,
        },
        `Updated "${updated.name}"`,
      );
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
    // Block-paired sync (the admin tester's), proportional fallback.
    syncPaneScroll({
      text: content,
      textarea: ta,
      preview: pv,
      direction: "text-to-preview",
    });
    requestAnimationFrame(() => {
      isSyncingRef.current = false;
    });
  }, [content]);

  // Keyboard shortcuts: ⌘S save, ⌘E run analysis, ⌘. toggle modes.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      // Editor mode owns its own keys (⌘S saves the proving copy there).
      if (mode === "editor") return;
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
  }, [loadedSample, isDirty, content, handleQuickUpdate, mode]);

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

  // Print / Save PDF — the SAME canonical path every markdown surface uses
  // (`printMarkdownContent` -> `@ai-matrx/print/markdown`). Never a second
  // converter or stylesheet. More printables: the hub at /print.
  const handlePrint = useCallback(() => {
    if (!content.trim()) {
      toast.info("Nothing to print yet");
      return;
    }
    printMarkdownContent(content, loadedSample?.name ?? "Markdown");
  }, [content, loadedSample]);

  const headerActions: HeaderAction[] = useMemo(() => {
    const actions: HeaderAction[] = [
      {
        icon: "FolderOpen",
        label: "Open",
        onPress: () => setSourcePickerOpen(true),
      },
      {
        // RC-B11: the annotation sidecar on a live document (AnnotateView).
        icon: "Highlighter",
        label: mode === "annotate" ? "Close annotations" : "Annotate",
        onPress: () => setMode((m) => (m === "annotate" ? "studio" : "annotate")),
      },
      {
        icon: "Printer",
        label: "Print / Save PDF",
        onPress: handlePrint,
      },
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
    handlePrint,
    mode,
  ]);

  // Surface scope — built at trigger time (▶ Run), never on mount, so the
  // agent always sees the live buffer rather than a render-stale copy.
  const getScope = useCallback(() => {
    const ta = textareaRef.current;
    const selected =
      ta && ta.selectionStart !== ta.selectionEnd
        ? ta.value.slice(ta.selectionStart, ta.selectionEnd)
        : undefined;
    return createMarkdownStudioScope({
      content,
      document_label: contentLabel,
      is_from_library: Boolean(loadedSample),
      detected_blocks: detectRenderBlocks(content),
      is_dirty: isDirty,
      is_saving: saving,
      view_mode: mode,
      library_sample_count: samples.length,
      sample_id: loadedSampleId ?? undefined,
      sample_name: loadedSampleName ?? undefined,
      selection: selected,
    });
  }, [
    content,
    contentLabel,
    loadedSample,
    isDirty,
    saving,
    mode,
    samples.length,
    loadedSampleId,
    loadedSampleName,
  ]);

  // Surface write handlers — the write half of the 360 loop (declared in
  // `markdown-studio.manifest.ts`). Every content write goes through the SAME
  // `setContent` the textarea's own `handleChange` calls, so the dirty flag
  // re-derives itself, the header's Save/Update action stays honest, and
  // nothing reaches the sample library until the user saves. No parallel write
  // path, no direct service call.
  const getWriteHandlers = useCallback((): SurfaceWriteHandlers => {
    // A save/update/fork request sends the buffer captured when it started;
    // moving the buffer underneath it would silently persist text the user
    // never approved. Refuse loudly instead of racing it.
    const assertNotSaving = (target: string) => {
      if (saving)
        throw new Error(
          `${target} cannot be applied while a save to the sample library is in flight. Wait for the save to finish and try again.`,
        );
    };
    return {
      document_content: (value: unknown) => {
        assertNotSaving("document_content");
        if (typeof value !== "string")
          throw new Error(
            "document_content expects a string — the FULL markdown document, which replaces the buffer.",
          );
        if (!value.trim())
          throw new Error(
            "document_content expects non-empty markdown. Clearing the studio is a human action — use the editor's Clear button.",
          );
        setContent(value);
      },
      append_document_content: (value: unknown) => {
        assertNotSaving("append_document_content");
        if (typeof value !== "string")
          throw new Error(
            "append_document_content expects a string — only the new markdown to add to the end of the document.",
          );
        if (!value.trim())
          throw new Error(
            "append_document_content expects non-empty markdown to add.",
          );
        setContent((prev) => (prev.trim() ? `${prev}\n\n${value}` : value));
      },
      view_mode: (value: unknown) => {
        if (
          typeof value !== "string" ||
          !(MARKDOWN_STUDIO_MODES as readonly string[]).includes(value)
        )
          throw new Error(
            `view_mode expects one of: ${MARKDOWN_STUDIO_MODES.join(" | ")}.`,
          );
        setMode(value as StudioMode);
      },
    };
  }, [saving]);

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/markdown-studio"
      getScope={getScope}
      isEditable
      getWriteHandlers={getWriteHandlers}
    >
    {/* matrx-touch-targets: the platform's 44px touch floor for every
        control in the studio on phones/touch (desktop density untouched). */}
    <div className="matrx-touch-targets flex h-full w-full flex-col bg-textured">
      <PageHeader>
        <HeaderToggle
          options={[
            { icon: "Eye", label: "Studio", value: "studio" },
            { icon: "GitCompare", label: "Analysis", value: "analysis" },
            { icon: "PenLine", label: "Editor", value: "editor" },
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
        <div className="flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap border-b border-border/50 bg-muted/20 px-4 py-1.5 text-[11px] [&>*]:shrink-0">
          <Bookmark className="h-3 w-3 text-muted-foreground" />
          <span className="hidden text-muted-foreground sm:inline">Loaded:</span>
          <span className="min-w-0 !shrink truncate font-medium" title={contentLabel}>
            {loadedSource?.titleIsRich ? (
              <RichContent source={contentLabel} level="inline" />
            ) : (
              contentLabel
            )}
          </span>
          {loadedSample && (
            <Badge
              variant="outline"
              className="h-4 px-1.5 text-[10px] font-normal"
            >
              from library
            </Badge>
          )}
          {loadedSource && (
            <Badge
              variant="outline"
              className="h-4 px-1.5 text-[10px] font-normal border-primary/40 bg-primary/10"
              title="A read-only copy — editing here never changes the original"
            >
              {STUDIO_SOURCES[loadedSource.kind].label} · read-only copy
            </Badge>
          )}
          {loadedSource?.notice && (
            <span className="hidden items-center gap-1 text-muted-foreground md:flex">
              <Info className="h-3 w-3" />
              {loadedSource.notice}
            </span>
          )}
          {sourceLoading && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Opening {sourceLoading.toLowerCase()}…
            </span>
          )}
          {isDirty && !loadedSource && (
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
          {sourceGate &&
          deepLinkKind === sourceGate.kind &&
          deepLinkId === sourceGate.id ? (
            <div className="h-full overflow-y-auto">
              <AccessGate
                token={sourceGate.token}
                id={sourceGate.id}
                error={sourceGate.error}
                onRetry={() => void loadFromSource(sourceGate.kind, sourceGate.id)}
                fallbackHref="/markdown-studio"
                fallbackLabel="Start fresh in the studio"
              />
            </div>
          ) : mode === "studio" ? (
            <div className="flex h-full flex-col gap-2 p-3 lg:grid lg:grid-cols-2 lg:gap-3">
              {/* Phones get ONE full-height pane at a time — two stacked panes
                  left the editor about two lines tall (RC-B1 verify D5). */}
              <div
                role="tablist"
                aria-label="Studio pane"
                className="flex shrink-0 items-center gap-0.5 self-start rounded-md border border-border bg-background/40 p-0.5 lg:hidden"
              >
                {(["source", "preview"] as const).map((pane) => (
                  <button
                    key={pane}
                    type="button"
                    role="tab"
                    aria-selected={mobilePane === pane}
                    onClick={() => setMobilePane(pane)}
                    className={cn(
                      "min-h-11 whitespace-nowrap rounded px-3 text-xs font-medium transition-colors",
                      mobilePane === pane
                        ? "bg-foreground text-background"
                        : "text-muted-foreground",
                    )}
                  >
                    {pane === "source" ? "Source" : "Preview"}
                  </button>
                ))}
              </div>
              <div
                className={cn(
                  "min-h-0 flex-1 lg:block lg:h-full",
                  mobilePane === "source" ? "flex flex-col" : "hidden",
                )}
              >
              <EditorPanel
                content={content}
                onChange={handleChange}
                onClear={handleClear}
                onScroll={handleEditorScroll}
                textareaRef={textareaRef}
              />
              </div>
              <div
                className={cn(
                  "min-h-0 flex-1 lg:block lg:h-full",
                  mobilePane === "preview" ? "flex flex-col" : "hidden",
                )}
              >
              <PreviewPanel
                content={content}
                // The studio holds a COPY: the source rides read-only, so the
                // registry offers nothing that would change the original.
                contentSource={
                  loadedSource
                    ? { ...loadedSource.contentSource, readOnly: true }
                    : RAW_SOURCE
                }
                sourceActions={loadedSource?.sourceActions}
                mode={previewMode}
                onModeChange={setPreviewMode}
                title={contentLabel}
                onContentChange={handleChange}
                ref={previewScrollRef}
              />
              </div>
            </div>
          ) : mode === "annotate" ? (
            <AnnotateView
              documentId={loadedSource?.kind === "document" ? loadedSource.id : null}
              buffer={content}
              bufferTitle={loadedSampleName}
              onOpenDocument={(id) => void loadFromSource("document", id)}
            />
          ) : mode === "editor" ? (
            <StudioEditorMode
              key={loadedSource ? `${loadedSource.kind}:${loadedSource.id}` : (loadedSampleId ?? "buffer")}
              content={content}
              title={contentLabel}
              contentSource={loadedSource?.contentSource ?? RAW_SOURCE}
              onContentChange={handleChange}
            />
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
      <SourcePickerPanel
        open={sourcePickerOpen}
        onOpenChange={setSourcePickerOpen}
        isAdmin={isAdmin}
        initialKind={loadedSource?.kind}
        onPick={(kind, id) => void loadFromSource(kind, id)}
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
    </SurfaceRuntimeProvider>
  );
}
