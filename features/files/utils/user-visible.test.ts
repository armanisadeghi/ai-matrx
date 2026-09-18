/**
 * Fast unit cover for the mirrored visibility rule. The FORCING function is
 * the live guard `user-visible-parity.ts` (which compares these same answers
 * to the database's own functions); this file only keeps the obvious
 * regressions from reaching that guard.
 */
import {
  isUserVisibleFilePath,
  isUserVisibleFolderPath,
  isUserVisibleFileRow,
} from "./user-visible";

describe("isUserVisibleFilePath", () => {
  it.each([
    ["My Files/report.pdf", true],
    ["Inbox/note.md", true],
    ["coding-sessions/a/log.jsonl", true],
    ["tool-images/1/v/t.jpg", true],
    // FastFire is a registered machine-written prefix, NOT a hidden one
    // (SPEC-SERVER §1.4 S18) — the browser used to hide it and the daemon
    // synced it, which is the disagreement this rule deleted.
    ["FastFire", true],
    ["FastFire/sessions/clip.wav", true],
    ["system-files", false],
    ["system-files/fastfire/sessions/a.wav", false],
    ["generations", false],
    ["generations/img.png", false],
    [".matrx-tmp", false],
    [".matrx-tmp/upload.part", false],
    ["/system-files/a", false],
    ["system-files-not-really/a.txt", true],
    [".matrx-tmpish/a.txt", true],
  ])("%s → %s", (path, expected) => {
    expect(isUserVisibleFilePath(path)).toBe(expected);
  });

  it("treats null and undefined as not visible", () => {
    expect(isUserVisibleFilePath(null)).toBe(false);
    expect(isUserVisibleFilePath(undefined)).toBe(false);
  });
});

describe("isUserVisibleFolderPath", () => {
  it("mirrors NOT public.is_system_path — .matrx-tmp folders stay in scope", () => {
    expect(isUserVisibleFolderPath("system-files")).toBe(false);
    expect(isUserVisibleFolderPath("generations/x")).toBe(false);
    expect(isUserVisibleFolderPath(".matrx-tmp")).toBe(true);
    expect(isUserVisibleFolderPath("My Files")).toBe(true);
  });
});

describe("isUserVisibleFileRow", () => {
  const base = {
    file_path: "My Files/a.txt",
    parent_file_id: null,
    derivation_kind: null,
  };
  it("admits a plain owned row", () => {
    expect(isUserVisibleFileRow(base)).toBe(true);
  });
  it("rejects a derivative by either column", () => {
    expect(isUserVisibleFileRow({ ...base, parent_file_id: "x" })).toBe(false);
    expect(isUserVisibleFileRow({ ...base, derivation_kind: "variant" })).toBe(
      false,
    );
  });
  it("rejects a system path", () => {
    expect(
      isUserVisibleFileRow({ ...base, file_path: "system-files/a" }),
    ).toBe(false);
  });
});
