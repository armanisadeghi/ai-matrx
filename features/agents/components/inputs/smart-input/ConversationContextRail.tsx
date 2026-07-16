"use client";

/**
 * ConversationContextRail
 *
 * A single, compact, modern strip that sits directly above the composer and
 * surfaces everything "attached to" the current conversation that the user can
 * open — without scrolling up the transcript to hunt for the message that
 * introduced it. One place, always visible when there's something to show,
 * zero pixels when there isn't.
 *
 * Today it gathers (in priority order):
 *   • Working document      → click toggles it in/out of the CANVAS; X turns it
 *                             off for this chat (same as the docs-menu switch).
 *   • Scratchpad            → same canvas toggle + X (per-conversation gate).
 *   • Agent lists           → plan / tasks / todos (the `TaskPanel` drawer).
 *   • Working context       → `ActiveContextLensChip` (Lens Chip → ContextTree
 *                             popover; same host as the chat header — never a
 *                             layers drawer).
 *   • Any other live context entry the agent or user set (slot / ad-hoc) —
 *     click opens the detail sheet; X removes the entry from context.
 *
 * Pills are TINY on purpose: icon + one word. The full name, status, and click
 * hint live in the tooltip. Keep it that way — the composer is not a dashboard.
 *
 * It is the ONE rail — adding a future source (artifacts, canvas items, …) is a
 * single push into `items`, never a new bespoke strip. It reuses the existing
 * openers (`ContextSlotDetailSheet`, `TaskPanel`, `ActiveContextLensChip`) — it
 * does not reinvent any detail surface.
 *
 * Mobile-friendly: the most important pills stay inline; the rest collapse into
 * a clean "…" overflow menu so the rail never wraps or crowds the composer.
 *
 * Always mounts Eye + Lens Chip (working context). Other pills appear only when
 * the conversation has surfaceable attachments — safe in every SmartAgentInput.
 */

import { useEffect, useMemo, useState } from "react";
import {
  FileText,
  ListChecks,
  Loader2,
  MoreHorizontal,
  NotebookPen,
  Code2,
  Eye,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  openCanvas,
  closeCanvas,
  openArtifactInCanvas,
  selectCanvasIsOpen,
  selectCurrentCanvasItem,
} from "@/features/canvas/redux/canvasSlice";
import { selectInstanceContextEntries } from "@/features/agents/redux/execution-system/instance-context/instance-context.selectors";
import { removeContextEntry } from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import { selectAgentIdFromInstance } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import type { InstanceContextEntry } from "@/features/agents/types/instance.types";
import {
  CONTEXT_TYPE_ICON,
  FALLBACK_CONTEXT_ICON,
} from "@/features/agents/components/context-slots-display/contextSlotIcons";
import { ContextSlotDetailSheet } from "@/features/agents/components/context-slots-display/ContextSlotDetailSheet";
import { docKindForContextKey } from "@/features/agents/utils/workingDocumentContext";
import {
  isCanvasItemContextKey,
  isCanvasItemContextValue,
} from "@/features/agents/utils/canvasItemContext";
import { scratchScopeId } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.slice";
import { setConversationDocumentEnabledThunk } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.thunks";
import { setScratchpadGateThunk } from "@/features/agents/redux/execution-system/instance-working-document/scratchpad.thunks";
import {
  selectActiveScratchpadId,
  selectAttachedScratchpadIds,
  selectWorkingDocEnabled,
  selectWorkingDocSaving,
  selectWorkingDocTitle,
} from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.selectors";
import {
  selectHasAgentListsContent,
  selectAgentTaskCounts,
  selectUserTodoCounts,
} from "@/features/agents/ui-first-tools/redux/agent-lists.selectors";
import {
  hydrateAgentLists,
  subscribeAgentLists,
  unsubscribeAgentLists,
} from "@/features/agents/ui-first-tools/redux/agent-lists.thunks";
import { TaskPanel } from "@/features/agents/ui-first-tools/ui/lists/TaskPanel";
import { AgentSeesSheet } from "@/features/agents/components/context-slots-display/AgentSeesSheet";
import { ActiveContextLensChip } from "@/features/scopes/components/active-context/ActiveContextLensChip";

interface ConversationContextRailProps {
  conversationId: string;
  className?: string;
}

