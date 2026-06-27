/**
 * Resource Formatting and Parsing Utilities
 *
 * Canonical home for resource XML formatting/parsing used by agents, chat, and
 * public-chat. Moved here from features/prompts/utils/resource-formatting.ts
 * and features/prompts/utils/resource-parsing.ts so the prompts feature can be
 * deleted without breaking live agent/chat code.
 */

import {
    Resource,
    ResourceFormatConfig,
    ProcessedResources,
    MessageFileReference,
    MessageResourceReference,
    MessageMetadata,
    NoteResourceData,
    TaskResourceData,
    ProjectResourceData,
    TableResourceData,
    FileResourceData,
    WebpageResourceData,
    YouTubeResourceData,
    ImageUrlResourceData,
    FileUrlResourceData,
    AudioResourceData,
    ParsedResource,
} from "./types";

// ===========================
// Format Configuration
// ===========================

/**
 * Configuration for each resource type defining how to format it
 */
export const RESOURCE_FORMAT_CONFIG: Record<string, ResourceFormatConfig> = {
    note: {
        includeInContent: true,
        requiresDataFetch: false,
        instructions: "This is a user note that can be referenced, quoted, or analyzed. If you need to update, delete, or create notes, you should use the appropriate note management tools.",
        extractMetadata: (data: NoteResourceData) => ({
            label: data.label,
            ...(data.folder_name && { folder: data.folder_name }),
            ...(data.tags && data.tags.length > 0 && { tags: data.tags.join(', ') }),
        }),
        extractContent: (data: NoteResourceData) => data.content || '',
    },

    task: {
        includeInContent: true,
        requiresDataFetch: false,
        instructions: "This is a task from the user's task list. You can reference it, check its status, or suggest updates. To modify tasks, use the task management tools.",
        extractMetadata: (data: TaskResourceData) => ({
            title: data.title,
            status: data.status,
            ...(data.priority && { priority: data.priority }),
            ...(data.due_date && { due_date: data.due_date }),
            ...(data.project_id && { project: data.project_id }),
        }),
        extractContent: (data: TaskResourceData) => data.description || '',
    },

    project: {
        includeInContent: true,
        requiresDataFetch: false,
        instructions: "This is a project from the user's project list. You can reference it or suggest updates. To modify projects, use the project management tools.",
        extractMetadata: (data: ProjectResourceData) => ({
            name: data.name,
        }),
        extractContent: (data: ProjectResourceData) => data.description || '',
    },

    table: {
        includeInContent: true,
        requiresDataFetch: true, // Tables need their data fetched via RPC
        instructions: "This is a data table reference that you can analyze, query, or reference. You can perform calculations, filter data, or answer questions about it. To modify the table, use the table management tools.",
        extractMetadata: (data: TableResourceData) => ({
            name: data.table_name,
            ...(data.description && { description: data.description }),
            reference_type: data.type,
            ...(data.row_id && { row_id: data.row_id }),
            ...(data.column_name && { column: data.column_display_name || data.column_name }),
            ...(data.row_count !== undefined && { row_count: String(data.row_count) }),
        }),
        extractContent: (data: TableResourceData) => {
            return formatTableContent(data);
        },
    },

    file: {
        includeInContent: true,
        requiresDataFetch: false,
        instructions: "This is a file attachment. You can reference its contents or metadata. If you need to modify or create files, use the file management tools.",
        extractMetadata: (data: FileResourceData) => ({
            filename: data.filename || data.details?.filename || 'Unknown',
            ...(data.mime_type && { mime_type: data.mime_type }),
            ...(data.size && { size: formatFileSize(data.size) }),
        }),
        extractContent: (data: FileResourceData) => {
            if (data.content) {
                return data.content;
            }
            if (data.url) {
                return `File available at: ${data.url}`;
            }
            return `File: ${data.filename || 'attachment'}`;
        },
    },

    webpage: {
        includeInContent: true,
        requiresDataFetch: false,
        instructions: "This is web content scraped from a URL. You can reference, summarize, or analyze this content. Note that this is a snapshot and may not reflect the current state of the webpage.",
        extractMetadata: (data: WebpageResourceData) => ({
            ...(data.title && { title: data.title }),
            url: data.url,
            ...(data.scrapedAt && { scraped_at: data.scrapedAt }),
            ...(data.charCount && { char_count: String(data.charCount) }),
        }),
        extractContent: (data: WebpageResourceData) => data.textContent || '',
    },

    youtube: {
        includeInContent: false, // YouTube URLs go in settings
        requiresDataFetch: false,
        instructions: "YouTube video",
        extractMetadata: (data: YouTubeResourceData) => ({
            url: data.url,
            video_id: data.videoId,
            ...(data.title && { title: data.title }),
        }),
        extractContent: (data: YouTubeResourceData) => data.transcript || '',
    },

    image_url: {
        includeInContent: false, // Image URLs go in settings
        requiresDataFetch: false,
        instructions: "Image URL",
        extractMetadata: (data: ImageUrlResourceData) => ({
            url: data.url,
        }),
        extractContent: () => '',
    },

    file_url: {
        includeInContent: false, // File URLs go in settings
        requiresDataFetch: false,
        instructions: "File URL",
        extractMetadata: (data: FileUrlResourceData) => ({
            url: data.url,
            ...(data.filename && { filename: data.filename }),
        }),
        extractContent: () => '',
    },

    audio: {
        includeInContent: true,
        requiresDataFetch: false,
        instructions: "This is an audio file. If a transcript is available, you can reference it. Use audio management tools to modify or create audio files.",
        extractMetadata: (data: AudioResourceData) => ({
            filename: data.filename || 'Audio',
            ...(data.duration && { duration: `${data.duration}s` }),
        }),
        extractContent: (data: AudioResourceData) => {
            if (data.transcript) {
                return `[Audio Transcript]\n${data.transcript}`;
            }
            return 'Audio file (no transcript available)';
        },
    },
};

