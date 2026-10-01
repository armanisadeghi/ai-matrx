"use client";

/**
 * The context rows a conversation's chip and full view DISPLAY: the door's
 * display rows (`selectDisplayContextRows`), with the server-added documents
 * reconciled against what is attached to the conversation NOW — the same
 * platform.associations edges `AttachedDocumentChips` lists. A document
 * detached since the last receipt drops out at once; one attached since then
 * shows at once, its size unknown until the next receipt.
 */

import type { ResolvedContextRow } from "@ai-matrx/agents/context";
import { useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { useConversationMaterialized } from "@/features/agents/hooks/useConversationMaterialized";
import { useContainerLinks } from "@/features/scopes/hooks/useContainerLinks";
import {
  durableAttachmentKey,
  reconcileDurableAttachments,
  selectDisplayContextRows,
  type DurableAttachment,
} from "@/features/agents/redux/execution-system/context-rules/request-context";
import type { RootState } from "@/lib/redux/store";

const DOCUMENT_TOKENS = ["processed_document", "file"] as const;

export function useConversationDisplayRows(
  conversationId: string,
  mandateKillSwitch: boolean,
): ResolvedContextRow[] {
  const store = useAppStore();
  const rows = useAppSelector(selectDisplayContextRows(conversationId, mandateKillSwitch));
  const isMaterialized = useConversationMaterialized(conversationId);
  const convOrgId = useAppSelector(
    (s) => s.conversations.byConversationId[conversationId]?.organizationId,
  );
  const activeOrgId = useAppSelector(selectOrganizationId);
  const links = useContainerLinks({
    containerType: "conversation",
    containerId: isMaterialized ? conversationId : null,
    orgId: convOrgId ?? activeOrgId,
  });
  const attached: DurableAttachment[] | null =
    isMaterialized && links.status === "ready"
      ? DOCUMENT_TOKENS.flatMap((token) =>
          links.linksFor(token).flatMap((link) => {
            const key = durableAttachmentKey(token, link.resourceId);
            return key ? [{ key, label: link.label?.trim() || "Attached document" }] : [];
          }),
        )
      : null;
  return reconcileDurableAttachments(store.getState() as RootState, conversationId, rows, attached);
}
