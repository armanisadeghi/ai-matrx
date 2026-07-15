"use client";

/**
 * shareMessageAsWebpage — one-click "publish this response as a public
 * webpage and hand back the permanent URL".
 *
 * Uses the platform HTML-pages system (`HTMLPageService.createPage` → the
 * /api/html-pages route → the HTML Supabase project → public `/p/{id}`
 * page). Publishing is IDEMPOTENT per message: `sourceMessageId` is the
 * server's page-per-source key, so re-sharing the same message updates the
 * existing page in place and returns the SAME public URL — no orphan pages.
 *
 * The returned URL is a durable public page URL (never a signed/expiring
 * URL), safe to persist and share anywhere.
 *
 * Kept lazy-loadable: the markdown→HTML converter and the service are
 * imported on call, not at module load.
 */

export interface ShareMessageAsWebpageArgs {
  /** Answer-only markdown of the message/turn. */
  content: string;
  /** Page title — pass the conversation-derived title when available. */
  title: string;
  messageId: string | null;
  conversationId: string | null;
}

export async function shareMessageAsWebpage({
  content,
  title,
  messageId,
  conversationId,
}: ShareMessageAsWebpageArgs): Promise<{ url: string }> {
  const [{ convertMarkdownToHtml }, { HTMLPageService }] = await Promise.all([
    import("@/features/html-pages/utils/html-preview-utils"),
    import("@/features/html-pages/services/htmlPageService"),
  ]);

  const bodyHtml = convertMarkdownToHtml(content);
  if (!bodyHtml.trim()) {
    throw new Error("Nothing to publish — the message is empty.");
  }

  const result = await HTMLPageService.createPage(
    bodyHtml,
    title,
    "Shared from an AI Matrx conversation",
    undefined, // userId — the API route resolves the caller's session itself
    {},
    {
      sourceMessageId: messageId ?? undefined,
      sourceConversationId: conversationId ?? undefined,
    },
  );

  const url = typeof result?.url === "string" ? result.url : null;
  if (!url) {
    throw new Error("Publish succeeded but returned no page URL.");
  }
  return { url };
}