// ===========================
// Helper Functions
// ===========================

/**
 * Format file size in human-readable format
 */
function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Format table data based on reference type
 */
function formatTableContent(data: TableResourceData): string {
    switch (data.type) {
        case 'full_table':
            return formatFullTableAsMarkdown(data);
        case 'table_row':
            return formatTableRow(data);
        case 'table_column':
            return formatTableColumn(data);
        case 'table_cell':
            return formatTableCell(data);
        default:
            return `Reference to ${data.table_name}`;
    }
}

function formatFullTableAsMarkdown(data: TableResourceData): string {
    if (!data.fields || !data.rows || data.rows.length === 0) {
        return `# ${data.table_name}\n\nNo data available.`;
    }
    const lines: string[] = [];
    lines.push(`# ${data.table_name}`);
    lines.push('');
    const headers = data.fields.map(f => f.display_name || f.field_name);
    lines.push('| ' + headers.join(' | ') + ' |');
    lines.push('| ' + headers.map(() => '---').join(' | ') + ' |');
    const rowsToShow = data.rows.slice(0, 100);
    for (const row of rowsToShow) {
        const cells = data.fields.map(f => {
            const value = row[f.field_name];
            if (value === null || value === undefined) return '';
            if (typeof value === 'object') return JSON.stringify(value);
            return String(value);
        });
        lines.push('| ' + cells.join(' | ') + ' |');
    }
    if (data.rows.length > 100) {
        lines.push('');
        lines.push(`... ${data.rows.length - 100} more rows`);
    }
    return lines.join('\n');
}

function formatTableRow(data: TableResourceData): string {
    if (!data.rows || data.rows.length === 0) {
        return `Row from table "${data.table_name}" (ID: ${data.row_id})`;
    }
    const row = data.rows[0];
    const lines: string[] = [];
    lines.push(`## Row from ${data.table_name}`);
    lines.push(`Row ID: ${data.row_id}`);
    lines.push('');
    for (const [key, value] of Object.entries(row)) {
        if (key === 'id') continue;
        const displayValue = value === null || value === undefined ? '(empty)' :
            typeof value === 'object' ? JSON.stringify(value) :
            String(value);
        lines.push(`**${key}**: ${displayValue}`);
    }
    return lines.join('\n');
}

