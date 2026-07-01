"use client";

/**
 * CanvasPane — a single pane inside the canvas side sheet.
 *
 * Renders exactly one canvas item plus a compact, modern header. Knows
 * about its `paneRole` (`"single" | "top" | "bottom"`) and adapts:
 *  - which Redux item it shows (current vs secondary)
 *  - which actions appear on its header (split / unsplit / swap / close)
 *  - what "close" means (close entire canvas vs close just this pane)
 *
 * Visual language matches the new chat input + glass tap buttons:
 *  - Thin glass border under a 36px-tall header bar
 *  - Glass tap target icons for every action (no raw buttons anywhere)
 *  - Title left, view-toggle pill center, action cluster right
 *  - Body fills the remaining space and scrolls independently per pane
 */

import React, { useState } from "react";
import dynamic from "next/dynamic";
import {
  ArrowDownUp,
  Bug,
  ChevronDown,
  Cloud,
  CloudOff,
  Code,
  Eye,
  Layers,
  Maximize2,
  Share2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";
import {
  closeCanvas,
  setCurrentItem,
  splitCanvasWith,
  unsplitCanvas,
  swapCanvasPanes,
  removeCanvasItem,
  clearCanvas,
  selectCanvasItems,
  selectCurrentItemId,
  selectCurrentCanvasItem,
  selectSecondaryCanvasItem,
  selectCanvasIsSplit,
  markItemSynced,
  isPersistableCanvasType,
  type CanvasItem,
} from "@/features/canvas/redux/canvasSlice";
import { toast } from "sonner";
import { TapTargetButton } from "@/components/icons/TapTargetButton";
import { CanvasBody, getDefaultTitle, titleToString } from "./CanvasBody";
import { CanvasNavigation } from "./CanvasNavigation";
import { CanvasPaneUserMenu } from "./CanvasPaneHeaderChrome";
import { CanvasPanePutAwayToggle } from "./CanvasHeaderToggle";
import { ensureArtifactPersisted } from "@/features/canvas/materialization/ensureArtifactPersisted";
import { isMaterializedArtifactId } from "@/features/canvas/artifact-types/artifactId";
import { canvasArtifactService } from "@/features/canvas/services/canvasArtifactService";
import { CanvasArtifactDebugPanel } from "@/features/canvas/components/CanvasArtifactDebugPanel";

// CanvasShareSheet pulls in markdown utilities and image picker — keep it
// lazy so the canvas itself stays small on first paint.
const CanvasShareSheet = dynamic(
  () =>
    import("@/features/canvas/social/CanvasShareSheet").then(
      (m) => m.CanvasShareSheet,
    ),
  { ssr: false },
);

import type { CanvasType } from "@/types/canvas-social";

type PaneRole = "single" | "top" | "bottom";
type ViewMode = "preview" | "source";

interface CanvasPaneProps {
  paneRole: PaneRole;
}

export function CanvasPane({ paneRole }: CanvasPaneProps) {
  const dispatch = useAppDispatch();
  const currentItem = useAppSelector(selectCurrentCanvasItem);
  const secondaryItem = useAppSelector(selectSecondaryCanvasItem);
  const allItems = useAppSelector(selectCanvasItems);
  const currentItemId = useAppSelector(selectCurrentItemId);
  const isSplit = useAppSelector(selectCanvasIsSplit);

  const isAdmin = useAppSelector(selectIsAdmin);
  const [viewMode, setViewMode] = useState<ViewMode>("preview");
  const [showArtifactDebug, setShowArtifactDebug] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Which item is this pane responsible for? `single` and `top` show the
  // current item; `bottom` shows the secondary.
  const item: CanvasItem | null =
    paneRole === "bottom" ? secondaryItem : currentItem;

  if (!item) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
        No content
      </div>
    );
  }

  const content = item.content;
  const title =
    titleToString(content.metadata?.title) || getDefaultTitle(content.type);
  const subtitle =
    typeof content.metadata?.subtitle === "string"
      ? content.metadata.subtitle
      : undefined;
  const isSynced =
    isMaterializedArtifactId(
      content.metadata?.canvasItemId ?? item.savedItemId,
    ) || !!item.isSynced;
  // Ephemeral editor surfaces (code_preview / code_edit_error) carry live
  // callbacks that can't be serialized — saving or sharing them writes a
  // corrupt, dead row. Hide both affordances for those types.
  const canPersist = isPersistableCanvasType(content.type);

  // ── Per-pane actions ────────────────────────────────────────────────────
  const handleCloseAll = () => dispatch(closeCanvas());
  const handleClosePane = () => {
    if (paneRole === "bottom") {
      // Close just the bottom pane = collapse the split.
      dispatch(unsplitCanvas());
    } else if (paneRole === "top" && isSplit) {
      // Top pane in split mode → "close pane" = drop top, promote bottom.
      if (secondaryItem) {
        dispatch(setCurrentItem(secondaryItem.id));
        dispatch(unsplitCanvas());
      }
    } else {
      // Single pane → close entire canvas.
      handleCloseAll();
    }
  };

  const handleSplit = () => {
    // From single pane only — picks the next-most-recent item.
    dispatch(splitCanvasWith(undefined));
  };

  const handleSwap = () => dispatch(swapCanvasPanes());
  const handlePromote = () => {
    // Promote bottom pane to be the only pane.
    if (paneRole === "bottom" && secondaryItem) {
      dispatch(setCurrentItem(secondaryItem.id));
    }
  };

  const handleNavigate = (itemId: string) => {
    dispatch(setCurrentItem(itemId));
    setViewMode("preview");
  };
  const handleRemove = (itemId: string) => dispatch(removeCanvasItem(itemId));
  const handleClearAll = () => dispatch(clearCanvas());

  const handleSync = async () => {
    if (!content) return;
    if (!canPersist) {
      toast.error("This view is interactive-only and can't be saved.");
      return;
    }
    setIsSyncing(true);
    try {
      let rawContent = typeof content.data === "string" ? content.data : "";
      const existingArtifactId =
        content.metadata?.canvasItemId ?? item.savedItemId;

      if (!rawContent && isMaterializedArtifactId(existingArtifactId)) {
        const row = await canvasArtifactService.getById(existingArtifactId!);
        if (
          row?.content &&
          typeof row.content === "object" &&
          "data" in row.content
        ) {
          const d = (row.content as { data?: unknown }).data;
          rawContent = typeof d === "string" ? d : JSON.stringify(d ?? "");
        }
      }

      if (!rawContent) {
        toast.error(
          "Nothing to persist — no card content on this session item.",
        );
        return;
      }

      const result = await ensureArtifactPersisted({
        canvasType: content.type,
        title:
          titleToString(content.metadata?.title) ||
          getDefaultTitle(content.type),
        content: rawContent,
        messageId:
          content.metadata?.messageId ?? content.metadata?.sourceMessageId,
        conversationId: content.metadata?.conversationId,
        artifactId: existingArtifactId,
      });

      if (result.ok && result.artifactId) {
        dispatch(
          markItemSynced({
            sessionItemId: item.id,
            artifactId: result.artifactId,
            artifactDebug: {
              steps: result.steps,
              errors: result.errors,
              ensuredAt: Date.now(),
              wasCreated: result.wasCreated,
            },
          }),
        );
        toast.success(
          result.wasCreated ? "Artifact created in cloud" : "Artifact verified",
        );
      } else {
        toast.error(result.errors[0] ?? "Cloud sync failed");
      }
    } finally {
      setIsSyncing(false);
    }
  };

  // Header layout: title (left) | view toggle (center) | actions (right).
  // Navigation chip only shows in the single/top pane to avoid two competing
  // history pickers when split.
  const showNavigation =
    paneRole !== "bottom" && allItems.length > 1 && !isSplit;

  // Primary pane header (single or top in split): put-away + avatar live here
  // beside preview/source and the other actions — not a separate shell row.
  const showShellChrome = paneRole === "single" || paneRole === "top";
  const showCollapseSplit = paneRole === "bottom";

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header
        className={cn(
          "shrink-0 flex h-11 items-center gap-1 px-0.5",
          "border-b border-border/70",
        )}
      >
        {/* LEFT: Title + subtitle. Truncate aggressively so headers never
            push action icons offscreen. */}
        <div className="flex min-w-0 flex-1 items-center gap-2 pl-2">
          <span className="text-sm font-semibold text-foreground truncate">
            {title}
          </span>
          {subtitle && (
            <span className="hidden sm:inline text-xs text-muted-foreground/80 truncate">
              {subtitle}
            </span>
          )}
        </div>

        {/* CENTER: View toggle pill + admin artifact debug toggle */}
        {(hasViewToggle(content.type) || isAdmin) && (
          <div className="mx-1 flex items-center gap-0.5">
            {hasViewToggle(content.type) && (
              <div className="flex items-center gap-0.5 rounded-full bg-muted/60 p-0.5">
                <ViewToggleButton
                  active={viewMode === "preview"}
                  onClick={() => setViewMode("preview")}
                  icon={<Eye className="h-3.5 w-3.5" />}
                  label="Preview"
                />
                <ViewToggleButton
                  active={viewMode === "source"}
                  onClick={() => setViewMode("source")}
                  icon={<Code className="h-3.5 w-3.5" />}
                  label="Source"
                />
              </div>
            )}
            {isAdmin && (
              <TapTargetButton
                icon={
                  <Bug
                    className={cn(
                      "h-4 w-4",
                      showArtifactDebug && "text-amber-600 dark:text-amber-400",
                    )}
                  />
                }
                ariaLabel={
                  showArtifactDebug
                    ? "Hide artifact debug"
                    : "Show artifact debug"
                }
                tooltip={
                  showArtifactDebug
                    ? "Hide artifact debug"
                    : "Artifact debug (admin)"
                }
                onClick={() => setShowArtifactDebug((visible) => !visible)}
              />
            )}
          </div>
        )}

        {/* RIGHT: Actions. All glass tap targets for consistency with the
            rest of the app's icon language. */}
        <div className="flex items-center pr-0.5">
          {/* Navigation chevrons + dropdown (single/top only) */}
          {showNavigation && (
            <CanvasNavigation
              items={allItems}
              currentItemId={currentItemId}
              onNavigate={handleNavigate}
              onRemove={handleRemove}
              onClearAll={handleClearAll}
            />
          )}

          {/* Split / Unsplit — only shown in single-pane mode (split) or on
              the top pane in split mode (offer unsplit). The bottom pane
              never owns split state; its X already collapses the split. */}
          {paneRole === "single" && allItems.length > 1 && (
            <TapTargetButton
              icon={<Layers className="h-4 w-4" />}
              ariaLabel="Split canvas"
              tooltip="Split canvas (show 2 items)"
              onClick={handleSplit}
            />
          )}

          {/* Swap & Promote — only when this pane is part of a split. */}
          {paneRole === "bottom" && (
            <>
              <TapTargetButton
                icon={<ArrowDownUp className="h-4 w-4" />}
                ariaLabel="Swap panes"
                tooltip="Swap panes"
                onClick={handleSwap}
              />
              <TapTargetButton
                icon={<Maximize2 className="h-4 w-4" />}
                ariaLabel="Promote pane to full"
                tooltip="Promote to full view"
                onClick={handlePromote}
              />
            </>
          )}

          {/* Sync — hidden for render-only types that can't be persisted */}
          {canPersist && (
            <TapTargetButton
              icon={
                isSynced && !isSyncing ? (
                  <Cloud
                    className={cn(
                      "h-4 w-4",
                      isSynced
                        ? "text-green-600 dark:text-green-500"
                        : "text-muted-foreground",
                    )}
                  />
                ) : (
                  <CloudOff
                    className={cn(
                      "h-4 w-4 text-muted-foreground",
                      isSyncing && "animate-pulse text-primary",
                    )}
                  />
                )
              }
              ariaLabel={isSynced ? "Synced to cloud" : "Sync to cloud"}
              tooltip={
                isSyncing
                  ? "Syncing…"
                  : isSynced
                    ? "Synced to cloud"
                    : "Sync to cloud"
              }
              onClick={handleSync}
              disabled={isSyncing}
            />
          )}

          {/* Share — hidden for render-only types that can't be persisted */}
          {canPersist && (
            <TapTargetButton
              icon={<Share2 className="h-4 w-4" />}
              ariaLabel="Share canvas"
              tooltip="Share"
              onClick={() => setIsShareOpen(true)}
            />
          )}

          {/* Put away (primary pane) + user menu — far right of this header row */}
          {showShellChrome && (
            <>
              <CanvasPanePutAwayToggle onPutAway={handleCloseAll} />
              <CanvasPaneUserMenu />
            </>
          )}

          {/* Bottom split pane: collapse only */}
          {showCollapseSplit && (
            <TapTargetButton
              icon={<ChevronDown className="h-4 w-4" />}
              ariaLabel="Collapse split"
              tooltip="Collapse split"
              onClick={handleClosePane}
            />
          )}
        </div>
      </header>

      {showArtifactDebug && <CanvasArtifactDebugPanel item={item} />}

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-overlay">
        {viewMode === "preview" ? (
          <CanvasBody content={content} />
        ) : (
          <div className="h-full p-2">
            <pre className="h-full overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-xs text-foreground scrollbar-thin">
              {JSON.stringify(content, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Share sheet portal — only the active item per pane participates */}
      <CanvasShareSheet
        open={isShareOpen}
        onOpenChange={setIsShareOpen}
        canvasData={content.data}
        canvasType={content.type as CanvasType}
        defaultTitle={title}
        hasScoring={content.type === "quiz" || content.type === "flashcards"}
      />
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

interface ViewToggleButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

const ViewToggleButton: React.FC<ViewToggleButtonProps> = ({
  active,
  onClick,
  icon,
  label,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-medium transition-colors",
      active
        ? "bg-background text-foreground shadow-sm"
        : "text-muted-foreground hover:text-foreground",
    )}
    aria-pressed={active}
  >
    {icon}
    <span className="hidden md:inline">{label}</span>
  </button>
);

/**
 * Types where the JSON "source" view is meaningful. Image / iframe / html
 * are passthrough surfaces — toggling them to a JSON view is noise.
 */
function hasViewToggle(type: string): boolean {
  switch (type) {
    case "image":
    case "iframe":
    case "html":
      return false;
    default:
      return true;
  }
}
