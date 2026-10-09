import { createClient } from "@/utils/supabase/server";
import {
  readProviderConversationWith,
  type ProviderConversationRead,
} from "./providerConversationRead";

export * from "./providerConversationRead";

/**
 * Direct RLS read of a canonical conversation and its user-visible messages.
 * External coding sessions deliberately have no initial agent, so the normal
 * runnable chat page is not their transcript surface.
 */
export async function readProviderConversation(
  conversationId: string,
): Promise<ProviderConversationRead> {
  return readProviderConversationWith(await createClient(), conversationId);
}
