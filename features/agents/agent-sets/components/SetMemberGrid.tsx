// features/agents/agent-sets/components/SetMemberGrid.tsx
//
// The "Grid" builder view — an ordered, drag-to-reorder list of member role
// cards. A keyboard- and touch-friendly alternative to the spatial canvas;
// reordering persists each member's position.

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
import { useAppDispatch } from "@/lib/redux/hooks";
import { removeAgentFromSet, reorderSetMembers } from "@/features/agents/redux/agent-sets/thunks";
import { AgentRoleCard } from "./AgentRoleCard";
import type { SetAccent } from "../constants";
import type { AgentSetMember } from "../types";

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
}: {
  orchestratorId: string;
  members: AgentSetMember[];
  accent: SetAccent;
  onEdit: (agentId: string) => void;
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
    <div className="mx-auto max-w-2xl p-4">
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
