/**
 * V5-B (2026-09-30): a folder the system owns — a page-capture / crawl / login-capture root and
 * everything under it, or a variant folder — is listed only while `files.show_system_files` is on.
 * Mirrors aidream `system_folder_marker` (tests/test_system_folders_are_marked_at_the_folder_door.py).
 */
import { isListedFolderPath, isSystemFolderPath } from "../user-visible";

const ORG = "0a54df90-eab8-4d07-ab29-81a45fb41e04";

describe("system folders", () => {
  it.each([
    `page-captures-${ORG}`,
    `page-captures-${ORG}/en-wikipedia-org`,
    `web-crawls-${ORG}/www-cnn-com`,
    `login-captures-${ORG}/x`,
    `Images/Brand Library/v/${ORG}`,
    "Images/Brand Library/v",
  ])("%s is a system folder, hidden by default and shown when on", (path) => {
    expect(isSystemFolderPath(path)).toBe(true);
    expect(isListedFolderPath(path, false)).toBe(false);
    expect(isListedFolderPath(path, true)).toBe(true);
  });

  it.each(["My Files", "v", "Projects/v1", `Projects/v/${ORG}/notes`, `text-messages-${ORG}/a`])(
    "%s is a person's folder",
    (path) => {
      expect(isSystemFolderPath(path)).toBe(false);
      expect(isListedFolderPath(path, false)).toBe(true);
    },
  );
});
