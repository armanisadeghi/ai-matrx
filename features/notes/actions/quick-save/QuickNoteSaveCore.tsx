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
} from "lucide-react";
import { Button } from "@/components/ui/ButtonMine";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
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
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { cn } from "@/lib/utils";
import type { EditorMode } from "@/features/notes/components/NoteEditorCore";
import { RefinableContentEditor } from "@/components/content-refine/RefinableContentEditor";
import { useOpenNoteInWindow } from "@/features/notes/actions/useOpenNoteInWindow";
import { useOpenDiffViewerWindow } from "@/features/overlays/openers/diffViewerWindow";
import type { Note } from "@/features/notes/types";
import { useQuickNoteSave } from "./useQuickNoteSave";

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
  const openDiff = useOpenDiffViewerWindow();

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
              <Select value={folder} onValueChange={setFolder}>
                <SelectTrigger
                  id="qns-folder"
                  className="h-8 text-xs rounded-md w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-w-[min(90vw,360px)]">
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

      {/* Overwrite confirm — raised above WindowPanel */}
      <AlertDialog
        open={showOverwriteWarning}
        onOpenChange={setShowOverwriteWarning}
      >
        <AlertDialogPortal>
          <AlertDialogOverlay className={cn(ALERT_Z)} />
          <AlertDialogPrimitive.Content
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
          </AlertDialogPrimitive.Content>
        </AlertDialogPortal>
      </AlertDialog>
    </div>
  );
}
