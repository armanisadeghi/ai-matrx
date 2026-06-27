"use client";
// features/code-files/actions/QuickSaveCodeCore.tsx
//
// Presentational core for Quick Save Code. Intentionally framework-agnostic:
// does not own its own dialog/overlay/popover wrapper — callers render it
// inside whatever shell they need.

import React, { useCallback } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  Check,
  FolderPlus,
  GitCompareArrows,
  LayoutPanelLeft,
  Save,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/ButtonMine";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { useOpenDiffViewerWindow } from "@/features/overlays/openers/diffViewerWindow";
import type { CodeFile } from "../redux/code-files.types";
import { useQuickSaveCode } from "./useQuickSaveCode";

export type CodePostSaveAction = "newTab" | "openWindow" | "navigate" | "none";

export interface QuickSaveCodeCoreProps {
  initialContent: string;
  initialLanguage?: string;
  suggestedName?: string;
  defaultFolderId?: string | null;
  compact?: boolean;
  showPostSaveActions?: boolean;
  onSaved?: (file: CodeFile, action: CodePostSaveAction) => void;
  onCancel?: () => void;
  className?: string;
}

export function QuickSaveCodeCore({
  initialContent,
  initialLanguage,
  suggestedName,
  defaultFolderId = null,
  compact = false,
  showPostSaveActions = true,
  onSaved,
  onCancel,
  className,
}: QuickSaveCodeCoreProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const {
    content,
    setContent,
    name,
    setName,
    language,
    setLanguage,
    folderId,
    setFolderId,
    mode,
    setMode,
    selectedFileId,
    setSelectedFileId,
    selectedFile,
    updateMethod,
    setUpdateMethod,
    folders,
    filesInFolder,
    languageOptions,
    createFolder,
    isSaving,
    isSaveDisabled,
    savedFile,
    save,
  } = useQuickSaveCode({
    initialContent,
    initialLanguage,
    suggestedName,
    defaultFolderId,
  });

  const [showOverwrite, setShowOverwrite] = React.useState(false);
  const openDiff = useOpenDiffViewerWindow();
  const [isCreatingFolder, setIsCreatingFolder] = React.useState(false);
  const [newFolderName, setNewFolderName] = React.useState("");
  const [folderCreateBusy, setFolderCreateBusy] = React.useState(false);
  const newFolderInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (isCreatingFolder) {
      newFolderInputRef.current?.focus();
    }
  }, [isCreatingFolder]);

  const handleConfirmNewFolder = useCallback(async () => {
    setFolderCreateBusy(true);
    const created = await createFolder(newFolderName);
    setFolderCreateBusy(false);
    if (created) {
      setIsCreatingFolder(false);
      setNewFolderName("");
    }
  }, [createFolder, newFolderName]);

  const handleCancelNewFolder = useCallback(() => {
    setIsCreatingFolder(false);
    setNewFolderName("");
  }, []);

  const handleSave = useCallback(async () => {
    if (mode === "update" && updateMethod === "overwrite" && selectedFileId) {
      setShowOverwrite(true);
      return;
    }
    await save();
  }, [mode, updateMethod, selectedFileId, save]);

  const handleConfirmOverwrite = useCallback(async () => {
    setShowOverwrite(false);
    await save();
  }, [save]);

  // Compare-before-apply: existing file body is the baseline (old); the content
  // about to overwrite it is the incoming version (new). engine="auto"+language
  // routes recognized code to Monaco, plain text to the light engine.
  const handlePreviewOverwrite = useCallback(() => {
    openDiff({
      original: selectedFile?.content ?? "",
      modified: content,
      originalLabel: selectedFile?.name ?? "Current file",
      modifiedLabel: "Incoming",
      title: "Preview overwrite",
      engine: "auto",
      language,
      defaultView: "split",
    });
  }, [openDiff, selectedFile, content, language]);

  const handlePostSaveAction = useCallback(
    (action: CodePostSaveAction) => {
      if (!savedFile) return;
      if (action === "newTab") {
        window.open(
          `/code-files/${savedFile.id}`,
          "_blank",
          "noopener,noreferrer",
        );
      } else if (action === "navigate") {
        router.push(`/code-files/${savedFile.id}`);
      } else if (action === "openWindow") {
        dispatch(
          openOverlay({
            overlayId: "codeEditorWindow",
            data: {
              fileIds: [savedFile.id],
              activeFileId: savedFile.id,
              title: savedFile.name,
            },
          }),
        );
      }
      onSaved?.(savedFile, action);
    },
    [savedFile, router, dispatch, onSaved],
  );

  const charCount = content.length;

  return (
    <div
      className={cn(
        "flex flex-col min-h-0 h-full",
        compact ? "gap-1.5" : "gap-2",
        className,
      )}
    >
      {savedFile && (
        <div className="shrink-0 flex items-center gap-2 rounded-md border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs">
          <Check className="h-3.5 w-3.5 text-green-600" />
          <span className="font-medium">
            Saved as <span className="font-semibold">{savedFile.name}</span>
          </span>
          <span className="text-muted-foreground">
            · {charCount.toLocaleString()} chars
          </span>
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 min-h-0 flex flex-col border border-border rounded-md overflow-hidden bg-background">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Paste or write code here..."
          spellCheck={false}
          className="flex-1 min-h-0 w-full font-mono text-xs p-3 outline-none bg-background resize-none"
          style={{ fontSize: "13px" }}
          disabled={Boolean(savedFile)}
        />
      </div>

      <div className="shrink-0 flex items-center justify-between gap-2 text-xs">
        <Badge variant="secondary" className="text-[10px] font-mono rounded-md">
          {charCount.toLocaleString()} chars
        </Badge>
        <span className="text-muted-foreground">
          {mode === "create" ? "Creating new file" : "Updating existing file"}
        </span>
      </div>

      {!savedFile && (
        <div className="shrink-0 flex flex-col gap-2">
          {/* Mode toggle */}
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
              New File
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
              Existing File
            </button>
          </div>

          <div
            className={cn(
              "grid gap-2 min-w-0",
              compact
                ? "grid-cols-1"
                : "grid-cols-1 sm:grid-cols-[180px_minmax(0,1fr)_140px]",
            )}
          >
            {/* Folder */}
            <div className="grid gap-1 min-w-0">
              <Label className="text-xs">Folder</Label>
              {isCreatingFolder ? (
                <div className="flex items-center gap-1">
                  <Input
                    ref={newFolderInputRef}
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleConfirmNewFolder();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        handleCancelNewFolder();
                      }
                    }}
                    placeholder="Folder name"
                    className="h-8 text-xs rounded-md w-full"
                    style={{ fontSize: "16px" }}
                    disabled={folderCreateBusy}
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleConfirmNewFolder}
                    disabled={folderCreateBusy || !newFolderName.trim()}
                    className="h-8 text-xs rounded-md px-2"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCancelNewFolder}
                    disabled={folderCreateBusy}
                    className="h-8 text-xs rounded-md px-2"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <Select
                  value={folderId ?? "__root__"}
                  onValueChange={(v) => {
                    if (v === "__new__") {
                      setIsCreatingFolder(true);
                      return;
                    }
                    setFolderId(v === "__root__" ? null : v);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs rounded-md w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-w-[min(90vw,360px)]">
                    <SelectItem value="__root__">
                      <span className="truncate">(unfiled)</span>
                    </SelectItem>
                    {folders.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        <span className="truncate">{f.name}</span>
                      </SelectItem>
                    ))}
                    <SelectItem value="__new__">
                      <span className="flex items-center gap-1.5 text-primary">
                        <FolderPlus className="h-3.5 w-3.5" />
                        New folder…
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            {mode === "create" ? (
              <div className="grid gap-1 min-w-0">
                <Label htmlFor="qsc-name" className="text-xs">
                  File Name
                </Label>
                <Input
                  id="qsc-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="my-file.ts"
                  className="h-8 text-xs rounded-md w-full font-mono"
                  style={{ fontSize: "16px" }}
                />
              </div>
            ) : (
              <div className="grid gap-1 min-w-0">
                <Label className="text-xs">File</Label>
                <Select
                  value={selectedFileId}
                  onValueChange={setSelectedFileId}
                >
                  <SelectTrigger className="h-8 text-xs rounded-md w-full min-w-0">
                    <SelectValue placeholder="Choose a file…">
                      <span className="truncate block max-w-full font-mono">
                        {selectedFile?.name ?? "Choose a file…"}
                      </span>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-w-[min(90vw,480px)]">
                    {filesInFolder.length > 0 ? (
                      filesInFolder.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          <span className="truncate font-mono">{f.name}</span>
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="__none" disabled>
                        No files in this folder
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {mode === "create" && (
              <div className="grid gap-1 min-w-0">
                <Label className="text-xs">Language</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger className="h-8 text-xs rounded-md w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[40dvh]">
                    {languageOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {mode === "update" && selectedFileId && (
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
                  <RadioGroupItem value="append" id="qsc-append" />
                  <Label
                    htmlFor="qsc-append"
                    className="cursor-pointer font-normal text-xs"
                  >
                    Append
                  </Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="overwrite" id="qsc-overwrite" />
                  <Label
                    htmlFor="qsc-overwrite"
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

      {/* Footer */}
      <div className="shrink-0 flex items-center justify-end gap-2 pt-1 pb-safe">
        {savedFile && showPostSaveActions ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handlePostSaveAction("newTab")}
              className="h-8 text-xs gap-1.5 rounded-md"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">New tab</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handlePostSaveAction("openWindow")}
              className="h-8 text-xs gap-1.5 rounded-md"
            >
              <LayoutPanelLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Window</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handlePostSaveAction("navigate")}
              className="h-8 text-xs gap-1.5 rounded-md"
            >
              <ArrowRight className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Open</span>
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => handlePostSaveAction("none")}
              className="h-8 text-xs rounded-md"
            >
              Done
            </Button>
          </>
        ) : (
          <>
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onCancel}
                disabled={isSaving}
                className="h-8 text-xs gap-1.5 rounded-md"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={isSaveDisabled}
              className="h-8 text-xs gap-1.5 rounded-md"
            >
              <Save className="h-3.5 w-3.5" />
              {isSaving
                ? "Saving…"
                : mode === "create"
                  ? "Save Code"
                  : "Update File"}
            </Button>
          </>
        )}
      </div>

      <AlertDialog open={showOverwrite} onOpenChange={setShowOverwrite}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirm Overwrite
            </AlertDialogTitle>
            <AlertDialogDescription>
              You are about to replace the content of{" "}
              <strong>{selectedFile?.name}</strong>. A new version will be
              snapshotted automatically, so you can recover, but the current
              file body will change immediately.
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
              onClick={handleConfirmOverwrite}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Overwrite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
