import { supabase } from "@/utils/supabase/client";
import { requireUserId, getUserId } from "@/utils/auth/getUserId";
import { getRulebook, saveRules } from "../service";
import { nextRuleId } from "../ruleIds";
import type { Rulebook, RulebookRule } from "../types";
import { scopeToOwner, type ListScopeWord } from "@/lib/list-scope";

/**
 * The Oracle tap — Approach #10's in-app half. Colleagues (and the Expert
 * themself) already ask the AI questions all day; when an answer is worth
 * keeping, it lands in a Rulebook as a DRAFT rule the Expert reviews like any
 * other draft. Two entry points share this ONE implementation:
 *
 *   - "Add to Rulebook" in the message ⋯ menu (messageActionRegistry)
 *   - the thumbs follow-up nudge (RulebookNudge in AssistantActionBar)
 *
 * Both open the `addToRulebookDialog` overlay, which calls
 * `appendDraftRuleFromMessage`. The write is the canonical `saveRules`
 * compare-and-swap from features/masterwork/service.ts — never a second write
 * path. Appending is commutative, so a CAS conflict re-reads and retries.
 */

/** Word-boundary cap for the derived rule name (matches the platform rule). */
const NAME_MAX_CHARS = 60;
/** A rule statement is a rule, not an article — cap what one message can land. */
const STATEMENT_MAX_CHARS = 4000;
const CAS_RETRIES = 3;

/** First meaningful line of the message, markdown markers stripped, truncated
 * at a word boundary. The Expert can rename during review like any draft. */
