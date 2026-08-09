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
