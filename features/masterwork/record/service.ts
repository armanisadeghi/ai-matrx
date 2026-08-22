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
//
// 🚨 THE ASSEMBLY LIVES ON THE SERVER (2026-08-19). This function no longer
// assembles anything: it calls `GET /masterworks/{rulebook_id}/corpus`, which
// runs `aidream/services/masterwork_corpus/corpus.py::load_expert_corpus` —
// the exact function the Final Checkup judges rules against.
//
// WHY. The 2026-08-19 integration audit found TWO assemblies of this corpus
// (this file and the Checkup's) that disagreed on FOUR of the nine
// Distillation Approaches: body_of_work, dump, chat_import, and the Expert's
// own AI Matrx conversations were invisible to one side or the other. The page
// and the audit were reading different records of the same Expert. One
// assembly, two readers, no drift.
//
// WHY THE SERVER AND NOT HERE. Assembling the corpus is WORK, not a DB read:
// it captures pages through the scraper, reads processed-document pages, and
// re-parses an uploaded chat export. "Clients go direct to Supabase" governs
// CRUD; none of this is CRUD. What stays here is the AUDIO enrichment — which
// recording backs which message is a presentation door over text the server
// supplied, never a source of it.

import { supabase } from "@/utils/supabase/client";
import { associationsService } from "@/features/scopes/service/associationsService";
import { parseRecordingOrigin } from "@/features/audio/recordingOrigin";
import { callApi } from "@/lib/api/call-api";
import { getStoreSingleton } from "@/lib/redux/store-singleton";
import type { paths } from "@/types/python-generated/api-types";
import type { RulebookRule } from "../types";

/**
 * The ONE corpus endpoint. The cast becomes a plain `satisfies keyof paths`
 * the moment `pnpm sync-types` picks up the route against a deployed server
 * (the CHECKUP_PATH / UNDERSTUDY_REFRESH_PATH precedent) — regenerating the
 * types before the server ships would make the next release revert them.
 */
export const EXPERT_CORPUS_PATH =
  "/masterworks/{rulebook_id}/corpus" as keyof paths;

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
  /** Stable id — the server's `segment_id` (message id, or a lane-scoped key). */
  id: string;
  /**
   * What it physically is, as the server classified it: `message` ·
   * `chat_turn` · `web_page` · `document` · `recording`, or — for something
   * handed over through the dump lane — that row's own entity token (`note`,
   * `udt_document`, `fc_set`, …). Open-ended on purpose: the dump lane reads
   * whatever the platform can read, and a closed union here would go stale the
   * day a new resolver lands. Display uses `laneLabel`, never this.
   */
  kind: string;
  /**
   * Which Distillation Approach this came from (`platform.approach.key`):
   * `interview` · `matrx_conversations` · `chat_import` · `body_of_work` ·
   * `dump` · `file` · `monologue`.
   */
  lane: string;
  /** How the lane reads in prose — "from your published work". Server-owned. */
  laneLabel: string;
  /** The piece's own name: a page title, a file name, a chat's subject. */
  title?: string | null;
  /** The Expert's words (or the file's name, for an upload with no text). */
  text: string;
  /** True when this piece was longer than one pass reads. Shown, never implied. */
  truncated?: boolean;
  /** True when a cleaned-up version of the words is what is being shown. */
  cleaned?: boolean;
  /** Door: the page this came from (body_of_work / dump web resources). */
  url?: string | null;
  /** Door: the platform row this came from (dump lane). */
  entityToken?: string | null;
  entityId?: string | null;
  /** Door: the body-of-work frontier row (`platform.masterwork_corpus_item`). */
  corpusItemId?: string | null;
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

/**
 * Something the corpus does NOT contain, said out loud.
 *
 * The load-bearing one is `lane: "source"` — text the Expert PASTED straight
 * into the distiller was never stored anywhere, so those rules genuinely
 * cannot be checked against what they actually wrote. A surface that hides
 * this makes a partial record look complete, which is the exact failure the
 * 2026-08-19 audit found. Render every one of these.
 */
export interface ExpertCorpusLimit {
  lane: string;
  reason: string;
  count: number;
  /** False = gone for good. True = a lane that failed and can be retried. */
  recoverable: boolean;
}

