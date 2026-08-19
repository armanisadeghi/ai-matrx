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
import { parseRecordingOrigin } from "@/features/audio/recordingOrigin";
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
 * A dictation the Expert spoke — the AUDIO behind (part of) a contribution.
 *
 * Found through the recording origin the shared recorder stamps on
 * `transcripts.transcripts.metadata.origin` (`features/audio/recordingOrigin.ts`).
 * A single message can carry several: Arman's 20,007-character turn was five
 * separate dictations pasted end to end, and each has its own audio file.
 */
export interface ExpertDictation {
  /** `transcripts.transcripts` row id. */
  transcriptId: string;
  /** The audio itself — a file id, rendered with `InlineMediaRef`. */
  fileId: string;
  /** The recording's own title (the topic label the auto-labeler gave it). */
  title: string;
  /** When it was spoken — earlier than the message, which was sent later. */
  when: string;
  /** Length of the recording in seconds, when the row recorded one. */
  durationSec?: number | null;
  /**
   * Character offset inside the contribution's text where this dictation's
   * words begin, when the transcript was found verbatim in the message. This
   * is the EVIDENCE for the match, not a guess: an offset means the spoken
   * words are literally present at that position.
   */
  charOffset?: number;
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
  /**
   * The Expert's actual VOICE behind this contribution, oldest first. Present
   * on a message that was dictated (one entry per recording); absent when it
   * was typed, or when the dictation predates the origin stamp.
   */
  dictations?: ExpertDictation[];
}

