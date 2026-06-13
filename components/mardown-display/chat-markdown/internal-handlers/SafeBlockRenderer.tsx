import React from "react";
import { MarkdownErrorBoundary } from "./MarkdownErrorBoundary";
import { RenderBlock } from "../block-registry/BlockRenderer";
import dynamic from "next/dynamic";

const BlockRenderer = dynamic(
  () => import("../block-registry/BlockRenderer").then((m) => m.BlockRenderer),
  {
    ssr: false,
    loading: () => (
      <div className="py-2 px-1 text-sm text-neutral-400 animate-pulse">
        Loading...
      </div>
    ),
  },
);

interface SafeBlockRendererProps {
  requestId?: string;
  block: RenderBlock;
  index: number;
  isStreamActive?: boolean;
  onContentChange?: (newContent: string) => void;
  /**
   * conversationId + messageId are the cx_conversation.id / cx_message.id
   * pair that identifies the owning message. Threaded through so stateful
   * render blocks can call `useMessageBlockPersistence` and round-trip
   * their state into the DB via `cx_message_edit`.
   */
  conversationId?: string;
  messageId?: string;
  taskId?: string;
  isLastReasoningBlock?: boolean;
  replaceBlockContent: (original: string, replacement: string) => void;
  handleOpenEditor: () => void;
}

/**
 * Cheap DOM tags consumed by the single-instance markdown context menu
 * (`MarkdownContextMenuProvider`). These are plain attributes on a
 * `display:contents` wrapper — zero layout cost, zero listeners, zero hooks —
 * so they're safe to emit on EVERY block everywhere MarkdownStream renders.
 * A delegated right-click handler reads them via `target.closest`.
 */
function blockContextTags(
  block: RenderBlock,
  index: number,
): Record<string, string | undefined> {
  const sd = (block.serverData ?? {}) as Record<string, unknown>;
  const md = (block.metadata ?? {}) as Record<string, unknown>;
  const str = (v: unknown) =>
    typeof v === "string" && v.length > 0 ? v : undefined;
  const artifactType = str(sd.artifact_type) ?? str(md.artifactType);
  return {
    "data-mtx-ctx": "block",
    "data-block-type": block.type,
    "data-block-id":
      str(sd.id) ?? str(md.blockId) ?? str(md.id) ?? String(index),
    "data-tool-name": str(sd.tool_name) ?? str(sd.toolName) ?? str(md.toolName),
    "data-language": str(block.language),
    // Artifact identity for materialized refs (mermaid, etc.).
    "data-artifact-type": artifactType,
    "data-artifact-id": str(sd.artifact_id) ?? str(md.artifactId),
    // Mermaid's rendered SVG text is node LABELS, not the diagram DSL — so the
    // raw source must be tagged explicitly for the context menu to pass the
    // real diagram to an agent. Bounded to mermaid; DSL is small (<2KB typical).
    "data-block-source":
      block.type === "mermaid" || artifactType === "mermaid"
        ? str(block.content)
        : undefined,
  };
}

// Safe wrapper for individual block rendering
export const SafeBlockRenderer: React.FC<SafeBlockRendererProps> = ({
  requestId,
  block,
  index,
  isStreamActive,
  onContentChange,
  conversationId,
  messageId,
  taskId,
  isLastReasoningBlock,
  replaceBlockContent,
  handleOpenEditor,
}) => {
  try {
    return (
      <div className="contents" {...blockContextTags(block, index)}>
        <MarkdownErrorBoundary
          fallback={
            <div className="py-2 px-1 text-sm text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap break-words border-l-2 border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20">
              {block.content || "[Block rendering failed]"}
            </div>
          }
        >
          <BlockRenderer
            requestId={requestId}
            block={block}
            index={index}
            isStreamActive={isStreamActive}
            onContentChange={onContentChange}
            conversationId={conversationId}
            messageId={messageId}
            taskId={taskId}
            isLastReasoningBlock={isLastReasoningBlock}
            replaceBlockContent={replaceBlockContent}
            handleOpenEditor={handleOpenEditor}
          />
        </MarkdownErrorBoundary>
      </div>
    );
  } catch (error) {
    console.error("[MarkdownStream] Error rendering block:", error);
    return (
      <div className="py-2 px-1 text-sm text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap break-words border-l-2 border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20">
        {block.content || "[Block rendering failed]"}
      </div>
    );
  }
};
