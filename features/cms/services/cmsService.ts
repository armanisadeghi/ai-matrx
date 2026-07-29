'use client';

/**
 * CMS Service
 *
 * Client-side service that proxies all CMS operations through API routes.
 * Mirrors the HTMLPageService pattern.
 */

import type {
    ClientSite,
    ClientSiteSummary,
    ClientPage,
    ClientPageSummary,
    PromoteFromHtmlPageResult,
    CmsEntityType,
    ClientEntityVersion,
    ClientEntityVersionDetail,
    ClientComponent,
    ClientActivityLog,
    AgentWritePolicy,
    ContentException,
    ContentExceptionStatus,
    ClientAsset,
    AssetUsage,
    AssetPageUsage,
    AssetComponentUsage,
    SiteCollection,
    SiteCollectionSummary,
    SiteCollectionItem,
    CollectionFieldDef,
    CollectionValidationMode,
    CollectionStatus,
    CollectionItemFilter,
    CollectionExportRow,
    SiteCollectionSettings,
} from '../types';
import type { ItemValidationProblem } from '../collections/validateItem';

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
    /**
     * SUMMARY rows only — the route selects a subset of columns. Typing this
     * `ClientSite[]` hid that for months: `theme_config` / `navigation` /
     * `data_api_key` arrive `undefined` with no type error. Need a full row?
     * `getSite(id)`.
     */
    async listSites(): Promise<ClientSiteSummary[]> {
        const res = await callApi<{ sites: ClientSiteSummary[] }>('sites', 'list');
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
        /**
         * Initial settings. A caller whose site must be immediately authorable
         * through aidream's guarded seams (starter kit, plan↔CMS bridge) seeds
         * `{ agent_write_policy: "full" }` here — the same seed aidream's own
         * `site_service.create` applies — because an unset policy is `blocked`.
         */
        settings?: Record<string, unknown>;
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
        /** Parent page id — the trigger derives `route` as `parent.route + '/' + slug`. */
        parentId?: string;
        pageType?: string;
        metaTitle?: string;
        metaDescription?: string;
        isPublished?: boolean;
        showInNav?: boolean;
        sortOrder?: number;
        tags?: string[];
        excerpt?: string;
        author?: string;
        /** Caller provenance, stamped into the activity log (`changes.metadata`). */
        provenance?: Record<string, unknown>;
    }): Promise<ClientPage> {
        const res = await callApi<{ page: ClientPage }>('pages', 'create', params);
        return res.page;
    },

    /**
     * W2-A promote bridge: copy an `html_pages` quick page onto a site as a
     * NEW draft page (content in the `_draft` twins, never auto-published;
     * provenance recorded both directions). Re-promoting to the same site
     * returns the existing page (`reused: true`) unless `forceNew`.
     */
    async promoteFromHtmlPage(params: {
        htmlPageId: string;
        siteId: string;
        slug?: string;
        title?: string;
        category?: string;
        forceNew?: boolean;
    }): Promise<PromoteFromHtmlPageResult> {
        return callApi<PromoteFromHtmlPageResult>('pages', 'promote', params);
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
        /** Caller provenance, stamped into the activity log (`changes.metadata`). */
        provenance?: Record<string, unknown>;
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

// Six CMS entities are versioned (client_site / client_page / client_component /
// client_asset / html_page / site_collection). `entityType` defaults to `client_page`.
export const CmsVersionService = {
    /** Full change history for a row, newest first. Every change is an entry. */
    async listVersions(rowId: string, entityType: CmsEntityType = 'client_page'): Promise<ClientEntityVersion[]> {
        const res = await callApi<{ versions: ClientEntityVersion[] }>('versions', 'list', { rowId, entityType });
        return res.versions;
    },

    /** One history entry (by its `id`) with the raw row snapshot it captured. */
    async getVersion(versionId: string, entityType: CmsEntityType = 'client_page'): Promise<ClientEntityVersionDetail> {
        const res = await callApi<{ version: ClientEntityVersionDetail }>('versions', 'get', { versionId, entityType });
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

// ── Assets (W2-B asset library over client_assets) ───────────────────────────

/** Thrown by deleteAsset when content still references the asset (409 asset_in_use). */
export class AssetInUseError extends Error {
    usedInPages: AssetPageUsage[];
    usedInComponents: AssetComponentUsage[];
    constructor(message: string, usedInPages: AssetPageUsage[], usedInComponents: AssetComponentUsage[]) {
        super(message);
        this.name = 'AssetInUseError';
        this.usedInPages = usedInPages;
        this.usedInComponents = usedInComponents;
    }
}

export const CmsAssetService = {
    async listAssets(
        siteId: string,
        params: { folder?: string; fileType?: string; includeInactive?: boolean } = {},
    ): Promise<ClientAsset[]> {
        const res = await callApi<{ assets: ClientAsset[] }>('assets', 'list', { siteId, ...params });
        return res.assets;
    },

    /** Fleet-wide listing for the admin surface (super-admin gated server-side). */
    async adminListAssets(siteId?: string): Promise<ClientAsset[]> {
        const res = await callApi<{ assets: ClientAsset[] }>('assets', 'admin_list', siteId ? { siteId } : {});
        return res.assets;
    },

    async getAsset(assetId: string): Promise<ClientAsset> {
        const res = await callApi<{ asset: ClientAsset }>('assets', 'get', { assetId });
        return res.asset;
    },

    /**
     * Register an already-uploaded PUBLIC file as a site asset. Upload the
     * bytes FIRST through the canonical `fileHandler.upload(source, { preset,
     * visibility: "public" })` path and pass the durable `cdn_url` here —
     * never a signed URL (the route refuses them).
     */
    async createAsset(params: {
        siteId: string;
        fileId?: string | null;
        filePath: string;
        fileName: string;
        fileType: string;
        mimeType?: string | null;
        fileSize?: number | null;
        width?: number | null;
        height?: number | null;
        altText?: string | null;
        folder?: string;
        tags?: string[] | null;
    }): Promise<ClientAsset> {
        const res = await callApi<{ asset: ClientAsset }>('assets', 'create', params);
        return res.asset;
    },

    async updateAsset(
        assetId: string,
        updates: Partial<Pick<ClientAsset, 'file_name' | 'alt_text' | 'folder' | 'tags' | 'is_active'>>,
    ): Promise<ClientAsset> {
        const res = await callApi<{ asset: ClientAsset }>('assets', 'update', { assetId, updates });
        return res.asset;
    },

    /** Live usage scan — what breaks if this asset is deleted. */
    async assetUsage(assetId: string): Promise<AssetUsage> {
        const res = await callApi<{ usage: AssetUsage }>('assets', 'usage', { assetId });
        return res.usage;
    },

    /** Throws AssetInUseError (with the live usage detail) unless force. */
    async deleteAsset(assetId: string, force = false): Promise<void> {
        const response = await fetch('/api/cms/assets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete', assetId, force }),
        });
        const data = await response.json();
        if (!response.ok) {
            if (response.status === 409 && data.code === 'asset_in_use') {
                throw new AssetInUseError(data.error, data.used_in_pages ?? [], data.used_in_components ?? []);
            }
            throw new Error(data.error || `CMS API error: ${response.status}`);
        }
    },
};

