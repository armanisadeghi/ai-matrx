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
  const [title, setTitle] = useState<string | null>(() =>
    conversationId ? (titleCache.get(conversationId) ?? null) : null,
  );

  useEffect(() => {
    if (!conversationId) {
      setTitle(null);
      return;
    }
    let cancelled = false;
    void resolveConversationTitle(conversationId).then((resolved) => {
      if (!cancelled) setTitle(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  return title;
}