export function deriveRuleNameFromContent(content: string): string {
  const firstLine =
    content
      .split("\n")
      .map((line) =>
        line
          // Strip leading markdown structure: headings, list/quote markers.
          .replace(/^[#>\-*+\s]+/, "")
          // Strip emphasis/code markers so the name reads as plain words.
          .replace(/[*_`~]/g, "")
          .trim(),
      )
      .find((line) => line.length > 0) ?? "";
  if (!firstLine) return "Saved from a conversation";
  if (firstLine.length <= NAME_MAX_CHARS) return firstLine;
  const cut = firstLine.slice(0, NAME_MAX_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > NAME_MAX_CHARS / 2 ? cut.slice(0, lastSpace) : cut).trim();
}

/** The picker's projection — just enough to choose a Rulebook. */
export interface OracleRulebookOption {
  id: string;
  name: string;
  description: string;
  rule_count: number;
  updated_at: string;
}

/**
 * The viewer's OWN Rulebooks (THE VIEW LAW: explicit `mine` predicate, never a
 * bare RLS read). A draft lands where the Expert reviews it, so only Rulebooks
 * they created are offered. Small population; recency-ordered.
 */
export async function listMyRulebooks(): Promise<OracleRulebookOption[]> {
  const userId = requireUserId();
  // DECLARED `mine`, not hard-coded (DD-137c / §3.3). A draft lands where the Expert reviews it, so
  // this picker deliberately offers only Rulebooks they created — said in one word, through the
  // same helper every other list uses, and one word from being changed.
  const ownerOnly = await scopeToOwner("rulebook", "mine");
  let q = supabase
    .schema("platform")
    .from("rulebook")
    .select("id,name,description,rules,updated_at")
    .is("deleted_at", null);
  if (ownerOnly) q = q.eq("created_by", userId);
  const { data, error } = await q
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    description: String(row.description ?? ""),
    rule_count: Array.isArray(row.rules) ? row.rules.length : 0,
    updated_at: String(row.updated_at),
  }));
}

// Cached per session + per user: the thumbs nudge must never show for a user
// with zero Rulebooks, and must never cost a query per thumbs click either.
let hasRulebookCache: { userId: string; promise: Promise<boolean> } | null =
  null;

/** Cheap, cached: does the viewer own at least one Rulebook? Errors resolve
 * false (the nudge simply doesn't show) — never a thrown toast on a nudge. */
export function hasAnyRulebook(): Promise<boolean> {
  const userId = getUserId();
  if (!userId) return Promise.resolve(false);
  if (hasRulebookCache?.userId === userId) return hasRulebookCache.promise;
  const promise = (async () => {
    const ownerOnly = await scopeToOwner("rulebook", "mine");
    let countQuery = supabase
      .schema("platform")
      .from("rulebook")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null);
    if (ownerOnly) countQuery = countQuery.eq("created_by", userId);
    const { count, error } = await countQuery;
    if (error) {
      hasRulebookCache = null; // don't cache a failure
      return false;
    }
    return (count ?? 0) > 0;
  })();
  hasRulebookCache = { userId, promise };
  return promise;
}

/** Called after a successful append so a first-ever Rulebook shows the nudge
 * without a reload. */
export function invalidateHasRulebookCache(): void {
  hasRulebookCache = null;
}

/**
 * The question this answer answered — ONE implementation, used by both chat
 * surfaces' menus and nudges. The Oracle tap's whole premise is *"the question
 * maps which judgment is scarce, and the answer is already written in their
 * voice"*, so a draft that keeps only the answer throws away the half that
 * makes it a rule. Walks back from the message to the nearest user turn.
 *
 * Takes the minimum shape both stores already have, so neither surface needs a
 * store-specific helper of its own.
 */
export function precedingQuestion(
  messages: ReadonlyArray<{ id: string; role: string; content?: string | null }>,
  messageId: string | null,
): string | null {
  if (!messageId) return null;
  const index = messages.findIndex((m) => m.id === messageId);
  if (index <= 0) return null;
  for (let i = index - 1; i >= 0; i--) {
    if (messages[i].role !== "user") continue;
    const text = (messages[i].content ?? "").trim();
    return text.length > 0 ? text : null;
  }
  return null;
}

export interface AppendDraftRuleResult {
  rulebook: Rulebook;
  rule: RulebookRule;
}

/**
 * Land one message's content as a DRAFT rule on a Rulebook — the Oracle tap's
 * single write. Draft means the Expert still approves it in review; nothing
 * here can reach a Build unreviewed. CAS through `saveRules`, with a bounded
 * re-read retry because a concurrent Scout write and an append can both win.
 */
export async function appendDraftRuleFromMessage(opts: {
  rulebookId: string;
  content: string;
  conversationId: string | null;
  /** The message the draft came from — the draft's provenance, always recorded. */
  messageId?: string | null;
  /** The user's question, when this message is an answer to one. */
  question?: string | null;
}): Promise<AppendDraftRuleResult> {
  const question = (opts.question ?? "").trim() || null;
  const statement =
    opts.content.length > STATEMENT_MAX_CHARS
      ? `${opts.content.slice(0, STATEMENT_MAX_CHARS).trimEnd()}…`
      : opts.content;
  // The name reads best as the QUESTION when there is one — that is the shape
  // the Expert recognises in their review queue ("what do I do if…"), not the
  // first line of the answer.
  const name = deriveRuleNameFromContent(question ?? opts.content);

  let lastError: unknown = null;
  for (let attempt = 0; attempt < CAS_RETRIES; attempt++) {
    const rulebook = await getRulebook(opts.rulebookId);
    if (!rulebook) throw new Error("That Rulebook no longer exists.");

    // Section: the seeded "G" (General) when present, else the first declared
    // section — never invent a section code the Rulebook doesn't have.
    const sectionKeys = Object.keys(rulebook.sections);
    const section = rulebook.sections.G ? "G" : (sectionKeys[0] ?? "G");
    // A Rulebook with no declared sections gets the seed section, same as
    // createDraftRulebook mints.
    const sections =
      sectionKeys.length > 0 ? undefined : { G: { label: "General" } };

    const existingIds = new Set(rulebook.rules.map((r) => r.id));
    const rule: RulebookRule = {
      id: nextRuleId(name, existingIds),
      name,
      section,
      statement,
      severity: "major",
      draft: true,
      // The verbatim span this draft came from. There is no server-side Oracle
      // distiller today (no mandate turns a chat turn into quote/statement/
      // rationale), so the honest minimum is the message itself, kept whole and
      // attributed — never a silently paraphrased "rule" nobody said.
      quote: statement,
      ...(question ? { rationale: `The question this answered: “${question}”` } : {}),
      source_ref: {
        approach: "oracle_tap",
        note: question
          ? "Saved from a conversation — a question a colleague asked"
          : "Saved from a conversation",
        ...(opts.conversationId
          ? { conversation_id: opts.conversationId }
          : {}),
        // Provenance is not optional: a draft in "Waiting on you" must be able
        // to point back at the exact message it came from.
        ...(opts.messageId ? { message_id: opts.messageId } : {}),
        ...(question ? { question } : {}),
      },
    };

    try {
      const saved = await saveRules({
        rulebookId: opts.rulebookId,
        expectedVersion: rulebook.version,
        rules: [...rulebook.rules, rule],
        ...(sections ? { sections } : {}),
      });
      return { rulebook: saved, rule };
    } catch (error) {
      // saveRules raises a readable conflict Error on a lost CAS; an append is
      // commutative, so re-read and try again. Anything else is real.
      lastError = error;
      const message = error instanceof Error ? error.message : "";
      if (!message.includes("changed while you were editing")) throw error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Could not save to the Rulebook — it kept changing. Try again.");
}
