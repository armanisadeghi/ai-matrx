/**
 * Round 26, item 1: edits made in the last ~2 s before a reload came back only with a toast, or not at all
 * (the save that landed meanwhile made the kept copy "older" than the stored page, so it was only offered).
 * Every change this member makes is kept on the device at once; a kept copy newer than what is stored
 * comes back silently.
 */
import type { SpaceDoc } from "../../contract";
import { contentKey } from "../content-key";
import { keepsChange, keepUnsaved, noteWritten, readUnsaved, restoreDecision, wroteVersion, type KeepStorage } from "../unsaved";

function memoryStorage(): KeepStorage {
  const map = new Map<string, string>();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}
const settings = { font: "default", smallText: false, fullWidth: false, locked: false } as SpaceDoc["settings"];
const body = (title: string, t: string) => ({ title, icon: null, cover: null, settings, blocks: [{ id: "a", type: "text", text: [{ text: t }] }] }) as unknown as Pick<SpaceDoc, "title" | "icon" | "cover" | "settings" | "blocks">;

describe("an edit survives a reload at any moment", () => {
  it("a change this member makes is kept before the room is joined or a host is elected", () => {
    expect(keepsChange({ local: true, host: false, keptLocally: false })).toBe(true);
    expect(keepsChange({ local: false, host: false, keptLocally: false })).toBe(false);
    expect(keepsChange({ local: false, host: true, keptLocally: false })).toBe(true);
  });

  it("a save that landed while later edits waited: the kept copy is newer and comes back silently", () => {
    const storage = memoryStorage();
    // v4 stored; the person types "Kickoff"; a save of it lands as v5 (written by this device)…
    noteWritten(storage, "p", 5);
    // …while "Kickoff notes" was typed against v4 and kept; then the tab reloads.
    keepUnsaved(storage, "p", body("Plan", "Kickoff notes"), 4);
    const copy = readUnsaved(storage, "p")!;
    const stored = { key: contentKey(body("Plan", "Kickoff")), version: 5 };
    expect(restoreDecision({ copy, stored, wrote: wroteVersion(storage, "p") })).toBe("apply");
  });

  it("the save sent as the tab closed landed: the copy is what is stored and is dropped", () => {
    const storage = memoryStorage();
    keepUnsaved(storage, "p", body("Plan", "Kickoff notes"), 4);
    const copy = readUnsaved(storage, "p")!;
    expect(restoreDecision({ copy, stored: { key: contentKey(body("Plan", "Kickoff notes")), version: 5 }, wrote: 4 })).toBe("forget");
  });

  it("someone else stored a newer version since: the copy is offered, never written over theirs", () => {
    const storage = memoryStorage();
    keepUnsaved(storage, "p", body("Plan", "mine"), 4);
    const copy = readUnsaved(storage, "p")!;
    expect(restoreDecision({ copy, stored: { key: contentKey(body("Plan", "theirs")), version: 6 }, wrote: 4 })).toBe("ask");
  });

  it("edited from what is stored: applied", () => {
    const storage = memoryStorage();
    keepUnsaved(storage, "p", body("Plan b", "x"), 5);
    expect(restoreDecision({ copy: readUnsaved(storage, "p")!, stored: { key: contentKey(body("Plan", "x")), version: 5 }, wrote: null })).toBe("apply");
  });
});
