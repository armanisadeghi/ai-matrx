import dynamic from "next/dynamic";
import { TypedStreamEvent } from "@/components/mardown-display/chat-markdown/types";
import type { ServerProcessedBlock } from "@/components/mardown-display/chat-markdown/EnhancedChatMarkdown";

/**
 * Props for the MarkdownStream component.
 * Defined here (in the shell) so consumers can import the type without
 * pulling in the heavy implementation module.
 */
export interface MarkdownStreamProps {
  /** Markdown content to render (legacy mode) */
  content?: string;
  /** Stream events to process (new mode) */
  events?: TypedStreamEvent[];
  /** Optional task ID for streaming updates (legacy mode with Redux) */
  taskId?: string;
  requestId?: string;
  /** Turn ID for DB-loaded turn rendering */
  turnId?: string;
  /** Conversation ID for DB-loaded turn rendering */
  conversationId?: string;
  /**
   * @deprecated No longer used — `MarkdownStream` now always renders in
   * `message` mode. This prop is kept on the interface for backward
   * compatibility only and is ignored. Remove from callers.
   */
  type?:
    | "flashcard"
    | "message"
    | "text"
    | "image"
    | "audio"
    | "video"
    | "file"
    | string;
  /**
   * @deprecated No longer used — `MarkdownStream` now always renders as
   * `assistant`. This prop is kept on the interface for backward
   * compatibility only and is ignored. Remove from callers.
   */
  role?: "user" | "assistant" | "system" | "tool" | string;
  /** Additional CSS classes */
  className?: string;
  /** Whether streaming is currently active */
  isStreamActive?: boolean;
  /** Callback for content changes */
  onContentChange?: (newContent: string) => void;
  /**
   * When false (with onContentChange), block edits are reported via onContentChange but
   * the visible markdown stays tied to the `content` prop (no local edited overlay).
   */
  applyLocalEdits?: boolean;
  /** Additional analysis data */
  analysisData?: any;
  /** Message ID for identification */
  messageId?: string;
  /** Allow full-screen editor mode */
  allowFullScreenEditor?: boolean;
  /** Hide the copy button */
  hideCopyButton?: boolean;
  /** Callback when an error event is received (new mode) */
  onError?: (error: string) => void;
  /** Callback when phase events are received (new mode) */
  onPhaseUpdate?: (phase: string) => void;
  /** Pre-processed content blocks from server/Redux (new content_block protocol). */
  serverProcessedBlocks?: ServerProcessedBlock[];
  /**
   * Strict server-data mode — for testing/debugging only.
   * When true, structured blocks will NOT fall back to client-side parsing
   * if block.serverData is null. Leave false (default) for production.
   */
  strictServerData?: boolean;
}

/**
 * MarkdownStream — public entry point of the RICH DOCUMENT rendering engine.
 *
 * IMPORTANT: This is NOT a thin react-markdown wrapper. "MarkdownStream" is the
 * historical name for the engine that turns text + JSON into interactive
 * components: flashcards with AI integrations, live diagrams, wired task
 * lists, tool-call traces, code surfaces, realtime feeds, classification
 * analyzers, plan viewers, and more. Do not "simplify" it, replace it with a
 * plugin, or assume its behavior from the name.
 *
 * FRONT DOOR: most consumers should render `<RichDocument>`
 * (features/rich-document/RichDocument.tsx), which wraps this engine and adds
 * the action toolkit (copy / save-to-notes/task / print / html-preview / …).
 * Import MarkdownStream directly only for bare rendering with no actions.
 * See features/rich-document/FEATURE.md and the `rich-document-actions` skill.
 *
 * Loaded dynamically (client-only, no SSR) so the heavy pipeline — block
 * registry, code highlighter, jspdf, html2canvas, etc. — is never bundled
 * into the server render. The shell renders nothing until the JS chunk is
 * ready, which is fine because this content is always dynamic.
 */
const MarkdownStream = dynamic(() => import("./MarkdownStreamImpl"), {
  ssr: false,
});

export default MarkdownStream;
