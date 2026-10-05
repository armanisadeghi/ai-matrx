import type { InlineDecision, InlineDecisionOption } from './types';
import { parseDecisionOptionsFromBody } from './decision-options';
import { parseXmlAttributes } from '@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2';

/**
 * Parses the inner content of a <decision> block into an InlineDecision.
 * Used as the client-side fallback when serverData is not available.
 *
 * @param innerContent - The raw text between <decision> and </decision> tags
 * @param attributes - Pre-parsed attributes from the opening tag (e.g. { prompt: "..." })
 * @param blockIndex - Used to generate a stable id
 */
export function parseDecisionFromContent(
    innerContent: string,
    attributes: Record<string, string>,
    blockIndex: number = 0,
): InlineDecision | null {
    const options: InlineDecisionOption[] = parseDecisionOptionsFromBody(innerContent).map((o, i) => ({
        id: `opt-${i}`,
        label: o.label,
        text: o.text,
    }));

    if (options.length === 0) return null;

    return {
        id: `decision-${blockIndex}`,
        prompt: attributes.prompt || 'Make a selection',
        options,
    };
}

/**
 * Parses a full <decision prompt="...">...</decision> XML string.
 * Convenience wrapper that handles both the opening tag attributes and inner content.
 */
export function parseDecisionXml(fullXml: string, blockIndex: number = 0): InlineDecision | null {
    const openTagMatch = fullXml.match(/^<decision\s+([^>]*)>/);
    if (!openTagMatch) return null;

    const attributes = parseXmlAttributes(`<decision ${openTagMatch[1]}>`);
    const closingIdx = fullXml.lastIndexOf('</decision>');
    if (closingIdx === -1) return null;

    const innerContent = fullXml.slice(fullXml.indexOf('>') + 1, closingIdx);
    return parseDecisionFromContent(innerContent, attributes, blockIndex);
}
