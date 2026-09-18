/**
 * WHICH SCOPE does binding a box from a chat control write to?
 *
 * THE RULE (owner, 2026-09-14): binding a box from a chat control binds THIS
 * CONVERSATION. The shared, surface-wide default ("every new chat here") is an
 * explicit OPT-IN, never what happens when the user just picks a box. The
 * conversation binding is the one the server actually reads —
 * `chat.conversation.sandbox_instance_id` (written by the
 * `setConversationSandbox` thunk) — so the default scope and the persisted
 * truth are now the same thing.
 *
 * Until 2026-09-14 this was inverted: the panel's checkbox was "Only this
 * conversation", unchecked by default, so every pick from the chat control
 * silently rewrote the user's `activeAgentSandboxBySurface` seed and moved
 * every future chat on that surface onto the box.
 *
 * This module owns ONLY the decision. The callers own the dispatches:
 *   - `bindConversation`  → `setConversationSandbox({ conversationId, ref })`
 *   - `writeSurfaceSeed`  → `setPreference` on `activeAgentSandboxBySurface`
 * See `lib/sandbox/active-binding.ts#getEffectiveSandboxRef` for how the two
 * are read back (conversation binding first, surface seed only as the seed).
 */

export type SandboxBindingScope = "conversation" | "surface";

export type SandboxBindingPlan = {
  /** What the user will be told this pick did. */
  scope: SandboxBindingScope;
  /** Write `chat.conversation.sandbox_instance_id` for this conversation. */
  bindConversation: boolean;
  /** Write the per-surface seed every FUTURE chat on this surface inherits. */
  writeSurfaceSeed: boolean;
  /**
   * Non-null when the pick cannot be applied at all. The UI shows this and
   * dispatches nothing — never a silent no-op.
   */
  blockedReason: string | null;
  /** Toast copy that says exactly what happened. */
  attachMessage: string;
  detachMessage: string;
};

const NO_SURFACE_YET =
  "This conversation has no surface yet — try again in a moment.";
const NOTHING_TO_BIND =
  "There is no conversation or surface to attach this box to yet.";

/**
 * @param conversationId  the chat being bound, or null when there is none.
 * @param sourceFeature   the surface the conversation belongs to; the key of
 *                        the per-surface seed map. Null until the conversation
 *                        record has loaded.
 * @param shareAcrossSurface  the explicit opt-in: ALSO make this box the
 *                        default for new chats on this surface.
 */
export function resolveBindingScope({
  conversationId,
  sourceFeature,
  shareAcrossSurface,
}: {
  conversationId: string | null;
  sourceFeature: string | null;
  shareAcrossSurface: boolean;
}): SandboxBindingPlan {
  const blocked = (reason: string): SandboxBindingPlan => ({
    scope: "conversation",
    bindConversation: false,
    writeSurfaceSeed: false,
    blockedReason: reason,
    attachMessage: "",
    detachMessage: "",
  });

  if (!conversationId) {
    // No chat to bind: the only thing a pick can write is the seed future
    // chats on this surface will inherit.
    if (!sourceFeature) return blocked(NOTHING_TO_BIND);
    return {
      scope: "surface",
      bindConversation: false,
      writeSurfaceSeed: true,
      blockedReason: null,
      attachMessage: "Sandbox set as the default for new chats here",
      detachMessage: "Sandbox cleared as the default for new chats here",
    };
  }

  if (shareAcrossSurface) {
    // The opt-in still binds THIS conversation — a seed alone would leave the
    // chat you are standing in unbound until its next turn promoted it.
    if (!sourceFeature) return blocked(NO_SURFACE_YET);
    return {
      scope: "surface",
      bindConversation: true,
      writeSurfaceSeed: true,
      blockedReason: null,
      attachMessage: "Sandbox attached to this chat and every new chat here",
      detachMessage: "Sandbox detached from this chat and every new chat here",
    };
  }

  return {
    scope: "conversation",
    bindConversation: true,
    writeSurfaceSeed: false,
    blockedReason: null,
    attachMessage: "Sandbox attached to this conversation",
    detachMessage: "Sandbox detached from this conversation",
  };
}
