/**
 * One frame for a note, in every host (2026-10-09): ONE bottom row and, for a
 * single note, no tab strip.
 *
 * The class this guards: hosts stacked a second strip under the note (the
 * notes window's footer slot, NoteWorkspace's own stats strip) and a single
 * note carried a one-tab strip that repeated its title. The bottom row is
 * `NoteMetadataBar`, which renders the save status + counts itself, so no
 * other file may mount `NoteStatsFooter`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "../../..");
const SCAN = ["app", "features", "components", "lib"];

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__" || name.startsWith(".")) continue;
    const path = join(dir, name);
    // Other writers share this checkout: a file can vanish between list and stat.
    let isDir: boolean;
    try {
      isDir = statSync(path).isDirectory();
    } catch {
      continue;
    }
    if (isDir) sources(path, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

const files = SCAN.flatMap((d) => sources(join(ROOT, d)));
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

it("only the note's bottom row mounts the save status + counts", () => {
  const mounting = files
    .filter((f) => {
      try {
        return /<NoteStatsFooter\b/.test(readFileSync(f, "utf8"));
      } catch {
        return false;
      }
    })
    .map((f) => relative(ROOT, f));
  expect(mounting).toEqual(["features/notes/components/NoteMetadataBar.tsx"]);
});

it("the bottom row carries the save status itself", () => {
  expect(read("features/notes/components/NoteMetadataBar.tsx")).toMatch(/<NoteStatsFooter noteId=\{noteId\} \/>/);
});

it("a single note has no tab strip", () => {
  const workspace = read("features/notes/components/NoteWorkspace.tsx");
  expect(workspace).not.toMatch(/<NoteTabBar\b/);
  // Its NoteTabItem is the note's actions, never a tab.
  const items = workspace.match(/<NoteTabItem\b[^>]*>/g) ?? [];
  expect(items.length).toBeGreaterThan(0);
  for (const item of items) expect(item).toMatch(/\bstandalone\b/);
});

it("the mode capsule and the note tools are one component everywhere", () => {
  // The Write dropdown, and hand-rolled mode / outline / versions buttons, are
  // the class: NOTE_VIEW_MODES is only mapped by NoteModeSwitch.
  const mappers = files
    .filter((f) => /NOTE_VIEW_MODES\.map\(/.test(readFileSync(f, "utf8")))
    .map((f) => relative(ROOT, f));
  expect(mappers).toEqual(["features/notes/components/NoteModeSwitch.tsx"]);
  const controls = read("features/notes/components/NoteViewControls.tsx");
  expect(controls).toMatch(/<NoteModeSwitch\b/);
  expect(controls).toMatch(/<NoteRecordTools\b/);
  expect(controls).not.toMatch(/DropdownMenu/);
  const view = read("features/notes/components/NotesView.tsx");
  expect(view).toMatch(/<NoteModeSwitch\b/);
  expect(view).not.toMatch(/<(ListTapButton|HistoryTapButton)\b/);
});

it("hosts that show one note frame it with NoteWorkspace, not their own editor chrome", () => {
  for (const rel of [
    "features/files/virtual-sources/adapters/NotesInlinePreview.tsx",
    "features/war-room/components/thread/ThreadNotesTab.tsx",
    "features/education/study-guides/components/StudyGuideReader.tsx",
  ]) {
    const src = read(rel);
    expect(src).toMatch(/<NoteWorkspace\b/);
    expect(src).not.toMatch(/<NoteEditorCore\b/);
  }
});
