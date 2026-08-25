// features/masterwork/conduct/service.ts
//
// The Conductor's data half: what is ATTACHED to a Masterwork session, and the
// canonical record of the session itself.
//
// THE ATTACHMENT MODEL. The Conductor never takes a hardcoded input. Whatever
// the Expert already has is ATTACHED to the session, and a Rulebook is ONE
// attachable kind among many (more Approaches are coming — this must not
// special-case Rulebooks). The attachment is described by the platform's own
// entity vocabulary: `{ entityToken, id, name }`, where `entityToken` is the
// canonical `platform.entity_types` token. That list is what the Conductor
// reads as a NAMED VARIABLE — never prose in the human's turn (THE USER-INPUT
// LAW).
//
// THE SESSION RECORD. A Conductor session is a conversation, and its link to
// what it is building from is a canonical association — never a column, never a
// junction table:
//
//     conversation --(role 'conducting')--> rulebook
//
// The same registered `conversation → rulebook` pair the Scout's `interview`
// edge already uses (platform.association_types, container_side='none' — an
// edge is provenance, never permission). The ROLE is what tells them apart, and
// every reader must filter on it: an interview is the Expert's own words and
// feeds the Record; a conducting session is a build conversation ABOUT the
// rules and must never be mistaken for something the Expert said.

import { supabase } from "@/utils/supabase/client";
import { associationsService } from "@/features/scopes/service/associationsService";

/** The canonical association role for a Conductor build session. */
export const CONDUCTING_ROLE = "conducting" as const;

/**
 * One thing attached to a Masterwork session.
 *
 * `entityToken` is the canonical platform entity token (`rulebook` today;
 * `note`, `file`, `research_topic`, … are all already registered as sources on
 * a Rulebook and become attachable here without a code change).
 */
export interface MasterworkAttachment {
  entityToken: string;
  id: string;
  name: string;
}

/**
 * The attachments variable exactly as the Conductor receives it.
 *
 * Serialized because a Mandate variable is a scalar on the wire; the agent
 * parses it. This is still a NAMED variable, not prose appended to the human's
 * turn — the distinction the platform's whole inspectability rests on.
 */
export function attachmentsVariable(
  attachments: MasterworkAttachment[],
): string {
  return JSON.stringify(
    attachments.map((a) => ({
      entity_token: a.entityToken,
      id: a.id,
      name: a.name,
    })),
  );
}

// =============================================================================
// The relationship
// =============================================================================

/**
 * Record that a persisted conversation IS a Conductor session for this
 * Rulebook. Idempotent (the DB unique constraint revives a tombstone rather
 * than duplicating).
 *
 * Failure is LOUD but non-fatal: the session still works; we scream because an
 * unlinked session is a Masterwork build the Expert can never find their way
 * back to — the exact defect the Record exists to prevent.
 */
export async function linkConductorSession(args: {
  rulebookId: string;
  conversationId: string;
  orgId?: string | null;
}): Promise<boolean> {
  const res = await associationsService.add({
    sourceType: "conversation",
    sourceId: args.conversationId,
    targetType: "rulebook",
    targetId: args.rulebookId,
    orgId: args.orgId ?? undefined,
    role: CONDUCTING_ROLE,
  });
  if (!res.ok) {
    console.error(
      "[masterwork/conduct] FAILED to associate this Masterwork session with " +
        "its Rulebook — the Expert will have no way back to the conversation " +
        "that built their system.",
      { ...args, error: res.error },
    );
    return false;
  }
  return true;
}

/**
 * Start the association as a MODULE-LEVEL job that outlives the panel.
 *
 * The edge cannot be written at mint time — `assoc_add` requires real access to
 * both endpoints and the server writes `chat.conversation` atomically at stream
 * end, so an early write fails 42501. So we wait for the row, from a job that
 * survives the Expert closing the panel mid-turn (the case where losing the
 * link hurts most). Deduped per conversation.
 */
const pendingLinks = new Set<string>();

export function associateConductorWhenPersisted(args: {
  rulebookId: string;
  conversationId: string;
  rulebookName: string;
  /** True once the execution system has created the first request. */
  turnStarted: boolean;
}): void {
  if (!args.turnStarted) return;
  if (pendingLinks.has(args.conversationId)) return;
  pendingLinks.add(args.conversationId);
  void (async () => {
    try {
      const { waitForConversationPersisted } = await import(
        "@/features/agents/redux/execution-system/conversations/conversation-persistence"
      );
      const persisted = await waitForConversationPersisted(args.conversationId);
      if (!persisted) {
        console.error(
          "[masterwork/conduct] the Masterwork session never persisted — it " +
            "cannot be associated with its Rulebook.",
          {
            rulebookId: args.rulebookId,
            conversationId: args.conversationId,
          },
        );
        return;
      }
      await linkConductorSession({
        rulebookId: args.rulebookId,
        conversationId: args.conversationId,
      });
      await ensureConductorTitle({
        conversationId: args.conversationId,
        rulebookName: args.rulebookName,
      });
    } finally {
      pendingLinks.delete(args.conversationId);
    }
  })();
}

/**
 * Give a Conductor session an honest title. The execution system auto-titles
 * conversations ("Auto: masterwork_conductor"), which is a name no Expert
 * recognizes. Best-effort, and only ever REPLACES an auto title.
 */
export async function ensureConductorTitle(args: {
  conversationId: string;
  rulebookName: string;
}): Promise<void> {
  const { data } = await supabase
    .schema("chat")
    .from("conversation")
    .select("title, created_at")
    .eq("id", args.conversationId)
    .maybeSingle();
  if (!data) return;
  const current = (data.title ?? "").trim();
  if (current && !current.startsWith("Auto:")) return;
  const when = new Date(data.created_at ?? Date.now()).toLocaleDateString(
    undefined,
    { month: "short", day: "numeric", year: "numeric" },
  );
  await supabase
    .schema("chat")
    .from("conversation")
    .update({ title: `${args.rulebookName} — building, ${when}` })
    .eq("id", args.conversationId);
}

// =============================================================================
// Reads
// =============================================================================

/** One prior Conductor session, enough for the Expert to recognize it. */
export interface ConductorSession {
  conversationId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

/**
 * Every Conductor session on this Rulebook, most recent first.
 *
 * Filtered on the `conducting` role — an interview is a different thing and
 * belongs to the Record, not here.
 */
export async function listConductorSessions(
  rulebookId: string,
): Promise<ConductorSession[]> {
  const res = await associationsService.listForEntity("rulebook", rulebookId);
  if (!res.ok) {
    console.error(
      "[masterwork/conduct] could not read this Rulebook's Masterwork sessions",
      { rulebookId, error: res.error },
    );
    return [];
  }
  const ids = res.data.edges
    .filter(
      (e) => e.otherType === "conversation" && e.role === CONDUCTING_ROLE,
    )
    .map((e) => e.otherId);
  if (ids.length === 0) return [];

  const { data } = await supabase
    .schema("chat")
    .from("conversation")
    .select("id, title, created_at, updated_at, message_count")
    .in("id", ids)
    .is("deleted_at", null);

  return (data ?? [])
    .map((row) => ({
      conversationId: row.id as string,
      title: (row.title as string | null) ?? null,
      createdAt: (row.created_at as string | null) ?? new Date(0).toISOString(),
      updatedAt:
        (row.updated_at as string | null) ??
        (row.created_at as string | null) ??
        new Date(0).toISOString(),
      messageCount: (row.message_count as number | null) ?? 0,
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
