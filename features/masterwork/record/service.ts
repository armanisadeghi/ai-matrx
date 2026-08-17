// features/masterwork/record/service.ts
//
// THE RECORD — everything the Expert has ever contributed to one Rulebook.
//
// WHY THIS EXISTS (Arman, 2026-08-17, after dictating ~37,455 characters of his
// SEO method into a single Scout interview and losing the way back to it):
//
//   "When I go to one that I've already done and I click interview me, there's
//    no way to go back to the conversation I was having before. That's
//    horrible… Clearly we're not properly associating these things together."
//
//   "All of the things that I have said, all of the transcripts or messages I
//    wrote, need to be readily available somewhere in the UI."
//
// The Expert's own words are the single most valuable asset in this product.
// Before this module, a Rulebook and its interview conversations had NO
// relationship: the only breadcrumb was `source_ref.conversation_id` on rules
// that happened to be written successfully, plus `chat.tool_trace.args`. That
// is forensics, not a relationship.
//
// THE RELATIONSHIP — canonical, no new column, no junction table:
//   `platform.associations` edge  conversation --(role 'interview')--> rulebook
// registered in `platform.association_types` (2026-08-17). Direction follows
// the canonical rule: little points to big — many conversations make a
// Rulebook. Written through `associationsService` ONLY (the sole caller of the
// `assoc_*` RPCs), never by touching the table.
//
// THE CORPUS CONTRACT — `getExpertCorpus(rulebookId)` is the ONE canonical way
// any consumer (this UI, the Final Checkup auditor, a future Hindsight pass)
// gets "everything the Expert ever said about this Rulebook", ordered oldest
// first. Never assemble it a second way.

import { supabase } from "@/utils/supabase/client";
import { associationsService } from "@/features/scopes/service/associationsService";
import type { RulebookRule } from "../types";

// =============================================================================
// Types
// =============================================================================

/** One Scout interview conversation belonging to a Rulebook. */
export interface RulebookInterview {
  conversationId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string | null;
  /** Total messages in the conversation (both sides). */
  messageCount: number;
  /** How many turns the Expert took. */
  expertTurnCount: number;
  /** How many characters the Expert contributed. The honest "how much is in here". */
  expertChars: number;
  /** First line of the first thing the Expert said — how they recognise it. */
  firstExpertLine: string | null;
  /** Rules in the Rulebook whose provenance points at this conversation. */
  rulesProduced: number;
}

/**
 * One thing the Expert contributed. The unit of THE RECORD and of the corpus
 * handed to any auditing agent.
 */
export interface ExpertContribution {
  /** Stable id — the message / file / transcript row id. */
  id: string;
  kind: "message" | "upload" | "transcript";
  /** The Expert's words (or the file's name, for an upload with no text). */
  text: string;
  /** ISO timestamp — the corpus is ordered by this, oldest first. */
  when: string;
  /** Door: the conversation this came from. */
  conversationId?: string;
  /** Door: the exact message. */
  messageId?: string;
  /** Door: the uploaded source (`files.files` id) — openable at /files/f/{id}. */
  fileId?: string;
  /** Time anchor inside a recording, when the contribution is a spoken span. */
  timeRange?: { start: number; end?: number | null };
  /** Extraction job that read an uploaded document, when there was one. */
  pageExtractionJobId?: string;
  /** For an upload: how many rules it produced. */
  rulesProduced?: number;
}

export interface ExpertCorpus {
  rulebookId: string;
  interviews: RulebookInterview[];
  contributions: ExpertContribution[];
  /** Total characters the Expert contributed across every contribution. */
  totalChars: number;
}

// =============================================================================
// Message content → plain text
// =============================================================================

interface MessagePart {
  type?: string;
  text?: string;
}

/**
 * `chat.message.content` is a JSONB array of typed parts. The Expert's words
 * are the `text` parts, joined in order. Non-text parts (attachments) are
 * surfaced separately as `upload` contributions, never flattened into prose.
 */
export function messageContentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object") {
        const p = part as MessagePart;
        if (typeof p.text === "string") return p.text;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function firstLine(text: string, max = 140): string | null {
  const line = text.split("\n").map((l) => l.trim()).find(Boolean);
  if (!line) return null;
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

// =============================================================================
// The relationship
// =============================================================================

/**
 * Record that a conversation IS an interview for this Rulebook. Called the
 * moment the Scout panel knows both ids — the FIRST thing that happens, so a
 * conversation can never exist un-associated even if the Expert closes the
 * panel before saying a word. Idempotent (the DB unique constraint revives a
 * tombstone rather than duplicating).
 *
 * Failure is LOUD but non-fatal: the interview still works; we scream because
 * an unlinked conversation is exactly the defect this closes.
 */
export async function linkInterviewConversation(args: {
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
    role: "interview",
  });
  if (!res.ok) {
    console.error(
      "[masterwork/record] FAILED to associate interview conversation with its Rulebook — " +
        "the Expert's words will not be findable from the Rulebook page.",
      { ...args, error: res.error },
    );
    return false;
  }
  return true;
}

/**
 * Give an interview conversation an honest title. The agent-execution system
 * auto-titles conversations ("Auto: expertise_interviewer"), which is a name
 * no Expert recognises. Best-effort and only ever REPLACES an auto title — a
 * title the Expert (or the labeler) chose is never clobbered.
 */
