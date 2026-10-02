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
import { useAppSelector, useAppStore } from "../../../../store/hooks";
import { selectOrganizationId } from "@host/lib/redux/slices/appContextSlice";
import { useConversationMaterialized } from "../../../hooks/useConversationMaterialized";
import { useContainerLinks } from "@host/features/scopes/hooks/useContainerLinks";
import { attachmentContextKey } from "@ai-matrx/agents/context";
import {
  DOCUMENT_ATTACHMENT_PREFIXES,
  RESOURCE_ATTACHMENT_PREFIXES,
  durableAttachmentKey,
  reconcileDurableAttachments,
  selectDisplayContextRows,
  type DurableAttachment,
} from "../../../redux/execution-system/context-rules/request-context";
import { selectConversationAttachmentsEntry } from "@host/features/connectors/redux/attachments.slice";
import type { ChatRootState } from "../../../../store/root-state";
import {
  ATTACHED_DOCUMENT_TOKENS,
  attachedDocumentFileId,
  resolveAttachedDocumentDisplayName,
  useAttachedDocumentFileNames,
} from "../resources/attached-documents";

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
  const documentLinks =
    isMaterialized && links.status === "ready"
      ? ATTACHED_DOCUMENT_TOKENS.flatMap((token) =>
          links.linksFor(token).map((link) => ({
            token,
            link,
            fileId: attachedDocumentFileId(token, link),
          })),
        )
      : null;
  // Named exactly as the tiles beside the chip name them: the file's own
  // name, then a sane edge label (an edge saved without one read "Attached
  // document" after every reload).
  const fileNames = useAttachedDocumentFileNames(
    (documentLinks ?? []).flatMap(({ fileId }) => (fileId ? [fileId] : [])),
  );
  const documents: DurableAttachment[] | null =
    documentLinks?.flatMap(({ token, link, fileId }) => {
      const key = durableAttachmentKey(token, link.resourceId);
      if (!key) return [];
      const label = resolveAttachedDocumentDisplayName({
        fileName: fileId ? fileNames[fileId] : null,
        edgeLabel: link.label,
      });
      return [{ key, label }];
    }) ?? null;
  const resourcesEntry = useAppSelector(selectConversationAttachmentsEntry(conversationId));
  const resources: DurableAttachment[] | null =
    resourcesEntry.status === "succeeded"
      ? resourcesEntry.rows.map((row) => ({
          key: attachmentContextKey(row.provider, row.resource_ref),
          label: row.display_name,
        }))
      : null;
  return reconcileDurableAttachments(store.getState() as ChatRootState, conversationId, rows, [
    { prefixes: DOCUMENT_ATTACHMENT_PREFIXES, items: documents },
    { prefixes: RESOURCE_ATTACHMENT_PREFIXES, items: resources },
  ]);
}
