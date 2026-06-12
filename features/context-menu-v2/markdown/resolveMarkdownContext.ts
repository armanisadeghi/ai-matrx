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
    const text = blockEl.textContent?.trim();
    if (text) ctx.content = text;
  } else if (messageEl) {
    const text = messageEl.textContent?.trim();
    if (text) ctx.content = text;
  }

  return ctx;
}
