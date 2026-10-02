/**
 * Builds a CxContentBlock[] array suitable for the cx_message_edit RPC.
 *
 * When `rawContent` is available (DB-loaded messages), it preserves non-text blocks
 * (thinking, tool calls, media, etc.) and replaces only the text blocks with the
 * current display content. For streamed messages or when rawContent only contains
 * simple text, it returns a single text block.
 */

import type { CxContentBlock, CxTextContent } from '@/features/public-chat/types/cx-tables';

export function buildContentBlocksForSave(
    currentContent: string,
    rawContent?: unknown[],
): CxContentBlock[] {
    if (!rawContent || rawContent.length === 0) {
        return [{ type: 'text', text: currentContent } as CxTextContent];
    }

    const blocks = rawContent as CxContentBlock[];
    const hasNonTextBlocks = blocks.some(b => b.type !== 'text');

    if (!hasNonTextBlocks) {
        return [{ type: 'text', text: currentContent } as CxTextContent];
    }

    // Preserve non-text blocks (thinking, tool_call, tool_result, media, etc.)
    // and replace all text blocks with the current edited content as a single block.
    const preserved = blocks.filter(b => b.type !== 'text');
    const textBlock: CxTextContent = { type: 'text', text: currentContent };

    // Insert text block at the position of the first original text block,
    // or append at the end if no text blocks existed (unlikely but safe).
    const firstTextIndex = blocks.findIndex(b => b.type === 'text');
    if (firstTextIndex === -1) {
        return [...preserved, textBlock];
    }

    const result: CxContentBlock[] = [];
    let textInserted = false;
    for (const block of blocks) {
        if (block.type === 'text') {
            if (!textInserted) {
                result.push(textBlock);
                textInserted = true;
            }
            // Skip remaining text blocks — they're merged into one
        } else {
            result.push(block);
        }
    }
    return result;
}
