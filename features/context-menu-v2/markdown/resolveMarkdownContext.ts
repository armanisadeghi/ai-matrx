/**
 * resolveMarkdownContext — delegated right-click → context payload.
 *
 * Walks up from the right-clicked element to the nearest tagged ancestors and
 * assembles the per-target context the single-instance markdown menu needs.
 * Pure DOM reads (no React, no Redux, no listeners) so it costs nothing until
 * the user actually right-clicks. Tags are emitted by:
 *   - the message root (`data-message-id`, added in AgentAssistantMessage)
 *   - each block (`data-mtx-ctx="block"` + block-type/id/tool/language, added
 *     in SafeBlockRenderer)
 */

export interface MarkdownMenuContext extends Record<string, unknown> {
  conversationId: string;
  messageId?: string;
  blockId?: string;
  blockType?: string;
  toolName?: string;
  language?: string;
  /** `<artifact type>` / materialized artifact type of the block, when any. */
  artifactType?: string;
  /** canvas_items row id when the block is a materialized artifact. */
  artifactId?: string;
  /** Raw diagram DSL for mermaid blocks (the rendered SVG text is only labels). */
  diagram_source?: string;
  /** Text the menu's compare/AI actions operate on when there's no selection. */
  content?: string;
}

export function resolveMarkdownContext(
  target: HTMLElement | null,
  conversationId: string,
): MarkdownMenuContext {
  const ctx: MarkdownMenuContext = { conversationId };
  if (!target) return ctx;

  const messageEl = target.closest<HTMLElement>("[data-message-id]");
  if (messageEl?.dataset.messageId) {
    ctx.messageId = messageEl.dataset.messageId;
  }

  const blockEl = target.closest<HTMLElement>('[data-mtx-ctx="block"]');
  if (blockEl) {
    const d = blockEl.dataset;
    if (d.blockId) ctx.blockId = d.blockId;
    if (d.blockType) ctx.blockType = d.blockType;
    if (d.toolName) ctx.toolName = d.toolName;
    if (d.language) ctx.language = d.language;
    if (d.artifactType) ctx.artifactType = d.artifactType;
    if (d.artifactId) ctx.artifactId = d.artifactId;
    if (d.blockSource) {
      // Mermaid: the diagram DSL, NOT the SVG's label text — feed agents the
      // real source so "edit this diagram" works, and use it for content too.
      ctx.diagram_source = d.blockSource;
      ctx.content = d.blockSource;
    } else {
      const text = blockEl.textContent?.trim();
      if (text) ctx.content = text;
    }
  } else if (messageEl) {
    const text = messageEl.textContent?.trim();
    if (text) ctx.content = text;
  }

  return ctx;
}
