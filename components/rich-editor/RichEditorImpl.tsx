"use client";

// components/rich-editor/RichEditorImpl.tsx
//
// THE ONE EDITOR's shell (rich-content PLAN decisions 5, 6, 11): three views
// over ONE source text —
//   Visual   Tiptap 3; unchanged blocks are written back as their stored bytes
//   Source   CodeMirror 6 live preview; the source is the document
//   Preview  the shared renderer (RichDocument) with the full action set
// — plus the save gate (planSave): a save stores only what changed, never
// touches a protected island the person did not change on purpose, and asks
// (never refuses) when it would. Everything else — slash menu, selection
// toolbar, block handles, tables, callouts, checklists, footnotes, find &
// replace, outline, counts, focus mode, shortcuts, paste, dictation, the
// right-click AI menu — rides on those three views.
//
// Loaded only through RichEditor.tsx (one dynamic boundary).

import "./rich-editor.css";
import { useDeferredValue, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlignLeft,
  Code2,
  Eye,
  Focus,
  Keyboard,
  ListTree,
  Loader2,
  Mic,
  MicOff,
  Save,
  Search,
  ShieldCheck,
  Type,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, useIsMobile } from "@ai-matrx/design-system";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v3/utils/build-application-scope";
import { useMicField } from "@/features/audio/hooks/useMicField";
import { useFileUpload } from "@/features/files/handler/hooks/useFileUpload";
import { fileUrls } from "@/features/files/handler/utils/python-base";
import { RichDocument } from "@/features/rich-document/RichDocument";
import type { SourceFeature } from "@/types/python-generated/source-attribution";
import type { ContentSource } from "@/features/rich-document/types";
import { planSave, type IslandDelta, type SavePlan } from "./core/save-plan";
import { measureText } from "./core/text-metrics";
import { outlineOf, type OutlineEntry } from "./core/outline";
import type { DeclaredVariable } from "./core/variables";
import type { VisualLoadStats } from "./core/visual-document";
import { RichEditorContext, type RichEditorContextValue } from "./RichEditorContext";
import { VisualEditor, type EditorViewHandle } from "./visual/VisualEditor";
import { SourceEditor } from "./source/SourceEditor";
import type { RichShellActions } from "./visual/visual-extensions";
import { FindReplacePanel } from "./panels/FindReplacePanel";
import { OutlinePanel } from "./panels/OutlinePanel";
import { ShortcutsDialog } from "./panels/ShortcutsDialog";
import { KindPicker } from "./panels/KindPicker";
import { islandMeta, inlineIslandLabel } from "./islands/island-meta";

export type RichEditorView = "visual" | "source" | "preview";
const VIEWS: RichEditorView[] = ["visual", "source", "preview"];

export interface RichEditorProps {
  /** The stored text — what the save gate compares against. */
  value: string;
  /**
   * Store the text. Resolve with the text AS STORED (read back) and the editor
   * proves it byte-for-byte; resolve with nothing to trust the write.
   */
  onSave?: (text: string, plan: SavePlan) => Promise<string | void>;
  /** Every change to the working text. */
  onChange?: (text: string) => void;
  /** Variables the surface declares; omit for a surface without variables (a note). */
  variables?: readonly DeclaredVariable[] | null;
  onDeclareVariable?: (name: string) => void;
  /** The view it opens in: source for prompts/templates/skills, visual for prose. */
  defaultView?: RichEditorView;
  readOnly?: boolean;
  placeholder?: string;
  /** The right-click menu's surface + attribution. */
  surfaceName?: string;
  sourceFeature?: SourceFeature;
  /** The preview's action source (RichDocument). */
  contentSource?: ContentSource;
  /** Label for the save button. */
  saveLabel?: string;
  className?: string;
  /** Extra controls on the right of the toolbar (host actions). */
  toolbarExtras?: ReactNode;
}

function describeDelta(delta: IslandDelta): string {
  const raw = delta.before ?? delta.after ?? "";
  const name = raw.startsWith("{{") ? raw : `${islandMeta(delta.islandType, raw).label || inlineIslandLabel(delta.islandType)}`;
  switch (delta.kind) {
    case "removed":
      return `${name} would be removed`;
    case "changed":
      return `${name} would be changed`;
    case "swallowed":
      return `${name} would stop being protected — something above it (an unclosed code block or tag) now swallows it`;
    default:
      return `${name} would be added`;
  }
}