export async function ensureInterviewTitle(args: {
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
    .update({ title: `${args.rulebookName} — interview, ${when}` })
    .eq("id", args.conversationId);
}

/** Build the honest title a NEW interview should carry from the start. */
export function interviewTitleFor(rulebookName: string, when = new Date()) {
  const date = when.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${rulebookName} — interview, ${date}`;
}

// =============================================================================
// Reads
// =============================================================================

/** Every conversation id associated with this Rulebook, oldest edge first. */
async function interviewConversationIds(rulebookId: string): Promise<string[]> {
  const res = await associationsService.listForEntity("rulebook", rulebookId);
  if (!res.ok) {
    console.error(
      "[masterwork/record] could not read this Rulebook's interview edges",
      { rulebookId, error: res.error },
    );
    return [];
  }
  return res.data.edges
    .filter((e) => e.otherType === "conversation")
    .map((e) => e.otherId);
}

interface UserMessageRow {
  id: string;
  conversation_id: string;
  position: number;
  content: unknown;
  created_at: string;
}

/** Every message the EXPERT wrote, across the given conversations, in order. */
async function readExpertMessages(
  conversationIds: string[],
): Promise<UserMessageRow[]> {
  if (conversationIds.length === 0) return [];
  const { data, error } = await supabase
    .schema("chat")
    .from("message")
    .select("id, conversation_id, position, content, created_at")
    .in("conversation_id", conversationIds)
    .eq("role", "user")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[masterwork/record] failed to read the Expert's messages", {
      conversationIds,
      error,
    });
    return [];
  }
  return (data ?? []) as unknown as UserMessageRow[];
}

/**
 * The interviews on a Rulebook, richest-first metadata: when, how many turns,
 * how much the Expert said, how many rules it produced, and the first line so
 * the Expert recognises which conversation is which.
 */
export async function listRulebookInterviews(
  rulebookId: string,
  rules: RulebookRule[] = [],
): Promise<RulebookInterview[]> {
  const ids = await interviewConversationIds(rulebookId);
  if (ids.length === 0) return [];

  const [{ data: convRows }, messages] = await Promise.all([
    supabase
      .schema("chat")
      .from("conversation")
      .select("id, title, created_at, updated_at, message_count")
      .in("id", ids)
      .is("deleted_at", null),
    readExpertMessages(ids),
  ]);

  const rulesByConversation = new Map<string, number>();
  for (const rule of rules) {
    const cid = rule.source_ref?.conversation_id;
    if (cid) rulesByConversation.set(cid, (rulesByConversation.get(cid) ?? 0) + 1);
  }

  return (convRows ?? [])
    .map((row) => {
      const mine = messages.filter((m) => m.conversation_id === row.id);
      const texts = mine.map((m) => messageContentToText(m.content));
      return {
        conversationId: row.id,
        title: row.title,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        messageCount: row.message_count ?? mine.length,
        expertTurnCount: mine.length,
        expertChars: texts.reduce((sum, t) => sum + t.length, 0),
        firstExpertLine: texts.length > 0 ? firstLine(texts[0]) : null,
        rulesProduced: rulesByConversation.get(row.id) ?? 0,
      } satisfies RulebookInterview;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * THE CANONICAL CORPUS — everything the Expert has contributed to one
 * Rulebook, ordered oldest first, across every conversation and every
 * Approach. This is the ONE function any consumer calls; a second assembly of
 * the same corpus is a defect.
 *
 * Sources, in the order they are merged:
 *   1. every USER message in every associated interview conversation;
 *   2. every uploaded source / recording that produced rules
 *      (`source_ref.file_id`), each with the extraction that read it and the
 *      time anchor when it came from a recording.
 *
 * Assistant turns are deliberately EXCLUDED — this is the Expert's record, not
 * a chat log. The conversation itself is one click away on every message.
 */
export async function getExpertCorpus(
  rulebookId: string,
  rules: RulebookRule[] = [],
): Promise<ExpertCorpus> {
  const interviews = await listRulebookInterviews(rulebookId, rules);
  const ids = interviews.map((i) => i.conversationId);
  const messages = await readExpertMessages(ids);

  const contributions: ExpertContribution[] = messages
    .map((m) => {
      const text = messageContentToText(m.content);
      return {
        id: m.id,
        kind: "message" as const,
        text,
        when: m.created_at,
        conversationId: m.conversation_id,
        messageId: m.id,
      };
    })
    .filter((c) => c.text.length > 0);

  // Uploaded sources: one contribution per distinct file that produced rules.
  const byFile = new Map<string, ExpertContribution>();
  for (const rule of rules) {
    const ref = rule.source_ref;
    if (!ref?.file_id) continue;
    const existing = byFile.get(ref.file_id);
    if (existing) {
      existing.rulesProduced = (existing.rulesProduced ?? 0) + 1;
      continue;
    }
    byFile.set(ref.file_id, {
      id: `file:${ref.file_id}`,
      kind: ref.time_range ? "transcript" : "upload",
      text: ref.note ?? "",
      // Files carry no per-rule timestamp; anchor them before the first
      // interview so an upload that seeded the Rulebook reads first.
      when: interviews.at(-1)?.createdAt ?? new Date(0).toISOString(),
      fileId: ref.file_id,
      timeRange: ref.time_range,
      pageExtractionJobId: ref.page_extraction_job_id,
      rulesProduced: 1,
    });
  }
  contributions.push(...byFile.values());

  contributions.sort((a, b) => a.when.localeCompare(b.when));

  return {
    rulebookId,
    interviews,
    contributions,
    totalChars: contributions.reduce((sum, c) => sum + c.text.length, 0),
  };
}