function formatTableColumn(data: TableResourceData): string {
    const columnName = data.column_display_name || data.column_name || 'Unknown Column';
    if (!data.rows || data.rows.length === 0) {
        return `Column "${columnName}" from table "${data.table_name}"`;
    }
    const lines: string[] = [];
    lines.push(`## Column: ${columnName}`);
    lines.push(`From table: ${data.table_name}`);
    lines.push('');
    lines.push('Values:');
    const rowsToShow = data.rows.slice(0, 100);
    for (let i = 0; i < rowsToShow.length; i++) {
        const row = rowsToShow[i];
        const value = row[data.column_name || ''];
        const displayValue = value === null || value === undefined ? '(empty)' :
            typeof value === 'object' ? JSON.stringify(value) :
            String(value);
        lines.push(`${i + 1}. ${displayValue}`);
    }
    if (data.rows.length > 100) {
        lines.push(`... ${data.rows.length - 100} more values`);
    }
    return lines.join('\n');
}

function formatTableCell(data: TableResourceData): string {
    const columnName = data.column_display_name || data.column_name || 'Unknown Column';
    const cellValue = (data as any).cell_value;
    const lines: string[] = [];
    lines.push(`## Cell from ${data.table_name}`);
    lines.push(`Column: ${columnName}`);
    lines.push(`Row ID: ${data.row_id}`);
    lines.push('');
    lines.push('Value:');
    const displayValue = cellValue === null || cellValue === undefined ? '(empty)' :
        typeof cellValue === 'object' ? JSON.stringify(cellValue, null, 2) :
        String(cellValue);
    lines.push(displayValue);
    return lines.join('\n');
}

function escapeXml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function formatMetadataXml(metadata: Record<string, string>, indent: string = '        '): string {
    return Object.entries(metadata)
        .map(([key, value]) => `${indent}<${key}>${escapeXml(value)}</${key}>`)
        .join('\n');
}

// ===========================
// Main Formatting Functions
// ===========================

function getResourceId(resource: Resource): string {
    if (resource.type === 'table') {
        return resource.data.table_id;
    } else if (resource.type === 'note' || resource.type === 'task' || resource.type === 'project' || resource.type === 'file' || resource.type === 'audio') {
        return resource.data.id || `${resource.type}-${Date.now()}`;
    } else if (resource.type === 'webpage' || resource.type === 'youtube' || resource.type === 'image_url' || resource.type === 'file_url') {
        return resource.data.url || `${resource.type}-${Date.now()}`;
    }
    return `resource-${Date.now()}`;
}

/**
 * Format a single resource to XML with proper indentation
 */
export function formatResourceToXml(resource: Resource): string {
    const config = RESOURCE_FORMAT_CONFIG[resource.type];
    if (!config || !config.includeInContent) {
        return '';
    }
    const metadata = config.extractMetadata(resource.data);
    const content = config.extractContent(resource.data);
    const instructions = config.instructions;
    const resourceId = getResourceId(resource);

    const lines: string[] = [];
    lines.push(`    <resource type="${resource.type}" id="${resourceId}">`);
    if (Object.keys(metadata).length > 0) {
        lines.push('        <metadata>');
        lines.push(formatMetadataXml(metadata, '            '));
        lines.push('        </metadata>');
    }
    lines.push('        <instructions>');
    lines.push('            ' + escapeXml(instructions));
    lines.push('        </instructions>');
    if (content) {
        lines.push('        <content>');
        lines.push('            ' + escapeXml(content));
        lines.push('        </content>');
    }
    lines.push('    </resource>');
    return lines.join('\n');
}

/**
 * Format multiple resources to XML (wrapped in <attached_resources> tag)
 */
export function formatResourcesToXml(resources: Resource[]): string {
    const contentResources = resources.filter(r => {
        const config = RESOURCE_FORMAT_CONFIG[r.type];
        return config && config.includeInContent;
    });
    if (contentResources.length === 0) {
        return '';
    }
    const formattedResources = contentResources.map(r => formatResourceToXml(r)).filter(Boolean);
    if (formattedResources.length === 0) {
        return '';
    }
    return `<attached_resources>\n\n${formattedResources.join('\n\n')}\n\n</attached_resources>`;
}

/**
 * Extract settings attachments from resources (URLs, etc.)
 */
