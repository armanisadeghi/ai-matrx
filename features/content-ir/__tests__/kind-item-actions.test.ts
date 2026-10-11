/**
 * run_shortcut + save_item_state: what a shape can make happen on its own item.
 * The handlers are exercised through their definitions with a fake context —
 * the same seam the runner binds — so the contract a component relies on is
 * what is pinned: window vs background, saveAs lands in item state even via
 * the persistence seam, unhosted items refuse with a sentence, bad input is an
 * envelope (never a throw).
 */
import { KIND_ACTIONS } from "../react/actions/kind-action-provider";
import type {
  KindActionContext,
  KindShortcutRunResult,
} from "../react/actions/kind-action-context";
import { parseRunShortcutInput } from "../react/actions/handlers/run-shortcut";
import {
  imageFileIdsOf,
  stableImageState,
  withImageSources,
} from "../react/db-component/item-state-media";
import { imageRefOfMedia } from "../react/actions/useKindActionRunner";
import { makeBlobUrlMapper } from "../sandbox/runtime/blob-urls";

function handler(key: string) {
  const def = KIND_ACTIONS.find((d) => d.key === key);
  if (!def) throw new Error(`no action ${key}`);
  return def.handler;
}

function ctx(over: Partial<KindActionContext> = {}): KindActionContext & { saved: Record<string, unknown> } {
  const saved: Record<string, unknown> = {};
  return {
    saved,
    launchAgent: async () => ({ conversationId: "c" }) as never,
    userId: "u",
    openShortcut: async () => ({ conversationId: "window-conv" }),
    runShortcut: async (_req, onResult) => {
      const result: KindShortcutRunResult = { ok: true, data: { brief: "A warm flat lay" } };
      onResult?.(result);
      return result;
    },
    itemState: {
      hosted: true,
      read: () => saved,
      patch: (p) => Object.assign(saved, p),
    },
    openFile: (fileId) => Object.assign(saved, { opened: fileId }),
    shareFile: (fileId, name) => Object.assign(saved, { shared: `${fileId}:${name}` }),
    ...over,
  };
}

describe("run_shortcut", () => {
  it("opens in a window by default and saves nothing", async () => {
    const c = ctx();
    const out = await handler("run_shortcut")({ shortcutId: "s1", scope: { selection: "idea" } }, c);
    expect(out).toEqual({ ok: true, result: { conversationId: "window-conv" } });
    expect(c.saved).toEqual({});
  });

  it("with saveAs runs in the background and the host saves the product onto the item", async () => {
    const c = ctx();
    const out = await handler("run_shortcut")({ shortcutId: "s1", saveAs: "idea_3_brief" }, c);
    expect(out).toEqual({ ok: true, result: { data: { brief: "A warm flat lay" }, saved: true } });
    expect(c.saved).toEqual({ idea_3_brief: { brief: "A warm flat lay" } });
  });

  it("refuses saveAs where the item has no record, with a sentence", async () => {
    const c = ctx({ itemState: { hosted: false, read: () => ({}), patch: () => undefined } });
    const out = await handler("run_shortcut")({ shortcutId: "s1", saveAs: "k" }, c);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/Open this from its chat/);
  });

  it("a failed run saves nothing and returns its reason", async () => {
    const c = ctx({ runShortcut: async () => ({ ok: false, data: null, error: "No image came back." }) });
    const out = await handler("run_shortcut")({ shortcutId: "s1", saveAs: "k", expect: "image" }, c);
    expect(out).toEqual({ ok: false, error: "No image came back." });
    expect(c.saved).toEqual({});
  });

  it("validates input as envelopes", () => {
    expect(parseRunShortcutInput(null)).toHaveProperty("error");
    expect(parseRunShortcutInput({ shortcutId: "" })).toHaveProperty("error");
    expect(parseRunShortcutInput({ shortcutId: "s", saveAs: "__proto__" })).toHaveProperty("error");
    expect(parseRunShortcutInput({ shortcutId: "s", saveAs: "a/b" })).toHaveProperty("error");
    expect(parseRunShortcutInput({ shortcutId: "s", saveAs: "k", display: "window" })).toHaveProperty("error");
    expect(parseRunShortcutInput({ shortcutId: "s", saveAs: "k", expect: "image" })).toMatchObject({
      display: "background",
      expect: "image",
      saveAs: "k",
    });
  });
});

