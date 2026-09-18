/**
 * THE DEFECT (owner, seen live 2026-09-14): binding a sandbox from a chat
 * control defaulted to the SURFACE-WIDE seed ("every chat here") — the
 * "Only this conversation" checkbox was unchecked by default, so a single pick
 * silently moved every future chat on the surface onto that box. The scope the
 * server actually persists is the conversation's own column,
 * `chat.conversation.sandbox_instance_id`.
 *
 * The production change that makes these fail: restore the old default — make
 * `resolveBindingScope` write the surface seed when `shareAcrossSurface` is
 * false (or drop the flag and always seed the surface, as `applyBinding` did).
 *
 * Proven red before green — see the task report.
 */

import { resolveBindingScope } from "@/lib/sandbox/binding-scope";

const CONVERSATION = "e4a1c7de-0b2a-4c77-9f61-2c0a5f2a1b33";
const SURFACE = "chat-route";

describe("resolveBindingScope", () => {
  it("binds THIS CONVERSATION when the user just picks a box", () => {
    const plan = resolveBindingScope({
      conversationId: CONVERSATION,
      sourceFeature: SURFACE,
      shareAcrossSurface: false,
    });
    expect(plan.scope).toBe("conversation");
    expect(plan.bindConversation).toBe(true);
    // THE defect: this was true by default and rewrote the user's seed.
    expect(plan.writeSurfaceSeed).toBe(false);
    expect(plan.blockedReason).toBeNull();
  });

  it("does NOT need a surface to bind a conversation", () => {
    // The seed key is unknown (the conversation record has not loaded yet) and
    // a conversation-scoped bind must still go through — it writes a column,
    // not the preference map.
    const plan = resolveBindingScope({
      conversationId: CONVERSATION,
      sourceFeature: null,
      shareAcrossSurface: false,
    });
    expect(plan.blockedReason).toBeNull();
    expect(plan.bindConversation).toBe(true);
    expect(plan.writeSurfaceSeed).toBe(false);
  });

  it("seeds the surface only on the explicit opt-in — and still binds this chat", () => {
    const plan = resolveBindingScope({
      conversationId: CONVERSATION,
      sourceFeature: SURFACE,
      shareAcrossSurface: true,
    });
    expect(plan.scope).toBe("surface");
    expect(plan.writeSurfaceSeed).toBe(true);
    // A seed alone would leave the chat you are standing in unbound until its
    // next turn promoted it — the client/server disagreement this prevents.
    expect(plan.bindConversation).toBe(true);
  });

  it("refuses the opt-in out loud when the surface is unknown", () => {
    const plan = resolveBindingScope({
      conversationId: CONVERSATION,
      sourceFeature: null,
      shareAcrossSurface: true,
    });
    expect(plan.writeSurfaceSeed).toBe(false);
    expect(plan.bindConversation).toBe(false);
    expect(plan.blockedReason).toBe(
      "This conversation has no surface yet — try again in a moment.",
    );
  });

  it("falls back to the seed only when there is no conversation to bind", () => {
    const plan = resolveBindingScope({
      conversationId: null,
      sourceFeature: SURFACE,
      shareAcrossSurface: false,
    });
    expect(plan.scope).toBe("surface");
    expect(plan.writeSurfaceSeed).toBe(true);
    expect(plan.bindConversation).toBe(false);
  });

  it("refuses out loud when there is neither a conversation nor a surface", () => {
    const plan = resolveBindingScope({
      conversationId: null,
      sourceFeature: null,
      shareAcrossSurface: false,
    });
    expect(plan.writeSurfaceSeed).toBe(false);
    expect(plan.bindConversation).toBe(false);
    expect(plan.blockedReason).toBe(
      "There is no conversation or surface to attach this box to yet.",
    );
  });

  it("names the scope it wrote in the toast copy", () => {
    const own = resolveBindingScope({
      conversationId: CONVERSATION,
      sourceFeature: SURFACE,
      shareAcrossSurface: false,
    });
    const shared = resolveBindingScope({
      conversationId: CONVERSATION,
      sourceFeature: SURFACE,
      shareAcrossSurface: true,
    });
    expect(own.attachMessage).toBe("Sandbox attached to this conversation");
    expect(shared.attachMessage).toBe(
      "Sandbox attached to this chat and every new chat here",
    );
    // Never the other way round — the old copy said "bound for this surface"
    // on the default path.
    expect(own.attachMessage).not.toContain("every new chat");
  });
});