type RailTone = "default" | "primary";

interface RailItem {
  id: string;
  icon: LucideIcon;
  /** Full name — shown in the tooltip and the overflow menu, never on the pill. */
  label: string;
  /** ONE word for the pill face (chips stay tiny; the tooltip carries the rest). */
  word: string;
  /** Short trailing meta (e.g. "3/5", a count, a status word) — tooltip only. */
  detail?: string;
  /** One-line description of what clicking does, for the tooltip. */
  hint?: string;
  tone?: RailTone;
  /** Tiny spinner instead of a static state (e.g. saving). */
  busy?: boolean;
  /** Pill's detail surface is currently open. */
  active?: boolean;
  onOpen: () => void;
  /** Floating X — detaches the item from this conversation's context. */
  onRemove?: () => void;
}

function entryHasValue(e: InstanceContextEntry): boolean {
  const v = e.value;
  if (v === undefined || v === null) return false;
  if (typeof v === "string" && v.trim() === "") return false;
  if (typeof v === "object" && Object.keys(v as object).length === 0)
    return false;
  return true;
}

export function ConversationContextRail({
  conversationId,
  className,
}: ConversationContextRailProps) {
  const dispatch = useAppDispatch();
  const isMobile = useIsMobile();

  // ── Live context entries (working doc, scratchpad, slot / ad-hoc context) ──
  const selectEntries = useMemo(
    () => selectInstanceContextEntries(conversationId),
    [conversationId],
  );
  const entries = useAppSelector(selectEntries);
  const agentId = useAppSelector(selectAgentIdFromInstance(conversationId));

  // ── Document pills read the EDITOR slice (the SSOT), never instanceContext
  // (which is the agent-facing publication). Working: shown iff enabled.
  // Scratch: shown iff this conversation OPTED IN (per-conversation gate,
  // default OFF) or extra scratchpads are attached. An opted-in empty
  // scratchpad shows the pill (affordance to type) but publishes nothing. ──
  const workingDocEnabled = useAppSelector(
    selectWorkingDocEnabled(conversationId, "working"),
  );
  const workingDocTitle = useAppSelector(
    selectWorkingDocTitle(conversationId, "working"),
  );
  const workingDocSaving = useAppSelector(
    selectWorkingDocSaving(conversationId, "working"),
  );
  const activeScratchId = useAppSelector(selectActiveScratchpadId);
  const scratchScope = activeScratchId
    ? scratchScopeId(activeScratchId)
    : "sp:none";
  const scratchTitle = useAppSelector(
    selectWorkingDocTitle(scratchScope, "scratch"),
  );
  const scratchSaving = useAppSelector(
    selectWorkingDocSaving(scratchScope, "scratch"),
  );
  const scratchEnabled = useAppSelector(
    selectWorkingDocEnabled(conversationId, "scratch"),
  );
  const attachedScratchIds = useAppSelector(
    selectAttachedScratchpadIds(conversationId),
  );
  const showScratchPill = scratchEnabled || attachedScratchIds.length > 0;

  // ── Canvas state for the doc pills' visibility toggle ─────────────────────
  const canvasOpen = useAppSelector(selectCanvasIsOpen);
  const currentCanvasItem = useAppSelector(selectCurrentCanvasItem);
  const currentCanvasSourceId = currentCanvasItem?.sourceMessageId ?? null;

  // ── Agent lists (plan / tasks / todos). Hydrate + live-subscribe here so the
  // rail is the single owner now that the standalone chip is gone. ──────────
  const hasLists = useAppSelector(selectHasAgentListsContent(conversationId));
  const taskCounts = useAppSelector(selectAgentTaskCounts(conversationId));
  const todoCounts = useAppSelector(selectUserTodoCounts(conversationId));

  useEffect(() => {
    if (!conversationId) return undefined;
    void dispatch(hydrateAgentLists(conversationId));
    dispatch(subscribeAgentLists(conversationId));
    return () => {
      dispatch(unsubscribeAgentLists(conversationId));
    };
  }, [conversationId, dispatch]);

  // ── Detail surfaces (one of each, opened on demand) ────────────────────────
  const [activeEntry, setActiveEntry] = useState<{
    key: string;
    snapshotValue?: unknown;
  } | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [listsOpen, setListsOpen] = useState(false);
  // "What the agent sees" — the plain-language readout of the real payload.
  const [seesOpen, setSeesOpen] = useState(false);

  const closeOtherSurfaces = () => {
    setListsOpen(false);
  };

  /** Same pill again → close; different pill → switch. */
  const toggleEntry = (key: string, snapshotValue?: unknown) => {
    if (detailOpen && activeEntry?.key === key) {
      setDetailOpen(false);
      return;
    }
    closeOtherSurfaces();
    setActiveEntry({ key, snapshotValue });
    setDetailOpen(true);
  };

  /**
   * Doc pill click = CANVAS VISIBILITY TOGGLE: open the canvas on this doc,
   * or close it if it's already showing this doc. Deliberately not the detail
   * sheet — the pill is the "see it / hide it" affordance; management lives in
   * the docs menu. `openCanvas` dedups on the stable sourceMessageId shared
   * with ChatCanvasButton / openInCanvas, so all surfaces reuse one item.
   */
  const toggleDocInCanvas = (kind: "working" | "scratch") => {
    const scope = kind === "scratch" ? scratchScope : conversationId;
    if (kind === "scratch" && !activeScratchId) return;
    const stableId = `wd:${scope}:${kind}`;
    if (canvasOpen && currentCanvasSourceId === stableId) {
      dispatch(closeCanvas());
      return;
    }
    dispatch(
      openCanvas({
        type: kind === "scratch" ? "scratchpad" : "working_document",
        // gateConversationId: the CHAT this pill lives in — lets the canvas
        // scratch panel offer its per-document "Share with this chat" toggle.
        data: {
          conversationId: scope,
          kind,
          gateConversationId: conversationId,
        },
        metadata: {
          title:
            (kind === "scratch" ? scratchTitle : workingDocTitle)?.trim() ||
            (kind === "scratch" ? "Scratchpad" : "Working document"),
          conversationId: scope,
          sourceMessageId: stableId,
        },
      }),
    );
  };

  const toggleLists = () => {
    if (listsOpen) {
      setListsOpen(false);
      return;
    }
    setDetailOpen(false);
    setListsOpen(true);
  };

  // ── Assemble the rail in priority order ────────────────────────────────────
  // Working context (Scopes) is NOT a rail pill — it is `ActiveContextLensChip`
  // rendered beside the Eye/Context control (popover, never a layers drawer).
  const items = useMemo<RailItem[]>(() => {
    const out: RailItem[] = [];
    const valued = entries.filter(entryHasValue);

    if (workingDocEnabled) {
      out.push({
        id: "working_document",
        icon: FileText,
        label: workingDocTitle?.trim() || "Working document",
        word: "Doc",
        tone: "primary",
        busy: workingDocSaving,
        detail: workingDocSaving ? "Saving…" : "Live",
        hint: "Click: show / hide in canvas · X: turn off for this chat",
        active:
          canvasOpen &&
          currentCanvasSourceId === `wd:${conversationId}:working`,
        onOpen: () => toggleDocInCanvas("working"),
        onRemove: () =>
          void dispatch(
            setConversationDocumentEnabledThunk({
              conversationId,
              kind: "working",
              enabled: false,
            }),
          ),
      });
    }
    if (showScratchPill) {
      out.push({
        id: "scratchpad",
        icon: NotebookPen,
        label: scratchTitle?.trim() || "Scratchpad",
        word: "Scratch",
        busy: scratchSaving,
        detail:
          attachedScratchIds.length > 0
            ? `+${attachedScratchIds.length} attached`
            : "Read-only to agent",
        hint: "Click: show / hide in canvas · X: turn off for this chat",
        active:
          canvasOpen && currentCanvasSourceId === `wd:${scratchScope}:scratch`,
        onOpen: () => toggleDocInCanvas("scratch"),
        onRemove: () =>
          void dispatch(
            setScratchpadGateThunk({ conversationId, enabled: false }),
          ),
      });
    }

    if (hasLists) {
      const open = todoCounts.open;
      out.push({
        id: "lists",
        icon: ListChecks,
        label: "Tasks & todos",
        word: "Tasks",
        detail:
          taskCounts.total > 0
            ? `${taskCounts.done}/${taskCounts.total}${open > 0 ? ` · ${open}` : ""}`
            : open > 0
              ? `${open} todo${open === 1 ? "" : "s"}`
              : undefined,
        hint: "Click: open the task panel",
        active: listsOpen,
        onOpen: toggleLists,
      });
    }

    for (const e of valued) {
      // Doc-like keys (working doc, scratchpad, attached-scratchpad extras)
      // already have their slice-driven pills above — never re-surface their
      // published context values as generic pills.
      if (docKindForContextKey(e.key) !== null) continue;

      // Pinned canvas artifacts (key = canvas_items UUID) — open in canvas
      // with version history; X unpins from context (row is kept).
      if (isCanvasItemContextKey(e.key) && isCanvasItemContextValue(e.value)) {
        const label = e.label?.trim() || e.value.label || "Artifact";
        out.push({
          id: `artifact:${e.key}`,
          icon: Code2,
          label,
          word: label.split(/\s+/)[0] ?? "Code",
          detail: `v${e.value.source.base_version}`,
          hint: "Click: open in canvas · X: unpin from context",
          tone: "primary",
          active:
            canvasOpen &&
            (currentCanvasSourceId === e.key ||
              currentCanvasItem?.savedItemId === e.key ||
              currentCanvasItem?.content?.metadata?.canvasItemId === e.key),
          onOpen: () => {
            dispatch(
              openArtifactInCanvas({
                artifactId: e.key,
                type: "code",
                metadata: {
                  title: label,
                  canvasItemId: e.key,
                  conversationId,
                },
              }),
            );
          },
          onRemove: () =>
            dispatch(removeContextEntry({ conversationId, key: e.key })),
        });
        continue;
      }

      const Icon = CONTEXT_TYPE_ICON[e.type] ?? FALLBACK_CONTEXT_ICON;
      const label = e.label?.trim() || e.key;
      out.push({
        id: `ctx:${e.key}`,
        icon: Icon,
        label,
        word: label.split(/\s+/)[0] ?? label,
        hint: "Click: view details · X: remove from context",
        active: detailOpen && activeEntry?.key === e.key,
        onOpen: () => toggleEntry(e.key, e.value),
        onRemove: () =>
          dispatch(removeContextEntry({ conversationId, key: e.key })),
      });
    }

    return out;
  }, [
    entries,
    hasLists,
    taskCounts.total,
    taskCounts.done,
    todoCounts.open,
    workingDocEnabled,
    workingDocTitle,
    workingDocSaving,
    showScratchPill,
    scratchTitle,
    scratchSaving,
    attachedScratchIds.length,
    detailOpen,
    activeEntry?.key,
    listsOpen,
    canvasOpen,
    currentCanvasSourceId,
    currentCanvasItem?.savedItemId,
    currentCanvasItem?.content?.metadata?.canvasItemId,
    scratchScope,
    conversationId,
    dispatch,
  ]);

  // ── Inline vs overflow split. Keep the highest-priority pills visible; fold
  // the rest into a clean "…" menu so the rail never wraps. ──────────────────
  const maxInline = isMobile ? 2 : 5;
  const { inline, overflow } = useMemo(() => {
    if (items.length <= maxInline) {
      return { inline: items, overflow: [] as RailItem[] };
    }
    return {
      inline: items.slice(0, maxInline - 1),
      overflow: items.slice(maxInline - 1),
    };
  }, [items, maxInline]);

  return (
    <div
      className={cn("flex min-w-0 items-center gap-1.5 px-0.5 pb-1", className)}
    >
      <button
        type="button"
        onClick={() => setSeesOpen(true)}
        title="See exactly what the agent receives this turn"
        className={cn(
          "group/ctx flex shrink-0 items-center gap-1 rounded px-1 py-0.5",
          "text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70",
          "transition-colors hover:bg-muted/60 hover:text-foreground",
        )}
      >
        <Eye className="h-3 w-3 opacity-70 transition-opacity group-hover/ctx:opacity-100" />
        Context
      </button>
      <ActiveContextLensChip className="h-6 shrink-0 px-2 text-[11px]" />
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
        {inline.map((item) => (
          <RailPill key={item.id} item={item} />
        ))}
      </div>

      {overflow.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title={`${overflow.length} more`}
              aria-label={`${overflow.length} more context items`}
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-border px-2",
                "text-xs font-medium text-muted-foreground transition-colors",
                "hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
              <span className="tabular-nums">{overflow.length}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-56">
            {overflow.map((item) => {
              const Icon = item.icon;
              return (
                <DropdownMenuItem
                  key={item.id}
                  onSelect={(e) => {
                    e.preventDefault();
                    item.onOpen();
                  }}
                  className="gap-2"
                >
                  {item.busy ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                  ) : (
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0",
                        item.tone === "primary"
                          ? "text-primary"
                          : "text-muted-foreground",
                      )}
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.detail && (
                    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                      {item.detail}
                    </span>
                  )}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <DetailSurfaces
        conversationId={conversationId}
        agentId={agentId ?? null}
        activeEntry={activeEntry}
        detailOpen={detailOpen}
        setDetailOpen={setDetailOpen}
        listsOpen={listsOpen}
        setListsOpen={setListsOpen}
      />
      <AgentSeesSheet
        conversationId={conversationId}
        open={seesOpen}
        onOpenChange={setSeesOpen}
      />
    </div>
  );
}

// ── Pill ─────────────────────────────────────────────────────────────────────

/**
 * Tiny pill: icon + ONE word. Everything else (full name, status, click hint)
 * lives in the tooltip; a floating X (hover/focus reveal, always visible on
 * touch) detaches the item from this conversation's context.
 */
function RailPill({ item }: { item: RailItem }) {
  const Icon = item.icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="group relative inline-flex shrink-0">
          <button
            type="button"
            onClick={item.onOpen}
            aria-label={item.label}
            className={cn(
              "inline-flex h-6 min-w-0 items-center gap-1 rounded-full border px-2",
              "text-[11px] font-medium transition-colors",
              item.active
                ? item.tone === "primary"
                  ? "border-primary bg-primary/15 text-primary ring-1 ring-inset ring-primary/30"
                  : "border-foreground/20 bg-muted text-foreground ring-1 ring-inset ring-foreground/10"
                : item.tone === "primary"
                  ? "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
                  : "border-border bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {item.busy ? (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
            ) : (
              <Icon className="h-3 w-3 shrink-0" />
            )}
            <span className="max-w-[4.5rem] truncate">{item.word}</span>
          </button>
          {item.onRemove && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                item.onRemove?.();
              }}
              aria-label={`Remove ${item.label} from context`}
              className={cn(
                "absolute -right-1 -top-1 z-10 flex h-3.5 w-3.5 items-center justify-center rounded-full",
                "border border-border bg-background text-muted-foreground shadow-sm",
                "transition-opacity hover:bg-destructive hover:text-destructive-foreground",
                "opacity-0 focus-visible:opacity-100 group-hover:opacity-100",
                "pointer-coarse:opacity-100",
              )}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[16rem]">
        <div className="font-medium text-popover-foreground">{item.label}</div>
        {item.detail && (
          <div className="mt-0.5 text-muted-foreground">{item.detail}</div>
        )}
        {item.hint && (
          <div className="mt-0.5 text-[10px] text-muted-foreground/80">
            {item.hint}
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

// ── Detail surfaces (kept in one place so they mount once) ────────────────────

function DetailSurfaces({
  conversationId,
  agentId,
  activeEntry,
  detailOpen,
  setDetailOpen,
  listsOpen,
  setListsOpen,
}: {
  conversationId: string;
  agentId: string | null;
  activeEntry: { key: string; snapshotValue?: unknown } | null;
  detailOpen: boolean;
  setDetailOpen: (open: boolean) => void;
  listsOpen: boolean;
  setListsOpen: (open: boolean) => void;
}) {
  return (
    <>
      {activeEntry && (
        <ContextSlotDetailSheet
          open={detailOpen}
          onOpenChange={setDetailOpen}
          conversationId={conversationId}
          agentId={agentId}
          contextKey={activeEntry.key}
          snapshotValue={activeEntry.snapshotValue}
        />
      )}
      <TaskPanel
        conversationId={conversationId}
        open={listsOpen}
        onOpenChange={setListsOpen}
      />
    </>
  );
}
