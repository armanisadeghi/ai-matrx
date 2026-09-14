/**
 * THE STALE DRAFT BANNER (2026-09-14): a one-hour-old browser draft was
 * offered as "unsaved changes" after dozens of later saves had long superseded
 * it. A draft is unsaved work ONLY when its text is in neither the note nor
 * any version in its history.
 */
import { isDraftAlreadySaved } from "./NoteDraftRecoveryBanner";

jest.mock("@/features/text-diff/service/versionService", () => ({
  fetchVersions: jest.fn(),
}));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: jest.fn() }));
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn() } }));
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({ confirm: jest.fn() }));
jest.mock("@/components/agent-copy/clipboard", () => ({ writeClipboard: jest.fn() }));
jest.mock("@/features/overlays/openers/diffViewerWindow", () => ({ useOpenDiffViewerWindow: jest.fn() }));
jest.mock("@ai-matrx/kit/drafts", () => ({ getDraftsVersion: jest.fn(), subscribeDrafts: jest.fn() }));
jest.mock("@/utils/datetime", () => ({ formatRelativeTime: jest.fn() }));
jest.mock("../utils/notesDrafts", () => ({ discardNoteDraft: jest.fn(), getNoteDraft: jest.fn() }));
jest.mock("../redux/selectors", () => ({ selectNoteContent: jest.fn(), selectNoteFetchStatus: jest.fn() }));

const T = Date.parse("2026-09-14T10:00:00.000Z");
const draft = { entityId: "note-1", content: "an old edit", capturedAt: T };
const at = (offsetMs: number) => new Date(T + offsetMs).toISOString();

describe("isDraftAlreadySaved", () => {
  it("is saved when the draft equals the note itself", async () => {
    const versions = jest.fn(async () => []);
    await expect(isDraftAlreadySaved(draft, "an old edit", versions)).resolves.toBe(true);
    expect(versions).not.toHaveBeenCalled();
  });

  it("is saved when ANY version in history holds the draft's text — the superseded-edit case", async () => {
    const versions = jest.fn(async () => [
      { content: "first", created_at: at(-3_600_000) },
      { content: "an old edit", created_at: at(-2_000) },
      { content: "the latest, an hour of edits later", created_at: at(3_600_000) },
    ]);
    await expect(
      isDraftAlreadySaved(draft, "the latest, an hour of edits later", versions),
    ).resolves.toBe(true);
  });

  it("is UNSAVED when the text is in neither the note nor its history", async () => {
    const versions = jest.fn(async () => [
      { content: "first", created_at: at(-3_600_000) },
      { content: "latest", created_at: at(60_000) },
    ]);
    await expect(isDraftAlreadySaved(draft, "latest", versions)).resolves.toBe(false);
  });

  it("is UNSAVED when the only matching version is from long BEFORE the capture — a revert the user typed and lost", async () => {
    const versions = jest.fn(async () => [
      { content: "an old edit", created_at: at(-3 * 3_600_000) },
      { content: "latest", created_at: at(-1_000) },
    ]);
    await expect(isDraftAlreadySaved(draft, "latest", versions)).resolves.toBe(false);
  });

  it("judges without the note's content when the note is not loaded (the recovery list)", async () => {
    const versions = jest.fn(async () => [{ content: "an old edit", created_at: at(500) }]);
    await expect(isDraftAlreadySaved(draft, null, versions)).resolves.toBe(true);
  });

  it("degrades to offering the draft when history cannot be read", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const versions = jest.fn(async () => {
      throw new Error("offline");
    });
    await expect(isDraftAlreadySaved(draft, "latest", versions)).resolves.toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
