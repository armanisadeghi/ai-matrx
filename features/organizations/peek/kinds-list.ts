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
 *
 * **KEYED BY CANONICAL ENTITY TOKEN** since 2026-08-09. It used to be keyed by
 * the legacy resource-catalogue vocabulary, which differed for six kinds
 * (`agent_app`/`picklist`/`canvas`/`flashcard`/`sandbox`/`quiz`), so a caller
 * asking `hasPeek(token)` for one of those silently lost the peek door — the
 * component existed, was registered, and was unreachable. That gap cost six
 * peeks their door once, was bridged by a `peekKeyForToken` map, and the map
 * itself then had to be extracted when a second consumer appeared. Deleted:
 * pass the canonical token and there is nothing to translate.
 *
 * The org resource CATALOGUE keeps its own `key` — that is a URL slug
 * (`/organizations/{orgId}/resources/{key}`, read back via `params.kind`), NOT
 * a peek key, and renaming it would break live links. `entry.token` is what
 * you hand to a peek.
 */

export const PEEK_KINDS = [
  "agent",
  "file",
  "note",
  "app",
  "skill",
  "workflow",
  "message_template",
  "conversation",
  "flashcard_data",
  "canvas_item",
  "task",
  "dataset",
  "transcript",
  "agent_shortcut",
  "structured_list",
  "workbook",
  "quiz_session",
  "sandbox_instance",
  "project",
] as const;

const PEEK_KIND_SET: ReadonlySet<string> = new Set(PEEK_KINDS);

export function hasPeek(key: string): boolean {
  return PEEK_KIND_SET.has(key);
}