export function extractSettingsAttachments(resources: Resource[]): ProcessedResources['settingsAttachments'] {
    const attachments: ProcessedResources['settingsAttachments'] = {};
    for (const resource of resources) {
        const config = RESOURCE_FORMAT_CONFIG[resource.type];
        if (!config || config.includeInContent) {
            continue;
        }
        switch (resource.type) {
            case 'youtube':
                if (!attachments.youtubeUrls) attachments.youtubeUrls = [];
                attachments.youtubeUrls.push(resource.data.url);
                break;
            case 'image_url':
                if (!attachments.imageUrls) attachments.imageUrls = [];
                attachments.imageUrls.push(resource.data.url);
                break;
            case 'file_url':
                if (!attachments.fileUrls) attachments.fileUrls = [];
                attachments.fileUrls.push(resource.data.url);
                break;
            case 'audio':
                if (resource.data.url) {
                    if (!attachments.audioFiles) attachments.audioFiles = [];
                    attachments.audioFiles.push(resource.data.url);
                }
                break;
        }
    }
    return attachments;
}

/**
 * Extract file references for message metadata
 */
export function extractFileReferences(resources: Resource[]): MessageFileReference[] {
    const files: MessageFileReference[] = [];
    for (const resource of resources) {
        switch (resource.type) {
            case 'youtube':
                files.push({ uri: resource.data.url, mime_type: 'video/*' });
                break;
            case 'image_url':
                files.push({ uri: resource.data.url, mime_type: resource.data.type || 'image/*' });
                break;
            case 'file_url':
                files.push({ uri: resource.data.url, mime_type: resource.data.mime_type });
                break;
            case 'file':
                if (resource.data.url) {
                    files.push({ uri: resource.data.url, mime_type: resource.data.mime_type || resource.data.content_type });
                }
                break;
            case 'audio':
                if (resource.data.url) {
                    files.push({ uri: resource.data.url, mime_type: 'audio/*' });
                }
                break;
        }
    }
    return files;
}

/**
 * Extract resource references for message metadata
 */
export function extractResourceReferences(resources: Resource[]): MessageResourceReference[] {
    const references: MessageResourceReference[] = [];
    for (const resource of resources) {
        switch (resource.type) {
            case 'table':
                references.push({ type: resource.type, data: resource.data });
                break;
            case 'note':
            case 'task':
            case 'project':
            case 'file':
            case 'audio':
                references.push({ type: resource.type, id: resource.data.id });
                break;
            case 'webpage':
                references.push({ type: resource.type, id: resource.data.url });
                break;
            case 'youtube':
            case 'image_url':
            case 'file_url':
                references.push({ type: resource.type, id: resource.data.url });
                break;
        }
    }
    return references;
}

/**
 * Extract message metadata from resources
 */
export function extractMessageMetadata(resources: Resource[]): MessageMetadata {
    return {
        files: extractFileReferences(resources),
        resources: extractResourceReferences(resources),
    };
}

/**
 * Process resources for message inclusion
 */
export async function processResourcesForMessage(resources: Resource[]): Promise<ProcessedResources> {
    return {
        formattedXml: formatResourcesToXml(resources),
        settingsAttachments: extractSettingsAttachments(resources),
        metadata: extractMessageMetadata(resources),
        originalResources: resources,
    };
}

/**
 * Append resources to message content
 */
export function appendResourcesToMessage(messageContent: string, resourcesXml: string): string {
    if (!resourcesXml) {
        return messageContent;
    }
    if (!messageContent.trim()) {
        return resourcesXml;
    }
    return `${messageContent}\n\n${resourcesXml}`;
}

// ===========================
// Resource Parsing Functions
// (from features/prompts/utils/resource-parsing.ts)
// ===========================

function unescapeXml(text: string): string {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
}

function extractTagContent(xml: string, tagName: string): string | null {
    const regex = new RegExp(`<${tagName}>(.*?)</${tagName}>`, 's');
    const match = xml.match(regex);
    return match ? unescapeXml(match[1].trim()) : null;
}

function extractMetadataFromXml(metadataXml: string): Record<string, string> {
    const metadata: Record<string, string> = {};
    const tagRegex = /<(\w+)>(.*?)<\/\1>/gs;
    let match;
    while ((match = tagRegex.exec(metadataXml)) !== null) {
        const tagName = match[1];
        const content = unescapeXml(match[2].trim());
        metadata[tagName] = content;
    }
    return metadata;
}

