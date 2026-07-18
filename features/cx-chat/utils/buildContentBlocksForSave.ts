/**
 * Builds a CxContentBlock[] array suitable for the cx_message_edit RPC.
 *
 * When `rawContent` is available (DB-loaded messages), it preserves non-text blocks
 * (thinking, tool calls, media, etc.) and replaces only the text blocks with the
 * current display content. For streamed messages or when rawContent only contains
 * simple text, it returns a single text block.
 */

import type {
  CxContentBlock,
  CxTextContent,
} from "@/features/cx-chat/types/cx-tables";

/**
 * Citation-bearing provider turns store MANY text blocks, each carrying its own
 * `citations` array. Merging text blocks into one on edit must carry every
 * citation forward onto the merged block — dropping them is silent data loss
 * (the sources footer/chips would vanish from the message on next reload).
 * Answer-side offsets may drift after an edit; source-side fields (cited_text,
 * title, page, url) stay valid, which is what the UI keys on.
 */
function collectTextBlockCitations(blocks: CxContentBlock[]): unknown[] {
  const merged: unknown[] = [];
  for (const block of blocks) {
    if (block.type === "text" && Array.isArray(block.citations)) {
      merged.push(...block.citations);
    }
  }
  return merged;
}

function mergedTextBlock(
  currentContent: string,
  blocks: CxContentBlock[],
): CxTextContent {
  const citations = collectTextBlockCitations(blocks);
  const textBlock: CxTextContent = { type: "text", text: currentContent };
  if (citations.length > 0) textBlock.citations = citations;
  return textBlock;
}

export function buildContentBlocksForSave(
  currentContent: string,
  rawContent?: unknown[],
): CxContentBlock[] {
  if (!rawContent || rawContent.length === 0) {
    return [{ type: "text", text: currentContent } as CxTextContent];
  }

  const blocks = rawContent as CxContentBlock[];
  const hasNonTextBlocks = blocks.some((b) => b.type !== "text");

  if (!hasNonTextBlocks) {
    return [mergedTextBlock(currentContent, blocks)];
  }

  // Preserve non-text blocks (thinking, tool_call, tool_result, media, etc.)
  // and replace all text blocks with the current edited content as a single block.
  const preserved = blocks.filter((b) => b.type !== "text");
  const textBlock = mergedTextBlock(currentContent, blocks);

  // Insert text block at the position of the first original text block,
  // or append at the end if no text blocks existed (unlikely but safe).
  const firstTextIndex = blocks.findIndex((b) => b.type === "text");
  if (firstTextIndex === -1) {
    return [...preserved, textBlock];
  }

  const result: CxContentBlock[] = [];
  let textInserted = false;
  for (const block of blocks) {
    if (block.type === "text") {
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
