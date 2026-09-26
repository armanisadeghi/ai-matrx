// components/markdown-studio/MarkdownStudio.tsx
// The Markdown Studio — THE markdown workbench. Modes share a single content
// buffer so switching between them never loses the user's work:
//   Studio   — live editor + preview (every preview view in PreviewPanel)
//   Analysis — the three-parser drift report
//   Editor   — the rich editor over a disposable proving copy
//   Annotate — the annotation sidecar on a real document
//   Inspect  — ADMIN ONLY (the admin tester route): raw server events,
//              replay of captured server events, processors and AST
// The admin tester route (/administration/utilities/markdown-tester) renders
// this same component; the admin lane is what turns admin mode on (shared
// sample library writes + Inspect). Loading a sample syncs the source editor and
// flags that sample as the "loaded" baseline; later edits mark it dirty.
//
// 🚨 A HUGE DOCUMENT NEVER BLOCKS TYPING: the preview and the editor's block
// atlas read a DEFERRED copy of the buffer, so a keystroke paints first and
// the (interruptible) re-render of a 5 MB preview follows.

"use client";

import React, {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
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
import { useMarkdownAutosave } from "@/components/admin/markdown-tester/useMarkdownAutosave";
import { SampleEditor } from "@/components/admin/markdown-tester/SampleEditor";
import { useMarkdownSamples } from "@/components/admin/markdown-tester/useMarkdownSamples";
import type { MarkdownSample } from "@/components/admin/markdown-tester/samples-service";
import { printMarkdownContent } from "@/features/conversation/utils/markdown-print";
import { EditorPanel } from "./EditorPanel";
import { PreviewPanel, type PreviewMode } from "./PreviewPanel";
import { AnnotateView } from "./AnnotateView";
import { InspectView } from "./InspectView";
import { SourcePickerPanel } from "./lab/SourcePickerPanel";
import {
  STUDIO_SOURCES,
  isStudioSourceKind,
  type LoadedStudioContent,
  type StudioSourceKind,
} from "./lab/content-sources";
import { syncPaneScroll } from "./lab/sync-scroll";
import type { EditorViewHandle } from "@/components/rich-editor/visual/VisualEditor";
import { syncStudioSourceUrl } from "./lab/studio-url";
import { loadStudioSource } from "./lab/content-sources";
import { isRecordUnavailableError } from "@/lib/records/recordUnavailable";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import type { ContentSource } from "@/features/rich-document/types";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAdminLaneOpen, selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";
import { useSetting } from "@/features/settings/hooks/useSetting";
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
import { ArchiveRecordDialog } from "@/features/trash/components/ArchiveRecordButton";

/**
 * The studio's modes an agent may switch to — the ONE vocabulary. `StudioMode`
 * derives from it, so the header toggle and the `view_mode` surface write
 * handler (which validates against this array) can never drift apart. The
 * admin-only Inspect view is deliberately NOT in it.
 */
export const MARKDOWN_STUDIO_MODES = ["studio", "analysis", "editor", "annotate"] as const;
type StudioMode = (typeof MARKDOWN_STUDIO_MODES)[number];
type ViewMode = StudioMode | "inspect";

/** How the preview follows the editor — a per-person setting, live by default. */
export type PreviewUpdateMode = "live" | "manual";

const EMPTY = "";
/**
 * Past this size the preview follows a typing PAUSE, not every keystroke. Each
 * re-render of a long preview re-resolves its action surface over the whole
 * text (table/code detection per action), and at 100 KB that alone made a key
 * take ~50 ms to paint (verifier round 1: p75 144–153 ms by its method). 40 KB
 * is well above an ordinary answer or note.
 */
const LARGE_BUFFER_CHARS = 40_000;
const LARGE_BUFFER_PAUSE_MS = 400;
const RAW_SOURCE: ContentSource = { type: "raw" };

/** The sample the buffer came from: the person's own, or the shared library. */
type LoadedSample =
  | { lib: "user"; sample: UserMarkdownSample }
  | { lib: "shared"; sample: MarkdownSample };

type SampleDialog =
  | { open: false }
  | { open: true; intent: "save" | "fork" | "save-shared" | "edit" };

export function MarkdownStudio() {
  const [content, setContent] = useState(EMPTY);
  const [mode, setMode] = useState<ViewMode>("studio");
  const [loadedRef, setLoadedRef] = useState<{ lib: "user" | "shared"; id: string } | null>(null);
  const [loadedSampleName, setLoadedSampleName] = useState<string | null>(null);
  const [sampleDialog, setSampleDialog] = useState<SampleDialog>({ open: false });
  const [dialogSession, setDialogSession] = useState(0);
  const [saving, setSaving] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  // Below lg only one pane shows; opening real content jumps to the preview.
  const [mobilePane, setMobilePane] = useState<"source" | "preview">("source");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("rendered");
  // Desktop layout: the editor alone, and the whole studio over the page.
  const [previewHidden, setPreviewHidden] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  // ⌘Enter asks the Analysis view to run; each press is a new number.
  const [analysisRunSignal, setAnalysisRunSignal] = useState(0);
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
  // Admin mode = the admin lane (the tester route). An admin on a user page
  // sees exactly what anyone else sees.
  const isAdmin = useAppSelector(selectIsSuperAdmin);
  // The admin layout already places content below its header; a user page's
  // header floats over the content, so only there does the body pad down.
  const inAdminLane = useAppSelector(selectAdminLaneOpen);
  const searchParams = useSearchParams();

  // Per-person settings (userPreferences.display), live + synced by default.
  const [previewUpdatesSetting, setPreviewUpdates] = useSetting<PreviewUpdateMode | undefined>(
    "userPreferences.display.markdownStudioPreviewUpdates",
  );
  const [scrollSyncSetting, setScrollSync] = useSetting<boolean | undefined>(
    "userPreferences.display.markdownStudioScrollSync",
  );
  const previewUpdates: PreviewUpdateMode = previewUpdatesSetting === "manual" ? "manual" : "live";
  const scrollSync = scrollSyncSetting !== false;
  // Manual mode renders the last "Update preview".
  const [manualContent, setManualContent] = useState(EMPTY);

  const editorRef = useRef<EditorViewHandle | null>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);

  const { create, update, samples } = useUserMarkdownSamples();
  const shared = useMarkdownSamples();
  const { loadAutosave } = useMarkdownAutosave(
    isAdmin ? "admin-tester" : "markdown-studio",
    content,
  );
  const loaded: LoadedSample | null = useMemo(() => {
    if (!loadedRef) return null;
    if (loadedRef.lib === "user") {
      const s = samples.find((x) => x.id === loadedRef.id);
      return s ? { lib: "user", sample: s } : null;
    }
    const s = shared.samples.find((x) => x.id === loadedRef.id);
    return s ? { lib: "shared", sample: s } : null;
  }, [loadedRef, samples, shared.samples]);

  // What every render reads: deferred, so typing is never held by the preview.
  // A very large buffer re-renders the preview only once typing pauses — one
  // re-split of a megabyte is a single uninterruptible chunk of work, and
  // doing it per keystroke made each key take over a second to appear.
  const [settledContent, setSettledContent] = useState(content);
  useEffect(() => {
    if (content.length < LARGE_BUFFER_CHARS) return undefined;
    const timer = setTimeout(() => startTransition(() => setSettledContent(content)), LARGE_BUFFER_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [content]);
  const deferredContent = useDeferredValue(
    content.length < LARGE_BUFFER_CHARS ? content : settledContent,
  );
  const previewContent = previewUpdates === "live" ? deferredContent : manualContent;

  // Restore autosave on first mount.
  useEffect(() => {
    // A deep link names the content to open — never overwrite it with the
    // autosaved buffer.
    if (new URLSearchParams(window.location.search).get("source")) return;
    loadAutosave().then((saved) => {
      if (saved) {
        setContent(saved);
        setManualContent(saved);
      }
    });
  }, [loadAutosave]);

  // Dirty = the buffer diverges from the loaded sample (derived, never stored).
  const isDirty = loaded
    ? content !== loaded.sample.content
    : content.length > 0;
  // A shared sample outside admin mode is a read-only starter: never "unsaved".
  const canWriteLoaded = loaded?.lib === "user" || (loaded?.lib === "shared" && isAdmin);

  const handleChange = useCallback((value: string) => {
    setContent(value);
  }, []);

  /** Replace the whole buffer (a load): the manual preview follows at once. */
  const replaceBuffer = (value: string) => {
    setContent(value);
    setManualContent(value);
  };

  const clearSourceParams = () => syncStudioSourceUrl(null);

  const handleClear = () => {
    replaceBuffer(EMPTY);
    setLoadedRef(null);
    setLoadedSampleName(null);
    setLoadedSource(null);
    setSourceGate(null);
    clearSourceParams();
  };

  const handleLoadTemplate = (template: StudioTemplate) => {
    replaceBuffer(template.content);
    setLoadedRef(null);
    setLoadedSampleName(template.title);
    setLoadedSource(null);
    setSourceGate(null);
    syncStudioSourceUrl(null);
    toast.success(`Loaded ${template.id.startsWith("builtin:") ? "sample" : "template"}: ${template.title}`);
  };

  const handleLoadSample = (sample: UserMarkdownSample) => {
    replaceBuffer(sample.content);
    setLoadedRef({ lib: "user", id: sample.id });
    setLoadedSampleName(sample.name);
    setLoadedSource(null);
    setSourceGate(null);
    syncStudioSourceUrl(null);
  };

  const handleLoadShared = (sample: MarkdownSample) => {
    replaceBuffer(sample.content);
    setLoadedRef({ lib: "shared", id: sample.id });
    setLoadedSampleName(sample.name);
    setLoadedSource(null);
    setSourceGate(null);
    syncStudioSourceUrl(null);
  };

  // Real-content sources ────────────────────────────────────────────────
  // Last `kind:id` a deep link (or a pick) resolved — a re-render or our own
  // URL update never reloads the same record.
  const deepLinkHandledRef = useRef<string | null>(null);
  // READ-ONLY: the record is copied into the buffer; nothing writes back.
  const loadFromSource = async (kind: StudioSourceKind, id: string) => {
    const def = STUDIO_SOURCES[kind];
    setSourceLoading(def.label);
    try {
      const loadedContent = await loadStudioSource(kind, id);
      setSourceGate(null);
      replaceBuffer(loadedContent.content);
      setLoadedRef(null);
      setLoadedSampleName(loadedContent.title);
      setLoadedSource(loadedContent);
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
  const openSampleDialog = (intent: "save" | "fork" | "save-shared" | "edit") => {
    setDialogSession((n) => n + 1);
    setSampleDialog({ open: true, intent });
  };

  const handleSampleDialogConfirm = async (values: {
    name: string;
    description: string;
    detectedBlocks: string[];
  }) => {
    if (!sampleDialog.open) return;
    const intent = sampleDialog.intent;
    setSaving(true);
    try {
      if (intent === "edit" && loaded) {
        // Name / description / tags only — the buffer is untouched.
        const patch = {
          name: values.name,
          description: values.description,
          detected_blocks: values.detectedBlocks,
        };
        const updated =
          loaded.lib === "user"
            ? await update(loaded.sample.id, patch)
            : await shared.update(loaded.sample.id, patch);
        setLoadedSampleName(updated.name);
        recordToast.success(
          { type: "markdown_sample", id: updated.id, title: updated.name },
          `Updated the details of "${updated.name}"`,
        );
      } else {
        const input = {
          name: values.name,
          description: values.description,
          content,
          detected_blocks: values.detectedBlocks,
        };
        const created =
          intent === "save-shared" ? await shared.create(input) : await create(input);
        setLoadedRef({ lib: intent === "save-shared" ? "shared" : "user", id: created.id });
        setLoadedSampleName(created.name);
        recordToast.success(
          { type: "markdown_sample", id: created.id, title: created.name },
          intent === "save-shared"
            ? `Saved "${created.name}" to the shared library`
            : `Saved "${created.name}" to your library`,
        );
      }
      setSampleDialog({ open: false });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleQuickUpdate = async () => {
    if (!loaded || !canWriteLoaded) return;
    setSaving(true);
    try {
      const patch = { content, detected_blocks: detectRenderBlocks(content) };
      const updated =
        loaded.lib === "user"
          ? await update(loaded.sample.id, patch)
          : await shared.update(loaded.sample.id, patch);
      setLoadedSampleName(updated.name);
      recordToast.success(
        { type: "markdown_sample", id: loaded.sample.id, title: updated.name },
        loaded.lib === "shared" ? `Updated shared sample "${updated.name}"` : `Updated "${updated.name}"`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  // Scroll sync between the source editor and preview — block-paired, both directions,
  // behind a per-person on/off setting.
  const isSyncingRef = useRef(false);
  const syncScroll = (direction: "text-to-preview" | "preview-to-text") => {
    if (!scrollSync || isSyncingRef.current) return;
    const editor = editorRef.current;
    const el = editor?.scroller?.();
    const pv = previewScrollRef.current;
    if (!editor || !el || !pv || !editor.lineTop) return;
    isSyncingRef.current = true;
    syncPaneScroll({
      text: previewContent,
      source: { el, lineTop: editor.lineTop },
      preview: pv,
      direction,
    });
    requestAnimationFrame(() => {
      isSyncingRef.current = false;
    });
  };

  // Stable handlers for the two panes: a keystroke re-renders this component,
  // and a new function per render would re-render the whole preview with it
  // (measured: ~25 ms per key on a 1 MB document).
  const syncScrollRef = useRef(syncScroll);
  useLayoutEffect(() => {
    syncScrollRef.current = syncScroll;
  });
  const onEditorScroll = useCallback(() => syncScrollRef.current("text-to-preview"), []);
  const onPreviewScroll = useCallback(() => syncScrollRef.current("preview-to-text"), []);
  const showSourcePane = useCallback(() => setMobilePane("source"), []);
  const showPreviewPane = useCallback(() => setMobilePane("preview"), []);
  // The studio holds a COPY: the source rides read-only, so the registry offers
  // nothing that would change the original. One object per loaded record.
  const previewSource = useMemo<ContentSource>(
    () => (loadedSource ? { ...loadedSource.contentSource, readOnly: true } : RAW_SOURCE),
    [loadedSource],
  );

  const handleCopySource = async () => {
    if (!content) {
      toast.info("Nothing to copy yet");
      return;
    }
    try {
      await navigator.clipboard.writeText(content);
      toast.success(`Copied ${content.length.toLocaleString()} characters of source`);
    } catch {
      toast.error("The clipboard refused the copy — select the text and copy it instead.");
    }
  };

  const handleRestoreDraft = async () => {
    const saved = await loadAutosave();
    if (saved === null) {
      toast.info("There is no saved draft on this device yet.");
      return;
    }
    replaceBuffer(saved);
    setLoadedRef(null);
    setLoadedSampleName(null);
    setLoadedSource(null);
    toast.success(`Restored the last draft (${saved.length.toLocaleString()} characters)`);
  };

  const handleUpdatePreview = () => setManualContent(content);

  const handlePrimaryAction = () => {
    if (saving) return;
    if (loaded && canWriteLoaded) {
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
      openSampleDialog("save");
    }
  };

  const handleForkAction = () => {
    if (!loaded || saving) return;
    if (!content.trim()) {
      toast.info("Nothing to fork yet");
      return;
    }
    openSampleDialog("fork");
  };

  const runAnalysis = () => {
    if (!content.trim()) {
      toast.info("Nothing to analyze yet — type or paste markdown first.");
      return;
    }
    setMode("analysis");
    setAnalysisRunSignal((n) => n + 1);
  };

  // Keyboard shortcuts: ⌘S save, ⇧⌘S fork, ⌘K samples, ⌘Enter run the
  // comparison, ⌘. switch Studio/Analysis.
  const onShortcut = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === "Escape" && fullScreen && !e.defaultPrevented) {
      setFullScreen(false);
      return;
    }
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    // Editor mode owns its own keys (⌘S saves the proving copy there).
    if (mode === "editor") return;
    const key = e.key.toLowerCase();
    if (key === "s" && !e.shiftKey) {
      e.preventDefault();
      handlePrimaryAction();
    } else if (key === "s" && e.shiftKey) {
      e.preventDefault();
      if (content.trim()) openSampleDialog("fork");
    } else if (key === "k" && !e.shiftKey) {
      e.preventDefault();
      setTemplatesOpen(false);
      setLibraryOpen(true);
    } else if (e.key === "Enter") {
      e.preventDefault();
      runAnalysis();
    } else if (e.key === ".") {
      e.preventDefault();
      setMode((m) => (m === "studio" ? "analysis" : "studio"));
    }
  });
  useEffect(() => {
    // CAPTURE phase: the studio's own keys (⌘K samples, ⌘Enter compare) win over
    // the source editor's bindings for the same keys (link, blank line).
    const handler = (e: KeyboardEvent) => {
      const wasPrevented = e.defaultPrevented;
      onShortcut(e);
      if (!wasPrevented && e.defaultPrevented) e.stopPropagation();
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, []);

  const contentLabel =
    loadedSampleName ?? (content.trim() ? "Untitled" : "Empty");

  // Print / Save PDF — the SAME canonical path every markdown surface uses
  // (`printMarkdownContent` -> `@ai-matrx/print/markdown`). Never a second
  // converter or stylesheet. More printables: the hub at /print.
  const handlePrint = () => {
    if (!content.trim()) {
      toast.info("Nothing to print yet");
      return;
    }
    printMarkdownContent(content, loaded?.sample.name ?? "Markdown");
  };

  // Every control lives in the page header's action set (inline icons on
  // desktop, the "More actions" menu beyond three, one sheet on phones) —
  // never a new row, strip or badge under the header.
  const headerActions: HeaderAction[] = [
    ...(previewUpdates === "manual" && mode === "studio"
      ? [{ icon: "RefreshCw", label: "Update preview", onPress: handleUpdatePreview }]
      : []),
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
    // The studio's own record kind is archivable where it is named (door law) —
    // from the header's action set, never a button in the "Loaded" info strip.
    ...(loadedSource?.kind === "document"
      ? [{ icon: "Archive", label: "Archive document", onPress: () => setArchiveOpen(true) }]
      : []),
    {
      icon: "BookOpen",
      label:
        samples.length + shared.samples.length > 0
          ? `Samples (${samples.length + shared.samples.length}) · ⌘K`
          : "Samples · ⌘K",
      onPress: () => setLibraryOpen(true),
    },
    {
      icon: "Layers",
      label: "Templates & built-in samples",
      onPress: () => setTemplatesOpen(true),
    },
    {
      icon: loaded && canWriteLoaded ? "SaveAll" : "Save",
      label:
        loaded && canWriteLoaded
          ? isDirty
            ? loaded.lib === "shared"
              ? "Update shared sample"
              : "Update"
            : "Saved"
          : "Save to my library",
      onPress: handlePrimaryAction,
    },
    ...(loaded
      ? [{ icon: "GitFork", label: "Fork into my library", onPress: handleForkAction }]
      : []),
    ...(loaded && canWriteLoaded
      ? [{ icon: "Tags", label: "Edit name, description & tags", onPress: () => openSampleDialog("edit") }]
      : []),
    ...(isAdmin
      ? [{
          icon: "Share2",
          label: "Save to the shared library",
          onPress: () => {
            if (!content.trim()) {
              toast.info("Nothing to save yet");
              return;
            }
            openSampleDialog("save-shared");
          },
        }]
      : []),
    { icon: "Copy", label: "Copy source", onPress: () => void handleCopySource() },
    { icon: "FileClock", label: "Restore last draft", onPress: () => void handleRestoreDraft() },
    {
      icon: previewUpdates === "live" ? "Hand" : "Zap",
      label:
        previewUpdates === "live"
          ? "Preview: live — switch to manual updates"
          : "Preview: manual — switch to live updates",
      onPress: () => {
        const next: PreviewUpdateMode = previewUpdates === "live" ? "manual" : "live";
        setManualContent(content);
        setPreviewUpdates(next);
      },
    },
    {
      icon: scrollSync ? "Unlink" : "Link",
      label: scrollSync ? "Turn scroll sync off" : "Turn scroll sync on",
      onPress: () => setScrollSync(!scrollSync),
    },
    ...(mode === "studio"
      ? [{
          icon: previewHidden ? "Eye" : "EyeOff",
          label: previewHidden ? "Show preview" : "Hide preview",
          onPress: () => setPreviewHidden((v) => !v),
        }]
      : []),
    {
      icon: fullScreen ? "Minimize2" : "Maximize2",
      label: fullScreen ? "Exit full screen" : "Full screen",
      onPress: () => setFullScreen((v) => !v),
    },
    { icon: "Play", label: "Run comparison · ⌘↵", onPress: runAnalysis },
    ...(isAdmin
      ? [{
          icon: "Microscope",
          label: mode === "inspect" ? "Close Inspect" : "Inspect (server events, processors)",
          onPress: () => setMode((m) => (m === "inspect" ? "studio" : "inspect")),
        }]
      : []),
  ];

  // Surface scope — built at trigger time (▶ Run), never on mount, so the
  // agent always sees the live buffer rather than a render-stale copy.
  const getScope = useCallback(() => {
    const selected = editorRef.current?.selectedText() || undefined;
    return createMarkdownStudioScope({
      content,
      document_label: contentLabel,
      is_from_library: Boolean(loaded),
      detected_blocks: detectRenderBlocks(content),
      is_dirty: isDirty,
      is_saving: saving,
      view_mode: mode,
      library_sample_count: samples.length,
      sample_id: loadedRef?.id ?? undefined,
      sample_name: loadedSampleName ?? undefined,
      selection: selected,
    });
  }, [
    content,
    contentLabel,
    loaded,
    isDirty,
    saving,
    mode,
    samples.length,
    loadedRef,
    loadedSampleName,
  ]);

  // Surface write handlers — the write half of the 360 loop (declared in
  // `markdown-studio.manifest.ts`). Every content write goes through the SAME
  // `setContent` the source editor's own `handleChange` calls, so the dirty flag
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

  const dialogIntent = sampleDialog.open ? sampleDialog.intent : "save";
  const dialogInitial =
    dialogIntent === "edit" && loaded
      ? {
          name: loaded.sample.name,
          description: loaded.sample.description ?? "",
          detectedBlocks: loaded.sample.detected_blocks ?? [],
          content: loaded.sample.content,
        }
      : {
          name: dialogIntent === "fork" && loadedSampleName ? `${loadedSampleName} (copy)` : "",
          description: "",
          detectedBlocks: [],
          content,
        };

  const showPreview = !previewHidden;

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/markdown-studio"
      getScope={getScope}
      isEditable
      getWriteHandlers={getWriteHandlers}
    >
    {/* matrx-touch-targets: the platform's 44px touch floor for every
        control in the studio on phones/touch (desktop density untouched). */}
    <div
      className={cn(
        "matrx-touch-targets flex h-full w-full flex-col bg-textured",
        // Full screen: the studio takes the whole window under the app
        // header (which keeps the studio's own actions reachable); Esc exits.
        fullScreen && "fixed inset-x-0 bottom-0 top-[var(--shell-header-h)] z-30",
      )}
    >
      <PageHeader>
        <HeaderToggle
          options={[
            { icon: "Eye", label: "Studio", value: "studio" },
            { icon: "GitCompare", label: "Analysis", value: "analysis" },
            { icon: "PenLine", label: "Editor", value: "editor" },
          ]}
          active={mode === "inspect" ? "studio" : mode}
          onChange={setMode}
          actions={headerActions}
        />
      </PageHeader>

      <div
        className="flex min-h-0 flex-1 flex-col"
        style={{ paddingTop: fullScreen || inAdminLane ? undefined : "var(--shell-header-h)" }}
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
          {loaded && (
            <Badge
              variant="outline"
              className="h-4 px-1.5 text-[10px] font-normal"
              title={
                loaded.lib === "shared" && !isAdmin
                  ? "A shared starter sample — fork it into your library to keep your changes"
                  : undefined
              }
            >
              {loaded.lib === "shared" ? (isAdmin ? "shared library" : "shared · read-only") : "from library"}
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
          {isDirty && !loadedSource && (loaded ? canWriteLoaded : true) && (
            <Badge
              variant="outline"
              className="h-4 px-1.5 text-[10px] font-normal border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
            >
              unsaved changes
            </Badge>
          )}
          {previewUpdates === "manual" && content !== manualContent && mode === "studio" && (
            <button
              type="button"
              onClick={handleUpdatePreview}
              className="rounded border border-primary/40 bg-primary/10 px-1.5 text-[10px] text-primary hover:bg-primary/20"
              title="The preview shows your last update — click to render the current text"
            >
              preview behind · update
            </button>
          )}
          <span className="ml-auto hidden text-muted-foreground font-mono sm:inline">
            ⌘S save · ⌘K samples · ⌘↵ analyze · ⌘. switch view
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
            <div
              className={cn(
                "flex h-full flex-col gap-2 p-3 lg:grid lg:gap-3",
                showPreview ? "lg:grid-cols-2" : "lg:grid-cols-1",
              )}
            >
              {/* Phones get ONE full-height pane at a time — two stacked panes
                  left the editor about two lines tall (RC-B1 verify D5). Each
                  pane's own header switches to the other: no tab strip row. */}
              <div
                className={cn(
                  "min-h-0 flex-1 lg:block lg:h-full",
                  mobilePane === "source" ? "flex flex-col" : "hidden",
                )}
              >
              <EditorPanel
                content={content}
                statsContent={deferredContent}
                onChange={handleChange}
                onClear={handleClear}
                onScroll={onEditorScroll}
                editorRef={editorRef}
                onSave={handlePrimaryAction}
                onShowPreview={showPreviewPane}
                getScope={getScope}
              />
              </div>
              {showPreview && (
              <div
                className={cn(
                  "min-h-0 flex-1 lg:block lg:h-full",
                  mobilePane === "preview" ? "flex flex-col" : "hidden",
                )}
              >
              <PreviewPanel
                content={previewContent}
                // The studio holds a COPY: the source rides read-only, so the
                // registry offers nothing that would change the original.
                contentSource={previewSource}
                sourceActions={loadedSource?.sourceActions}
                mode={previewMode}
                onModeChange={setPreviewMode}
                title={contentLabel}
                onContentChange={handleChange}
                onShowSource={showSourcePane}
                onPreviewScroll={onPreviewScroll}
                ref={previewScrollRef}
              />
              </div>
              )}
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
              key={loadedSource ? `${loadedSource.kind}:${loadedSource.id}` : (loadedRef?.id ?? "buffer")}
              content={content}
              title={contentLabel}
              contentSource={loadedSource?.contentSource ?? RAW_SOURCE}
              onContentChange={handleChange}
            />
          ) : mode === "inspect" && isAdmin ? (
            <InspectView content={deferredContent} />
          ) : (
            <AnalysisView
              content={content}
              contentLabel={contentLabel}
              runSignal={analysisRunSignal}
              userSamples={samples}
              sharedSamples={shared.samples}
            />
          )}
        </main>
      </div>

      {/* ── Library + templates panels ──────────────────────────────── */}
      <SampleLibrarySheet
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        loadedSampleId={loadedRef?.id ?? null}
        onLoad={handleLoadSample}
        sharedSamples={shared.samples}
        sharedLoading={shared.isLoading}
        onLoadShared={handleLoadShared}
        canManageShared={isAdmin}
        onArchiveShared={async (sample) => {
          await shared.remove(sample.id);
          if (loadedRef?.lib === "shared" && loadedRef.id === sample.id) {
            setLoadedRef(null);
          }
        }}
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

      {loadedSource?.kind === "document" && (
        <ArchiveRecordDialog
          open={archiveOpen}
          onOpenChange={setArchiveOpen}
          token="document"
          id={loadedSource.id}
          what={`"${contentLabel}"`}
          onArchived={handleClear}
          onRestored={() => void loadFromSource("document", loadedSource.id)}
        />
      )}

      {/* ── Save / fork / edit-details dialog (name, description, tags) ── */}
      <SampleEditor
        open={sampleDialog.open}
        onOpenChange={(o) => {
          if (!o && !saving) setSampleDialog({ open: false });
        }}
        mode={dialogIntent === "edit" ? "edit" : "create"}
        sessionKey={`${dialogIntent}:${dialogSession}`}
        initial={dialogInitial}
        busy={saving}
        title={
          dialogIntent === "fork"
            ? "Fork into your library"
            : dialogIntent === "save-shared"
              ? "Save to the shared library"
              : dialogIntent === "edit"
                ? "Edit sample details"
                : "Save to your library"
        }
        description={
          dialogIntent === "save-shared"
            ? "Everyone sees shared samples as read-only starter samples."
            : dialogIntent === "fork"
              ? `Branch "${loadedSampleName ?? "this sample"}" — the original stays untouched.`
              : dialogIntent === "edit"
                ? "Change the name, description or tags. The text itself is saved with Update."
                : "Name it, say what it is for, and check the detected block tags."
        }
        onConfirm={handleSampleDialogConfirm}
      />
    </div>
    </SurfaceRuntimeProvider>
  );
}
