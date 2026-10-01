"use client";

/**
 * The context rows a conversation's chip and full view DISPLAY: the door's
 * display rows (`selectDisplayContextRows`), with the server-added documents
 * reconciled against what is attached to the conversation NOW — the same
 * platform.associations edges `AttachedDocumentChips` lists, and the connector
 * resources (repos, Google files, synced records) the attachments handle has
 * read (`selectConversationAttachmentsEntry`, no second fetch). An attachment
 * detached since the last receipt drops out at once; one attached since then
 * shows at once, its size unknown until the next receipt.
 */

import type { ResolvedContextRow } from "@ai-matrx/agents/context";
import { useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { useConversationMaterialized } from "@/features/agents/hooks/useConversationMaterialized";
import { useContainerLinks } from "@/features/scopes/hooks/useContainerLinks";
import { attachmentContextKey } from "@ai-matrx/agents/context";
import {
  DOCUMENT_ATTACHMENT_PREFIXES,
  RESOURCE_ATTACHMENT_PREFIXES,
  durableAttachmentKey,
  reconcileDurableAttachments,
  selectDisplayContextRows,
  type DurableAttachment,
} from "@/features/agents/redux/execution-system/context-rules/request-context";
import { selectConversationAttachmentsEntry } from "@/features/connectors/redux/attachments.slice";
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
  const documents: DurableAttachment[] | null =
    isMaterialized && links.status === "ready"
      ? DOCUMENT_TOKENS.flatMap((token) =>
          links.linksFor(token).flatMap((link) => {
            const key = durableAttachmentKey(token, link.resourceId);
            return key ? [{ key, label: link.label?.trim() || "Attached document" }] : [];
          }),
        )
      : null;
  const resourcesEntry = useAppSelector(selectConversationAttachmentsEntry(conversationId));
  const resources: DurableAttachment[] | null =
    resourcesEntry.status === "succeeded"
      ? resourcesEntry.rows.map((row) => ({
          key: attachmentContextKey(row.provider, row.resource_ref),
          label: row.display_name,
        }))
      : null;
  return reconcileDurableAttachments(store.getState() as RootState, conversationId, rows, [
    { prefixes: DOCUMENT_ATTACHMENT_PREFIXES, items: documents },
    { prefixes: RESOURCE_ATTACHMENT_PREFIXES, items: resources },
  ]);
}