export interface ExpertCorpus {
  rulebookId: string;
  interviews: RulebookInterview[];
  contributions: ExpertContribution[];
  /** Total characters the Expert contributed across every contribution. */
  totalChars: number;
  /**
   * Interviews this Rulebook HAS that the current viewer cannot read (the
   * conversations belong to someone else and were never shared). The surface
   * must say so — an empty Record that is really an access boundary is a lie,
   * and the honest answer is "there is more here, it just isn't yours".
   */
  hiddenInterviewCount: number;
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
 * Record that a persisted conversation IS an interview for this Rulebook.
 * Called after the first turn makes the conversation real; an untouched
 * client-only draft correctly leaves no durable trace. Idempotent (the DB
 * unique constraint revives a tombstone rather than duplicating).
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
 * Start the association as a MODULE-LEVEL job that outlives the panel.
 *
 * The edge cannot be written at mint time — `assoc_add` requires real access to
 * both endpoints and the server writes `chat.conversation` atomically at stream
 * end, so an early write fails 42501 (verified live 2026-08-17). We therefore
 * wait for the row. An untouched client-minted conversation is only a draft,
 * so the caller starts this job only after the Expert sends the first turn.
 * That wait must NOT be tied to the interview sheet's React
 * lifetime: the Expert closing the panel mid-turn is exactly the case where
 * losing the link hurts most. Deduped per conversation; bounded by the
 * persistence poll's own timeout.
 */
const pendingAssociations = new Set<string>();

export function associateInterviewWhenPersisted(args: {
  rulebookId: string;
  conversationId: string;
  rulebookName: string;
  /** True once the execution system has created the first request. */
  turnStarted: boolean;
}): void {
  if (!args.turnStarted) return;
  if (pendingAssociations.has(args.conversationId)) return;
  pendingAssociations.add(args.conversationId);
  void (async () => {
    try {
      const { waitForConversationPersisted } = await import(
        "@/features/agents/redux/execution-system/conversations/conversation-persistence"
      );
      const persisted = await waitForConversationPersisted(args.conversationId);
      if (!persisted) {
        console.error(
          "[masterwork/record] interview conversation never persisted — it " +
            "cannot be associated with its Rulebook, so the Expert would have " +
            "no way back to it.",
          {
            rulebookId: args.rulebookId,
            conversationId: args.conversationId,
            rulebookName: args.rulebookName,
          },
        );
        return;
      }
      await linkInterviewConversation({
        rulebookId: args.rulebookId,
        conversationId: args.conversationId,
      });
      await ensureInterviewTitle({
        conversationId: args.conversationId,
        rulebookName: args.rulebookName,
      });
    } finally {
      pendingAssociations.delete(args.conversationId);
    }
  })();
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
  await supabase
    .schema("chat")
    .from("conversation")
    .update({
      title: interviewTitleFor(
        args.rulebookName,
        new Date(data.created_at ?? Date.now()),
      ),
    })
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
  // ROLE MATTERS. A Rulebook now carries more than one kind of conversation
  // edge — `interview` (the Scout, the Expert's own words) and `conducting`
  // (the Conductor, a build session ABOUT the rules). Only interviews belong
  // in the Record and in `getExpertCorpus`; a Conductor session swallowed as
  // interview material would put words in the Expert's mouth.
  return res.data.edges
    .filter((e) => e.otherType === "conversation" && e.role === "interview")
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
  return (await listRulebookInterviewsWithAccess(rulebookId, rules)).interviews;
}

/**
 * The interviews the viewer can actually READ, plus how many exist that they
 * cannot. The second number is what stops an access boundary from looking like
 * an empty Record.
 */
export async function listRulebookInterviewsWithAccess(
  rulebookId: string,
  rules: RulebookRule[] = [],
): Promise<{ interviews: RulebookInterview[]; hiddenCount: number }> {
  const edgeIds = await interviewConversationIds(rulebookId);

  // LOUD RECOVERY. Rule provenance is the older, weaker breadcrumb; the edge is
  // the relationship. A conversation named by a rule but missing its edge means
  // the association write never landed — heal it now (so it is never lost
  // again) and scream, because a recovery firing means a real bug got past the
  // proactive path.
  const fromProvenance = new Set(
    rules
      .map((r) => r.source_ref?.conversation_id)
      .filter((v): v is string => typeof v === "string" && v.length > 0),
  );
  const missing = [...fromProvenance].filter((id) => !edgeIds.includes(id));
  if (missing.length > 0) {
    console.error(
      "[masterwork/record] RECOVERY: interview conversations were not associated " +
        "with their Rulebook — healing the missing edges now.",
      { rulebookId, missing },
    );
    await Promise.all(
      missing.map((conversationId) =>
        linkInterviewConversation({ rulebookId, conversationId }),
      ),
    );
  }

  const ids = [...new Set([...edgeIds, ...missing])];
  if (ids.length === 0) return { interviews: [], hiddenCount: 0 };

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

  const interviews = (convRows ?? [])
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

  // Edges we can read but conversations we cannot = someone else's interviews.
  return {
    interviews,
    hiddenCount: Math.max(0, ids.length - interviews.length),
  };
}

// =============================================================================
// The audio behind the words
// =============================================================================

interface TranscriptRow {
  id: string;
  title: string | null;
  created_at: string;
  audio_file_path: string | null;
  segments: unknown;
  metadata: unknown;
}

/** `transcripts.transcripts.segments` is a jsonb array of `{ text }` parts. */
function transcriptText(segments: unknown): string {
  if (!Array.isArray(segments)) return "";
  return segments
    .map((s) =>
      s && typeof s === "object" && typeof (s as { text?: unknown }).text === "string"
        ? ((s as { text: string }).text ?? "")
        : "",
    )
    .filter(Boolean)
    .join(" ")
    .trim();
}

/**
 * How many leading characters of a transcript must appear verbatim in a
 * message for the match to count. Long enough that a coincidental hit is not
 * a real possibility, short enough to survive a trailing-word difference
 * between the streamed chunks and what the Expert actually sent.
 */
const DICTATION_MATCH_CHARS = 120;

/**
 * Every dictation stamped with an origin pointing at one of these
 * conversations. Rows written before the origin stamp existed (2026-08-17) are
 * invisible here by design — an unstamped recording cannot be attributed
 * without guessing, and a wrong attribution is worse than none.
 */
async function readDictations(
  conversationIds: string[],
): Promise<TranscriptRow[]> {
  if (conversationIds.length === 0) return [];
  const { data, error } = await supabase
    .schema("transcripts")
    .from("transcripts")
    .select("id, title, created_at, audio_file_path, segments, metadata")
    .filter(
      "metadata->origin->>conversationId",
      "in",
      `(${conversationIds.join(",")})`,
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) {
    console.error(
      "[masterwork/record] failed to read the audio behind the Expert's words " +
        "— the Record will show the text without the voice.",
      { conversationIds, error },
    );
    return [];
  }
  return (data ?? []) as unknown as TranscriptRow[];
}

/**
 * Attach each dictation to the message that contains its words.
 *
 * THE MATCH IS EVIDENCE, NOT INFERENCE. A dictation belongs to a message only
 * when the transcript's opening words appear VERBATIM inside that message's
 * text; the position where they appear is kept as `charOffset`. A dictation
 * that matches nothing (the Expert re-recorded, or edited heavily before
 * sending) is NOT force-fitted onto the nearest message — it becomes its own
 * `transcript` contribution, so the audio is still in the Record and the
 * Record still tells the truth about where it came from.
 */
function attachDictations(
  contributions: ExpertContribution[],
  rows: TranscriptRow[],
): ExpertContribution[] {
  const byMessage = new Map<string, ExpertContribution>();
  for (const c of contributions) {
    if (c.kind === "message" && c.messageId) byMessage.set(c.messageId, c);
  }

  const unmatched: ExpertContribution[] = [];
  for (const row of rows) {
    if (!row.audio_file_path) continue;
    const origin = parseRecordingOrigin(
      (row.metadata as { origin?: unknown } | null)?.origin,
    );
    const text = transcriptText(row.segments);
    const needle = text.slice(0, DICTATION_MATCH_CHARS);

    let host: ExpertContribution | undefined;
    let offset = -1;
    if (needle.length >= 20) {
      for (const c of byMessage.values()) {
        if (c.conversationId !== origin?.conversationId) continue;
        const at = c.text.indexOf(needle);
        if (at >= 0) {
          host = c;
          offset = at;
          break;
        }
      }
    }

    const dictation: ExpertDictation = {
      transcriptId: row.id,
      fileId: row.audio_file_path,
      title: row.title ?? "Recording",
      when: row.created_at,
      durationSec:
        typeof (row.metadata as { duration?: unknown } | null)?.duration ===
        "number"
          ? ((row.metadata as { duration: number }).duration ?? null)
          : null,
      ...(offset >= 0 ? { charOffset: offset } : {}),
    };

    if (host) {
      host.dictations = [...(host.dictations ?? []), dictation];
    } else {
      unmatched.push({
        id: `transcript:${row.id}`,
        kind: "transcript",
        text,
        when: row.created_at,
        conversationId: origin?.conversationId,
        fileId: row.audio_file_path,
        dictations: [dictation],
      });
    }
  }

  for (const c of byMessage.values()) {
    if (c.dictations) {
      c.dictations.sort(
        (a, b) => (a.charOffset ?? 0) - (b.charOffset ?? 0) ||
          a.when.localeCompare(b.when),
      );
    }
  }

  return [...contributions, ...unmatched];
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
 *      time anchor when it came from a recording;
 *   3. every DICTATION — the audio of a spoken turn, found through the
 *      recording origin and attached to the message whose words it contains.
 *
 * Assistant turns are deliberately EXCLUDED — this is the Expert's record, not
 * a chat log. The conversation itself is one click away on every message.
 */
export async function getExpertCorpus(
  rulebookId: string,
  rules: RulebookRule[] = [],
): Promise<ExpertCorpus> {
  const { interviews, hiddenCount } = await listRulebookInterviewsWithAccess(
    rulebookId,
    rules,
  );
  const ids = interviews.map((i) => i.conversationId);
  const [messages, dictationRows] = await Promise.all([
    readExpertMessages(ids),
    readDictations(ids),
  ]);

  let contributions: ExpertContribution[] = messages
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

  // 3. the AUDIO behind those words. Attached to the message that contains the
  //    spoken words verbatim; anything that matches no message is kept as its
  //    own contribution rather than guessed onto the nearest one.
  contributions = attachDictations(contributions, dictationRows);

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
    hiddenInterviewCount: hiddenCount,
  };
}
