import {
  enforceStorageSelectionMode,
  matchStorageAccept,
} from "@/features/files/storage-sources/accept";

describe("storage source acceptance", () => {
  test.each([
    ["report.pdf", null, ".pdf", true],
    ["photo.png", "image/png", "image/*", true],
    ["notes.txt", "text/plain", "text/plain", true],
    ["notes.txt", "text/plain", "application/pdf", false],
    ["opaque", null, "application/pdf", false],
    ["opaque", null, "", true],
  ])("matches %s against %s", (name, mime, accept, accepted) => {
    expect(matchStorageAccept(name, mime, accept).accepted).toBe(accepted);
  });

  test("single mode refuses a provider batch instead of truncating it", () => {
    expect(enforceStorageSelectionMode(["a", "b"], false)).toEqual({
      accepted: false,
      reason: "Select one file.",
    });
  });
});
