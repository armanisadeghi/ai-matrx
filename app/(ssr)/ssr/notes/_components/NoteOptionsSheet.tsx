"use client";

import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Save,
  Copy,
  Link2,
  Share2,
  Download,
  Trash2,
  Folder,
  FolderInput,
} from "lucide-react";
import { cn } from "@/lib/utils";

type SaveState = "saved" | "dirty" | "saving" | "conflict";

interface NoteOptionsSheetProps {
  currentFolder: string;
  allFolders: string[];
  saveState: SaveState;
  onSave: () => void;
  onDuplicate: () => void;
  onShareLink: () => void;
  onShareClipboard: () => void;
  onExport: () => void;
  onMove: (folder: string) => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function NoteOptionsSheet({
  currentFolder,
  allFolders,
  saveState,
  onSave,
  onDuplicate,
  onShareLink,
  onShareClipboard,
  onExport,
  onMove,
  onDelete,
  onClose,
}: NoteOptionsSheetProps) {
  const [folderMode, setFolderMode] = useState(false);

  const itemClass =
    "flex items-center gap-2.5 w-full px-3 py-1.5 text-[0.8125rem] text-foreground rounded-lg cursor-pointer transition-colors hover:bg-[var(--matrx-glass-bg-hover)] bg-transparent border-none text-left";

  return (
    <>
      <div
        className="fixed inset-0 z-100"
        onClick={() => { onClose(); setFolderMode(false); }}
      />
      <div className="matrx-shell-glass fixed inset-x-3 z-110 rounded-2xl p-2 bottom-[calc(var(--shell-dock-h)+var(--shell-dock-bottom)+env(safe-area-inset-bottom,0px)+0.5rem)]">
        {folderMode ? (
          <>
            <div className="flex items-center gap-2.5 px-3 py-2 text-[0.8125rem] text-foreground">
              <button
                className="flex items-center justify-center w-6 h-6 rounded-full cursor-pointer hover:bg-accent [&_svg]:w-4 [&_svg]:h-4 text-muted-foreground"
                onClick={() => setFolderMode(false)}
              >
                <ChevronLeft />
              </button>
              <span className="font-medium">Move to Folder</span>
            </div>
            <div className="h-px my-1 mx-2 bg-(--matrx-glass-border-color)" />
            {allFolders.map((f) => {
              const isCurrent = currentFolder === f;
              return (
                <button
                  key={f}
                  className={cn(itemClass, isCurrent && "text-amber-600 dark:text-amber-400")}
                  onClick={() => { onMove(f); onClose(); setFolderMode(false); }}
                  disabled={isCurrent}
                >
                  <FolderInput className="w-4 h-4 shrink-0" />
                  {f}
                  {isCurrent && <span className="ml-auto text-[0.625rem] opacity-50">current</span>}
                </button>
              );
            })}
          </>
        ) : (
          <>
            <button className={itemClass} onClick={() => setFolderMode(true)}>
              <Folder className="w-4 h-4 shrink-0" />
              <span className="flex-1 truncate">{currentFolder ?? "Draft"}</span>
              <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
            </button>

            <div className="h-px my-1 mx-2 bg-(--matrx-glass-border-color)" />

            <button
              className={cn(itemClass, saveState === "dirty" && "text-amber-500 [&_svg]:text-amber-500")}
              onClick={() => { onSave(); onClose(); }}
            >
              <Save className="w-4 h-4 shrink-0" />
              {saveState === "dirty" ? "Save Changes" : "Saved"}
            </button>
            <button className={itemClass} onClick={() => { onDuplicate(); onClose(); }}>
              <Copy className="w-4 h-4 shrink-0" />
              Duplicate
            </button>
            <button className={itemClass} onClick={() => { onShareLink(); onClose(); }}>
              <Link2 className="w-4 h-4 shrink-0" />
              Share Note
            </button>
            <button className={itemClass} onClick={() => { onShareClipboard(); onClose(); }}>
              <Share2 className="w-4 h-4 shrink-0" />
              Copy to Clipboard
            </button>
            <button className={itemClass} onClick={() => { onExport(); onClose(); }}>
              <Download className="w-4 h-4 shrink-0" />
              Export as Markdown
            </button>

            <div className="h-px my-1 mx-2 bg-(--matrx-glass-border-color)" />

            <button
              className={cn(itemClass, "text-destructive [&_svg]:text-destructive")}
              onClick={() => { onDelete(); onClose(); }}
            >
              <Trash2 className="w-4 h-4 shrink-0" />
              Delete Note
            </button>
          </>
        )}
      </div>
    </>
  );
}
