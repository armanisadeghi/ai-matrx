"use client";

/**
 * THE PROPOSALS A RELOAD CAN STILL APPROVE (DD-144).
 *
 * WHY THIS EXISTS. A proposed directive (the `ask` apply policy) reached this
 * client exactly once, as a `directive_apply.proposed` stream event, and lived
 * only in `proposedDirectivesSlice`. Refresh the page and the card was gone: the
 * action the agent proposed could no longer be approved at all, and nothing on
 * screen said so (V-24, live 2026-09-12).
 *
 * Nothing was lost. The two-key shell the agent emitted IS the assistant
 * message's stored text — `chat.message.content` is a jsonb array of parts, and
 * the shell sits in a `text` part, sometimes alone and sometimes followed by
 * prose. This module reads it back the way the ledger read reads receipts: an
 * ordinary client-direct Supabase read under RLS, no new server hop for the data.
 *
 * 🚨 BUT THE ANSWER TO "IS IT STILL APPROVABLE?" IS THE SERVER'S, ALWAYS. The
 * apply key is `content_key(conversation, ledger_type, item.model_dump())` —
 * aidream's `keys.py` declares it FROZEN, and it hashes the VALIDATED item model,
 * which this client does not have and must never reimplement. So the shells go
 * back to `POST /directives/apply_state` and the server answers per item
 * `not_applied` / `in_flight` / `applied`. A client that guessed here would put
 * an Approve button beside that proposal's own receipt — the exact lie the
 * receipt ledger exists to prevent.
 *
 * The words are the server's too: the rebuilt card's sentence is
 * `receipt_words.proposed_sentence`, the same author and the same line the live
 * event carried, so a card before a reload and after one cannot read differently.
 */

import { tryDecodeDirective } from "@ai-matrx/content-ir";

import { fetchDirectiveApplyState } from "@/features/directive-catalog/service";
import type { ProposedDirective } from "@/features/matrx-envelope/state/proposedDirectivesSlice";
import { supabase } from "@/utils/supabase/client";

/** A two-key shell found in a stored message, ready to go back to the server. */
type StoredShell = Record<string, unknown>;

/**
 * Every two-key directive shell stored in one conversation's ASSISTANT messages,
 * oldest first.
 *
 * Assistant only, deliberately: a shell in a USER message is text the person
 * typed or pasted, and in-content directives are the `MatrxEnvelopeBlock` /
 * confirm-dialog path, not an agent proposal. Reading them here would offer an
 * Approve card for something no agent ever proposed.
 *
 * A read failure THROWS with a sentence the caller can show — "no proposals" and
 * "we could not look" must not render identically.
 */
export async function fetchStoredDirectiveShells(
  conversationId: string,
): Promise<StoredShell[]> {
  const { data, error } = await supabase
    .schema("chat")
    .from("message")
    .select("id, content, created_at")
    .eq("conversation_id", conversationId)
    .eq("role", "assistant")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(
      `Could not read this conversation's messages to find pending actions (${error.message}).`,
    );
  }

  const shells: StoredShell[] = [];
  for (const row of data ?? []) {
    for (const text of textPartsOf(row.content)) {
      shells.push(...extractShells(text));
    }
  }
  return shells;
}

/** The `text` bodies of a stored message's parts. Anything else is ignored. */
function textPartsOf(content: unknown): string[] {
  if (!Array.isArray(content)) return [];
  const out: string[] = [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const p = part as Record<string, unknown>;
    // A `thinking` part is the model's reasoning, never a directive it emitted.
    if (p.type !== undefined && p.type !== "text") continue;
    if (typeof p.text === "string" && p.text) out.push(p.text);
  }
  return out;
}

/**
 * The directive shells inside one text body.
 *
 * TWO ARRIVALS, both real and both seen in the live table: a ```matrx fence, and
 * a BARE JSON object the structured-output extractor read (message
 * `aea95446-…` stores `{"__kind":"directive_v1_action_create_project_with_tasks",
 * "items":[…]}` followed by two paragraphs of prose). The gate is the ONE decoder
 * (`tryDecodeDirective`), so a JSON object that is not a directive is skipped
 * rather than shipped to the server as a question — anything it does not
 * recognise is simply not a proposal, the same fail-safe contract the rest of
 * this feature holds to.
 */
export function extractShells(text: string): StoredShell[] {
  const out: StoredShell[] = [];
  for (const raw of candidateJsonRegions(text)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
    if (!tryDecodeDirective(parsed)) continue;
    out.push(parsed as StoredShell);
  }
  return out;
}

/** Fresh global regex each call — a shared one carries `lastIndex` state. */
const matrxFenceRe = (): RegExp => /```(?:matrx|json)?[ \t]*\r?\n([\s\S]*?)\r?\n```/g;

/**
 * JSON object regions worth parsing: every fenced block, plus every balanced
 * `{ … }` run that begins with a `__kind` key. Scanning for the key rather than
 * for every brace keeps this from parsing a message's worth of incidental JSON.
 */
function candidateJsonRegions(text: string): string[] {
  const regions: string[] = [];
  if (!text) return regions;

  for (const match of text.matchAll(matrxFenceRe())) {
    if (match[1]) regions.push(match[1].trim());
  }

  const KEY = '"__kind"';
  let from = 0;
  for (;;) {
    const at = text.indexOf(KEY, from);
    if (at === -1) break;
    const open = text.lastIndexOf("{", at);
    from = at + KEY.length;
    if (open === -1) continue;
    const end = balancedEnd(text, open);
    if (end > open) regions.push(text.slice(open, end + 1));
  }
  return regions;
}

/** Index of the `}` closing the `{` at `open`, or -1. String-aware. */
function balancedEnd(text: string, open: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * The proposals this conversation still has open, rebuilt for the card.
 *
 * Returns ONLY the approvable ones. An `applied` shell is already on screen as
 * the ledger's receipt (`fetchConversationReceipts`), and an `in_flight` one is
 * somebody else's request finishing right now — neither is a question to put to
 * the user, and offering one would be the Approve-beside-its-own-receipt defect.
 *
 * A shell the server could not read is NOT silently dropped: it comes back with
 * `unreadable` and is surfaced to the caller, because a proposal that vanishes
 * from a reloaded conversation is the whole defect.
 */
export interface RehydratedProposals {
  proposals: ProposedDirective[];
  /** One sentence per shell the server refused to read, for the reader. */
  unreadable: string[];
}

export async function fetchConversationProposals(
  baseUrl: string | undefined,
  conversationId: string,
): Promise<RehydratedProposals> {
  const shells = await fetchStoredDirectiveShells(conversationId);
  if (shells.length === 0) return { proposals: [], unreadable: [] };

  const state = await fetchDirectiveApplyState(baseUrl, {
    shells,
    conversation_id: conversationId,
  });

  const proposals: ProposedDirective[] = [];
  const unreadable: string[] = [];
  for (const [index, shell] of state.shells.entries()) {
    if (shell.unreadable) {
      unreadable.push(shell.unreadable);
      continue;
    }
    if (!shell.approvable) continue;
    proposals.push({
      proposalId: shell.proposal_id,
      conversationId,
      directive: shell.directive,
      directiveClass: shell.directive_class,
      noun: shell.noun,
      summary: null,
      // THE SERVER'S SENTENCE, verbatim — `receipt_words.proposed_sentence`, the
      // same line the live `directive_apply.proposed` event carried.
      message: shell.message,
      itemCount: shell.item_count,
      // The shell goes back to `/directives/confirm` VERBATIM, exactly as the
      // live card would have sent it.
      shell: shells[index],
    });
  }
  return { proposals, unreadable };
}
