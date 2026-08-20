"use client";

// features/crm/components/deals/DealsBoard.tsx
//
// The kanban pipeline board — one column per stage of the selected pipeline,
// drag a deal card onto a column to move its stage. The ONE write is
// `moveDealToStage(stage_id)`: the DB derives status/closed_at, appends the
// stage event, and on a won transition records the outcome + advances the
// party lifecycle — so a drag and an agent write are indistinguishable
// downstream.
//
// dnd: @dnd-kit (the repo standard — @hello-pangea/dnd is an unused dep).
// PointerSensor distance 6 keeps plain clicks opening the record (the card is
// a real door); drag starts after 6px of movement — same constraint as the
// file manager (features/files PageShell).

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { Building2, CalendarClock, User } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/utils/datetime";
import {
  UserAvatarDisplay,
} from "@/components/user/UserIdentity";
import type { UserLike } from "@/components/user/UserIdentity";
import { moveDealToStage } from "../../deals/service";
import type { DealListRow, DealPipeline, DealStage } from "../../deals/types";
import { effectiveProbability, formatDealAmount } from "../../deals/types";

interface Props {
  pipeline: DealPipeline;
  deals: DealListRow[];
  /** True board size before the fetch cap — the board SAYS when it truncated. */
  total: number;
  memberById: Map<string, UserLike>;
  /** Optimistic single-row patch + server refresh, owned by the page. */
  onMoved: (dealId: string, stageId: string) => void;
  onRevert: () => void;
}

function DealCard({
  deal,
  stage,
  memberById,
  dragging,
}: {
  deal: DealListRow;
  stage: DealStage | undefined;
  memberById: Map<string, UserLike>;
  dragging?: boolean;
}) {
  const overdue =
    deal.status === "open" &&
    !!deal.expected_close_date &&
    deal.expected_close_date < new Date().toISOString().slice(0, 10);
  const probability = effectiveProbability(deal, stage);
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-card p-2 shadow-sm",
        dragging && "shadow-lg ring-2 ring-primary",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium text-foreground">
          {deal.name}
        </span>
        {deal.assigned_to && (
          <UserAvatarDisplay
            user={memberById.get(deal.assigned_to) ?? { id: deal.assigned_to }}
            size="xs"
            className="shrink-0"
          />
        )}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium tabular-nums text-foreground">
          {formatDealAmount(deal.amount, deal.currency)}
        </span>
        {probability !== null && (
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {probability}%
          </span>
        )}
      </div>
      {deal.party && (
        <div className="mt-1 flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
          {deal.party.party_kind === "person" ? (
            <User className="h-3 w-3 shrink-0" />
          ) : (
            <Building2 className="h-3 w-3 shrink-0" />
          )}
          <span className="truncate">{deal.party.display_name}</span>
        </div>
      )}
      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
        <span title="Time in this stage">
          {formatRelativeTime(deal.stage_entered_at)}
        </span>
        {deal.expected_close_date && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5",
              overdue && "font-medium text-destructive",
            )}
            title={overdue ? "Expected close is in the past" : "Expected close"}
          >
            <CalendarClock className="h-3 w-3" />
            {deal.expected_close_date}
          </span>
        )}
      </div>
    </div>
  );
}

function DraggableDealCard({
  deal,
  stage,
  memberById,
  onOpen,
}: {
  deal: DealListRow;
  stage: DealStage | undefined;
  memberById: Map<string, UserLike>;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: deal.id,
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      className={cn("cursor-grab touch-none", isDragging && "opacity-40")}
      aria-label={`Deal ${deal.name}`}
    >
      <DealCard deal={deal} stage={stage} memberById={memberById} />
    </div>
  );
}

function StageColumn({
  stage,
  deals,
  memberById,
  onOpen,
}: {
  stage: DealStage;
  deals: DealListRow[];
  memberById: Map<string, UserLike>;
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const sum = deals.reduce((acc, d) => acc + (d.amount ?? 0), 0);
  const currency = deals.find((d) => d.amount !== null)?.currency ?? "USD";
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-64 shrink-0 flex-col rounded-lg border bg-muted/30",
        stage.outcome === "won"
          ? "border-emerald-500/30"
          : stage.outcome === "lost"
            ? "border-destructive/30"
            : "border-border",
        isOver && "bg-primary/5 ring-2 ring-inset ring-primary",
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-2 py-1.5">
        <span
          className={cn(
            "truncate text-xs font-semibold",
            stage.outcome === "won"
              ? "text-emerald-600 dark:text-emerald-400"
              : stage.outcome === "lost"
                ? "text-destructive"
                : "text-foreground",
          )}
        >
          {stage.name}
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {deals.length}
          {sum > 0 && <> · {formatDealAmount(sum, currency)}</>}
        </span>
      </div>
      <div className="flex min-h-24 flex-1 flex-col gap-1.5 overflow-y-auto p-1.5">
        {deals.map((deal) => (
          <DraggableDealCard
            key={deal.id}
            deal={deal}
            stage={stage}
            memberById={memberById}
            onOpen={() => onOpen(deal.id)}
          />
        ))}
        {deals.length === 0 && (
          <div className="rounded border border-dashed border-border/60 px-2 py-3 text-center text-[11px] text-muted-foreground">
            No deals in {stage.name}
          </div>
        )}
      </div>
    </div>
  );
}

export function DealsBoard({
  pipeline,
  deals,
  total,
  memberById,
  onMoved,
  onRevert,
}: Props) {
  const router = useRouter();
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const byStage = useMemo(() => {
    const map = new Map<string, DealListRow[]>();
    for (const stage of pipeline.stages) map.set(stage.id, []);
    for (const deal of deals) {
      const list = map.get(deal.stage_id);
      if (list) list.push(deal);
      // A deal whose stage is not in this pipeline's set never renders here —
      // the list surface still shows it, so nothing is unreachable.
    }
    return map;
  }, [pipeline.stages, deals]);

  const activeDeal = activeId
    ? (deals.find((d) => d.id === activeId) ?? null)
    : null;

  const onDragStart = (event: DragStartEvent) =>
    setActiveId(String(event.active.id));

  const onDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const dealId = String(event.active.id);
    const overStageId = event.over ? String(event.over.id) : null;
    const deal = deals.find((d) => d.id === dealId);
    if (!deal || !overStageId || overStageId === deal.stage_id) return;
    const target = pipeline.stages.find((s) => s.id === overStageId);
    if (!target) return;
    // Optimistic column move; the page refetches for the derived fields.
    onMoved(dealId, overStageId);
    try {
      await moveDealToStage({ dealId, stageId: overStageId });
      if (target.outcome === "won") toast.success(`"${deal.name}" won 🎉`);
      else if (target.outcome === "lost") toast(`"${deal.name}" marked lost`);
    } catch (e) {
      onRevert();
      toast.error(e instanceof Error ? e.message : "Could not move the deal");
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {total > deals.length && (
        <div className="mb-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-400">
          Showing the first {deals.length} of {total} deals on this pipeline —
          narrow with the list view&apos;s filters to see the rest.
        </div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="flex min-h-0 flex-1 gap-2 overflow-x-auto pb-2">
          {pipeline.stages.map((stage) => (
            <StageColumn
              key={stage.id}
              stage={stage}
              deals={byStage.get(stage.id) ?? []}
              memberById={memberById}
              onOpen={(id) => router.push(`/crm/deals/${id}`)}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeDeal && (
            <DealCard
              deal={activeDeal}
              stage={pipeline.stages.find((s) => s.id === activeDeal.stage_id)}
              memberById={memberById}
              dragging
            />
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
