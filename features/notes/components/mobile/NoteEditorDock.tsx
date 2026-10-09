"use client";

/**
 * NoteEditorDock — fixed bottom action dock for the mobile note editor.
 *
 * Visual DNA identical to MobileDock (matrx-glass-card, rounded-[22px], pb-safe,
 * fixed bottom-0, pointer-events-none wrapper) but uses action callbacks instead
 * of Link-based navigation, since this is a contextual toolbar, not a nav bar.
 */

import { FormatButtons } from "@ai-matrx/rich-editor/format/FormatButtons";
import type { FormatTarget } from "@ai-matrx/rich-editor/format/format-target";
import { useState, useRef, useEffect, useCallback } from "react";
import type { LucideIcon } from "lucide-react";
import type { ContentTransferController } from "@ai-matrx/alchemy/react/workspace";
import { ExportPaletteAnchor, openExportPalette, useExportPaletteKey } from "@ai-matrx/rich-content/copy/ExportPalette";
import { ContentActionMenuRows } from "@ai-matrx/rich-content/copy/ContentActions";
import { richDocumentViewKey } from "@ai-matrx/rich-content/rich-document/runtime/useActionSurfaceProvider";
import { noteIdentityContentSource } from "@/features/notes/richDocumentSource";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { noteRecordData, type NoteRecordView } from "@/features/notes/format";
import { selectNoteById } from "../../redux/selectors";
import {
  FolderOpen,
  MoreHorizontal,
  Copy,
  Loader2,
  Network,
} from "lucide-react";
import { copyReferenceFence } from "@/features/matrx-envelope/referenceClipboard";
import { useRouter } from "next/navigation";
import { TextInputDialog } from "@ai-matrx/design-system";
import { noteActions, openNotePrintStudio } from "../note-actions/noteActionSet";
import { buildRecordReferenceFence } from "@/features/matrx-envelope/recordReference";
import { cn } from "@/lib/utils";
import {
  BottomSheet,
  BottomSheetHeader,
  BottomSheetBody,
} from "@ai-matrx/design-system";
import MobileNoteToolbar from "./MobileNoteToolbar";
import { NoteContextSection } from "../NoteContextSection";
import { CreateFolderDialog } from "../CreateFolderDialog";
import { selectFolderReferences } from "../../redux/selectors";
import { useAppSelector } from "@/lib/redux/hooks";
import type { FolderReference } from "../../types";
import { useToastManager } from "@/hooks/useToastManager";
import { useOpenNoteKnowledgePanel } from "@/features/notes/canvas/noteKnowledgeKind";
import { useNoteIngestStatus } from "../../hooks/useNoteIngestStatus";
import { ShareModal } from "@/features/sharing/components/ShareModal";
import { copyRichContent } from "@ai-matrx/rich-content/copy/copy-commands";
import { CopyMenuButton } from "@ai-matrx/rich-content/copy/CopyMenuButton";

// ─── Types ────────────────────────────────────────────────────────────────────

interface NoteEditorDockProps {
  noteId: string;
  noteLabel?: string;
  folder: string;
  organizationId: string;
  tags: string[];
  content: string;
  onFolderChange: (folder: FolderReference) => void;
  onCreateFolder: (folderName: string) => void;
  onTagsChange: (tags: string[]) => void;
  onDuplicate: () => void;
  onExport: () => void;
  onDelete: () => void;
  /** Rename the note (the More sheet's Rename). */
  onRename?: (label: string) => void;
  isDeleting?: boolean;
  /** Viewer-level sharee: hide the folder/tags mutators (their saves are
   *  RLS-rejected); copy/export/context/more stay available. */
  readOnly?: boolean;
  /** The editor the dock's formatting strip acts on — set in the editing modes, null in Read. */
  formatResolve?: (() => FormatTarget | null) | null;
}

// ─── Constants (mirrors MobileDock) ──────────────────────────────────────────

const PILL_INSET_X = 3;
const PILL_INSET_Y = 4;

// ─── Component ────────────────────────────────────────────────────────────────