const VIEW_META: Record<RichEditorView, { label: string; icon: typeof Type }> = {
  visual: { label: "Visual", icon: Type },
  source: { label: "Source", icon: Code2 },
  preview: { label: "Preview", icon: Eye },
};

export default function RichEditorImpl({
  value,
  onSave,
  onChange,
  variables = null,
  onDeclareVariable,
  defaultView = "visual",
  readOnly = false,
  placeholder,
  surfaceName = "matrx-user/markdown-studio",
  sourceFeature = "documents",
  contentSource = { type: "raw" },
  saveLabel = "Save",
  className,
  toolbarExtras,
}: RichEditorProps) {
  const isMobile = useIsMobile();
  const [stored, setStored] = useState(value);
  const [current, setCurrent] = useState(value);
  const [view, setView] = useState<RichEditorView>(defaultView);
  const [mountKey, setMountKey] = useState(0);
  const [findMode, setFindMode] = useState<null | "find" | "replace">(null);
  const [outlineOpen, setOutlineOpen] = useState(!isMobile);
  const [focusMode, setFocusMode] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [renderIslands, setRenderIslands] = useState(true);
  const [loadStats, setLoadStats] = useState<VisualLoadStats | null>(null);
  const [pendingPlan, setPendingPlan] = useState<SavePlan | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<null | { at: Date; verified: boolean | null }>(null);
  const [linkDialog, setLinkDialog] = useState<{ open: boolean; href: string }>({ open: false, href: "" });
  const [kindRequest, setKindRequest] = useState<((markdown: string | null) => void) | null>(null);
  const approved = useRef(new Set<string>());
  const handle = useRef<EditorViewHandle>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const { upload } = useFileUpload();

  // A new document from the host resets the editor to it.
  const lastValue = useRef(value);
  useEffect(() => {
    if (value === lastValue.current) return;
    lastValue.current = value;
    setStored(value);
    setCurrent(value);
    approved.current.clear();
    setMountKey((key) => key + 1);
  }, [value]);

  const deferred = useDeferredValue(current);
  const metrics = measureText(deferred);
  const outline = outlineOf(deferred);
  const dirty = current !== stored;

  const updateCurrent = (text: string) => {
    setCurrent(text);
    onChange?.(text);
  };

  const flush = () => {
    const text = handle.current?.flush() ?? current;
    if (text !== current) updateCurrent(text);
    return text;
  };

  const switchView = (next: RichEditorView) => {
    if (next === view) return;
    flush();
    handle.current?.clearFind();
    setView(next);
    setMountKey((key) => key + 1);
  };

  const doSave = async (plan: SavePlan) => {
    if (!onSave) return;
    setSaving(true);
    try {
      const readBack = await onSave(plan.text, plan);
      const storedNow = typeof readBack === "string" ? readBack : plan.text;
      const verified = typeof readBack === "string" ? readBack === plan.text : null;
      setStored(storedNow);
      lastValue.current = storedNow;
      approved.current.clear();
      setSaveState({ at: new Date(), verified });
      if (verified === false) {
        toast.error("Saved, but what the database holds differs from the editor. Reload to see exactly what was stored.");
      }
    } catch (error) {
      toast.error(`Not saved: ${error instanceof Error ? error.message : String(error)}. Your text is still here — try again.`);
    } finally {
      setSaving(false);
    }
  };

  const save = () => {
    if (!onSave || readOnly || saving) return;
    const text = flush();
    const plan = planSave(stored, text, { approvedIslands: approved.current });
    if (!plan.changed) {
      toast.info("Nothing changed — the stored text is already exactly this.");
      return;
    }
    if (plan.needsConsent.length || plan.error) {
      setPendingPlan(plan);
      return;
    }
    void doSave(plan);
  };

  const pickImage = () => imageInput.current?.click();
  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      const uploaded = await upload({ kind: "file", file }, { folderPath: "Editor images" });
      const alt = file.name.replace(/\.[^.]+$/, "").replace(/[[\]]/g, "");
      return `![${alt}](${fileUrls(uploaded.fileId).inline})`;
    } catch (error) {
      toast.error(`The image did not upload: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  };

  const shellRef = useRef<RichShellActions | null>(null);
  const liveShell: RichShellActions = {
    save,
    find: () => setFindMode("find"),
    replace: () => setFindMode("replace"),
    toggleOutline: () => setOutlineOpen((open) => !open),
    toggleFocus: () => setFocusMode((on) => !on),
    cycleView: () => switchView(VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length] ?? "visual"),
    showHelp: () => setHelpOpen(true),
    showWordCount: () =>
      toast.info(`${metrics.words.toLocaleString()} words · ${metrics.characters.toLocaleString()} characters · ${metrics.readingMinutes} min read`),
    editLink: () => setLinkDialog({ open: true, href: handle.current?.currentLink() ?? "https://" }),
    pickKind: () => new Promise<string | null>((resolve) => setKindRequest(() => resolve)),
    pickImage,
    uploadImage,
    variables: () => variables,
    declareVariable: (name) => onDeclareVariable?.(name),
  };
  useEffect(() => {
    shellRef.current = liveShell;
  });
  // Stable facade: extensions are created once and always call the latest shell.
  const [shell] = useState<RichShellActions>(() => ({
    save: () => shellRef.current?.save(),
    find: () => shellRef.current?.find(),
    replace: () => shellRef.current?.replace(),
    toggleOutline: () => shellRef.current?.toggleOutline(),
    toggleFocus: () => shellRef.current?.toggleFocus(),
    cycleView: () => shellRef.current?.cycleView(),
    showHelp: () => shellRef.current?.showHelp(),
    showWordCount: () => shellRef.current?.showWordCount(),
    editLink: () => shellRef.current?.editLink(),
    pickKind: () => shellRef.current?.pickKind() ?? Promise.resolve(null),
    pickImage: () => shellRef.current?.pickImage(),
    uploadImage: (file) => shellRef.current?.uploadImage(file) ?? Promise.resolve(null),
    variables: () => shellRef.current?.variables() ?? null,
    declareVariable: (name) => shellRef.current?.declareVariable(name),
  }));

  const contextValue: RichEditorContextValue = {
    variables,
    approveIsland: (raw) => approved.current.add(raw),
    uploadImage,
    pickKind: shell.pickKind,
    onDeclareVariable,
    readOnly,
  };

  // Dictation (ProTextarea's power, the shared recorder): the final transcript
  // is inserted at the cursor of whichever view is showing.
  const mic = useMicField({
    label: "Editor",
    getValue: () => "",
    writeValue: () => undefined,
    onTranscriptionComplete: (text) => {
      if (text.trim()) handle.current?.replaceSelection(text.trim());
    },
    onTranscriptionError: (message) => toast.error(`Dictation stopped: ${message}`),
  });

  const getApplicationScope = () => {
    const selected = handle.current?.selectedText() ?? "";
    return buildApplicationScopeFromMenuContext({
      selectedText: selected,
      selectionRange: null,
      contextData: { content: current, active_text: selected || current },
    });
  };

  const jump = (entry: OutlineEntry) => {
    if (view === "preview") switchView("visual");
    window.setTimeout(() => handle.current?.scrollToHeading(entry.slug, entry.offset), view === "preview" ? 200 : 0);
    if (isMobile) setOutlineOpen(false);
  };

  const lockedCount = (loadStats?.lockedBlocks ?? 0) + (loadStats?.lockedChildren ?? 0);

  const body =
    view === "preview" ? (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-6 sm:px-10">
          <RichDocument
            content={current}
            source={contentSource}
            enableContextMenu
            hideCopyButton
            allowFullScreenEditor={false}
            actions={{ exclude: ["edit", "delete-message"] }}
          />
        </div>
      </div>
    ) : (
      <EditableContextMenu
        sourceFeature={sourceFeature}
        surfaceName={surfaceName}
        getApplicationScope={getApplicationScope}
        onTextReplace={(text) => handle.current?.replaceSelection(text)}
        onTextInsertBefore={(text) => handle.current?.insertText(text, "before")}
        onTextInsertAfter={(text) => handle.current?.insertText(text, "after")}
        onSave={onSave ? save : undefined}
        className="h-full"
      >
        {view === "visual" ? (
          <VisualEditor
            key={`visual-${mountKey}`}
            initialText={current}
            onChange={updateCurrent}
            onLoadStats={setLoadStats}
            shell={shell}
            placeholder={placeholder}
            focusMode={focusMode}
            handleRef={handle}
          />
        ) : (
          <SourceEditor
            key={`source-${mountKey}`}
            initialText={current}
            onChange={updateCurrent}
            shell={shell}
            placeholder={placeholder}
            focusMode={focusMode}
            renderIslands={renderIslands}
            handleRef={handle}
          />
        )}
      </EditableContextMenu>
    );

  return (
    <RichEditorContext.Provider value={contextValue}>
      <div className={cn("flex h-full min-h-0 flex-col bg-textured", className)} data-testid="rich-editor">
        {/* ── Toolbar ─────────────────────────────────────────────────── */}
        {!focusMode && (
          <div className="matrx-touch-targets flex min-h-10 items-center gap-1 overflow-x-auto border-b border-border bg-card/80 px-2 py-1 backdrop-blur">
            <div role="tablist" aria-label="View" className="flex shrink-0 items-center rounded-md border border-border bg-background/60 p-0.5">
              {VIEWS.map((option) => {
                const Icon = VIEW_META[option].icon;
                return (
                  <button
                    key={option}
                    type="button"
                    role="tab"
                    aria-selected={view === option}
                    onClick={() => switchView(option)}
                    className={cn(
                      "flex h-7 items-center gap-1 rounded px-2 text-xs font-medium text-muted-foreground",
                      view === option && "bg-primary/10 text-primary",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {VIEW_META[option].label}
                  </button>
                );
              })}
            </div>
            <span className="mx-1 h-5 w-px shrink-0 bg-border" />
            <ToolbarButton label="Find & replace (⌘F)" active={findMode !== null} onClick={() => setFindMode((mode) => (mode ? null : "find"))} disabled={view === "preview"}>
              <Search className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton label="Outline (⌘⌥H)" active={outlineOpen} onClick={() => setOutlineOpen((open) => !open)}>
              <ListTree className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton label="Focus mode (⌘⇧F)" active={focusMode} onClick={() => setFocusMode((on) => !on)} disabled={view === "preview"}>
              <Focus className="h-4 w-4" />
            </ToolbarButton>
            {view === "source" && (
              <ToolbarButton label={renderIslands ? "Show protected blocks as source" : "Render protected blocks"} active={renderIslands} onClick={() => setRenderIslands((on) => !on)}>
                <AlignLeft className="h-4 w-4" />
              </ToolbarButton>
            )}
            {mic.available && !readOnly && view !== "preview" && (
              <ToolbarButton
                label={mic.isRecording ? "Stop dictation" : mic.isTranscribing ? "Finishing the transcript…" : "Dictate at the cursor"}
                active={mic.isRecording}
                onClick={() => void mic.handleVoiceClick()}
              >
                {mic.isTranscribing ? <Loader2 className="h-4 w-4 animate-spin" /> : mic.isRecording ? <MicOff className="h-4 w-4 text-destructive" /> : <Mic className="h-4 w-4" />}
              </ToolbarButton>
            )}
            <ToolbarButton label="Keyboard shortcuts (⌘/)" onClick={() => setHelpOpen(true)}>
              <Keyboard className="h-4 w-4" />
            </ToolbarButton>
            <div className="ml-auto flex shrink-0 items-center gap-1">
              {toolbarExtras}
              {onSave && !readOnly && (
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className={cn(
                    "flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium",
                    dirty ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border border-border text-muted-foreground",
                  )}
                  title="Save (⌘S) — only what you changed is written"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {dirty ? saveLabel : "Saved"}
                </button>
              )}
            </div>
          </div>
        )}
        {mic.isRecording && mic.liveTranscript && (
          <div className="border-b border-border bg-primary/5 px-4 py-1 text-xs text-muted-foreground" aria-live="polite">
            Hearing: {mic.liveTranscript}
          </div>
        )}
        {findMode && view !== "preview" && (
          <FindReplacePanel
            showReplace={findMode === "replace"}
            onFind={(query, options, step) =>
              handle.current?.find(query, options, step) ?? { count: 0, current: -1, skippedProtected: 0, error: null }
            }
            onReplace={(query, replacement, options) => {
              for (const raw of handle.current?.replaceCurrent(query, replacement, options) ?? []) approved.current.add(raw);
            }}
            onReplaceAll={(query, replacement, options) => {
              const before = handle.current?.find(query, options).count ?? 0;
              for (const raw of handle.current?.replaceAll(query, replacement, options) ?? []) approved.current.add(raw);
              return before;
            }}
            onClose={() => {
              handle.current?.clearFind();
              setFindMode(null);
              handle.current?.focus();
            }}
          />
        )}

        {/* ── Body ────────────────────────────────────────────────────── */}
        <div className="flex min-h-0 flex-1">
          {outlineOpen && !focusMode && !isMobile && (
            <aside className="hidden w-56 shrink-0 border-r border-border bg-card/40 md:block">
              <OutlinePanel entries={outline} onJump={jump} />
            </aside>
          )}
          <div className="min-h-0 min-w-0 flex-1">{body}</div>
        </div>

        {/* ── Status bar ──────────────────────────────────────────────── */}
        {!focusMode && (
          <div className="flex min-h-7 flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-border bg-card/60 px-3 py-1 text-[11px] text-muted-foreground pb-safe">
            <span>
              {metrics.words.toLocaleString()} words · {metrics.characters.toLocaleString()} characters · {metrics.readingMinutes} min read
            </span>
            {metrics.islands > 0 && (
              <span className="flex items-center gap-1" title="Kinds, XML sections, code, math, variables and other protected content are never rewritten by the editor.">
                <ShieldCheck className="h-3 w-3" /> {metrics.islands} protected
              </span>
            )}
            {view === "visual" && lockedCount > 0 && (
              <span title="Markdown the visual editor cannot hold byte-for-byte (tables it can't map, raw HTML, indented code…) is shown rendered and kept exactly as written; edit it with its pencil or in Source.">
                {lockedCount} kept as written
              </span>
            )}
            <span className="ml-auto">
              {dirty
                ? "Unsaved changes"
                : saveState
                  ? `Saved ${saveState.at.toLocaleTimeString()}${saveState.verified ? " · verified byte-for-byte" : ""}`
                  : "No changes"}
            </span>
          </div>
        )}
      </div>

      {/* ── Mobile outline ────────────────────────────────────────────── */}
      {isMobile && (
        <Sheet open={outlineOpen} onOpenChange={setOutlineOpen}>
          <SheetContent side="bottom" className="h-[70dvh] p-0 pb-safe">
            <SheetHeader className="sr-only">
              <SheetTitle>Outline</SheetTitle>
            </SheetHeader>
            <OutlinePanel entries={outline} onJump={jump} />
          </SheetContent>
        </Sheet>
      )}

      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />

      <KindPicker
        open={kindRequest !== null}
        onResolve={(markdown) => {
          kindRequest?.(markdown);
          setKindRequest(null);
        }}
      />

      <TextInputDialog
        open={linkDialog.open}
        onOpenChange={(open) => setLinkDialog((state) => ({ ...state, open }))}
        title="Link"
        description="Paste the address. Leave it empty to remove the link."
        placeholder="https://"
        defaultValue={linkDialog.href}
        confirmLabel="Apply"
        onConfirm={(href) => {
          handle.current?.editLink(href.trim() && href.trim() !== "https://" ? href.trim() : null);
          setLinkDialog({ open: false, href: "" });
        }}
      />

      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          void uploadImage(file).then((markdown) => {
            if (markdown) handle.current?.replaceSelection(markdown);
          });
        }}
      />

      <ConfirmDialog
        open={pendingPlan !== null}
        onOpenChange={(open) => !open && setPendingPlan(null)}
        title="This save changes protected content"
        description={
          pendingPlan?.error ??
          "Kinds, XML sections, code, math and {{variables}} are protected. You did not change these through their own editors, so here is exactly what saving would do:"
        }
        content={
          pendingPlan && (
            <ul className="max-h-60 list-disc space-y-1 overflow-y-auto pl-5 text-sm">
              {pendingPlan.needsConsent.map((delta, index) => (
                <li key={`${delta.at}-${index}`}>{describeDelta(delta)}</li>
              ))}
            </ul>
          )
        }
        confirmLabel="Save anyway"
        cancelLabel="Go back and fix it"
        onConfirm={async () => {
          const plan = pendingPlan;
          setPendingPlan(null);
          if (plan) await doSave(plan);
        }}
      />
    </RichEditorContext.Provider>
  );
}

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40",
        active && "bg-primary/10 text-primary",
      )}
    >
      {children}
    </button>
  );
}
