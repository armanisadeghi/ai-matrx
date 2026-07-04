/**
 * war_room_read_resource — READ any attached resource, any registered entity
 * type. The generic access half of the open-vocabulary `<resources>` roster:
 * the context lists {type, id, title}; this tool returns the content.
 *
 * Resolution order (registry-driven, zero per-surface code):
 *   1. `entity_type` = "thread" | "war_room" → the container's full attachment
 *      MANIFEST (every edge with type/id/title/pinned) — the `<more/>` escape
 *      hatch and the "what does thread X hold?" answer for oversight tiers.
 *   2. A bespoke client adapter for tokens server tools don't cover:
 *      `conversation` (recent messages + attached working documents) and
 *      `working_document` (title + body).
 *   3. The canonical adapter registry (`entityContentAdapters`) — bespoke
 *      `read` when registered, else the safe RLS-scoped generic row read.
 *
 * Read-only, no HITL — same family + dispatcher as war_room_read_thread. All
 * reads are RLS-scoped supabase (the established war-room tool pattern);
 * failures come back as clean `ok:false` results, never throws.
 */

import type { WarRoomMasterToolHandler } from "./types";
import {
  READ_RESOURCE_DEFAULT_MAX_CHARS,
  type WarRoomReadResourceArgs,
  type WarRoomReadResourceResult,
} from "../tools/schemas";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";
import { selectConversationMessages } from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { messageRecordToText } from "../service/messageText";
import {
  getCxWorkingDocumentById,
  listConversationDocuments,
} from "@/features/agents/redux/execution-system/instance-working-document/cx-working-document.service";
import {
  getEntityContentAdapter,
  readEntityRowGeneric,
} from "@/features/scopes/registry/entityContentAdapters";
import { listAssignmentsForContainer } from "@/features/war-room/service/associations";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";

function clip(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: `${text.slice(0, maxChars)}…`, truncated: true };
}

export const readResourceHandler: WarRoomMasterToolHandler<
  WarRoomReadResourceArgs,
  WarRoomReadResourceResult
> = {
  name: "war_room_read_resource",
  run: async (args, ctx) => {
    const { entity_type, entity_id } = args;
    const maxChars = args.max_chars ?? READ_RESOURCE_DEFAULT_MAX_CHARS;
    const base = { entity_type, entity_id };

    try {
      // ── Containers: the full attachment manifest ────────────────────────
      if (entity_type === "thread" || entity_type === "war_room") {
        const rows = await listAssignmentsForContainer({
          type: entity_type === "thread" ? "thread" : "room",
          id: entity_id,
        });
        const manifest = rows.map((r) => ({
          type: r.entity_type,
          id: r.entity_id,
          title: r.label ?? undefined,
          active: r.is_active ?? undefined,
        }));
        return {
          ok: true,
          ...base,
          content: JSON.stringify(manifest, null, 1),
          meta: { count: manifest.length },
          hint: "Read any listed resource with war_room_read_resource(type, id).",
        };
      }

      // ── Conversation: recent messages + its working documents ──────────
      if (entity_type === "conversation") {
        try {
          await ctx.dispatch(
            loadConversation({ conversationId: entity_id }),
          ).unwrap();
        } catch (err) {
          console.error(
            `[war-room] read_resource loadConversation skipped for ${entity_id}:`,
            err,
          );
        }
        const messages = selectConversationMessages(entity_id)(ctx.getState());
        const rendered = messages
          .slice(-30)
          .map((m) => ({ role: m.role, text: messageRecordToText(m) }))
          .filter((m) => m.text.length > 0);
        let docs: { id: string; kind: string; enabled: boolean }[] = [];
        try {
          const linked = await listConversationDocuments(entity_id);
          docs = linked.map((d) => ({
            id: d.documentId,
            kind: d.kind,
            enabled: d.enabled,
          }));
        } catch (err) {
          console.error(
            `[war-room] read_resource listConversationDocuments failed:`,
            err,
          );
        }
        const body = rendered
          .map((m) => `${m.role}: ${m.text}`)
          .join("\n---\n");
        const { text, truncated } = clip(body, maxChars);
        return {
          ok: true,
          ...base,
          content: text,
          meta: {
            message_count: messages.length,
            truncated,
            working_documents: docs,
          },
          hint:
            docs.length > 0
              ? "Read a working document with war_room_read_resource(entity_type='working_document', entity_id=<its id>)."
              : undefined,
        };
      }

      // ── Working document: title + body ──────────────────────────────────
      if (entity_type === "working_document") {
        const doc = await getCxWorkingDocumentById(entity_id);
        if (!doc) {
          return {
            ok: false,
            ...base,
            error: "not_found",
            hint: "The document does not exist or is not accessible.",
          };
        }
        const { text, truncated } = clip(doc.content ?? "", maxChars);
        return {
          ok: true,
          ...base,
          content: text,
          meta: { title: doc.title ?? null, truncated },
        };
      }

      // ── Registry adapters + the generic RLS row read ────────────────────
      if (!tryGetEntityInfo(entity_type)) {
        return {
          ok: false,
          ...base,
          error: "unknown_entity_type",
          hint: `"${entity_type}" is not a registered entity type — use a type from the <resources> roster.`,
        };
      }
      const adapter = getEntityContentAdapter(entity_type);
      const result = adapter?.read
        ? await adapter.read(entity_id, {
            mode: args.mode,
            maxChars,
          })
        : await readEntityRowGeneric(entity_type, entity_id, {
            mode: args.mode,
            maxChars,
          });
      if (!result.ok) {
        return { ok: false, ...base, error: result.error };
      }
      return {
        ok: true,
        ...base,
        content: result.content,
        meta: result.meta,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "read failed";
      console.error("[war-room] war_room_read_resource failed:", err);
      return { ok: false, ...base, error: message };
    }
  },
};