describe("save_item_state", () => {
  it("merge-patches the item", async () => {
    const c = ctx();
    await handler("save_item_state")({ patch: { picked: [1, 3] } }, c);
    expect(c.saved).toEqual({ picked: [1, 3] });
  });

  it("refuses empty, forbidden, oversized and unhosted patches", async () => {
    const h = handler("save_item_state");
    expect((await h({ patch: {} }, ctx())).ok).toBe(false);
    expect((await h({ patch: JSON.parse('{"__proto__": 1}') }, ctx())).ok).toBe(false);
    expect((await h({ patch: { big: "x".repeat(70_000) } }, ctx())).ok).toBe(false);
    const unhosted = ctx({ itemState: null });
    expect((await h({ patch: { a: 1 } }, unhosted)).ok).toBe(false);
  });
});

describe("saved images get a displayable src", () => {
  const ref = { file_id: "f1", mime_type: "image/png", width: 10, height: 10, organization_id: null };
  const state = { idea_3_image: ref, nested: { list: [{ ...ref, file_id: "f2" }] }, note: "keep" };

  it("finds every image ref, nested", () => {
    expect(imageFileIdsOf(state)).toEqual(["f1", "f2"]);
    expect(imageFileIdsOf({ doc: { file_id: "x", mime_type: "application/pdf" } })).toEqual([]);
  });

  it("frame mode hands over the Blob; a failure carries a sentence; unloaded is null", () => {
    const blob = new Blob(["png"], { type: "image/png" });
    const sources = new Map([
      ["f1", { blob }],
      ["f2", { error: "This image couldn't be loaded." }],
    ]);
    const out = withImageSources(state, sources, "blob") as Record<string, any>;
    expect(out.idea_3_image.src).toBe(blob);
    expect(out.nested.list[0]).toMatchObject({ src: null, src_error: "This image couldn't be loaded." });
    expect(out.note).toBe("keep");
    expect((withImageSources(state, new Map(), "blob") as any).idea_3_image.src).toBeNull();
  });
});

describe("the image and identity seams", () => {
  it("imageRefOfMedia takes the first image block with the run's organization", () => {
    const media = [
      { kind: "audio", fileId: "a1", mimeType: "audio/mpeg" },
      { kind: "image", fileId: "i1", mimeType: "image/png", width: 1024, height: 1536 },
    ];
    expect(imageRefOfMedia(media, "org-1")).toEqual({
      file_id: "i1",
      mime_type: "image/png",
      width: 1024,
      height: 1536,
      organization_id: "org-1",
    });
    expect(imageRefOfMedia([], "org-1")).toBeNull();
    expect(imageRefOfMedia("not media", null)).toBeNull();
  });

  it("a saved product too large for the item is returned, not saved", async () => {
    const c = ctx({
      runShortcut: async (_req, onResult) => {
        const result: KindShortcutRunResult = { ok: true, data: "x".repeat(70_000) };
        onResult?.(result);
        return result;
      },
    });
    const out = await handler("run_shortcut")({ shortcutId: "s1", saveAs: "k", expect: "text" }, c);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.result).toMatchObject({ saved: false });
    expect(c.saved).toEqual({});
  });

  it("stableImageState keeps one identity for the same state and sources", () => {
    const sources = new Map();
    const a = stableImageState({ k: 1 }, sources, "url");
    const b = stableImageState({ k: 1 }, sources, "url");
    expect(a).toBe(b);
    expect(stableImageState({ k: 2 }, sources, "url")).not.toBe(a);
    expect(stableImageState({ k: 1 }, new Map(), "url")).not.toBe(a);
  });

  it("the frame turns handed-over Blobs into one blob: URL each", () => {
    let n = 0;
    const map = makeBlobUrlMapper(() => `blob:frame/${++n}`);
    const blob = new Blob(["png"], { type: "image/png" });
    const state = { idea_3_image: { file_id: "f", src: blob }, list: [{ src: blob }], note: "keep" };
    const out = map(state) as any;
    expect(out.idea_3_image.src).toBe("blob:frame/1");
    expect(out.list[0].src).toBe("blob:frame/1");
    expect(out.note).toBe("keep");
    expect((map(state) as any).idea_3_image.src).toBe("blob:frame/1");
  });
});

describe("open_file / share_file", () => {
  it("hand a saved file to the canonical preview and share windows", async () => {
    const c = ctx();
    expect(await handler("open_file")({ file_id: "f9", name: "Two envelopes" }, c)).toEqual({ ok: true, result: { opened: true } });
    expect(await handler("share_file")({ file_id: "f9", name: "Two envelopes" }, c)).toEqual({ ok: true, result: { opened: true } });
    expect(c.saved).toMatchObject({ opened: "f9", shared: "f9:Two envelopes" });
  });

  it("refuse without a file id, with a sentence", async () => {
    const out = await handler("open_file")({ name: "x" }, ctx());
    expect(out).toEqual({ ok: false, error: "This needs a saved file." });
  });
});
