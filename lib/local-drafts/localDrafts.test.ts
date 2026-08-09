// Guard for D132's remainder (a): work snapshotted before a forced reload has
// to actually come back — to the RIGHT account, and only when it still differs
// from what was saved.

import {
  captureDrafts,
  discardDraft,
  getDraft,
  listDrafts,
  registerDraftSource,
} from "./localDrafts";

const USER_A = "user-a";
const USER_B = "user-b";

function unsaved(entityId: string, content: string, ownerId: string) {
  return {
    namespace: "note",
    entityId,
    ownerId,
    label: `Note ${entityId}`,
    content,
  };
}

describe("local drafts", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("captures unsaved work and offers it back to the same account", () => {
    const stop = registerDraftSource("note", () => [
      unsaved("n1", "fourteen hours of edits", USER_A),
    ]);

    const captured = captureDrafts("auth-identity-drift");
    expect(captured).toHaveLength(1);

    const draft = getDraft("note", "n1", USER_A);
    expect(draft?.content).toBe("fourteen hours of edits");
    expect(draft?.reason).toBe("auth-identity-drift");
    stop();
  });

  it("NEVER offers a draft to a different account", () => {
    const stop = registerDraftSource("note", () => [
      unsaved("n1", "written while signed in as A", USER_A),
    ]);
    captureDrafts("auth-identity-drift");
    stop();

    // The exact D132 shape: the cookie rotated, the tab reloaded as someone
    // else. That someone else must not see A's text.
    expect(getDraft("note", "n1", USER_B)).toBeNull();
    expect(listDrafts("note", USER_B)).toHaveLength(0);
    expect(listDrafts("note", null)).toHaveLength(0);
    expect(getDraft("note", "n1", USER_A)).not.toBeNull();
  });

  it("survives the capture → reload → read round trip via storage", () => {
    const stop = registerDraftSource("note", () => [
      unsaved("n1", "buffer only", USER_A),
    ]);
    captureDrafts("note-save-failures");
    stop();

    // A reload drops every in-memory source; storage is all that is left.
    expect(listDrafts("note", USER_A).map((d) => d.content)).toEqual([
      "buffer only",
    ]);
  });

  it("keeps the newest snapshot per entity and discards on request", () => {
    let content = "first";
    const stop = registerDraftSource("note", () => [
      unsaved("n1", content, USER_A),
    ]);
    captureDrafts("unload");
    content = "second";
    captureDrafts("unload");
    stop();

    expect(listDrafts("note", USER_A)).toHaveLength(1);
    expect(getDraft("note", "n1", USER_A)?.content).toBe("second");

    discardDraft("note", "n1");
    expect(getDraft("note", "n1", USER_A)).toBeNull();
  });

  it("captures nothing when nothing is unsaved", () => {
    const stop = registerDraftSource("note", () => []);
    expect(captureDrafts("unload")).toHaveLength(0);
    stop();
  });

  it("does not let one throwing source lose another source's work", () => {
    const stopBad = registerDraftSource("broken", () => {
      throw new Error("collector blew up");
    });
    const stopGood = registerDraftSource("note", () => [
      unsaved("n1", "still rescued", USER_A),
    ]);

    expect(captureDrafts("unload")).toHaveLength(1);
    expect(getDraft("note", "n1", USER_A)?.content).toBe("still rescued");
    stopBad();
    stopGood();
  });

  it("drops drafts older than the TTL", () => {
    const stop = registerDraftSource("note", () => [
      unsaved("n1", "ancient", USER_A),
    ]);
    captureDrafts("unload");
    stop();

    // Rewrite the stored capture time to 8 days ago (TTL is 7).
    const raw = JSON.parse(
      window.localStorage.getItem("matrx.local-drafts.v1") ?? "[]",
    ) as Array<Record<string, unknown>>;
    raw[0].capturedAt = Date.now() - 8 * 24 * 60 * 60 * 1000;
    window.localStorage.setItem("matrx.local-drafts.v1", JSON.stringify(raw));

    expect(listDrafts("note", USER_A)).toHaveLength(0);
  });
});
