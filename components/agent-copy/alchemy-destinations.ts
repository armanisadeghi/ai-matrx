"use client";

import { createMatrxTransferPorts, type MatrxTransferContent } from "@ai-matrx/agents/content-transfer";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { selectUserId } from "@/lib/redux/slices/userSlice";
import { alchemyOrganizationId } from "./alchemy-organization";
import { saveDocumentThroughDoor, saveNotesThroughDoor, saveWorkbookThroughDoor } from "./alchemy-door";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { setPendingSource } from "@/features/tasks/redux/taskUiSlice";
import { clearFocus } from "@ai-matrx/chat/agents/redux/execution-system/conversation-focus/conversation-focus.slice";
import { bumpFreshSession } from "@ai-matrx/chat/agents/redux/chat/chat-route.slice";
import { chatRouteSurfaceKey } from "@ai-matrx/chat/agents/components/chat/begin-fresh-chat";
import { stashChatDraftTransfer } from "@ai-matrx/chat/agents/components/chat/chat-draft-transfer";
import { DEFAULT_NEW_CHAT_MANDATE_KEY } from "@ai-matrx/chat/agents/components/chat/chat-quick-actions.config";

/** The folder `attach` saves its note into (the package passes it); that flow needs the note's own id. */
const ALCHEMY_ATTACH_FOLDER = "Alchemy";

type Host = { getCurrentState(): RootState; dispatch: AppDispatch; navigate(href: string): void };

/** A door receipt as the destination's save result: the created record's link, or the refusal's words. */
function savedRecord({ receipt, created }: Awaited<ReturnType<typeof saveDocumentThroughDoor>>): { ok: boolean; id?: string; href?: string; error?: string } {
  if (receipt.status === "refused") return { ok: false, error: `${receipt.sentence} ${receipt.remedy}` };
  if (receipt.status !== "applied") return { ok: false, error: receipt.sentence };
  if (!created) return { ok: false, error: `${receipt.sentence} Its link isn't available; find it in the library — don't save another copy.` };
  return created.error ? { ok: false, id: created.id, href: created.href, error: created.error } : { ok: true, id: created.id, href: created.href };
}

/** Concrete Matrx bindings for the portable destination workflow. */
export function createAlchemyDestinationPorts(host: Host) {
  const identity = () => {
    const state = host.getCurrentState();
    // The admin section works in the platform tenant, like every other request from there.
    const userId = selectUserId(state); const organizationId = alchemyOrganizationId(state);
    if (!userId || !organizationId) throw new Error("Sign in and select an organization to use Matrx destinations.");
    return { userId, organizationId };
  };
  // A write: it lands through the one write door (`matrx-user/notes · create_notes`, headless
  // when no Notes page is open) and is refused with the door's own sentence and remedy.
  const saveNote = async (content: MatrxTransferContent, folder: string) => {
    identity();
    const { receipt, created } = await saveNotesThroughDoor([{ title: content.label, content: content.markdown, folder }]);
    if (receipt.status === "refused") throw new Error(`${receipt.sentence} ${receipt.remedy}`);
    const note = created[0];
    if (note) return note;
    // Saved, but the handler reported no id. A destination that only needs a link gets the Notes list;
    // "attach" needs the note's real id, so it says the note exists rather than inventing one.
    if (folder === ALCHEMY_ATTACH_FOLDER) {
      throw new Error(`${receipt.sentence} The note was saved but its link isn't available; find it in Notes and attach it there — don't save another copy.`);
    }
    return { kind: "notes", id: "notes", label: "Notes", href: "/notes" };
  };
  return createMatrxTransferPorts({
    getIdentity: identity,
    saveNote,
    // Writes: through the one write door (`create_documents` / `create_workbooks`, headless), the
    // created record's link from the receipt; a refusal is the door's own sentence and remedy.
    saveDocument: async (content) => { identity(); return savedRecord(await saveDocumentThroughDoor({ markdown: content.markdown, name: content.label })); },
    saveWorkbook: async (content) => { identity(); if (!content.table) throw new Error("A workbook requires tabular content."); return savedRecord(await saveWorkbookThroughDoor(content.table)); },
    openNotes: (content) => { host.dispatch(openOverlay({ overlayId: "saveToNotes", instanceId: `alchemy-notes:${crypto.randomUUID()}`, data: { initialContent: content.markdown, title: content.label } })); },
    openTask: (content) => { host.dispatch(setPendingSource({ entity_type: null, entity_id: null, label: content.label, metadata: { source: "alchemy", sourceId: content.draft.sourceId }, prePopulate: { title: content.label, description: content.markdown } })); },
    openCode: (content) => { host.dispatch(openOverlay({ overlayId: "saveToCode", instanceId: `alchemy-code:${crypto.randomUUID()}`, data: { initialContent: content.plainText, initialLanguage: "plaintext", suggestedName: content.label, defaultFolderId: null } })); },
    openAttachment: (target) => { host.dispatch(openOverlay({ overlayId: "contextAssignment", instanceId: `alchemy-attach:${target.id}`, data: { subject: { entityType: "note", entityId: target.id, title: target.label } } })); },
    openChat: async (content, mode, current) => {
      const { resolveMandateAsking } = await import("@ai-matrx/chat/mandates/resolve-asking");
      let mandate;
      try {
        mandate = await resolveMandateAsking(DEFAULT_NEW_CHAT_MANDATE_KEY);
      } catch (error) {
        throw error;
      }
      identity();
      const resource = { type: "text" as const, data: { id: crypto.randomUUID(), label: content.label, text: content.markdown } };
      if (mode === "chat") {
        stashChatDraftTransfer({ targetAgentId: mandate.agentId, text: "", resources: [resource], ...current });
        host.dispatch(clearFocus(chatRouteSurfaceKey(mandate.agentId))); host.dispatch(bumpFreshSession()); host.navigate("/chat/new"); return;
      }
      const instanceId = `alchemy-chat:${crypto.randomUUID()}`;
      host.dispatch(openOverlay({ overlayId: "agentRunWindow", instanceId, data: { initialAgentId: mandate.agentId, initialResources: [resource], initialResourceIdentity: current, initialAutoRun: false, initialToolsOpen: mode === "tools", mandateKey: DEFAULT_NEW_CHAT_MANDATE_KEY, surfaceName: null, seedNonce: Date.now() } }));
    },
  });
}
