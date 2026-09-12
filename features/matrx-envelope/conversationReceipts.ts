"use client";

/**
 * THE RECEIPTS A RELOAD CAN STILL SEE — read from the action ledger.
 *
 * WHY THIS EXISTS. A directive apply's receipt used to live only in a stream
 * event or a REST response, so refreshing the page erased any statement that one
 * project and four tasks had been written. Walk K-1 named the shape of it:
 * *"the chat keeps the request while the ledger keeps the result, joined by
 * nothing the UI reads."* This module is that join.
 *
 * Chair ruling, 2026-09-12: **receipts persist by reading the action ledger,
 * never by faking a message part.** `platform.matrx_action_ledger` already holds
 * one durable row per applied item, keyed by the conversation, with owner-read
 * RLS — so this is an ordinary client-direct Supabase read, the way every other
 * data read in this app works, and no new server hop.
 *
 * 🚨 THE SENTENCE IS THE SERVER'S, FROM THE ROW. `message` is written at apply
 * time by aidream's `receipt_words.py` (migration 0640). This module never
 * composes, counts or pluralizes anything: a row without words renders nothing,
 * because a pre-receipt apply genuinely has no sentence and inventing one would
 * be worse than silence.
 */

import { buildDirectiveSlug, type DirectiveClass } from "@ai-matrx/content-ir";

import { supabase } from "@/utils/supabase/client";

export interface ConversationDirectiveReceipt {
  /** The ledger key — stable, unique, and the React key. */
  ledgerKey: string;
  /** The directive SLUG, reconstructed from the row's own (kind, type). */
  directive: string;
  /** The server's sentence, verbatim. */
  message: string;
  createdAt: string;
}

/** The classes whose ledger `type` is `"<class>:<noun>"` (aidream naming.py). */
const COLON_CLASSES = new Set(["create", "update", "delete"]);

/**
 * `(kind, type)` → slug — the mirror of aidream's `slug_for_ledger_row`.
 * `kind` is the directive class on a post-merge row; `type` is the derived
 * legacy type (`create:task`, `plan_tree`). A pre-merge row's `kind` is an old
 * envelope kind and does not parse — those return null and are shown with their
 * sentence and no slug-derived chrome, never with a guessed identity.
 */
export function slugForLedgerRow(kind: string, type: string): string | null {
  try {
    if (COLON_CLASSES.has(kind)) {
      const prefix = `${kind}:`;
      if (!type.startsWith(prefix)) return null;
      return buildDirectiveSlug(kind as DirectiveClass, type.slice(prefix.length));
    }
    return buildDirectiveSlug(kind as DirectiveClass, type);
  } catch {
    return null;
  }
}

/**
 * Every applied directive in this conversation that has words, oldest first.
 *
 * RLS does the scoping (the ledger is owner-read), so this returns only the
 * signed-in user's own rows. A read failure THROWS with a sentence the caller
 * can show — it is never swallowed into an empty list, because "no receipts" and
 * "we could not look" must not render identically.
 */
export async function fetchConversationReceipts(
  conversationId: string,
): Promise<ConversationDirectiveReceipt[]> {
  const { data, error } = await supabase
    .schema("platform")
    .from("matrx_action_ledger")
    .select("key, kind, type, message, created_at")
    .eq("conversation_id", conversationId)
    .not("message", "is", null)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(
      `Could not load what this conversation's actions did (${error.message}).`,
    );
  }

  return (data ?? []).flatMap((row) => {
    const message = typeof row.message === "string" ? row.message.trim() : "";
    if (!message) return [];
    return [
      {
        ledgerKey: String(row.key),
        directive: slugForLedgerRow(String(row.kind), String(row.type)) ?? String(row.type),
        message,
        createdAt: String(row.created_at),
      },
    ];
  });
}