function parseResourceXml(resourceXml: string, startIndex: number): ParsedResource | null {
    try {
        const openingTagMatch = resourceXml.match(/<resource\s+type="([^"]+)"\s+id="([^"]+)">/);
        if (!openingTagMatch) {
            console.warn('Failed to parse resource: missing type or id');
            return null;
        }
        const type = openingTagMatch[1];
        const id = openingTagMatch[2];
        const metadataXml = extractTagContent(resourceXml, 'metadata');
        const metadata = metadataXml ? extractMetadataFromXml(metadataXml) : {};
        const content = extractTagContent(resourceXml, 'content') || '';
        return {
            type,
            id,
            metadata,
            content,
            rawXml: resourceXml,
            startIndex,
            endIndex: startIndex + resourceXml.length,
        };
    } catch (error) {
        console.error('Error parsing resource XML:', error);
        return null;
    }
}

/**
 * Parse all resources from message content
 */
export function parseResourcesFromMessage(messageContent: string): ParsedResource[] {
    const resources: ParsedResource[] = [];
    const resourceRegex = /<resource\s+type="[^"]+"\s+id="[^"]+">(.*?)<\/resource>/gs;
    let match;
    while ((match = resourceRegex.exec(messageContent)) !== null) {
        const resourceXml = match[0];
        const startIndex = match.index;
        const parsed = parseResourceXml(resourceXml, startIndex);
        if (parsed) {
            resources.push(parsed);
        }
    }
    return resources;
}

/**
 * Check if message contains resources
 */
export function messageContainsResources(messageContent: string): boolean {
    return messageContent.includes('<attached_resources>') || messageContent.includes('<resource type=');
}

/**
 * Extract message content without resource XML
 */
export function extractMessageWithoutResources(messageContent: string): string {
    let cleaned = messageContent.replace(/<attached_resources>.*?<\/attached_resources>/gs, '');
    cleaned = cleaned.replace(/<resource\s+type="[^"]+"\s+id="[^"]+">(.*?)<\/resource>/gs, '');
    return cleaned.trim();
}

/**
 * Split message into text segments and resource segments
 */
export interface MessageSegment {
    type: 'text' | 'resource';
    content: string;
    resource?: ParsedResource;
}

export function splitMessageIntoSegments(messageContent: string): MessageSegment[] {
    const segments: MessageSegment[] = [];
    const resources = parseResourcesFromMessage(messageContent);
    if (resources.length === 0) {
        return [{ type: 'text', content: messageContent }];
    }
    resources.sort((a, b) => a.startIndex - b.startIndex);
    let currentIndex = 0;
    for (const resource of resources) {
        if (resource.startIndex > currentIndex) {
            const textContent = messageContent.substring(currentIndex, resource.startIndex);
            if (textContent.trim()) {
                segments.push({ type: 'text', content: textContent });
            }
        }
        segments.push({ type: 'resource', content: resource.rawXml, resource });
        currentIndex = resource.endIndex;
    }
    if (currentIndex < messageContent.length) {
        const textContent = messageContent.substring(currentIndex);
        if (textContent.trim()) {
            segments.push({ type: 'text', content: textContent });
        }
    }
    return segments;
}

/**
 * Extract resource IDs from message content
 */
export function extractResourceIds(messageContent: string): Array<{ type: string; id: string }> {
    const resources = parseResourcesFromMessage(messageContent);
    return resources.map(r => ({ type: r.type, id: r.id }));
}

/**
 * Check if a specific resource exists in the message
 */
export function messageHasResource(messageContent: string, resourceType: string, resourceId: string): boolean {
    const ids = extractResourceIds(messageContent);
    return ids.some(r => r.type === resourceType && r.id === resourceId);
}

/**
 * Get count of resources by type in message
 */
export function getResourceCountByType(messageContent: string): Record<string, number> {
    const resources = parseResourcesFromMessage(messageContent);
    const counts: Record<string, number> = {};
    for (const resource of resources) {
        counts[resource.type] = (counts[resource.type] || 0) + 1;
    }
    return counts;
}
