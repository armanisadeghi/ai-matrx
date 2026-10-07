/**
 * Round 27, D1 (silent data loss): a copy kept on this device was never applied when the page became
 * ready in pieces — the editor reported ready while edit access was still loading, the one check ran,
 * found no edit access, marked the page done and never looked again. The copy stayed on the device,
 * unapplied and unforgotten, and the old title showed with no word.
 *
 * This renders the real restore wiring (useRestoreKept, the hook SpacePage mounts) with a pending copy
 * and readiness arriving late, in the orders the live page produces.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { SpaceDoc } from "../../contract";
import { contentKey } from "../content-key";
import { keepUnsaved, readUnsaved, type KeepStorage, type UnsavedCopy } from "../unsaved";
import { useRestoreKept, type RestoreKeptArgs } from "../useRestoreKept";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function memoryStorage(): KeepStorage {
  const map = new Map<string, string>();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}
const settings = { font: "default", smallText: false, fullWidth: false, locked: false } as SpaceDoc["settings"];
const body = (title: string) => ({ title, icon: null, cover: null, settings, blocks: [{ id: "a", type: "text", text: [{ text: "hello" }] }] }) as unknown as Pick<SpaceDoc, "title" | "icon" | "cover" | "settings" | "blocks">;

type Props = Omit<RestoreKeptArgs, "apply" | "offer" | "storage">;

function harness(storage: KeepStorage) {
  const applied: UnsavedCopy[] = [];
  const offered: { copy: UnsavedCopy; discard: () => void }[] = [];
  const hook: { awaiting: () => boolean } = { awaiting: () => false };
  function Probe(props: Props) {
    hook.awaiting = useRestoreKept({ ...props, storage: () => storage, apply: (c) => applied.push(c), offer: (copy, a) => offered.push({ copy, discard: a.discard }) }).awaiting;
    return null;
  }
  const el = document.createElement("div");
  let root: Root;
  act(() => {
    root = createRoot(el);
  });
  const render = (p: Props) =>
    act(() => {
      root.render(createElement(Probe, p));
    });
  const tick = () =>
    act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  return { applied, offered, hook, render, tick, unmount: () => act(() => root.unmount()) };
}

const stored = { key: contentKey(body(" first")), version: 2, archived: false };
const editor = { id: "editor" };

describe("a kept copy is never written over before its decision", () => {
  it("awaiting while undecided (the page holds its keeps and saves), released once applied", async () => {
    const storage = memoryStorage();
    keepUnsaved(storage, "p", body(" first offline"), 2);
    const h = harness(storage);
    await h.render({ spaceId: "p", editor: null, canEdit: false, stored: () => stored });
    expect(h.hook.awaiting()).toBe(true);
    await h.render({ spaceId: "p", editor, canEdit: false, stored: () => stored });
    await h.tick();
    expect(h.hook.awaiting()).toBe(true);
    await h.render({ spaceId: "p", editor, canEdit: true, stored: () => stored });
    await h.tick();
    expect(h.hook.awaiting()).toBe(false);
    expect(h.applied).toHaveLength(1);
    h.unmount();
  });

  it("no copy when the page opened: never awaiting, even after this page keeps its own", async () => {
    const storage = memoryStorage();
    const h = harness(storage);
    await h.render({ spaceId: "p", editor: null, canEdit: true, stored: () => stored });
    expect(h.hook.awaiting()).toBe(false);
    keepUnsaved(storage, "p", body(" first typed"), 2);
    expect(h.hook.awaiting()).toBe(false);
    await h.render({ spaceId: "p", editor, canEdit: true, stored: () => stored });
    await h.tick();
    expect(h.applied).toHaveLength(0);
    h.unmount();
  });
});

describe("a kept copy is applied once the page is ready, whatever order readiness arrives in", () => {
  it("edit access answers after the editor is ready (the live order of D1): the copy is applied", async () => {
    const storage = memoryStorage();
    keepUnsaved(storage, "p", body(" first offline"), 2);
    const h = harness(storage);
    // Editor ready, access still loading.
    await h.render({ spaceId: "p", editor, canEdit: false, stored: () => stored });
    await h.tick();
    expect(h.applied).toHaveLength(0);
    // Access answers "edit".
    await h.render({ spaceId: "p", editor, canEdit: true, stored: () => stored });
    await h.tick();
    expect(h.applied.map((c) => c.doc.title)).toEqual([" first offline"]);
    // Applied once — later renders never re-apply.
    await h.render({ spaceId: "p", editor, canEdit: true, stored: () => stored });
    await h.tick();
    expect(h.applied).toHaveLength(1);
    h.unmount();
  });

  it("the stored version is not known when the editor is ready: decided once it is", async () => {
    const storage = memoryStorage();
    keepUnsaved(storage, "p", body(" first offline"), 2);
    const h = harness(storage);
    let known: typeof stored | null = null;
    await h.render({ spaceId: "p", editor, canEdit: true, stored: () => known });
    await h.tick();
    expect(h.applied).toHaveLength(0);
    known = stored;
    await h.render({ spaceId: "p", editor: { id: "editor-2" }, canEdit: true, stored: () => known });
    await h.tick();
    expect(h.applied).toHaveLength(1);
    h.unmount();
  });

  it("someone else stored a newer version: offered, and Discard forgets the copy", async () => {
    const storage = memoryStorage();
    keepUnsaved(storage, "p", body(" first offline"), 2);
    const h = harness(storage);
    await h.render({ spaceId: "p", editor, canEdit: true, stored: () => ({ ...stored, version: 5 }) });
    await h.tick();
    expect(h.applied).toHaveLength(0);
    expect(h.offered).toHaveLength(1);
    h.offered[0].discard();
    expect(readUnsaved(storage, "p")).toBeNull();
    h.unmount();
  });

  it("the copy is what is stored: forgotten even before edit access answers", async () => {
    const storage = memoryStorage();
    keepUnsaved(storage, "p", body(" first"), 2);
    const h = harness(storage);
    await h.render({ spaceId: "p", editor, canEdit: false, stored: () => stored });
    await h.tick();
    expect(readUnsaved(storage, "p")).toBeNull();
    expect(h.applied).toHaveLength(0);
    h.unmount();
  });

  it("a viewer never applies; the copy stays on the device", async () => {
    const storage = memoryStorage();
    keepUnsaved(storage, "p", body(" first offline"), 2);
    const h = harness(storage);
    await h.render({ spaceId: "p", editor, canEdit: false, stored: () => stored });
    await h.tick();
    expect(h.applied).toHaveLength(0);
    expect(readUnsaved(storage, "p")).not.toBeNull();
    h.unmount();
  });
});
