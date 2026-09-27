// features/rich-document/review/applyTargets.ts
//
// Where an agent's answer can be APPLIED back to. When "Custom agent…" opens an
// agent window from text that can be saved (a note, a chat answer, a working
// document), the text's action context is registered here and the window's
// conversation is bound to it. Every answer in that conversation then offers
// "Apply to source", which opens the one review (diff → splice → save through
// the source's own adapter). Several windows may bind to the same target;
// each is independent.
//
// Module scope, not Redux: a context carries functions (dispatch, adapters).
// Only the string ids travel through overlay data.

import type { RichDocumentActionContext } from "../types";

interface ApplyTarget {
  ctx: RichDocumentActionContext;
  /** What the source is called, for the action's label. */
  label: string;
}

const targets = new Map<string, ApplyTarget>();
const byConversation = new Map<string, string>();
let seq = 0;

/** Sources whose saved bytes the review can read and write. */
const APPLYABLE_SOURCES = new Set(["note", "chat-message", "working-document"]);

/** True when an answer about this text could be applied back to it. */
export function canApplyBack(ctx: RichDocumentActionContext): boolean {
  return APPLYABLE_SOURCES.has(ctx.source.type) && ctx.source.readOnly !== true;
}

export function registerApplyTarget(
  ctx: RichDocumentActionContext,
  label: string,
): string {
  seq += 1;
  const id = `apply-target-${seq}`;
  targets.set(id, { ctx, label });
  return id;
}

export function bindConversationToApplyTarget(
  conversationId: string,
  targetId: string,
): void {
  if (targets.has(targetId)) byConversation.set(conversationId, targetId);
}

export function applyTargetForConversation(
  conversationId: string | null | undefined,
): { id: string; label: string } | null {
  if (!conversationId) return null;
  const id = byConversation.get(conversationId);
  const target = id ? targets.get(id) : undefined;
  return id && target ? { id, label: target.label } : null;
}

export function getApplyTarget(id: string | null | undefined): ApplyTarget | null {
  return id ? (targets.get(id) ?? null) : null;
}
