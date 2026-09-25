/**
 * Fast unit cover for the mirrored visibility rule. The FORCING function is
 * the live guard `user-visible-parity.ts` (which compares these same answers
 * to the database's own functions); this file only keeps the obvious
 * regressions from reaching that guard.
 */
import {
  isRecentActivityFile,
  isRecentActivityPath,
  isUserVisibleFilePath,
  isUserVisibleFolderPath,
  isUserVisibleFileRow,
} from "./user-visible";

describe("isUserVisibleFilePath", () => {
  it.each([
    ["My Files/report.pdf", true],
    ["Inbox/note.md", true],
    // Machine namespaces: only machines write here; never the person's files
    // (Arman, 2026-09-24).
    ["coding-sessions/a/log.jsonl", false],
    ["coding-sessions", false],
    ["tool-images/1/v/t.jpg", false],
    ["/coding-sessions/a", false],
    ["My Files/coding-sessions/a", true],
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
    expect(isUserVisibleFolderPath("coding-sessions/claude_code")).toBe(false);
    expect(isUserVisibleFolderPath("tool-images")).toBe(false);
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
  it("rejects a machine-produced artifact wherever it lands", () => {
    expect(
      isUserVisibleFileRow({
        ...base,
        artifact_kind: "coding_session_artifact",
      }),
    ).toBe(false);
  });
  it("rejects a system path", () => {
    expect(
      isUserVisibleFileRow({ ...base, file_path: "system-files/a" }),
    ).toBe(false);
  });
});

describe("Recents — mirror of files.is_recent_activity", () => {
  const person = { filePath: "My Files/report.pdf", originDeviceId: null };
  it("admits a file the person uploaded in the app", () => {
    expect(isRecentActivityFile(person)).toBe(true);
  });
  it("never admits a file a device (desktop sync) wrote", () => {
    expect(isRecentActivityFile({ ...person, originDeviceId: "dev-1" })).toBe(
      false,
    );
  });
  it("never admits a machine namespace or machine output under the person's roots", () => {
    for (const filePath of [
      "coding-sessions/claude_code/s/log.md",
      "tool-images/1/shot.png",
      "Images/Generated/cat.png",
      "Generated/a.png",
      "Agent Apps/blocks/b.png",
      "Images/agent-blocks/c.png",
      "Transcripts/Recordings/x.m4a",
      "FastFire/sessions/s.wav",
      "FastFire/responses/r.wav",
      "system-files/variants/x.png",
    ])
      expect(isRecentActivityFile({ ...person, filePath })).toBe(false);
  });
  it("matches whole segments, not prefixes", () => {
    expect(isRecentActivityPath("Images/GeneratedX/cat.png")).toBe(true);
    expect(isRecentActivityPath("FastFire/decks/d.json")).toBe(true);
  });
  it("never admits a derivative", () => {
    expect(
      isRecentActivityFile({ ...person, derivationKind: "variant" }),
    ).toBe(false);
  });
});
