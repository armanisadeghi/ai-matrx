// features/spaces/embed/space-by-conversation.ts — the page a build conversation made: `content.space_by_conversation`.
// The Space Builder's `spaces` tool stamps the run's conversation on every page it creates
// (`content.document.last_conversation_id`); the database answers the build's ROOT page, and only when
// the signed-in person can open it. This is the fallback when the run's own result cannot be read again.

import { supabase } from "@/utils/supabase/client";

export interface BuiltRootPage {
  spaceId: string;
  title: string;
}

type ByConversationRpc = (
  fn: "space_by_conversation",
  args: { p_conversation_id: string },
) => PromiseLike<{ data: Array<{ space_id: string; title: string | null }> | null; error: { message: string } | null }>;

/** The build's root page, or null when the conversation made none (or the person cannot open it). */
export async function rootPageForConversation(conversationId: string): Promise<BuiltRootPage | null> {
  const content = supabase.schema("content") as unknown as { rpc: ByConversationRpc };
  const { data, error } = await content.rpc("space_by_conversation", { p_conversation_id: conversationId });
  if (error) throw new Error(error.message);
  const row = data?.[0];
  return row ? { spaceId: row.space_id, title: row.title ?? "" } : null;
}
