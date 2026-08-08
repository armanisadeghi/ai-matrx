// features/agents/agent-sets/components/SetMemberGrid.tsx
//
// The "Grid" builder view — a non-sortable orchestrator hub tile followed by an
// ordered, drag-to-reorder list of member role cards. A keyboard- and
// touch-friendly alternative to the spatial canvas; reordering persists each
// member's position.

"use client";

import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Network, PanelRight, Webhook } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { removeAgentFromSet, reorderSetMembers } from "@/features/agents/redux/agent-sets/thunks";
import { AgentRoleCard } from "./AgentRoleCard";
import { AgentPeekButton } from "./AgentPeekButton";
import { accentClasses } from "./accents";
import type { SetAccent } from "../constants";
import type { AgentSetMember } from "../types";

// The hub tile — the Grid twin of the canvas OrchestratorNode. NOT a member and
// NOT sortable: it renders above the sortable list, outside the DndContext.
// Same affordances as the canvas hub: Quick look + open the OrchestratorInspector
// (the whole tile is also clickable — hover toolbars don't exist on touch, and
// Grid IS the mobile builder).
function OrchestratorTile({
  orchestratorId,
  accent,
  memberCount,
  onOpen,
}: {
  orchestratorId: string;
  accent: SetAccent;
  memberCount: number;
  onOpen: () => void;
}) {
  const agent = useAppSelector((s) => selectAgentById(s, orchestratorId));
  const a = accentClasses(accent);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Orchestrator details"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "group/orch relative w-full cursor-pointer rounded-2xl border-2 bg-card p-4 shadow-sm transition-shadow",
        "border-transparent ring-2 hover:shadow-md",
        a.ring,
      )}
    >
      {/* Hover toolbar — mirrors the canvas hub node. */}
      <div className="absolute right-1.5 top-1.5 z-10 flex items-center gap-0.5 rounded-md bg-card/85 opacity-0 backdrop-blur transition-opacity group-hover/orch:opacity-100">
        <AgentPeekButton agentId={orchestratorId} />
        <button
          type="button"
          aria-label="Orchestrator details"
          title="Orchestrator details"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <PanelRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-3">
        <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl shadow-sm", a.glyph)}>
          <Network className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn("text-[10px] font-bold uppercase tracking-wide", a.text)}>
            Orchestrator
          </div>
          <div className="truncate text-sm font-semibold text-foreground" title={agent?.name}>
            {agent?.name ?? "Orchestrator"}
          </div>
        </div>
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-snug text-muted-foreground">
        {agent?.description ?? "Presides over this set of agents."}
      </p>
      <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <Webhook className="h-3 w-3" />
        Coordinates {memberCount} {memberCount === 1 ? "agent" : "agents"}
      </div>
    </div>
  );
}

function SortableRow({
  orchestratorId,
  member,
  accent,
  index,
  onEdit,
}: {
  orchestratorId: string;
  member: AgentSetMember;
  accent: SetAccent;
  index: number;
  onEdit: (agentId: string) => void;
}) {
  const dispatch = useAppDispatch();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: member.agentId,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "opacity-60" : undefined}
      {...attributes}
      {...listeners}
    >
      <AgentRoleCard
        agentId={member.agentId}
        roleTitle={member.roleTitle}
        gap={member.gap}
        accent={accent}
        index={index + 1}
        variant="tile"
        showDragHandle
        onEdit={() => onEdit(member.agentId)}
        onRemove={() => dispatch(removeAgentFromSet({ orchestratorId, agentId: member.agentId }))}
      />
    </div>
  );
}

export function SetMemberGrid({
  orchestratorId,
  members,
  accent,
  onEdit,
  onOpenOrchestrator,
}: {
  orchestratorId: string;
  members: AgentSetMember[];
  accent: SetAccent;
  onEdit: (agentId: string) => void;
  onOpenOrchestrator: () => void;
}) {
  const dispatch = useAppDispatch();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = members.map((m) => m.agentId);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    dispatch(reorderSetMembers({ orchestratorId, orderedAgentIds: arrayMove(ids, from, to) }));
  };

  return (
    <div className="mx-auto max-w-2xl space-y-3 p-4">
      <OrchestratorTile
        orchestratorId={orchestratorId}
        accent={accent}
        memberCount={members.length}
        onOpen={onOpenOrchestrator}
      />
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={members.map((m) => m.agentId)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {members.map((m, i) => (
              <SortableRow
                key={m.agentId}
                orchestratorId={orchestratorId}
                member={m}
                accent={accent}
                index={i}
                onEdit={onEdit}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
