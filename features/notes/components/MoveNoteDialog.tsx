"use client";

import React, { useCallback, useMemo, useState } from "react";
import { FolderInput, FolderPlus, Search } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/hooks/use-mobile";
import { getFolderIconAndColor } from "../utils/folderUtils";
import { createFolder } from "../service/notesService";
import { cn } from "@/lib/utils";
import { CreateFolderDialog } from "./CreateFolderDialog";

interface MoveNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (targetFolder: string) => void | Promise<void>;
  noteName: string;
  currentFolder: string;
  availableFolders: string[];
}

export function MoveNoteDialog({
  open,
  onOpenChange,
  onConfirm,
  noteName,
  currentFolder,
  availableFolders,
}: MoveNoteDialogProps) {
  const isMobile = useIsMobile();
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);

  const reset = useCallback(() => {
    setSelectedFolder(null);
    setQuery("");
    setBusy(false);
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (busy) return;
      if (!nextOpen) reset();
      onOpenChange(nextOpen);
    },
    [busy, onOpenChange, reset],
  );

  const filteredFolders = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return availableFolders;
    return availableFolders.filter((folder) =>
      folder.toLocaleLowerCase().includes(normalized),
    );
  }, [availableFolders, query]);

  const moveToFolder = async (folder: string) => {
    if (busy || folder === currentFolder) return;
    setBusy(true);
    try {
      await onConfirm(folder);
      reset();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to move note:", error);
      toast.error("Couldn't move the note");
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (selectedFolder) void moveToFolder(selectedFolder);
  };

  const handleCreateFolder = async (folderName: string) => {
    await createFolder(folderName);
    await onConfirm(folderName);
    toast.success(`Created ${folderName} and moved the note`);
    reset();
    onOpenChange(false);
  };

  const openCreateFolder = () => {
    // Never stack a mobile drawer on top of another drawer. The creation
    // sheet takes over in-place, then completes the move in the same action.
    // Keep the parent flow mounted so conditionally-rendered callers do not
    // lose the creation sheet when the move surface hides.
    setCreateFolderOpen(true);
  };

  const folderList = (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <button
        type="button"
        onClick={openCreateFolder}
        disabled={busy}
        className="flex w-full items-center gap-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-2.5 text-left text-sm font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
      >
        <FolderPlus className="h-4 w-4" />
        New folder…
      </button>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search folders"
          className="h-9 pl-8 text-base sm:text-sm"
          disabled={busy}
        />
      </div>
      <ScrollArea className="min-h-0 flex-1 rounded-lg border border-border p-1.5">
        <div className="space-y-1">
          {filteredFolders.map((folder) => {
            const { icon: FolderIcon, color: iconColor } =
              getFolderIconAndColor(folder);
            const isSelected = selectedFolder === folder;
            const isCurrent = folder === currentFolder;
            return (
              <button
                key={folder}
                type="button"
                onClick={() => setSelectedFolder(folder)}
                disabled={isCurrent || busy}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md border border-transparent p-2 text-left text-sm transition-colors hover:bg-accent",
                  isSelected && "border-primary bg-primary/10",
                  isCurrent && "cursor-not-allowed opacity-55",
                )}
              >
                <FolderIcon className={cn("h-4 w-4 shrink-0", iconColor)} />
                <span className="flex-1 truncate">{folder}</span>
                {isCurrent ? (
                  <span className="text-xs text-muted-foreground">Current</span>
                ) : null}
              </button>
            );
          })}
          {filteredFolders.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No folders match “{query}”. Create it as a new folder instead.
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );

  const actions = (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => handleOpenChange(false)}
        disabled={busy}
      >
        Cancel
      </Button>
      <Button
        type="submit"
        disabled={!selectedFolder || selectedFolder === currentFolder || busy}
      >
        Move note
      </Button>
    </>
  );

  const createDialog = (
    <CreateFolderDialog
      open={createFolderOpen}
      onOpenChange={setCreateFolderOpen}
      onConfirm={handleCreateFolder}
      existingFolders={availableFolders}
      description="Create a folder and move this note into it immediately."
      confirmLabel="Create & Move"
    />
  );

  if (isMobile) {
    return (
      <>
        <Drawer
          open={open && !createFolderOpen}
          onOpenChange={handleOpenChange}
        >
          <DrawerContent className="flex max-h-[86dvh] flex-col pb-safe">
            <DrawerHeader>
              <DrawerTitle className="flex items-center gap-2">
                <FolderInput className="h-5 w-5 text-primary" /> Move note
              </DrawerTitle>
              <DrawerDescription>
                Move “{noteName || "Untitled"}” to another folder.
              </DrawerDescription>
            </DrawerHeader>
            <form
              onSubmit={handleSubmit}
              className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4"
            >
              {folderList}
              <DrawerFooter className="shrink-0 flex-row justify-end gap-2 px-0">
                {actions}
              </DrawerFooter>
            </form>
          </DrawerContent>
        </Drawer>
        {createDialog}
      </>
    );
  }

  return (
    <>
      <Dialog open={open && !createFolderOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderInput className="h-5 w-5 text-primary" /> Move note
            </DialogTitle>
            <DialogDescription>
              Move “{noteName || "Untitled"}” to another folder.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={handleSubmit}
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden"
          >
            {folderList}
            <DialogFooter className="shrink-0">{actions}</DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {createDialog}
    </>
  );
}
