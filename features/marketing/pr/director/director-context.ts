/**
 * The PR Director's wiring, in one place: which job answers, which context rides every turn, and the edge
 * that keeps a conversation on its brand.
 *
 * THE MANDATE, NEVER AN AGENT ID. `seo.press_strategist` is resolved on the server (system default → org
 * binding → user binding), so rebinding the Director changes who answers with no client deploy. The key is
 * declared in aidream (`aidream/services/news/pr_mandates.py`) but the installed `@ai-matrx/agents` predates
 * it, so it reaches the typed carrier through `dbAuthoredMandateKey` and is listed, with that reason, in
 * `scripts/mandate-keys-allowlist.json`. When the package publishes it, swap to `MANDATE_KEYS`.
 *
 * THE CONTEXT. Every turn carries `pr_brand_context` as a LAZY SOURCE POINTER — `{source:{kind, id}}`, no
 * body. aidream's `news/pr_brand_context.py` resolver builds the body on the server, behind the brand's own
 * access check, fresh each turn.
 */

import { dbAuthoredMandateKey } from "@/features/mandates/mandate-key";
import { createClient } from "@/utils/supabase/client";

export const PR_DIRECTOR_MANDATE_KEY = dbAuthoredMandateKey("seo.press_strategist");

export const PR_BRAND_CONTEXT_KEY = "pr_brand_context";
export const PR_BRAND_CONTEXT_LABEL = "This brand's PR context";

export interface PrBrandContextValue {
  source: { kind: "pr_brand_context"; id: string };
  type: "json";
  label: string;
}

/** The per-turn context entry value: a pointer the server resolves, never a body the browser built. */
export function prBrandContextValue(brandId: string): PrBrandContextValue {
  return {
    source: { kind: "pr_brand_context", id: brandId },
    type: "json",
    label: PR_BRAND_CONTEXT_LABEL,
  };
}

/**
 * Write the `conversation → web_brand` edge ("this conversation is about this brand") through the canonical
 * association door. Non-conveying (registered by `migrations/pr_director_conversation_web_brand_pair.sql`):
 * it grants nothing; it lets a continuation turn from any surface keep its brand. Returns null on success or
 * the sentence to show.
 */
export async function bindConversationToBrand(args: {
  conversationId: string;
  brandId: string;
  organizationId: string;
}): Promise<string | null> {
  const supabase = createClient();
  const { error } = await supabase.rpc("assoc_add", {
    p_source_type: "conversation",
    p_source_id: args.conversationId,
    p_target_type: "web_brand",
    p_target_id: args.brandId,
    p_org_id: args.organizationId,
  } as never);
  return error ? error.message : null;
}