// ── Collections (W2-C — site_collections + site_collection_items) ─────────────

export interface CollectionUpsertParams {
    slug?: string;
    name?: string;
    description?: string | null;
    fieldSchema?: CollectionFieldDef[];
    validationMode?: CollectionValidationMode;
    publicWrite?: boolean;
    publicRead?: boolean;
    publicReadFields?: string[];
    allowUpsert?: boolean;
    searchable?: boolean;
    settings?: SiteCollectionSettings;
    status?: CollectionStatus;
}

/**
 * A collection refused an item on its field rules. Carries the per-field
 * detail so the editor can mark the offending inputs instead of showing one
 * opaque banner. Same shape as the validator's own report entries.
 */
export class ItemValidationError extends Error {
    validationErrors: ItemValidationProblem[];
    validationWarnings: ItemValidationProblem[];
    constructor(
        message: string,
        validationErrors: ItemValidationProblem[],
        validationWarnings: ItemValidationProblem[],
    ) {
        super(message);
        this.name = 'ItemValidationError';
        this.validationErrors = validationErrors;
        this.validationWarnings = validationWarnings;
    }
}

/**
 * Item write with structured-error passthrough. `callApi` flattens every
 * failure to `new Error(data.error)`, which would throw the field-level detail
 * away — the whole point of a schema-driven editor.
 */
async function itemWriteCall<T>(
    action: 'items_create' | 'items_update',
    params: Record<string, unknown>,
): Promise<T> {
    const response = await fetch('/api/cms/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...params }),
    });
    const data = await response.json();
    if (!response.ok) {
        if (response.status === 422 && Array.isArray(data.validationErrors)) {
            throw new ItemValidationError(
                data.error || 'This item does not match the field rules',
                data.validationErrors,
                data.validationWarnings ?? [],
            );
        }
        throw new Error(data.error || `CMS API error: ${response.status}`);
    }
    return data as T;
}

export interface CollectionItemsPage {
    items: SiteCollectionItem[];
    total: number;
    page: number;
    perPage: number;
    /** True when the non-searchable ilike fallback hit its scan cap. */
    searchTruncated: boolean;
}