export interface ExpertCorpus {
  rulebookId: string;
  interviews: RulebookInterview[];
  contributions: ExpertContribution[];
  /** Total characters the Expert contributed across every contribution. */
  totalChars: number;
  /** How many contributions came from each Approach. */
  laneCounts: Record<string, number>;
  /** What could not be read — see `ExpertCorpusLimit`. Never hide these. */
  limits: ExpertCorpusLimit[];
  /**
   * Interviews this Rulebook HAS that the current viewer cannot read (the
   * conversations belong to someone else and were never shared). The surface
   * must say so — an empty Record that is really an access boundary is a lie,
   * and the honest answer is "there is more here, it just isn't yours".
   */
  hiddenInterviewCount: number;
  /**
   * False when the viewer may see the Rulebook but not the raw material behind
   * it. A Rulebook shared for viewing shares its RULES, never the unedited
   * hours of dictation — and the page says so instead of rendering empty.
   */
  canReadMaterial: boolean;
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
      // A recording whose words are in NO message: the Expert spoke into an
      // interview and the turn never landed (a lost send, an edited message).
      // It is kept as its own contribution rather than guessed onto the
      // nearest one — and it is the ONE contribution the server assembly
      // cannot see, because there is no text row for it to read.
      unmatched.push({
        id: `transcript:${row.id}`,
        kind: "recording",
        lane: "interview",
        laneLabel: "said in an interview",
        title: row.title,
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

// =============================================================================
// THE CANONICAL CORPUS — one call, nine lanes
// =============================================================================

/** The wire shape of `GET /masterworks/{rulebook_id}/corpus`. */
interface CorpusSegmentWire {
  label: string;
  segment_id: string;
  lane: string;
  lane_label: string;
  kind: string;
  text: string;
  chars: number;
  title: string | null;
  when: string | null;
  truncated: boolean;
  cleaned: boolean;
  conversation_id: string | null;
  message_id: string | null;
  file_id: string | null;
  url: string | null;
  entity_token: string | null;
  entity_id: string | null;
  corpus_item_id: string | null;
}

interface CorpusInterviewWire {
  conversation_id: string;
  title: string | null;
  created_at: string | null;
  updated_at: string | null;
  message_count: number;
  expert_turn_count: number;
  expert_chars: number;
  first_expert_line: string | null;
  rules_produced: number;
}

interface ExpertCorpusWire {
  rulebook_id: string;
  segments: CorpusSegmentWire[];
  interviews: CorpusInterviewWire[];
  limits: ExpertCorpusLimit[];
  lane_counts: Record<string, number>;
  total_chars: number;
  hidden_conversation_count: number;
  can_read_material: boolean;
}

/**
 * A segment with no honest timestamp (an uploaded source, a pasted note) still
 * has to sort somewhere. The server already ordered the corpus oldest-first and
 * put the undated pieces at the front; this keeps that order stable through the
 * client's own sort rather than inventing a date the piece does not have.
 */
const NO_TIMESTAMP = "";

function contributionFrom(segment: CorpusSegmentWire): ExpertContribution {
  return {
    id: segment.segment_id,
    kind: segment.kind,
    lane: segment.lane,
    laneLabel: segment.lane_label,
    title: segment.title,
    text: segment.text,
    when: segment.when ?? NO_TIMESTAMP,
    truncated: segment.truncated,
    cleaned: segment.cleaned,
    conversationId: segment.conversation_id ?? undefined,
    messageId: segment.message_id ?? undefined,
    fileId: segment.file_id ?? undefined,
    url: segment.url,
    entityToken: segment.entity_token,
    entityId: segment.entity_id,
    corpusItemId: segment.corpus_item_id,
  };
}

/**
 * THE CANONICAL CORPUS — everything the Expert has contributed to one
 * Rulebook, across every Approach, oldest first. This is the ONE function any
 * consumer calls; a second assembly of the same corpus is a defect.
 *
 * It assembles NOTHING itself. The nine lanes are read by
 * `GET /masterworks/{rulebook_id}/corpus` (aidream
 * `services/masterwork_corpus/`) — the same function the Final Checkup judges
 * rules against — so the page and the audit can never disagree about what the
 * Expert said. See the module header for why the server owns it.
 *
 * The ONE thing added here is the AUDIO: every dictation stamped with a
 * recording origin pointing at one of the corpus's conversations, attached to
 * the message whose words it contains verbatim. That is a door onto text the
 * server supplied, not a tenth lane.
 *
 * Assistant turns are deliberately EXCLUDED at the source — this is the
 * Expert's record, not a chat log. The conversation itself is one click away on
 * every message.
 */
export async function getExpertCorpus(
  rulebookId: string,
): Promise<ExpertCorpus> {
  const store = getStoreSingleton();
  if (!store) throw new Error("Store not ready");

  const result = await store.dispatch(
    callApi({
      path: EXPERT_CORPUS_PATH,
      method: "GET",
      pathParams: { rulebook_id: rulebookId } as never,
    }),
  );
  const error = (result as { error?: { message?: string } }).error;
  if (error) {
    throw new Error(
      error.message ?? "We couldn't read what you've contributed to this Rulebook.",
    );
  }
  const wire = (result as { data?: ExpertCorpusWire }).data;
  if (!wire) throw new Error("The corpus request returned no result.");

  const interviews: RulebookInterview[] = wire.interviews.map((i) => ({
    conversationId: i.conversation_id,
    title: i.title,
    createdAt: i.created_at ?? NO_TIMESTAMP,
    updatedAt: i.updated_at,
    messageCount: i.message_count,
    expertTurnCount: i.expert_turn_count,
    expertChars: i.expert_chars,
    firstExpertLine: i.first_expert_line,
    rulesProduced: i.rules_produced,
  }));

  let contributions = wire.segments.map(contributionFrom);

  // THE AUDIO behind the words. Attached to the message that contains the
  // spoken words verbatim; anything that matches no message is kept as its own
  // contribution rather than guessed onto the nearest one.
  const conversationIds = [
    ...new Set(
      contributions
        .map((c) => c.conversationId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  contributions = attachDictations(
    contributions,
    await readDictations(conversationIds),
  );
  contributions.sort((a, b) => a.when.localeCompare(b.when));

  return {
    rulebookId: wire.rulebook_id,
    interviews,
    contributions,
    totalChars: contributions.reduce((sum, c) => sum + c.text.length, 0),
    laneCounts: wire.lane_counts,
    limits: wire.limits,
    hiddenInterviewCount: wire.hidden_conversation_count,
    canReadMaterial: wire.can_read_material,
  };
}
