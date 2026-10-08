'use client';

import { durableRecordId } from '@ai-matrx/kit/ids';
import { callApi } from '@/lib/api/call-api';
import { getStore } from '@/lib/redux/store-singleton';

/**
 * HTMLPageService — a person's quick-publish pages.
 *
 * The html_pages database is a separate project with no client access, so the
 * Python server is the door: `GET|POST /cms/html-pages`,
 * `GET|PATCH|DELETE /cms/html-pages/{page_id}` (owner-scoped as the caller;
 * delete archives). No Next.js route sits in between. A chat page VERSION is
 * never written here — `publishHtmlCanvasVersion` (canvasVersionPage.ts) is its
 * one writer.
 */
export class HTMLPageService {
    static async #call(request) {
        const store = getStore();
        if (!store) throw new Error('Pages need the app to be loaded.');
        const result = await store.dispatch(callApi(request));
        if (result.error) throw new Error(result.error.message || 'The page request failed.');
        return result.data;
    }

    static #metaFields(metaFields = {}) {
        const out = {};
        if (metaFields.metaKeywords !== undefined) out.meta_keywords = metaFields.metaKeywords || null;
        if (metaFields.ogImage !== undefined) out.og_image = metaFields.ogImage || null;
        if (metaFields.canonicalUrl !== undefined) out.canonical_url = metaFields.canonicalUrl || null;
        if (metaFields.isIndexable !== undefined) out.is_indexable = Boolean(metaFields.isIndexable);
        return out;
    }

    /** The answer callers read after a create/update (pageId + url + the saved meta). */
    static #saved(page) {
        return {
            success: true,
            pageId: page.id,
            url: page.url,
            metaTitle: page.meta_title,
            metaDescription: page.meta_description,
            isIndexable: page.is_indexable,
            createdAt: page.created_at,
            updatedAt: page.updated_at,
        };
    }

    /**
     * Create a new HTML page.
     *
     * `sourceMessageId` / `sourceConversationId` are provenance only.
     * Always inserts. A chat page version publishes through the server
     * (canvasVersionPage.publishHtmlCanvasVersion), never here. `sourceConversationId` and
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
        const page = await HTMLPageService.#call({
            path: '/cms/html-pages',
            method: 'POST',
            body: {
                html_content: htmlContent,
                meta_title: metaTitle,
                meta_description: metaDescription ?? '',
                ...HTMLPageService.#metaFields(metaFields),
                // `source_message_id` is a uuid: a client-temp answer has no row.
                ...(durableRecordId(sourceMessageId) ? { source_message_id: sourceMessageId } : {}),
                ...(sourceConversationId ? { source_conv_id: sourceConversationId } : {}),
                ...(contextMetadata ? { context_metadata: contextMetadata } : {}),
            },
        });
        return HTMLPageService.#saved(page);
    }

    /**
     * Get user's HTML pages (summary rows — no html_content blob).
     */
    static async getUserPages(userId) {
        return HTMLPageService.#call({ path: '/cms/html-pages', method: 'GET' });
    }

    /**
     * Update an existing HTML page.
     *
     * Partial updates are supported: omit `htmlContent` for metadata-only
     * saves. Pass `undefined` for any field you do not want to change.
     */
    static async updatePage(pageId, htmlContent, metaTitle, metaDescription, userId, metaFields = {}) {
        const body = HTMLPageService.#metaFields(metaFields);
        if (htmlContent !== undefined) body.html_content = htmlContent;
        if (metaTitle !== undefined) body.meta_title = metaTitle;
        if (metaDescription !== undefined) body.meta_description = metaDescription;
        const page = await HTMLPageService.#call({
            path: '/cms/html-pages/{page_id}',
            method: 'PATCH',
            pathParams: { page_id: pageId },
            body,
        });
        return HTMLPageService.#saved(page);
    }

    /**
     * Delete a HTML page
     */
    static async deletePage(pageId, userId) {
        await HTMLPageService.#call({
            path: '/cms/html-pages/{page_id}',
            method: 'DELETE',
            pathParams: { page_id: pageId },
        });
        return true;
    }

    /**
     * Get a single HTML page (for viewing / editing)
     */
    static async getPage(pageId) {
        return HTMLPageService.#call({
            path: '/cms/html-pages/{page_id}',
            method: 'GET',
            pathParams: { page_id: pageId },
        });
    }
}
