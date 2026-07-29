export interface ArtifactRendererProps {
  /** Chrome/scope hint — NOT a different component (each adapter handles modes internally). */
  mode: "inline" | "artifact" | "canvas";
  /** Raw payload string (streaming, or canvas content.data when stored as a string). */
  raw?: string;
  /** Pre-parsed data (canvas content.data object, or any already-parsed payload). */
  data?: unknown;
  /** Server-parsed data from the stream (Python content_block.data). */
  serverData?: unknown;
  metadata?: Record<string, unknown>;
  artifactId?: string;
  conversationId?: string;
  messageId?: string;
  /** Block position within the message — used by quiz/mermaid state persistence. */
  blockIndex?: number;
  taskId?: string;
  isStreamActive?: boolean;
  /**
   * Inline-edit write-back. Restores the per-type `case` behavior the legacy
   * switch had: an editable block (table, code, …) calls this with its new
   * content and the chat wires it to `replaceBlockContent` →
   * `commitInlineContentEdit` → `cx_message.content` + server-cache bust, so the
   * user's edit persists and the model's next-turn history matches what they see.
   * The artifact system must not strip this — normal-view editing stays identical.
   */
  onContentChange?: (newContent: string) => void;
  /**
   * True when rendered on a PUBLIC / shared surface (anonymous viewer). Renderers
   * that execute or script-enable author content (html, react) MUST downgrade to
   * a safe, sandboxed, non-executing view when this is set — never run untrusted
   * author HTML/React in a visitor's session. Defaults to false (owner view).
   */
  isPublic?: boolean;
}
