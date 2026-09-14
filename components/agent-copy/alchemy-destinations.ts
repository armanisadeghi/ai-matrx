"use client";

import { createMatrxTransferPorts, type MatrxTransferContent } from "@ai-matrx/agents/content-transfer";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { selectUserId } from "@/lib/redux/slices/userSlice";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { setPendingSource } from "@/features/tasks/redux/taskUiSlice";
import { clearFocus } from "@/features/agents/redux/execution-system/conversation-focus/conversation-focus.slice";
import { bumpFreshSession } from "@/features/agents/redux/chat/chat-route.slice";
import { chatRouteSurfaceKey } from "@/features/agents/components/chat/begin-fresh-chat";
import { stashChatDraftTransfer } from "@/features/agents/components/chat/chat-draft-transfer";
import { DEFAULT_NEW_CHAT_MANDATE_KEY } from "@/features/agents/components/chat/chat-quick-actions.config";

type Host = { getCurrentState(): RootState; dispatch: AppDispatch; navigate(href: string): void };

/** Concrete Matrx bindings for the portable destination workflow. */
export function createAlchemyDestinationPorts(host: Host) {
  const identity = () => {
    const state = host.getCurrentState();
    const userId = selectUserId(state); const organizationId = selectOrganizationId(state);
    if (!userId || !organizationId) throw new Error("Sign in and select an organization to use Matrx destinations.");
    return { userId, organizationId };
  };
  const saveNote = async (content: MatrxTransferContent, folder: string) => {
    const { organizationId } = identity();
    const { NotesAPI } = await import("@/features/notes/service/notesApi");
    identity();
    const note = await NotesAPI.create({ label: content.label, content: content.markdown, folder_name: folder, tags: [], organization_id: organizationId });
    return { kind: "note", id: note.id, label: note.label, href: `/notes/${note.id}` };
  };
  return createMatrxTransferPorts({
    getIdentity: identity,
    saveNote,
    saveDocument: async (content) => { const { organizationId } = identity(); const { pushMarkdownToDocument } = await import("@/features/data-tables/export-targets"); identity(); return pushMarkdownToDocument(content.markdown, content.label, organizationId); },
    saveWorkbook: async (content) => { const { organizationId } = identity(); const { pushTableToWorkbook } = await import("@/features/data-tables/export-targets"); identity(); if (!content.table) throw new Error("A workbook requires tabular content."); return pushTableToWorkbook(content.table, organizationId); },
    openNotes: (content) => { host.dispatch(openOverlay({ overlayId: "saveToNotes", instanceId: `alchemy-notes:${crypto.randomUUID()}`, data: { initialContent: content.markdown, title: content.label } })); },
    openTask: (content) => { host.dispatch(setPendingSource({ entity_type: null, entity_id: null, label: content.label, metadata: { source: "alchemy", sourceId: content.draft.sourceId }, prePopulate: { title: content.label, description: content.markdown } })); },
    openCode: (content) => { host.dispatch(openOverlay({ overlayId: "saveToCode", instanceId: `alchemy-code:${crypto.randomUUID()}`, data: { initialContent: content.plainText, initialLanguage: "plaintext", suggestedName: content.label, defaultFolderId: null } })); },
    openAttachment: (target) => { host.dispatch(openOverlay({ overlayId: "contextAssignment", instanceId: `alchemy-attach:${target.id}`, data: { subject: { entityType: "note", entityId: target.id, title: target.label } } })); },
    openChat: async (content, mode, current) => {
      const { resolveMandate } = await import("@/features/mandates/service");
      const mandate = await resolveMandate(DEFAULT_NEW_CHAT_MANDATE_KEY);
      identity();
      const resource = { type: "text" as const, data: { id: crypto.randomUUID(), label: content.label, text: content.markdown } };
      if (mode === "chat") {
        stashChatDraftTransfer({ targetAgentId: mandate.agentId, text: "", resources: [resource], ...current });
        host.dispatch(clearFocus(chatRouteSurfaceKey(mandate.agentId))); host.dispatch(bumpFreshSession()); host.navigate("/chat/new"); return;
      }
      const instanceId = `alchemy-chat:${crypto.randomUUID()}`;
      host.dispatch(openOverlay({ overlayId: "agentRunWindow", instanceId, data: { initialAgentId: mandate.agentId, initialResources: [resource], initialResourceIdentity: current, initialAutoRun: false, mandateKey: DEFAULT_NEW_CHAT_MANDATE_KEY, surfaceName: null, seedNonce: Date.now() } }));
    },
  });
}
