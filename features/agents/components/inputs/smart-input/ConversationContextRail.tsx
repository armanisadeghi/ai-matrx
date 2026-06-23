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
 *   • Working document      → opens the live editable doc in the side drawer.
 *   • Scratchpad            → opens the private (agent-read-only) doc.
 *   • Agent lists           → plan / tasks / todos (the `TaskPanel` drawer).
 *   • Active context layers → org / scope(s) / project / task (the layer drawer).
 *   • Any other live context entry the agent or user set (slot / ad-hoc).
 *
 * It is the ONE rail — adding a future source (artifacts, canvas items, …) is a
 * single push into `items`, never a new bespoke strip. It reuses the existing
 * openers (`ContextSlotDetailSheet`, `ContextItemDrawer`, `TaskPanel`) — it does
 * not reinvent any detail surface.
 *
 * Mobile-friendly: the most important pills stay inline; the rest collapse into
 * a clean "…" overflow menu so the rail never wraps or crowds the composer.
 *
 * Renders nothing (null) when the conversation has no surfaceable context, so
 * it is safe to mount inside every SmartAgentInput everywhere.
 */

import { useEffect, useMemo, useState } from "react";
import {
  FileText,
  ListChecks,
  Loader2,
  Layers,
  MoreHorizontal,
  NotebookPen,
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
import { selectInstanceContextEntries } from "@/features/agents/redux/execution-system/instance-context/instance-context.selectors";
import { selectAgentIdFromInstance } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import type { InstanceContextEntry } from "@/features/agents/types/instance.types";
import {
  CONTEXT_TYPE_ICON,
  FALLBACK_CONTEXT_ICON,
} from "@/features/agents/components/context-slots-display/contextSlotIcons";
import { ContextSlotDetailSheet } from "@/features/agents/components/context-slots-display/ContextSlotDetailSheet";
import {
  USER_SCRATCHPAD_CONTEXT_KEY,
  WORKING_DOCUMENT_CONTEXT_KEY,
} from "@/features/agents/utils/workingDocumentContext";
import { selectWorkingDocSaving } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.selectors";
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
import { useActiveContextLayerItems } from "@/features/agents/components/context-items/useActiveContextLayerItems";
import { useContextItemDrawer } from "@/features/agents/components/context-items/useContextItemDrawer";
import { ContextItemDrawer } from "@/features/agents/components/context-items/ContextItemDrawer";

interface ConversationContextRailProps {
  conversationId: string;
  className?: string;
}

type RailTone = "default" | "primary";

interface RailItem {
  id: string;
  icon: LucideIcon;
  label: string;
  /** Short trailing meta (e.g. "3/5", a count, a status word). */
  detail?: string;
  tone?: RailTone;
  /** Tiny spinner instead of a static state (e.g. saving). */
  busy?: boolean;
  onOpen: () => void;
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
  const workingDocSaving = useAppSelector(
    selectWorkingDocSaving(conversationId, "working"),
  );

  // ── Agent lists (plan / tasks / todos). Hydrate + live-subscribe here so the
  // rail is the single owner now that the standalone chip is gone. ──────────
  const hasLists = useAppSelector(selectHasAgentListsContent(conversationId));
  const taskCounts = useAppSelector(selectAgentTaskCounts(conversationId));
  const todoCounts = useAppSelector(selectUserTodoCounts(conversationId));

  useEffect(() => {
    if (!conversationId) return;
    void dispatch(hydrateAgentLists(conversationId));
    dispatch(subscribeAgentLists(conversationId));
    return () => {
      dispatch(unsubscribeAgentLists(conversationId));
    };
  }, [conversationId, dispatch]);

  // ── Active context layers (org / scope / project / task) ───────────────────
  const layers = useActiveContextLayerItems(conversationId);

  // ── Detail surfaces (one of each, opened on demand) ────────────────────────
  const [activeEntry, setActiveEntry] = useState<InstanceContextEntry | null>(
    null,
  );
  const [detailOpen, setDetailOpen] = useState(false);
  const [listsOpen, setListsOpen] = useState(false);
  const layerDrawer = useContextItemDrawer();

  const openEntry = (entry: InstanceContextEntry) => {
    setActiveEntry(entry);
    setDetailOpen(true);
  };

  // ── Assemble the rail in priority order ────────────────────────────────────
  const items = useMemo<RailItem[]>(() => {
    const out: RailItem[] = [];
    const valued = entries.filter(entryHasValue);

    const workingDoc = valued.find(
      (e) => e.key === WORKING_DOCUMENT_CONTEXT_KEY,
    );
    const scratch = valued.find((e) => e.key === USER_SCRATCHPAD_CONTEXT_KEY);

    if (workingDoc) {
      out.push({
        id: "working_document",
        icon: FileText,
        label: workingDoc.label?.trim() || "Working doc",
        tone: "primary",
        busy: workingDocSaving,
        detail: workingDocSaving ? undefined : "Live",
        onOpen: () => openEntry(workingDoc),
      });
    }
    if (scratch) {
      out.push({
        id: "scratchpad",
        icon: NotebookPen,
        label: scratch.label?.trim() || "Scratchpad",
        onOpen: () => openEntry(scratch),
      });
    }

    if (hasLists) {
      const open = todoCounts.open;
      out.push({
        id: "lists",
        icon: ListChecks,
        label: "Tasks",
        detail:
          taskCounts.total > 0
            ? `${taskCounts.done}/${taskCounts.total}${open > 0 ? ` · ${open}` : ""}`
            : open > 0
              ? `${open} todo${open === 1 ? "" : "s"}`
              : undefined,
        onOpen: () => setListsOpen(true),
      });
    }

    if (layers.count > 0) {
      out.push({
        id: "context_layers",
        icon: Layers,
        label: layers.summary,
        detail: layers.count > 1 ? String(layers.count) : undefined,
        onOpen: () => layerDrawer.openAt(layers.items, 0),
      });
    }

    for (const e of valued) {
      if (
        e.key === WORKING_DOCUMENT_CONTEXT_KEY ||
        e.key === USER_SCRATCHPAD_CONTEXT_KEY
      ) {
        continue;
      }
      const Icon = CONTEXT_TYPE_ICON[e.type] ?? FALLBACK_CONTEXT_ICON;
      out.push({
        id: `ctx:${e.key}`,
        icon: Icon,
        label: e.label?.trim() || e.key,
        onOpen: () => openEntry(e),
      });
    }

    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    entries,
    hasLists,
    taskCounts.total,
    taskCounts.done,
    todoCounts.open,
    layers.count,
    layers.summary,
    workingDocSaving,
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

  // Zero footprint when there's nothing to surface — but keep any drawer that
  // is mid-open mounted so its close animation completes if the backing item
  // momentarily drops out.
  if (items.length === 0 && !detailOpen && !listsOpen && !layerDrawer.open) {
    return null;
  }

  if (items.length === 0) {
    return (
      <DetailSurfaces
        conversationId={conversationId}
        agentId={agentId ?? null}
        activeEntry={activeEntry}
        detailOpen={detailOpen}
        setDetailOpen={setDetailOpen}
        listsOpen={listsOpen}
        setListsOpen={setListsOpen}
        layerDrawer={layerDrawer}
      />
    );
  }

  return (
    <div
      className={cn("flex min-w-0 items-center gap-1.5 px-0.5 pb-1", className)}
    >
      <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
        Context
      </span>
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
        layerDrawer={layerDrawer}
      />
    </div>
  );
}

// ── Pill ─────────────────────────────────────────────────────────────────────

function RailPill({ item }: { item: RailItem }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={item.onOpen}
      title={item.detail ? `${item.label} · ${item.detail}` : item.label}
      className={cn(
        "group inline-flex h-7 min-w-0 max-w-[10rem] items-center gap-1.5 rounded-full border px-2.5",
        "text-xs font-medium transition-colors",
        item.tone === "primary"
          ? "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
          : "border-border bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      {item.busy ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
      ) : (
        <Icon className="h-3.5 w-3.5 shrink-0" />
      )}
      <span className="min-w-0 truncate">{item.label}</span>
      {item.detail && (
        <span
          className={cn(
            "shrink-0 text-[10px] tabular-nums",
            item.tone === "primary"
              ? "text-primary/70"
              : "text-muted-foreground/70",
          )}
        >
          {item.detail}
        </span>
      )}
    </button>
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
  layerDrawer,
}: {
  conversationId: string;
  agentId: string | null;
  activeEntry: InstanceContextEntry | null;
  detailOpen: boolean;
  setDetailOpen: (open: boolean) => void;
  listsOpen: boolean;
  setListsOpen: (open: boolean) => void;
  layerDrawer: ReturnType<typeof useContextItemDrawer>;
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
          snapshotValue={activeEntry.value}
        />
      )}
      <TaskPanel
        conversationId={conversationId}
        open={listsOpen}
        onOpenChange={setListsOpen}
      />
      <ContextItemDrawer controller={layerDrawer} />
    </>
  );
}
