'use client';

/**
 * CMS Service
 *
 * Client-side service that proxies all CMS operations through API routes.
 * Mirrors the HTMLPageService pattern.
 */

import type {
    ClientSite,
    ClientPage,
    ClientPageSummary,
    ClientPageVersion,
    ClientComponent,
    ClientActivityLog,
    AgentWritePolicy,
    ContentException,
    ContentExceptionStatus,
} from '../types';

export class SiteNotEmptyError extends Error {
    pageCount: number;
    constructor(message: string, pageCount: number) {
        super(message);
        this.name = 'SiteNotEmptyError';
        this.pageCount = pageCount;
    }
}

async function callApi<T = unknown>(endpoint: string, action: string, params: Record<string, unknown> = {}): Promise<T> {
    const response = await fetch(`/api/cms/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...params }),
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || `CMS API error: ${response.status}`);
    }

    return data as T;
}

// ── Sites ────────────────────────────────────────────────────────────────────

export const CmsSiteService = {
    async listSites(): Promise<ClientSite[]> {
        const res = await callApi<{ sites: ClientSite[] }>('sites', 'list');
        return res.sites;
    },

    async getSite(siteId: string): Promise<ClientSite> {
        const res = await callApi<{ site: ClientSite }>('sites', 'get', { siteId });
        return res.site;
    },

    async createSite(params: {
        name: string;
        slug: string;
        domain?: string;
        themeConfig?: Record<string, unknown>;
        globalCss?: string;
    }): Promise<ClientSite> {
        const res = await callApi<{ site: ClientSite }>('sites', 'create', params);
        return res.site;
    },

    async updateSite(siteId: string, updates: Partial<{
        name: string;
        slug: string;
        domain: string;
        themeConfig: Record<string, unknown>;
        navigation: unknown[];
        footerConfig: Record<string, unknown>;
        metaDefaults: Record<string, unknown>;
        contactInfo: Record<string, unknown>;
        socialLinks: Record<string, unknown>;
        settings: Record<string, unknown>;
        isActive: boolean;
        globalCss: string;
        favicon: string;
    }>): Promise<ClientSite> {
        const res = await callApi<{ site: ClientSite }>('sites', 'update', { siteId, ...updates });
        return res.site;
    },

    /**
     * Refuses (HTTP 409) if the site has pages unless `force` is set. On refusal
     * throws `SiteNotEmptyError` carrying `pageCount` so the caller can re-prompt.
     */
    async deleteSite(siteId: string, force = false): Promise<void> {
        const response = await fetch('/api/cms/sites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete', siteId, force }),
        });
        const data = await response.json();
        if (!response.ok) {
            if (response.status === 409 && typeof data.pageCount === 'number') {
                throw new SiteNotEmptyError(data.error, data.pageCount);
            }
            throw new Error(data.error || `CMS API error: ${response.status}`);
        }
    },

    // ── Admin (requireSuperAdmin, fleet-wide, bypasses ownership) ─────────

    async adminListSites(): Promise<ClientSite[]> {
        const res = await callApi<{ sites: ClientSite[] }>('sites', 'admin_list_sites');
        return res.sites;
    },

    async adminUpdatePolicy(
        siteId: string,
        params: { agentWritePolicy?: AgentWritePolicy; policyOverrides?: Record<string, unknown> },
    ): Promise<ClientSite> {
        const res = await callApi<{ site: ClientSite }>('sites', 'admin_update_policy', { siteId, ...params });
        return res.site;
    },

    async adminListActivity(params: {
        siteId?: string;
        entityType?: string;
        actor?: 'agent' | 'human' | 'system';
        limit?: number;
    } = {}): Promise<ClientActivityLog[]> {
        const res = await callApi<{ activity: ClientActivityLog[] }>('sites', 'admin_list_activity', params);
        return res.activity;
    },
};

// ── Pages ────────────────────────────────────────────────────────────────────

export const CmsPageService = {
    async listPages(siteId?: string, category?: string): Promise<ClientPageSummary[]> {
        const res = await callApi<{ pages: ClientPageSummary[] }>('pages', 'list', {
            siteId,
            category,
        });
        return res.pages;
    },

    async getPage(pageId: string): Promise<ClientPage> {
        const res = await callApi<{ page: ClientPage }>('pages', 'get', { pageId });
        return res.page;
    },

    async createPage(params: {
        siteId: string;
        slug: string;
        title: string;
        htmlContent?: string;
        cssContent?: string;
        jsContent?: string;
        category?: string;
        pageType?: string;
        metaTitle?: string;
        metaDescription?: string;
        isPublished?: boolean;
        showInNav?: boolean;
        sortOrder?: number;
        tags?: string[];
        excerpt?: string;
        author?: string;
    }): Promise<ClientPage> {
        const res = await callApi<{ page: ClientPage }>('pages', 'create', params);
        return res.page;
    },

    async updatePage(pageId: string, updates: Record<string, unknown>): Promise<ClientPage> {
        const res = await callApi<{ page: ClientPage }>('pages', 'update', { pageId, ...updates });
        return res.page;
    },

    async deletePage(pageId: string): Promise<void> {
        await callApi('pages', 'delete', { pageId });
    },

    // ── Draft workflow ───────────────────────────────────────────────────

    async saveDraft(pageId: string, draft: {
        htmlContent?: string;
        cssContent?: string;
        jsContent?: string;
        metaTitle?: string;
        metaDescription?: string;
        metaKeywords?: string;
        ogImage?: string;
        canonicalUrl?: string;
    }): Promise<ClientPage> {
        const res = await callApi<{ page: ClientPage }>('pages', 'save-draft', { pageId, ...draft });
        return res.page;
    },

    async publishDraft(pageId: string): Promise<ClientPage> {
        const res = await callApi<{ page: ClientPage }>('pages', 'publish', { pageId });
        return res.page;
    },

    async discardDraft(pageId: string): Promise<void> {
        await callApi('pages', 'discard-draft', { pageId });
    },

    async rollbackToVersion(pageId: string, versionNumber: number): Promise<ClientPage> {
        const res = await callApi<{ page: ClientPage }>('pages', 'rollback', { pageId, versionNumber });
        return res.page;
    },

    /** Admin (requireSuperAdmin): every page across every site, or scoped to one site. */
    async adminListPages(siteId?: string): Promise<(ClientPageSummary & { client_id: string })[]> {
        const res = await callApi<{ pages: (ClientPageSummary & { client_id: string })[] }>(
            'pages',
            'admin_list',
            { siteId },
        );
        return res.pages;
    },
};

// ── Versions ─────────────────────────────────────────────────────────────────

export const CmsVersionService = {
    async listVersions(pageId: string): Promise<ClientPageVersion[]> {
        const res = await callApi<{ versions: ClientPageVersion[] }>('versions', 'list', { pageId });
        return res.versions;
    },

    async getVersion(versionId: string): Promise<ClientPageVersion> {
        const res = await callApi<{ version: ClientPageVersion }>('versions', 'get', { versionId });
        return res.version;
    },
};

// ── Components ───────────────────────────────────────────────────────────────

export const CmsComponentService = {
    async listComponents(siteId?: string): Promise<ClientComponent[]> {
        const res = await callApi<{ components: ClientComponent[] }>('components', 'list', { siteId });
        return res.components;
    },

    async getComponent(componentId: string): Promise<ClientComponent> {
        const res = await callApi<{ component: ClientComponent }>('components', 'get', { componentId });
        return res.component;
    },

    async createComponent(params: {
        siteId: string;
        componentType: string;
        name: string;
        htmlContent: string;
        cssContent?: string;
    }): Promise<ClientComponent> {
        const res = await callApi<{ component: ClientComponent }>('components', 'create', params);
        return res.component;
    },

    async updateComponent(componentId: string, updates: Record<string, unknown>): Promise<ClientComponent> {
        const res = await callApi<{ component: ClientComponent }>('components', 'update', { componentId, ...updates });
        return res.component;
    },

    async deleteComponent(componentId: string): Promise<void> {
        await callApi('components', 'delete', { componentId });
    },
};

// ── Validation approvals (F3, admin — degrades gracefully pre-P1) ─────────────

export const CmsApprovalsService = {
    async list(params: { status?: ContentExceptionStatus; siteId?: string } = {}): Promise<{
        violations: ContentException[];
        available: boolean;
        message?: string;
    }> {
        return callApi('approvals', 'list', params);
    },

    async approve(exceptionId: string, note?: string): Promise<ContentException> {
        const res = await callApi<{ exception: ContentException }>('approvals', 'approve', { exceptionId, note });
        return res.exception;
    },

    async reject(exceptionId: string, note?: string): Promise<ContentException> {
        const res = await callApi<{ exception: ContentException }>('approvals', 'reject', { exceptionId, note });
        return res.exception;
    },
};
