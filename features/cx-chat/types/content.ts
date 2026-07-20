// features/public-chat/types/content.ts
// Content item types for the Agent API

/**
 * BACKEND SUPPORTED TYPES (from types/agent-api.ts):
 * - input_text: { type, text }
 * - input_image: { type, url }
 * - input_audio: { type, url }
 * - input_file: { type, url }
 * 
 * All file/media types use a consistent 'url' field for the resource location.
 * Backend accepts [key: string]: unknown, so additional fields won't break.
 */

/**
 * Base content item - all content items have a type
 */
interface BaseContentItem {
    type: string;
}

/**
 * Text input content
 * Backend field: text
 */
export interface TextContentItem extends BaseContentItem {
    type: 'input_text';
    text: string;
}

/**
 * Image input content
 * Backend field: url
 */
export interface ImageContentItem extends BaseContentItem {
    type: 'input_image';
    url: string;
}

/**
 * Audio input content
 * Backend field: url
 */
export interface AudioContentItem extends BaseContentItem {
    type: 'input_audio';
    url: string;
}

/**
 * Generic file input (server will determine type)
 * Backend field: url
 */
export interface FileContentItem extends BaseContentItem {
    type: 'input_file';
    url: string;
}

// Video and Document types are handled as input_file by the backend
// Keeping type aliases for semantic clarity in the codebase
export type VideoContentItem = FileContentItem;
export type DocumentContentItem = FileContentItem;

/**
 * YouTube video content
 * Note: Backend may not support this - sending as-is for future support
 */
export interface YouTubeContentItem extends BaseContentItem {
    type: 'youtube_video';
    url: string;
}

/**
 * Webpage content (scraped text)
 * Note: Backend may not support this - sending as-is for future support
 */
export interface WebpageContentItem extends BaseContentItem {
    type: 'input_webpage';
    url: string;
}

/**
 * Note content (from Matrx notes)
 * Note: Backend may not support this - sending as-is for future support
 */
export interface NoteContentItem extends BaseContentItem {
    type: 'input_note';
    note_id: string;
    title: string;
    content: string;
}

/**
 * Task content (from Matrx tasks)
 * Note: Backend may not support this - sending as-is for future support
 */
export interface TaskContentItem extends BaseContentItem {
    type: 'input_task';
    task_id: string;
    title: string;
    description?: string;
    status?: string;
}

/**
 * Table content (from Matrx tables)
 * Note: Backend may not support this - sending as-is for future support
 */
export interface TableContentItem extends BaseContentItem {
    type: 'input_table';
    table_id: string;
    table_name: string;
    data?: string; // JSON or formatted text
}

/**
 * Union type for all content items
 */
export type ContentItem =
    | TextContentItem
    | ImageContentItem
    | AudioContentItem
    | VideoContentItem
    | DocumentContentItem
    | YouTubeContentItem
    | FileContentItem
    | WebpageContentItem
    | NoteContentItem
    | TaskContentItem
    | TableContentItem;

/**
 * Resource types that can be attached to messages.
 * Aligned with features/prompts/types/resources.ts for full cross-route parity.
 *
 * - 'file'       — Uploaded canonical file
 * - 'image_link' — Direct image URL (alias for image_url, kept for backward compat)
 * - 'image_url'  — Direct image URL (canonical name, matches prompts system)
 * - 'file_link'  — Direct file URL (alias for file_url, kept for backward compat)
 * - 'file_url'   — Direct file URL (canonical name, matches prompts system)
 * - 'audio'      — Audio file
 * - 'youtube'    — YouTube video
 * - 'webpage'    — Scraped webpage content
 * - 'note'       — Matrx note (requires auth)
 * - 'task'       — Matrx task (requires auth)
 * - 'project'    — Matrx project (requires auth)
 * - 'table'      — Matrx table / data reference (requires auth)
 * - 'storage'    — File from Matrx storage browser (requires auth)
 */
export type PublicResourceType =
    | 'file'
    | 'image_link'
    | 'image_url'
    | 'file_link'
    | 'file_url'
    | 'audio'
    | 'youtube'
    | 'webpage'
    | 'note'
    | 'task'
    | 'project'
    | 'table'
    | 'storage';

/**
 * Public resource structure.
 * The `data` bag is intentionally flexible so that both the public chat
 * and the authenticated prompts system can share the same type without
 * requiring separate conversion layers.
 */
