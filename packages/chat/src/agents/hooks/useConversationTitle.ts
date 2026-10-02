"use client";

/**
 * useConversationTitle — resolve a conversation's title client-side, cached.
 *
 * One module-scoped cache + in-flight dedup (the repo's file-fetch pattern):
 * many cards on one transcript may name the same conversation, and each
 * render must not become its own Supabase round-trip. RLS scopes the read,
 * so a conversation the user can't see resolves to null (callers fall back
 * to a neutral label — never render the raw UUID).
 */

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase/client";

const titleCache = new Map<string, string | null>();
const inFlight = new Map<string, Promise<string | null>>();

async function fetchTitle(conversationId: string): Promise<string | null> {
  const { data } = await supabase
    .schema("chat")
    .from("conversation")
    .select("title")
    .is("deleted_at", null)
    .eq("id", conversationId)
    .maybeSingle();
  return (data?.title as string | null) ?? null;
}

export function resolveConversationTitle(
  conversationId: string,
): Promise<string | null> {
  if (titleCache.has(conversationId)) {
    return Promise.resolve(titleCache.get(conversationId) ?? null);
  }
  const pending = inFlight.get(conversationId);
  if (pending) return pending;
  const promise = fetchTitle(conversationId)
    .then((title) => {
      titleCache.set(conversationId, title);
      return title;
    })
    .finally(() => {
      inFlight.delete(conversationId);
    });
  inFlight.set(conversationId, promise);
  return promise;
}

/**
 * Returns the conversation's title, or null while loading / when the row has
 * no title or isn't visible to this user. Pass null to skip the fetch.
 */
export function useConversationTitle(
  conversationId: string | null | undefined,
): string | null {
  // State carries the id it belongs to, so switching conversations shows the
  // new one's title (or nothing) IMMEDIATELY — resetting it from an effect
  // would render one frame of the previous conversation's title.
  const [resolved, setResolved] = useState<{
    id: string | null;
    title: string | null;
  }>({ id: null, title: null });

  const currentId = conversationId ?? null;

  useEffect(() => {
    if (!currentId) return;
    let cancelled = false;
    void resolveConversationTitle(currentId).then((title) => {
      if (!cancelled) setResolved({ id: currentId, title });
    });
    return () => {
      cancelled = true;
    };
  }, [currentId]);

  if (!currentId) return null;
  if (resolved.id === currentId) return resolved.title;
  // Not fetched yet this mount — the module cache may already have it.
  return titleCache.get(currentId) ?? null;
}
