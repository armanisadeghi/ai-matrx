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

const draft = { entityId: "note-1", content: "an old edit" };

describe("isDraftAlreadySaved", () => {
  it("is saved when the draft equals the note itself", async () => {
    const versions = jest.fn(async () => []);
    await expect(isDraftAlreadySaved(draft, "an old edit", versions)).resolves.toBe(true);
    expect(versions).not.toHaveBeenCalled();
  });

  it("is saved when ANY version in history holds the draft's text — the superseded-edit case", async () => {
    const versions = jest.fn(async () => [
      { content: "first" },
      { content: "an old edit" },
      { content: "the latest, an hour of edits later" },
    ]);
    await expect(
      isDraftAlreadySaved(draft, "the latest, an hour of edits later", versions),
    ).resolves.toBe(true);
  });

  it("is UNSAVED when the text is in neither the note nor its history", async () => {
    const versions = jest.fn(async () => [{ content: "first" }, { content: "latest" }]);
    await expect(isDraftAlreadySaved(draft, "latest", versions)).resolves.toBe(false);
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
