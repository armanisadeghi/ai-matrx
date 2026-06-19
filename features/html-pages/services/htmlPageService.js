'use client';

/**
 * HTMLPageService
 *
 * Routes all write/read operations through the Next.js API route at /api/html-pages,
 * which uses the HTML Supabase service role key to bypass RLS and verifies the
 * caller's main-app session server-side.
 *
 * This avoids the cross-project auth problem that arises when writing directly to a
 * separate Supabase project from the browser with an unauthenticated client.
 */
export class HTMLPageService {
    static async #call(action, params = {}) {
        const response = await fetch('/api/html-pages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, ...params }),
        });

        const text = await response.text();

        let data;
        try {
            data = JSON.parse(text);
        } catch {
            // The server returned a non-JSON body (e.g. a Next.js HTML error page,
            // a Vercel 413 payload-too-large, or a plain-text crash message).
            // Surface the raw response so the error is diagnosable.
            const preview = text.slice(0, 300).replace(/\s+/g, ' ').trim();
            throw new Error(
                `API returned non-JSON response (HTTP ${response.status}): ${preview}`
            );
        }

        if (!response.ok) {
            throw new Error(data.error || `API error: ${response.status}`);
        }

        return data;
    }

    /**
     * Create a new HTML page.
     *
     * Pass `sourceTracking.sourceMessageId` to make publishing idempotent: the
     * API updates the existing page for that message in place instead of
     * inserting a duplicate (used by the inline auto-preview so re-renders /
     * reloads never accumulate orphan pages). `sourceConversationId` and
     * `contextMetadata` are stored alongside for provenance.
     */
    static async createPage(
        htmlContent,
        metaTitle,
        metaDescription = '',
        userId,
        metaFields = {},
        sourceTracking = {},
    ) {
        const { sourceMessageId, sourceConversationId, contextMetadata } = sourceTracking;
        return HTMLPageService.#call('create', {
            htmlContent,
            metaTitle,
            metaDescription,
            metaFields,
            ...(sourceMessageId ? { sourceMessageId } : {}),
            ...(sourceConversationId ? { sourceConversationId } : {}),
            ...(contextMetadata ? { contextMetadata } : {}),
        });
    }

    /**
     * Get user's HTML pages
     */
    static async getUserPages(userId) {
        const data = await HTMLPageService.#call('list');
        return data.pages;
    }

    /**
     * Update an existing HTML page
     */
    static async updatePage(pageId, htmlContent, metaTitle, metaDescription = '', userId, metaFields = {}) {
        return HTMLPageService.#call('update', {
            pageId,
            htmlContent,
            metaTitle,
            metaDescription,
            metaFields,
        });
    }

    /**
     * Delete a HTML page
     */
    static async deletePage(pageId, userId) {
        await HTMLPageService.#call('delete', { pageId });
        return true;
    }

    /**
     * Get a single HTML page (for viewing)
     */
    static async getPage(pageId) {
        return HTMLPageService.#call('get', { pageId });
    }
}
