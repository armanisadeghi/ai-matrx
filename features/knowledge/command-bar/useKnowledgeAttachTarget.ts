"use client";

/**
 * Turns a search hit into what a composer attaches — the id → full-payload
 * adapter the resource-picker FEATURE.md says any search hand-off needs
 * (a pick carries a typed payload, never a bare id).
 *
 *  - note                    → the full `Note` row → `{ type: "note" }`
 *  - file                    → `{ type: "file", fileId }` (durable edge path)
 *  - Source with a stored file → the same file identity
 *  - conversation            → the `referenced_conversations` context entry
 *
 * Every other kind is not attachable yet, so the action is absent for it
 * rather than offered and refused.
 */

import { useEffect, useRef } from "react";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { fetchNoteById } from "@/features/notes/service/notesService";
import { useAttachResource } from "@/features/agents/components/inputs/resources/attach-resource";
import { appendConversationReference } from "@/features/resource-manager/resource-picker/conversation-reference-context";
import type { Resource } from "@/features/agents/resources/types";
import type { KnowledgeHit } from "@/features/knowledge/api/knowledgeSearch";
import { registerActiveAttachTarget, type KnowledgeAttachTarget } from "./attachTarget";

export function isAttachableHit(hit: KnowledgeHit): boolean {
  if (hit.entity === "note" || hit.entity === "file") return true;
  if (hit.entity === "conversation") return true;
  if (hit.entity === "processed_document") return Boolean(hit.file_id);
  return false;
}

/** Hit → Resource, fetching the full payload where the attach path needs it. */
export async function hitToResource(hit: KnowledgeHit): Promise<Resource | null> {
  if (hit.entity === "note") {
    const note = await fetchNoteById(hit.id, { failureMode: "throw" });
    return note ? { type: "note", data: note } : null;
  }
  if (hit.entity === "file") {
    return { type: "file", data: { id: hit.id, fileId: hit.id, filename: hit.title } };
  }
  if (hit.entity === "processed_document" && hit.file_id) {
    return {
      type: "file",
      data: { id: hit.file_id, fileId: hit.file_id, filename: hit.title },
    };
  }
  return null;
}

export interface UseKnowledgeAttachTargetArgs {
  conversationId: string | null | undefined;
  /**
   * The composer's own pick handler (resource pickers pass theirs so the hit
   * goes through exactly the path a manual pick does). Defaults to
   * `useAttachResource(conversationId)`.
   */
  onResourceSelected?: (resource: Resource) => boolean | void | Promise<boolean | void>;
  label?: string;
  /** Narrow further to the kinds this host takes (e.g. a picker's allowed views). */
  accepts?: (hit: KnowledgeHit) => boolean;
}

export function useKnowledgeAttachTarget({
  conversationId,
  onResourceSelected,
  label = "Attach to this chat",
  accepts: hostAccepts,
}: UseKnowledgeAttachTargetArgs): KnowledgeAttachTarget | null {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const attachResource = useAttachResource(conversationId ?? "");
  if (!conversationId && !onResourceSelected) return null;

  return {
    label,
    accepts: (hit) =>
      isAttachableHit(hit) &&
      // A chat reference writes the composer's own context: it needs one.
      (hit.entity !== "conversation" || Boolean(conversationId)) &&
      (hostAccepts ? hostAccepts(hit) : true),
    attach: async (hit) => {
      try {
        if (hit.entity === "conversation" && conversationId) {
          if (hit.id === conversationId) {
            toast.error("That is this chat — pick a different conversation to reference.");
            return false;
          }
          appendConversationReference(
            dispatch,
            store.getState,
            conversationId,
            { id: hit.id, title: hit.title, updatedAt: hit.updated_at ?? "", agentId: null },
          );
          toast.success(`Referenced “${hit.title}” in this chat.`);
          return true;
        }
        const resource = await hitToResource(hit);
        if (!resource) {
          toast.error(`“${hit.title}” could not be loaded to attach.`);
          return false;
        }
        const handler = onResourceSelected ?? attachResource;
        const result = await handler(resource);
        if (result === false) return false;
        toast.success(`Attached “${hit.title}”.`);
        return true;
      } catch (error) {
        toast.error(
          error instanceof Error
            ? `Couldn't attach “${hit.title}”: ${error.message}`
            : `Couldn't attach “${hit.title}”.`,
        );
        return false;
      }
    },
  };
}

/**
 * A chat on screen registers itself as the ⌘K bar's active attach target, so
 * "Attach to this chat" appears whenever — and only while — a chat is open.
 */
export function useRegisterChatAttachTarget(
  conversationId: string | null | undefined,
): void {
  const target = useKnowledgeAttachTarget({ conversationId });
  const latest = useRef(target);
  useEffect(() => {
    latest.current = target;
  });
  useEffect(() => {
    if (!conversationId) return;
    return registerActiveAttachTarget({
      label: "Attach to this chat",
      accepts: (hit) => latest.current?.accepts(hit) ?? false,
      attach: (hit) => latest.current?.attach(hit) ?? Promise.resolve(false),
    });
  }, [conversationId]);
}
