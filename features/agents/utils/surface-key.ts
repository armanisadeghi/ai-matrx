/**
 * Surface keys — what the `<prefix>:<id>` string after the colon actually IS.
 *
 * A surface key identifies the UI surface that launched a run. Every one is
 * built inline as a template literal, and the id it embeds is NOT always an
 * agent: `agent-run:<agentId>` and `chat-assistant:<conversationId>` and
 * `code-editor:<shortcutId>` and `research-context:<topicId>` all look
 * identical to a string parser.
 *
 * THE TRAP: "take everything after the first colon and treat it as an agent id"
 * is wrong for 17 of the 22 prefixes in use, and a uuid-shape check does NOT
 * catch it — a shortcut id and an agent id are both uuids. Shipping that
 * produces `/agents/<shortcutId>`: a door that opens on nothing while looking
 * like it worked, which the doctrine ranks as worse than no door. This module
 * exists because that exact bug shipped in `CreatorHubWindow` on 2026-08-09.
 *
 * So the mapping is declared, not inferred. An unknown prefix returns null —
 * no door — because guessing is what caused the defect.
 *
 * Adding a surface? Add its prefix here in the same change. A prefix that is
 * absent is not broken, it simply offers no door until someone says what its
 * id means.
 */

import { isUuidValue } from "@/components/official/entity-ref/doors";

/**
 * Prefix → the canonical entity token its id refers to. Derived by reading
 * every `surfaceKey:` construction site in the repo, not by pattern-matching
 * the prefix name.
 */
const TOKEN_BY_SURFACE_PREFIX: Record<string, string> = {
  // Agent ids
  "agent-run": "agent",
  agent: "agent",
  "chat-route": "agent",
  "cx-chat": "agent",
  "kind-request": "agent",

  // Conversation ids
  "chat-assistant": "conversation",
  "code-editor-compact": "conversation",
  "code-editor-modal": "conversation",
  "creator-widget-tester": "conversation",

  // Agent-shortcut ids
  shortcut: "agent_shortcut",

  // Agent-app ids (the `agent-app:<slug>` form is filtered out by the uuid
  // check below — a slug is a real identifier but not one `hrefFor` takes).
  "agent-app": "app",
};

export interface SurfaceKeyEntity {
  /** Canonical entity token — feed straight to `EntityRef` / doors. */
  token: string;
  /** The id embedded in the key. Always uuid-shaped. */
  id: string;
}

/**
 * Resolve the record a surface key points at, or null when the key names
 * nothing openable (unknown prefix, non-uuid id, no colon).
 *
 * Note `code-editor:` and `code-editor-modal:`/`code-editor-compact:` are
 * ambiguous at the CONSTRUCTION site — the same prefix is built with a
 * shortcut id in one file and a conversation id in another. Only the forms with
 * a single consistent meaning are listed above; `code-editor` itself is
 * deliberately absent rather than guessed.
 */
export function entityFromSurfaceKey(
  surfaceKey: string | null | undefined,
): SurfaceKeyEntity | null {
  if (!surfaceKey) return null;
  const colon = surfaceKey.indexOf(":");
  if (colon <= 0) return null;

  const token = TOKEN_BY_SURFACE_PREFIX[surfaceKey.slice(0, colon)];
  if (!token) return null;

  const id = surfaceKey.slice(colon + 1);
  // Keys like `${sourceFeature}:bound-agent:${uuid}` leave a second segment in
  // place; those are not a bare id and must not be linked.
  return isUuidValue(id) ? { token, id } : null;
}