export const CmsCollectionService = {
    /** A site's collections with live item/unread counts. */
    async listCollections(siteId: string): Promise<SiteCollectionSummary[]> {
        const res = await callApi<{ collections: SiteCollectionSummary[] }>('collections', 'list', { siteId });
        return res.collections;
    },

    async getCollection(collectionId: string): Promise<SiteCollection> {
        const res = await callApi<{ collection: SiteCollection }>('collections', 'get', { collectionId });
        return res.collection;
    },

    /**
     * Creates the collection; the FIRST collection on a site also mints the
     * site data key (`mintedDataApiKey: true` — refresh the site afterwards).
     */
    async createCollection(
        params: { siteId: string; slug: string; name: string } & CollectionUpsertParams,
    ): Promise<{ collection: SiteCollection; mintedDataApiKey: boolean }> {
        const res = await callApi<{ collection: SiteCollection; mintedDataApiKey: boolean }>(
            'collections',
            'create',
            { ...params },
        );
        return res;
    },

    async updateCollection(collectionId: string, updates: CollectionUpsertParams): Promise<SiteCollection> {
        const res = await callApi<{ collection: SiteCollection }>('collections', 'update', {
            collectionId,
            ...updates,
        });
        return res.collection;
    },

    async archiveCollection(collectionId: string): Promise<SiteCollection> {
        const res = await callApi<{ collection: SiteCollection }>('collections', 'archive', { collectionId });
        return res.collection;
    },

    /** Soft delete (deleted_at) — items survive under the FK, hidden with it. */
    async deleteCollection(collectionId: string): Promise<void> {
        await callApi('collections', 'delete', { collectionId });
    },

    /** Rotates client_sites.data_api_key — old key stops working immediately. */
    async rotateDataKey(siteId: string): Promise<string> {
        const res = await callApi<{ dataApiKey: string }>('collections', 'rotate_key', { siteId });
        return res.dataApiKey;
    },

    // ── Items ────────────────────────────────────────────────────────────

    async listItems(
        collectionId: string,
        params: { filter?: CollectionItemFilter; q?: string; page?: number; perPage?: number } = {},
    ): Promise<CollectionItemsPage> {
        return callApi<CollectionItemsPage>('collections', 'items_list', { collectionId, ...params });
    },

    /**
     * Admin-authored item create. Deliberately NOT the visitor
     * `submit_collection_item` RPC — that path carries the rate windows and the
     * `visitor_write_at` stamp, so authoring 30 events through it would 429 the
     * site's public forms. Rows land with no visitor provenance and never spam.
     * Throws ItemValidationError (field-level) when the collection refuses it.
     */
    async createItem(
        collectionId: string,
        data: Record<string, unknown>,
    ): Promise<{
        item: SiteCollectionItem;
        quarantined: boolean;
        validationWarnings: ItemValidationProblem[];
    }> {
        return itemWriteCall('items_create', { collectionId, data });
    },

    /** Edit one item's `data` (fix a typo). Never rewrites flags or provenance. */
    async updateItem(
        itemId: string,
        data: Record<string, unknown>,
    ): Promise<{ item: SiteCollectionItem; validationWarnings: ItemValidationProblem[] }> {
        return itemWriteCall('items_update', { itemId, data });
    },

    async getItem(itemId: string): Promise<SiteCollectionItem> {
        const res = await callApi<{ item: SiteCollectionItem }>('collections', 'items_get', { itemId });
        return res.item;
    },

    /** Triage flags — row or bulk (seen / spam / archive). */
    async setItemFlags(
        itemIds: string[],
        flags: { seen?: boolean; isSpam?: boolean; status?: CollectionStatus },
    ): Promise<SiteCollectionItem[]> {
        const res = await callApi<{ items: SiteCollectionItem[] }>('collections', 'items_set_flags', {
            itemIds,
            ...flags,
        });
        return res.items;
    },

    /** Soft delete — row or bulk. */
    async deleteItems(itemIds: string[]): Promise<void> {
        await callApi('collections', 'items_delete', { itemIds });
    },

    /**
     * Rows for client-side CSV assembly. The server stops on EITHER cap — 10,000
     * rows or ~3.5 MB serialized (Vercel's response limit is 4.5 MB) — and says
     * which via `reason`, so the UI can tell the admin to narrow the filter.
     */
    async exportItems(
        collectionId: string,
        filter: CollectionItemFilter = 'all',
    ): Promise<{
        items: CollectionExportRow[];
        truncated: boolean;
        reason: 'rows' | 'size' | null;
        cap: number;
        byteBudget: number;
    }> {
        return callApi('collections', 'items_export', { collectionId, filter });
    },

    /** Admin (requireSuperAdmin): every collection across every site. */
    async adminListCollections(siteId?: string): Promise<SiteCollection[]> {
        const res = await callApi<{ collections: SiteCollection[] }>(
            'collections',
            'admin_list',
            siteId ? { siteId } : {},
        );
        return res.collections;
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