export interface PublicResource {
    type: PublicResourceType;
    data: {
        // Universal fields
        url?: string;
        filename?: string;
        mime_type?: string;
        type?: string;
        size?: number;
        id?: string;
        title?: string;
        content?: string;
        description?: string;
        // Note fields
        label?: string;
        folder_name?: string;
        tags?: string[];
        // Task fields
        status?: string;
        priority?: string;
        project_id?: string;
        project_name?: string;
        // Project fields
        name?: string;
        // Table fields
        table_name?: string;
        table_id?: string;
        table_type?: 'full_table' | 'table_row' | 'table_column' | 'table_cell';
        row_id?: string;
        column_name?: string;
        // Webpage fields
        text_content?: string;
        // YouTube fields
        video_id?: string;
        videoId?: string;
        transcript?: string;
        // Storage / file detail fields
        filepath?: string;
        // Audio fields
        duration?: number;
        [key: string]: unknown;
    };
}

/**
 * Convert a PublicResource to a ContentItem for the API.
 *
 * Backend natively supports: input_text, input_image, input_audio, input_file.
 * All other types are sent with their type name for future backend support.
 */
export function resourceToContentItem(resource: PublicResource): ContentItem | null {
    const { type, data } = resource;

    switch (type) {
        // ── Media / file types ────────────────────────────────────────────
        case 'image_link':
        case 'image_url':
            if (!data.url) return null;
            return { type: 'input_image', url: data.url };

        case 'file_link':
        case 'file_url':
            if (!data.url) return null;
            return { type: 'input_file', url: data.url };

        case 'audio':
            if (!data.url) return null;
            return { type: 'input_audio', url: data.url };

        case 'file':
        case 'storage': {
            if (!data.url) return null;
            const mimeType = (data.mime_type ?? data.type ?? '') as string;
            if (mimeType.startsWith('image/')) return { type: 'input_image', url: data.url };
            if (mimeType.startsWith('audio/')) return { type: 'input_audio', url: data.url };
            return { type: 'input_file', url: data.url };
        }

        case 'youtube':
            if (!data.url) return null;
            return { type: 'youtube_video', url: data.url };

        case 'webpage':
            if (!data.url) return null;
            return { type: 'input_webpage', url: data.url };

        // ── Matrx data types (backend receives structured objects) ────────
        case 'note':
            return {
                type: 'input_note',
                note_id: data.id ?? '',
                title: (data.label ?? data.title ?? data.filename ?? 'Note') as string,
                content: (data.content ?? '') as string,
            };

        case 'task':
            return {
                type: 'input_task',
                task_id: data.id ?? '',
                title: (data.title ?? 'Task') as string,
                description: data.description as string | undefined,
                status: data.status as string | undefined,
            };

        case 'project':
            return {
                type: 'input_task',
                task_id: data.id ?? '',
                title: (data.name ?? data.title ?? 'Project') as string,
                description: data.description as string | undefined,
            };

        case 'table':
            return {
                type: 'input_table',
                table_id: (data.table_id ?? data.id ?? '') as string,
                table_name: (data.table_name ?? data.title ?? 'Table') as string,
                data: typeof data.content === 'string' ? data.content : JSON.stringify(data.content ?? {}),
            };

        default:
            console.warn('Unknown resource type:', type);
            return null;
    }
}

/**
 * Build content array from text and resources
 */
export function buildContentArray(
    text: string,
    resources: PublicResource[]
): ContentItem[] {
    const content: ContentItem[] = [];

    // Add text content if present
    if (text.trim()) {
        content.push({
            type: 'input_text',
            text: text,
        });
    }

    // Convert and add each resource
    for (const resource of resources) {
        const item = resourceToContentItem(resource);
        if (item) {
            content.push(item);
        }
    }

    return content;
}

/**
 * Adapter: convert a prompts `Resource` (from features/prompts/types/resources.ts)
 * to a `PublicResource` so that the prompts picker components can be reused in any route
 * without requiring callers to depend on the prompts type system directly.
 *
 * The prompts Resource discriminated union uses canonical names that already match
 * the extended PublicResourceType, so this is a safe cast with data normalisation.
 */
export function promptsResourceToPublicResource(resource: {
    type: string;
    data: Record<string, unknown>;
}): PublicResource {
    // All prompts resource types are valid PublicResourceType values after extending the union.
    // We normalise the data to match the PublicResource.data shape.
    return {
        type: resource.type as PublicResourceType,
        data: resource.data as PublicResource['data'],
    };
}
