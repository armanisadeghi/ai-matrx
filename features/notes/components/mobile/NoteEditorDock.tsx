"use client";

/**
 * NoteEditorDock — fixed bottom action dock for the mobile note editor.
 *
 * Visual DNA identical to MobileDock (matrx-glass-card, rounded-[22px], pb-safe,
 * fixed bottom-0, pointer-events-none wrapper) but uses action callbacks instead
 * of Link-based navigation, since this is a contextual toolbar, not a nav bar.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import type { LucideIcon } from "lucide-react";
import {
  FolderOpen,
  Tag,
  Share2,
  MoreHorizontal,
  Copy,
  CopyPlus,
  Download,
  Trash2,
  Loader2,
  Network,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BottomSheet,
  BottomSheetHeader,
  BottomSheetBody,
} from "@/components/official/bottom-sheet/BottomSheet";
import MobileNoteToolbar from "./MobileNoteToolbar";
import { NoteContextSection } from "../NoteContextSection";
import { useToastManager } from "@/hooks/useToastManager";

// ─── Types ────────────────────────────────────────────────────────────────────

interface NoteEditorDockProps {
  noteId: string;
  folder: string;
  tags: string[];
  content: string;
  onFolderChange: (folder: string) => void;
  onTagsChange: (tags: string[]) => void;
  onDuplicate: () => void;
  onExport: () => void;
  onDelete: () => void;
  isDeleting?: boolean;
}

// ─── Constants (mirrors MobileDock) ──────────────────────────────────────────

const PILL_INSET_X = 3;
const PILL_INSET_Y = 4;

// ─── Component ────────────────────────────────────────────────────────────────

export function NoteEditorDock({
  noteId,
  folder,
  tags,
  content,
  onFolderChange,
  onTagsChange,
  onDuplicate,
  onExport,
  onDelete,
  isDeleting,
}: NoteEditorDockProps) {
  const toast = useToastManager("notes");
  const navRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [pill, setPill] = useState<{
    x: number;
    width: number;
    height: number;
  } | null>(null);
  const [sheetOpen, setSheetOpen] = useState<
    "folder-tags" | "context" | "more" | null
  >(null);

  // Dock items definition — icons only, no labels
  const items: {
    key: string;
    tooltip: string;
    Icon: LucideIcon;
    onPress: () => void;
  }[] = [
    {
      key: "folder",
      tooltip: folder,
      Icon: FolderOpen,
      onPress: () => {
        setActiveIndex(0);
        setSheetOpen("folder-tags");
      },
    },
    {
      key: "tags",
      tooltip:
        tags.length > 0
          ? `${tags.length} tag${tags.length !== 1 ? "s" : ""}`
          : "Tags",
      Icon: Tag,
      onPress: () => {
        setActiveIndex(1);
        setSheetOpen("folder-tags");
      },
    },
    {
      key: "copy",
      tooltip: "Copy",
      Icon: Copy,
      onPress: () => {
        navigator.clipboard.writeText(content).catch(() => {});
        toast.success("Copied to clipboard");
      },
    },
    {
      key: "export",
      tooltip: "Export",
      Icon: Download,
      onPress: () => {
        onExport();
      },
    },
    {
      key: "context",
      tooltip: "Context",
      Icon: Network,
      onPress: () => {
        setActiveIndex(4);
        setSheetOpen("context");
      },
    },
    {
      key: "more",
      tooltip: "More",
      Icon: MoreHorizontal,
      onPress: () => {
        setActiveIndex(5);
        setSheetOpen("more");
      },
    },
  ];

  // Measure pill geometry — same math as MobileDock
  const measurePill = useCallback(() => {
    const nav = navRef.current;
    const idx = activeIndex;
    if (!nav || idx === null) {
      setPill(null);
      return;
    }
    const activeEl = itemRefs.current[idx];
    if (!activeEl) {
      setPill(null);
      return;
    }

    const navRect = nav.getBoundingClientRect();
    const itemRect = activeEl.getBoundingClientRect();
    const dockH = navRect.height;
    const navW = navRect.width;
    const CORNER_RADIUS = 22;

    const rawX = itemRect.left - navRect.left + PILL_INSET_X;
    const rawW = itemRect.width - PILL_INSET_X * 2;
    const minX = CORNER_RADIUS / 2;
    const maxRight = navW - CORNER_RADIUS / 2;
    const clampedX = Math.max(minX, rawX);
    const clampedRight = Math.min(maxRight, rawX + rawW);
    const clampedW = Math.max(0, clampedRight - clampedX);

    setPill({ x: clampedX, width: clampedW, height: dockH - PILL_INSET_Y * 2 });
  }, [activeIndex]);

  useEffect(() => {
    measurePill();
  }, [measurePill]);

  useEffect(() => {
    if (!sheetOpen) setActiveIndex(null);
  }, [sheetOpen]);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <nav className="md:hidden absolute bottom-0 left-0 right-0 z-40 pb-safe px-3 pointer-events-none">
        <div
          ref={navRef}
          className="relative flex items-stretch matrx-glass-core rounded-[22px] mb-2 pointer-events-auto"
        >
          {/* Sliding pill indicator */}
          {pill && (
            <div
              aria-hidden
              className="absolute rounded-full bg-primary/10 dark:bg-primary/15 border border-primary/20 dark:border-primary/30"
              style={{
                top: PILL_INSET_Y,
                left: pill.x,
                width: pill.width,
                height: pill.height,
                transition:
                  "left 380ms cubic-bezier(0.34, 1.56, 0.64, 1), width 380ms cubic-bezier(0.34, 1.56, 0.64, 1)",
                zIndex: 1,
                pointerEvents: "none",
              }}
            />
          )}

          {items.map((item, i) => {
            const { Icon } = item;
            const isActive = activeIndex === i;

            return (
              <div
                key={item.key}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                className="relative flex-1 flex items-center justify-center min-w-0"
              >
                <button
                  onClick={item.onPress}
                  aria-label={item.tooltip}
                  title={item.tooltip}
                  className={cn(
                    "relative z-10 flex items-center justify-center w-full py-2.5 px-1 transition-colors duration-200",
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-[20px] w-[20px] transition-all duration-200 shrink-0",
                      isActive &&
                        "drop-shadow-[0_0_6px_hsl(var(--primary)/0.4)]",
                    )}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </nav>

      {/* Folder + Tags sheet */}
      <BottomSheet
        open={sheetOpen === "folder-tags"}
        onOpenChange={(open) => setSheetOpen(open ? "folder-tags" : null)}
        title="Note Settings"
      >
        <BottomSheetHeader title="Folder &amp; Tags" />
        <BottomSheetBody>
          <MobileNoteToolbar
            folder={folder}
            tags={tags}
            onFolderChange={(f) => {
              onFolderChange(f);
              setSheetOpen(null);
            }}
            onTagsChange={onTagsChange}
            onClose={() => setSheetOpen(null)}
          />
        </BottomSheetBody>
      </BottomSheet>

      {/* Context assignment sheet */}
      <BottomSheet
        open={sheetOpen === "context"}
        onOpenChange={(open) => setSheetOpen(open ? "context" : null)}
        title="Note Context"
        contentClassName="bg-card border-border shadow-lg backdrop-blur-none backdrop-saturate-100"
      >
        <BottomSheetHeader title="Note Context" />
        <BottomSheetBody>
          <div className="px-2 py-2">
            <NoteContextSection noteId={noteId} />
          </div>
        </BottomSheetBody>
      </BottomSheet>

      {/* More actions sheet */}
      <BottomSheet
        open={sheetOpen === "more"}
        onOpenChange={(open) => setSheetOpen(open ? "more" : null)}
        title="Note Actions"
      >
        <BottomSheetHeader title="Note Actions" />
        <BottomSheetBody>
          <div className="px-4 py-2 space-y-1">
            <button
              onClick={() => {
                onDuplicate();
                setSheetOpen(null);
              }}
              className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl text-sm font-medium text-foreground hover:bg-accent/50 transition-colors"
            >
              <CopyPlus className="h-5 w-5 text-muted-foreground" />
              Duplicate Note
            </button>
            <button
              onClick={() => {
                toast.info("Sharing coming soon");
                setSheetOpen(null);
              }}
              className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl text-sm font-medium text-foreground hover:bg-accent/50 transition-colors"
            >
              <Share2 className="h-5 w-5 text-muted-foreground" />
              Share
              <span className="ml-auto text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-normal">
                Soon
              </span>
            </button>
            <div className="h-px bg-border/40 my-1" />
            <button
              onClick={() => {
                setSheetOpen(null);
                onDelete();
              }}
              disabled={isDeleting}
              className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
            >
              {isDeleting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Trash2 className="h-5 w-5" />
              )}
              {isDeleting ? "Deleting..." : "Delete Note"}
            </button>
          </div>
        </BottomSheetBody>
      </BottomSheet>
    </>
  );
}
