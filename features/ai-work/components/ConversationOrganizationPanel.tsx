"use client";

import { AssociationList } from "@/features/scopes/components/associations/AssociationList";
import type { ContainerResourcesAdapter } from "@/features/scopes/components/associations/AssociationList";
import { useAssociations } from "@/features/scopes/hooks/useAssociations";
import {
  createAssignment,
  removeAssignmentByEntity,
} from "@/features/war-room/service/associations";
import { roomRef } from "@/features/war-room/types";
import type { EntityTypeToken } from "@/types/generated/entity-types.generated";

const ORGANIZATION_TOKENS = [
  "project",
  "task",
  "war_room",
] as const satisfies readonly EntityTypeToken[];
const ORGANIZATION_TOKEN_SET = new Set<string>(ORGANIZATION_TOKENS);

export function ConversationOrganizationPanel({
  conversationId,
}: {
  conversationId: string;
}) {
  const relationships = useAssociations({
    type: "conversation",
    id: conversationId,
  });

  const adapter: ContainerResourcesAdapter = {
    status: relationships.status,
    error: relationships.error,
    reload: relationships.reload,
    rows: relationships.edges
      .filter(
        (edge) =>
          edge.direction === "outgoing" &&
          ORGANIZATION_TOKEN_SET.has(edge.otherType),
      )
      .map((edge) => ({
        key: edge.id,
        token: edge.otherType,
        resourceId: edge.otherId,
        label: edge.label,
        removable: true,
      })),
    attach: async (token, id) => {
      try {
        if (token === "war_room") {
          await createAssignment({
            ref: roomRef(id),
            entityType: "conversation",
            entityId: conversationId,
          });
          await relationships.reload();
          return { ok: true };
        }
        if (token !== "project" && token !== "task") {
          return { ok: false, error: `Unsupported target: ${token}` };
        }
        return relationships.add({
          targetType: token,
          targetId: id,
        });
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Attach failed",
        };
      }
    },
    detach: async (token, id) => {
      try {
        if (token === "war_room") {
          await removeAssignmentByEntity(
            roomRef(id),
            "conversation",
            conversationId,
          );
          await relationships.reload();
          return { ok: true };
        }
        if (token !== "project" && token !== "task") {
          return { ok: false, error: `Unsupported target: ${token}` };
        }
        return relationships.remove({ targetType: token, targetId: id });
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Detach failed",
        };
      }
    },
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">
        Organize this conversation
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Add or remove Projects, Tasks, and War Rooms. Every name is a direct
        door to the linked work.
      </p>
      <AssociationList
        adapter={adapter}
        tokens={[...ORGANIZATION_TOKENS]}
        variant="compact"
        className="mt-3"
      />
    </section>
  );
}
