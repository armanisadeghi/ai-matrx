/**
 * Resource Parsing Utility (internalized)
 *
 * Parses XML-formatted resources from message content.
 * Originally from features/prompts/utils/resource-parsing.ts —
 * internalized here so the conversation feature has no dependency
 * on the prompts feature for this critical display function.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ParsedResource {
    type: string;
    id: string;
    metadata: Record<string, string>;
    content: string;
    rawXml: string;
    startIndex: number;
    endIndex: number;
}

// ============================================================================
// INTERNALS
// ============================================================================

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
        metadata[match[1]] = unescapeXml(match[2].trim());
    }
    return metadata;
}

function parseResourceXml(resourceXml: string, startIndex: number): ParsedResource | null {
    try {
        const openingTagMatch = resourceXml.match(/<resource\s+type="([^"]+)"\s+id="([^"]+)">/);
        if (!openingTagMatch) return null;

        const type = openingTagMatch[1];
        const id = openingTagMatch[2];
        const metadataXml = extractTagContent(resourceXml, 'metadata');
        const metadata = metadataXml ? extractMetadataFromXml(metadataXml) : {};
        const content = extractTagContent(resourceXml, 'content') || '';

        return { type, id, metadata, content, rawXml: resourceXml, startIndex, endIndex: startIndex + resourceXml.length };
    } catch {
        return null;
    }
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function parseResourcesFromMessage(messageContent: string): ParsedResource[] {
    const resources: ParsedResource[] = [];
    const resourceRegex = /<resource\s+type="[^"]+"\s+id="[^"]+">(.*?)<\/resource>/gs;
    let match;
    while ((match = resourceRegex.exec(messageContent)) !== null) {
        const parsed = parseResourceXml(match[0], match.index);
        if (parsed) resources.push(parsed);
    }
    return resources;
}

export function messageContainsResources(messageContent: string): boolean {
    return messageContent.includes('<attached_resources>') || messageContent.includes('<resource type=');
}

export function extractMessageWithoutResources(messageContent: string): string {
    let cleaned = messageContent.replace(/<attached_resources>.*?<\/attached_resources>/gs, '');
    cleaned = cleaned.replace(/<resource\s+type="[^"]+"\s+id="[^"]+">(.*?)<\/resource>/gs, '');
    return cleaned.trim();
}