export function NoteEditorDock({
  noteId,
  noteLabel = "Note",
  folder,
  organizationId,
  tags,
  content,
  onFolderChange,
  onCreateFolder,
  onTagsChange,
  onDuplicate,
  onExport,
  onDelete,
  onRename,
  isDeleting,
  readOnly = false,
  formatResolve = null,
}: NoteEditorDockProps) {
  const toast = useToastManager("notes");
  const openKnowledge = useOpenNoteKnowledgePanel();
  const ingest = useNoteIngestStatus(noteId);
  // Export… (the More sheet's row): the note's one Alchemy palette — Formatted, JSON (the live
  // record), download, AI — the same palette the desktop note's copy chevron opens.
  const exportPalette = useRef<ContentTransferController | null>(null);
  const exportKey = useExportPaletteKey();
  const exportNote = useAppSelector(selectNoteById(noteId));
  const exportRecord = (): NoteRecordView | null =>
    exportNote
      ? {
          note: exportNote,
          content: exportNote.content ?? null,
          dirtyFields: exportNote._dirtyFields ? [...exportNote._dirtyFields] : [],
          error: exportNote._error ?? null,
          saving: !!exportNote._saving,
          consecutiveSaveFailures: exportNote._consecutiveSaveFailures ?? 0,
        }
      : null;
  const folderReferences = useAppSelector(selectFolderReferences);
  const availableFolders = folderReferences.filter(
    (candidate) => candidate.organizationId === organizationId,
  );
  const navRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const [shareOpen, setShareOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const router = useRouter();
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [pill, setPill] = useState<{
    x: number;
    width: number;
    height: number;
  } | null>(null);
  const [sheetOpen, setSheetOpen] = useState<
    "folder-tags" | "context" | "more" | null
  >(null);

  // Dock items definition — icons only, no labels. onPress receives the
  // item's RENDER index (items can be filtered, so positions aren't fixed).
  const items: {
    key: string;
    /** The word shown under the icon (every dock item is named). */
    label: string;
    tooltip: string;
    Icon: LucideIcon;
    onPress: (index: number) => void;
  }[] = [
    // Folder + tags mutate the note — a viewer's save is RLS-rejected, so
    // don't offer the affordance at all.
    ...(readOnly
      ? []
      : [
          {
            // Folder and tags live in ONE sheet, so they are ONE dock button
            // (two buttons opened the same sheet).
            key: "folder",
            label: "Folder",
            tooltip:
              tags.length > 0
                ? `Folder & tags — ${folder} · ${tags.length} tag${tags.length !== 1 ? "s" : ""}`
                : `Folder & tags — ${folder}`,
            Icon: FolderOpen,
            onPress: (index: number) => {
              setActiveIndex(index);
              setSheetOpen("folder-tags");
            },
          },
        ]),
    {
      key: "copy",
      label: "Copy",
      tooltip: "Copy the note's text",
      Icon: Copy,
      onPress: () => {
        // THE one copy (formatted + markdown). A refused write opens the
        // module's own copy-by-hand dialog — never a dead end.
        void copyRichContent(content, "default");
      },
    },
    // Export lives in the More sheet (Export as Markdown) — the dock copy
    // duplicated it and downloaded silently.
    {
      key: "context",
      label: "Scopes",
      tooltip: "Organization, project and scopes",
      Icon: Network,
      onPress: (index: number) => {
        setActiveIndex(index);
        setSheetOpen("context");
      },
    },
    {
      key: "more",
      label: "More",
      tooltip: "More note actions",
      Icon: MoreHorizontal,
      onPress: (index: number) => {
        setActiveIndex(index);
        setSheetOpen("more");
      },
    },
  ];

  // Measure pill geometry — same math as MobileDock
  const measurePill = useCallback(() => {
    const nav = navRef.current;
    const idx = sheetOpen ? activeIndex : null;
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
  }, [activeIndex, sheetOpen]);

  // A toast rests ABOVE this dock, never over its Copy chevron. The dock sits above the shell's own
  // foot (its notes container ends before the viewport does), so the shell's floating-clearance measure
  // does not reach it; the dock publishes its own top as `--matrx-toast-floor`, which the Toaster's
  // phone offset reads (components/ui/sonner.tsx).
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const root = document.documentElement;
    const publish = () => {
      const top = nav.getBoundingClientRect().top;
      const shown = nav.offsetParent !== null && nav.getBoundingClientRect().height > 0;
      root.style.setProperty("--matrx-toast-floor", shown ? `${Math.ceil(window.innerHeight - top) + 12}px` : "0px");
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(nav);
    window.addEventListener("resize", publish);
    const timer = window.setInterval(publish, 1000);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", publish);
      window.clearInterval(timer);
      root.style.removeProperty("--matrx-toast-floor");
    };
  }, []);

  useEffect(() => {
    measurePill();
  }, [measurePill]);

  // Publish the dock's height so floating launchers (the assists button)
  // sit above it rather than over its last button.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const root = document.documentElement;
    const publish = () =>
      root.style.setProperty("--page-bottom-dock-h", `${Math.round(nav.getBoundingClientRect().height) + 8}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(nav);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--page-bottom-dock-h");
    };
  }, []);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* The dock steps aside while one of its sheets is open — it used to
          ghost through the sheet's glass. */}
      <nav
        className={cn(
          "md:hidden absolute bottom-0 left-0 right-0 z-40 pb-safe px-3 pointer-events-none transition-opacity",
          sheetOpen && "opacity-0",
        )}
        aria-hidden={sheetOpen ? true : undefined}
      >
        {/* The phone's formatting: the essential set (text style, B, I, list,
            checklist, link) and More for the rest — the same toolbar as desktop. */}
        {formatResolve && !readOnly && (
          <div className="mb-1.5 flex justify-center">
            <FormatButtons
              variant="essential"
              resolve={formatResolve}
              className="matrx-glass-core pointer-events-auto rounded-full px-1.5 py-1"
            />
          </div>
        )}
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
            // Lit only while its sheet is open — it used to stay blue after close.
            const isActive = sheetOpen !== null && activeIndex === i;

            return (
              <div
                key={item.key}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                className="relative flex-1 flex items-center justify-center min-w-0"
              >
                {item.key === "copy" ? (
                  // THE Copy (Arman, 2026-10-08): one tap copies the raw note, then Copy raw ·
                  // Copy formatted · Copy for AI — the dock's own tile, never a chevron.
                  <CopyMenuButton
                    content={() => content}
                    label="note"
                    title={exportNote?.label || "Note"}
                    trigger={({ onClick, ...data }) => (
                <button
                        {...data}
                        onClick={onClick}
                        aria-label={item.tooltip}
                        title={item.tooltip}
                        className={cn(
                          "relative z-10 flex w-full flex-col items-center justify-center gap-0.5 px-1 py-1.5 transition-colors duration-200",
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
                        <span className="max-w-full truncate text-xs leading-none">
                          {item.label}
                        </span>
                      </button>
                    )}
                  />
                ) : (
                <button
                  onClick={() => item.onPress(i)}
                  aria-label={item.tooltip}
                  title={item.tooltip}
                  className={cn(
                    "relative z-10 flex w-full flex-col items-center justify-center gap-0.5 px-1 py-1.5 transition-colors duration-200",
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
                  <span className="max-w-full truncate text-xs leading-none">
                    {item.label}
                  </span>
                </button>
                )}
              </div>
            );
          })}
        </div>
        <ExportPaletteAnchor exportKey={exportKey} controllerRef={exportPalette} className="absolute right-2 top-0" />
        <CopyButtons
          human={() => content}
          contentFlavor="markdown"
          richCopyFlavors={[]}
          triggerHidden
          controllerRef={exportPalette}
          label={`Note "${noteLabel}"`}
          json={() => {
            const view = exportRecord();
            return view ? noteRecordData(view) : { content };
          }}
        />
      </nav>

      {/* Folder + Tags sheet */}
      <BottomSheet
        open={sheetOpen === "folder-tags"}
        onOpenChange={(open) => setSheetOpen(open ? "folder-tags" : null)}
        title="Folder & Tags"
        // Solid: the glass blurred the floating assist button behind it into a
        // smudge across the sheet.
        surface="solid"
      >
        <BottomSheetHeader title="Folder &amp; Tags" />
        <BottomSheetBody>
          <MobileNoteToolbar
            folder={folder}
            tags={tags}
            availableFolders={availableFolders}
            onFolderChange={(f) => {
              onFolderChange(f);
              setSheetOpen(null);
            }}
            onTagsChange={onTagsChange}
            onCreateFolder={() => {
              setSheetOpen(null);
              setCreateFolderOpen(true);
            }}
            onClose={() => setSheetOpen(null)}
          />
        </BottomSheetBody>
      </BottomSheet>

      <CreateFolderDialog
        open={createFolderOpen}
        onOpenChange={setCreateFolderOpen}
        existingFolders={availableFolders.map((folder) => folder.name)}
        onConfirm={async (folderName) => {
          onCreateFolder(folderName);
        }}
        description="Create a folder and move this note into it immediately."
        confirmLabel="Create & Move"
      />

      {/* Context assignment sheet */}
      <BottomSheet
        open={sheetOpen === "context"}
        onOpenChange={(open) => setSheetOpen(open ? "context" : null)}
        title="Note scopes"
        // Solid like the More sheet: the note's text showed through the glass.
        surface="solid"
      >
        <BottomSheetHeader title="Note scopes" />
        <BottomSheetBody>
          <div className="px-2 py-2">
            <NoteContextSection noteId={noteId} embedded />
          </div>
        </BottomSheetBody>
      </BottomSheet>

      {/* More actions sheet */}
      <BottomSheet
        open={sheetOpen === "more"}
        onOpenChange={(open) => setSheetOpen(open ? "more" : null)}
        title="Note Actions"
        surface="solid"
      >
        <BottomSheetHeader title="Note Actions" />
        <BottomSheetBody>
          {/* THE note actions (noteActionSet.ts) — the same rows, names and
              order as every right-click menu on the note. */}
          <div className="px-2 py-1">
            {/* The dock's ⋯ is this sheet, so the content action set lives here, each one tap:
                Plain, PDF · Word · HTML · Markdown file · Text file, Print, Transform. */}
            <ContentActionMenuRows
              content={() => content}
              title={exportNote?.label || "Note"}
              viewKey={richDocumentViewKey(noteIdentityContentSource(noteId), "")}
              onTransform={() => void openExportPalette(exportKey)}
              onDone={() => setSheetOpen(null)}
              rowClassName="min-h-11 gap-3 rounded-lg px-3"
            />
            {noteActions({
              rename: readOnly ? undefined : () => setRenameOpen(true),
              duplicate: onDuplicate,
              moveToFolder: readOnly ? undefined : () => setSheetOpen("folder-tags"),
              knowledge: () => openKnowledge({ noteId }),
              knowledgeIndexed: ingest.state === "ingested",
              exportMarkdown: () => {
                onExport();
                toast.success(`Downloaded ${noteLabel || "note"}.md`);
              },
              print: () => openNotePrintStudio(noteId),
              versionHistory: () => router.push(`/notes/${noteId}/diff`),
              share: () => setShareOpen(true),
              copyReference: () =>
                void copyReferenceFence(
                  buildRecordReferenceFence({ type: "note", id: noteId, label: noteLabel }),
                ).then((ok) => {
                  if (ok) toast.success("Reference copied — paste it into any agent chat");
                }),
              moveToTrash: onDelete,
            }).map((action) => {
              const Icon = action.icon;
              return (
                <div key={action.id}>
                  {action.groupStart && <div className="mx-3 my-1 h-px bg-border" />}
                  <button
                    type="button"
                    disabled={action.id === "delete" && isDeleting}
                    onClick={() => {
                      if (action.id !== "move-to-folder") setSheetOpen(null);
                      action.run();
                    }}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm transition-colors disabled:opacity-50",
                      action.destructive
                        ? "text-destructive-ink hover:bg-destructive/10"
                        : "text-foreground hover:bg-accent",
                    )}
                  >
                    {action.id === "delete" && isDeleting ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                    ) : (
                      <Icon className={cn("h-4 w-4 shrink-0", !action.destructive && "text-muted-foreground")} />
                    )}
                    {action.id === "delete" && isDeleting ? "Moving to Trash…" : action.label}
                  </button>
                </div>
              );
            })}
          </div>
        </BottomSheetBody>
      </BottomSheet>

      <TextInputDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        title="Rename note"
        defaultValue={noteLabel}
        confirmLabel="Rename"
        onConfirm={(value) => {
          onRename?.(value.trim());
          setRenameOpen(false);
        }}
      />

      {shareOpen && (
        <ShareModal
          isOpen={shareOpen}
          onClose={() => setShareOpen(false)}
          resourceType="note"
          resourceId={noteId}
          resourceName={noteLabel}
        />
      )}
    </>
  );
}
