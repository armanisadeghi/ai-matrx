/**
 * The set of kinds that HAVE a registered peek — importable from anywhere.
 *
 * Why this exists separately from `registry.ts`: that file statically imports
 * all 19 peek components, so importing `hasPeek` from it would pull every peek
 * into the caller's chunk (THE FRAGMENTATION LAW — CLAUDE.md). Surfaces that
 * only need to ask "is a peek available for this kind?" import from here and
 * render `<ResourcePeekHost>` (the one dynamic edge) when the answer is yes.
 *
 * `registry.ts` asserts these two lists agree, loudly, in dev.
 */

export const PEEK_KINDS = [
  "agent",
  "file",
  "note",
  "agent_app",
  "skill",
  "workflow",
  "message_template",
  "conversation",
  "flashcard",
  "canvas",
  "task",
  "dataset",
  "transcript",
  "agent_shortcut",
  "picklist",
  "workbook",
  "quiz",
  "sandbox",
  "project",
] as const;

const PEEK_KIND_SET: ReadonlySet<string> = new Set(PEEK_KINDS);

export function hasPeek(key: string): boolean {
  return PEEK_KIND_SET.has(key);
}

/**
 * Canonical entity token → the key its peek is REGISTERED under.
 *
 * The peek registry is keyed by the LEGACY resource-catalogue vocabulary
 * (`features/organizations/resource-catalogue.ts`), which predates canonical
 * entity tokens and does not match them for six kinds. A caller that asks
 * `hasPeek(token)` for one of those six silently loses the peek door — the
 * component exists, is registered, and is unreachable. Every entry was
 * verified against the table the peek actually queries:
 *
 *   app              → agent_app       (app.definition)
 *   structured_list  → picklist
 *   canvas_item      → canvas          (canvas.canvas_items)
 *   flashcard_data   → flashcard       (education.flashcard_data)
 *   sandbox_instance → sandbox         (public.sandbox_instances)
 *   quiz_session     → quiz            (education.quiz_sessions)
 *
 * This lives beside `hasPeek` rather than inside any one consumer because it
 * now has more than one: `EntityRef` and the agent builder's resource strip.
 * A second private copy is how this exact vocabulary gap cost six peeks their
 * Open door in the first place.
 *
 * The real fix is renaming the registry keys to the canonical tokens; that
 * also touches `resource-catalogue.ts` and the two organizations surfaces
 * keyed off `entry.key`, so it is tracked in
 * docs/handoffs/inventory-law-sweep.md. Until then this map must stay
 * complete — an unmapped mismatch is an invisible lost door.
 */
const PEEK_KEY_BY_TOKEN: Record<string, string> = {
  app: "agent_app",
  structured_list: "picklist",
  canvas_item: "canvas",
  flashcard_data: "flashcard",
  sandbox_instance: "sandbox",
  quiz_session: "quiz",
};

/** The peek registry key for a canonical token (identity when they agree). */
export function peekKeyForToken(token: string): string {
  return PEEK_KEY_BY_TOKEN[token] ?? token;
}
