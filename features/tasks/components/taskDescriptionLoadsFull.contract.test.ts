// GUARD (2026-10-08): the nav tree stores a task THIN (no description). A host that edits an
// existing task's description must upgrade the task to full data first, or the editor opens empty
// and the saved text looks lost (QuickTasksSheet / TaskDetailsPanel did exactly that: the DB row
// held the markdown, the box was blank after a reload).
import fs from "node:fs";
import path from "node:path";

const HOSTS = ["TaskDetailsPanel.tsx", "TaskDetails.tsx"];

describe("a host that edits a stored task description loads the full task first", () => {
  test.each(HOSTS)("%s upgrades the task and holds the editor until it is full", (file) => {
    const src = fs.readFileSync(path.join(__dirname, file), "utf8");
    expect(src).toMatch(/useEnsureTaskLoaded\(task\.id\)/);
    expect(src).toMatch(/isFullData/);
    expect(src).toMatch(/<TaskDescriptionEditor\b/);
  });
});
