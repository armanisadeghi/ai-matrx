"use client";

import React, { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Save,
  AlertTriangle,
  ExternalLink,
  ArrowRight,
  LayoutPanelLeft,
  Check,
  X,
  GitCompareArrows,
  FolderPlus,
} from "lucide-react";
import { Button } from "@/components/ui/ButtonMine";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogContentPrimitive,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import type { EditorMode } from "@/features/notes/components/NoteEditorCore";
import { RefinableContentEditor } from "@/components/content-refine/RefinableContentEditor";
import { useOpenNoteInWindow } from "@/features/notes/actions/useOpenNoteInWindow";
import { useOpenDiffViewerWindow } from "@/features/overlays/openers/diffViewerWindow";
import type { Note } from "@/features/notes/types";
import { useQuickNoteSave } from "./useQuickNoteSave";
import { NOTE_DRAFT_FIELDS } from "./quickNoteSaveVocabulary";
import { useSurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { CreateFolderDialog } from "@/features/notes/components/CreateFolderDialog";
import { createFolder } from "@/features/notes/service/notesService";

export type PostSaveAction = "newTab" | "navigate" | "openWindow" | "none";

export interface QuickNoteSaveCoreProps {
  initialContent: string;
  defaultFolder?: string;
  /** Pre-filled note title when the caller knows it (e.g. chat save). */
  defaultNoteName?: string;
  /** Compact footprint (popover). */
  compact?: boolean;
  /** Show post-save action row once a note is saved. Default true. */
  showPostSaveActions?: boolean;
  /** Initial editor mode (default "split"). */
  initialEditorMode?: EditorMode;
  onSaved?: (note: Note, action: PostSaveAction) => void;
  onCancel?: () => void;
  className?: string;
  saveLabel?: string;
  /**
   * Canonical `ui_surface.name` of the shell hosting this core, when that
   * shell publishes a surface (today: the Quick Note Save WINDOW). Passing it
   * registers this core's `note_draft` write handler against that surface, so
   * an agent bound to the window can stage a title / body / folder into the
   * live form. Omitted by the popover / dialog / overlay shells, which publish
   * no surface of their own — a core with no surfaceName registers nothing.
   */
  surfaceName?: string;
  /**
   * When the host chrome (WindowPanel) provides a footer slot element, the
   * Cancel / Save and post-save action buttons portal into it — they act on
   * the whole window, so they belong in the window footer, not the body.
   * Falls back to rendering inline at the bottom of the body when omitted.
   */
  footerHost?: HTMLElement | null;
}

// Z-index above WindowPanel (runtime z-index ~1000+)
const ALERT_Z = "z-[2147483600]";

export function QuickNoteSaveCore({
  initialContent,
  defaultFolder = "Scratch",
  defaultNoteName,
  compact = false,
  showPostSaveActions = true,
  initialEditorMode = "split",
  onSaved,
  onCancel,
  className,
  saveLabel,
  surfaceName,
  footerHost,
}: QuickNoteSaveCoreProps) {
  // Defensive: callers occasionally hand us a null content (e.g. when an
  // overlay opens from a cleared/legacy payload). Coerce to string so every
  // downstream `.length` / `.trim()` / `.slice()` call stays safe.
  const safeInitialContent =
    typeof initialContent === "string" ? initialContent : "";
  const router = useRouter();
  const openNoteInWindow = useOpenNoteInWindow();

  const {
    refine,
    noteName,
    setNoteName,
    folder,
    setFolder,
    mode,
    setMode,
    selectedNoteId,
    setSelectedNoteId,
    updateMethod,
    setUpdateMethod,
    selectedNote,
    allFolders,
    notesInFolder,
    isSaving,
    isSaveDisabled,
    savedNote,
    save,
  } = useQuickNoteSave({
    initialContent: safeInitialContent,
    defaultFolder,
    defaultNoteName,
  });

  const [showOverwriteWarning, setShowOverwriteWarning] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const openDiff = useOpenDiffViewerWindow();

  const handleCreateFolder = useCallback(
    async (folderName: string) => {
      await createFolder(folderName);
      setFolder(folderName);
    },
    [setFolder],
  );

  // Compare-before-apply: the existing note content is the baseline (old); the
  // content about to overwrite it is the incoming version (new), so the diff
  // reads as additions/removals the overwrite will make.
  const handlePreviewOverwrite = useCallback(() => {
    openDiff({
      original: selectedNote?.content ?? "",
      modified: refine.workingContent,
      originalLabel: selectedNote?.label ?? "Current note",
      modifiedLabel: "Incoming",
      title: "Preview overwrite",
      engine: "light",
      defaultView: "split",
    });
  }, [openDiff, selectedNote, refine.workingContent]);

  const handleSaveClick = useCallback(async () => {
    if (mode === "update" && updateMethod === "overwrite" && selectedNoteId) {
      setShowOverwriteWarning(true);
      return;
    }
    await save();
  }, [mode, updateMethod, selectedNoteId, save]);

  const handleOverwriteConfirm = useCallback(async () => {
    setShowOverwriteWarning(false);
    await save();
  }, [save]);

  // Write half of the Quick Note Save surface (manifest `writeTargets`): ONE
  // composite draft target, registered by name because the WINDOW owns the
  // surface while this core owns the form state. Every accepted key lands
  // through the same setter the user's own typing uses — `setNoteName`,
  // `setFolder`, and the refine primitive's `setEditedContent` (the editor's
  // own onChange) — so nothing here is a parallel write path, and the user
  // still presses Save Note.
  //
  // The save MODE gates the payload: a title and a folder describe a NEW note,
  // and body text may only be staged where it is additive (a new note, or an
  // append). Everything that could destroy an existing note — saving, picking
  // the mode, choosing the target note, choosing overwrite — stays human and
  // is not a target at all. Bad shapes THROW; the writeback seam turns a throw
  // into the error envelope the agent reads.
  useSurfaceWriteHandlers(surfaceName ?? null, {
    note_draft: (value: unknown) => {
      if (savedNote)
        throw new Error(
          "This capture has already been saved — the form is read-only now. Open a new Quick Note Save to capture something else.",
        );

      if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new Error(
          `note_draft expects an object with any of: ${NOTE_DRAFT_FIELDS.join(" | ")}.`,
        );

      const draft = value as Record<string, unknown>;
      const keys = Object.keys(draft);
      if (keys.length === 0)
        throw new Error("note_draft needs at least one field to stage.");

      const unknown = keys.filter(
        (key) => !(NOTE_DRAFT_FIELDS as readonly string[]).includes(key),
      );
      if (unknown.length > 0)
        throw new Error(
          `note_draft does not accept: ${unknown.join(", ")}. Allowed fields: ${NOTE_DRAFT_FIELDS.join(" | ")}.`,
        );

      /** The sent string for a present key; `undefined` when the key is absent. */
      const field = (key: string): string | undefined => {
        if (!(key in draft)) return undefined;
        const raw = draft[key];
        if (typeof raw !== "string")
          throw new Error(`note_draft.${key} expects a string.`);
        if (!raw.trim())
          throw new Error(
            `note_draft.${key} cannot be empty — send a real value or omit the field.`,
          );
        return raw;
      };

      const nextName = field("note_name");
      const nextFolder = field("folder");
      const nextContent = field("content");

      // Mode coherence — a value for the wrong mode would land in an input the
      // user cannot see, or would silently drop their chosen target note.
      if (mode === "update") {
        const newNoteOnly = [
          nextName !== undefined ? "note_name" : null,
          nextFolder !== undefined ? "folder" : null,
        ].filter(Boolean);
        if (newNoteOnly.length > 0)
          throw new Error(
            `The form is saving into an EXISTING note, so ${newNoteOnly.join(" and ")} cannot be staged: the title input is not rendered in this mode, and the folder select only filters which notes are listed, so changing it would drop the note the user chose. Ask the user to switch to a new note if that is what they want.`,
          );
        // `updateMethod` is this form's own state, typed from UPDATE_METHODS —
        // TypeScript rejects a comparison against anything not in that union,
        // so this check cannot drift from the vocabulary.
        if (nextContent !== undefined && updateMethod === "overwrite")
          throw new Error(
            `The form is set to overwrite an existing note, so staging content would replace that note's whole body — refused. Ask the user to switch the update method to "append" (or save to a new note) if they want your text applied.`,
          );
      }

      if (nextFolder !== undefined) {
        const folderName = nextFolder.trim();
        if (!allFolders.includes(folderName))
          throw new Error(
            `"${folderName}" is not one of this form's folders, and this target never creates one. Choose an exact (case-sensitive) name from: ${allFolders.join(" | ")}.`,
          );
        setFolder(folderName);
      }
      if (nextName !== undefined) setNoteName(nextName.trim());
      if (nextContent !== undefined) refine.setEditedContent(nextContent);
    },
  });

  const handlePostSaveAction = useCallback(
    (action: PostSaveAction) => {
      if (!savedNote) return;
      if (action === "newTab") {
        window.open(`/notes/${savedNote.id}`, "_blank", "noopener,noreferrer");
      } else if (action === "navigate") {
        router.push(`/notes/${savedNote.id}`);
      } else if (action === "openWindow") {
        openNoteInWindow({ noteId: savedNote.id });
      }
      onSaved?.(savedNote, action);
    },
    [savedNote, router, openNoteInWindow, onSaved],
  );

  // Footer actions are window-level, so they portal into the host chrome's
  // footer slot when one is provided (same pattern as TaskQuickCreateCore).
  const footerBtnClass = footerHost
    ? "h-7 px-2 text-xs gap-1.5 rounded-md"
    : "h-8 text-xs gap-1.5 rounded-md";
  const footerActions =
    savedNote && showPostSaveActions ? (
      <>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => handlePostSaveAction("newTab")}
          className={footerBtnClass}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">New tab</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => handlePostSaveAction("openWindow")}
          className={footerBtnClass}
        >
          <LayoutPanelLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Window</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => handlePostSaveAction("navigate")}
          className={footerBtnClass}
        >
          <ArrowRight className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Go to note</span>
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => handlePostSaveAction("none")}
          className={footerBtnClass}
        >
          Done
        </Button>
      </>
    ) : savedNote ? null : (
      <>
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isSaving}
            className={footerBtnClass}
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          onClick={handleSaveClick}
          disabled={isSaveDisabled}
          className={footerBtnClass}
        >
          <Save className="h-3.5 w-3.5" />
          {isSaving
            ? "Saving…"
            : (saveLabel ?? (mode === "create" ? "Save Note" : "Update Note"))}
        </Button>
      </>
    );

  return (
    <div
      className={cn(
        "flex flex-col min-h-0 h-full",
        compact ? "gap-1.5" : "gap-2",
        className,
      )}
    >
      {/* Post-save banner */}
      {savedNote && (
        <div className="shrink-0 flex items-center gap-2 rounded-md border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs">
          <Check className="h-3.5 w-3.5 text-green-600" />
          <span className="font-medium">
            Saved to <span className="font-semibold">{savedNote.label}</span>
          </span>
          <span className="text-muted-foreground">
            · {refine.charCount.toLocaleString()} chars
          </span>
        </div>
      )}

      {/* Toolbar + trim sliders + editor — the shared refine primitive */}
      <RefinableContentEditor
        refine={refine}
        initialEditorMode={initialEditorMode}
        readOnly={!!savedNote}
        placeholder="Enter your note content..."
        className="flex-1 min-h-0"
        resetKeySuffix={savedNote?.id ?? "draft"}
      />

      {/* Target row */}
      {!savedNote && (
        <div className="shrink-0 flex flex-col gap-2">
          {/* Joined pill toggle */}
          <div className="inline-flex self-start rounded-md border border-border overflow-hidden h-8">
            <button
              type="button"
              onClick={() => setMode("create")}
              className={cn(
                "px-3 text-xs font-medium transition-colors border-r border-border",
                mode === "create"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background hover:bg-accent text-foreground",
              )}
            >
              New Note
            </button>
            <button
              type="button"
              onClick={() => setMode("update")}
              className={cn(
                "px-3 text-xs font-medium transition-colors",
                mode === "update"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background hover:bg-accent text-foreground",
              )}
            >
              Existing Note
            </button>
          </div>

          <div
            className={cn(
              "grid gap-2 min-w-0",
              compact
                ? "grid-cols-1"
                : "grid-cols-1 sm:grid-cols-[180px_minmax(0,1fr)]",
            )}
          >
            <div className="grid gap-1 min-w-0">
              <Label htmlFor="qns-folder" className="text-xs">
                Folder
              </Label>
              <Select
                value={folder}
                onValueChange={(value) => {
                  if (value === "__create_folder__") {
                    setCreateFolderOpen(true);
                    return;
                  }
                  setFolder(value);
                }}
              >
                <SelectTrigger
                  id="qns-folder"
                  className="h-8 text-xs rounded-md w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-w-[min(90vw,360px)]">
                  <SelectItem
                    value="__create_folder__"
                    className="text-primary"
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <FolderPlus className="h-3.5 w-3.5" /> New folder…
                    </span>
                  </SelectItem>
                  <SelectSeparator />
                  {allFolders.map((f) => (
                    <SelectItem key={f} value={f}>
                      <span className="truncate">{f}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {mode === "create" ? (
              <div className="grid gap-1 min-w-0">
                <Label htmlFor="qns-name" className="text-xs">
                  Note Name
                </Label>
                <Input
                  id="qns-name"
                  value={noteName}
                  onChange={(e) => setNoteName(e.target.value)}
                  placeholder="Note name..."
                  className="h-8 text-xs rounded-md w-full"
                  style={{ fontSize: "16px" }}
                />
              </div>
            ) : (
              <div className="grid gap-1 min-w-0">
                <Label htmlFor="qns-select" className="text-xs">
                  Note
                </Label>
                <Select
                  value={selectedNoteId}
                  onValueChange={setSelectedNoteId}
                >
                  <SelectTrigger
                    id="qns-select"
                    className="h-8 text-xs rounded-md w-full min-w-0"
                  >
                    <SelectValue placeholder="Choose a note…">
                      <span className="truncate block max-w-full">
                        {selectedNote?.label ?? "Choose a note…"}
                      </span>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-w-[min(90vw,480px)]">
                    {notesInFolder.length > 0 ? (
                      notesInFolder.map((n) => (
                        <SelectItem key={n.id} value={n.id}>
                          <span className="truncate block max-w-[min(80vw,400px)]">
                            {n.label}
                          </span>
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="__none" disabled>
                        No notes in this folder
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {mode === "update" && selectedNoteId && (
            <div className="grid gap-1">
              <Label className="text-xs">Update Method</Label>
              <RadioGroup
                value={updateMethod}
                onValueChange={(v) =>
                  setUpdateMethod(v as "append" | "overwrite")
                }
                className="flex flex-wrap gap-4"
              >
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="append" id="qns-append" />
                  <Label
                    htmlFor="qns-append"
                    className="cursor-pointer font-normal text-xs"
                  >
                    Append
                  </Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="overwrite" id="qns-overwrite" />
                  <Label
                    htmlFor="qns-overwrite"
                    className="cursor-pointer font-normal text-xs flex items-center gap-1.5"
                  >
                    Overwrite
                    {updateMethod === "overwrite" && (
                      <Badge
                        variant="destructive"
                        className="text-[10px] h-4 rounded-md"
                      >
                        <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                        Warning
                      </Badge>
                    )}
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}
        </div>
      )}

      {/* Footer — portals into the window chrome when a slot is provided */}
      {footerHost ? (
        createPortal(
          <div className="flex items-center gap-2">{footerActions}</div>,
          footerHost,
        )
      ) : (
        <div className="shrink-0 flex items-center justify-end gap-2 pt-1 pb-safe">
          {footerActions}
        </div>
      )}

      <CreateFolderDialog
        open={createFolderOpen}
        onOpenChange={setCreateFolderOpen}
        onConfirm={handleCreateFolder}
        existingFolders={allFolders}
        description="Create a folder and use it as this note's destination."
        confirmLabel="Create & Select"
      />

      {/* Overwrite confirm — raised above WindowPanel */}
      <AlertDialog
        open={showOverwriteWarning}
        onOpenChange={setShowOverwriteWarning}
      >
        <AlertDialogPortal>
          <AlertDialogOverlay className={cn(ALERT_Z)} />
          <AlertDialogContentPrimitive
            className={cn(
              "fixed left-[50%] top-[50%] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 matrx-glass-core p-6 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg",
              ALERT_Z,
            )}
          >
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Confirm Overwrite
              </AlertDialogTitle>
              <AlertDialogDescription>
                You are about to replace the content of{" "}
                <strong>{selectedNote?.label}</strong>. This action cannot be
                undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <Button
                variant="outline"
                onClick={handlePreviewOverwrite}
                className="gap-1.5"
              >
                <GitCompareArrows className="h-4 w-4" />
                Preview changes
              </Button>
              <AlertDialogAction
                onClick={handleOverwriteConfirm}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Overwrite
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContentPrimitive>
        </AlertDialogPortal>
      </AlertDialog>
    </div>
  );
}
