// The task page drew two identical split Copy buttons — one in the route
// header, one in the editor's own title bar (2026-10-07 final pass). The
// editor's bar is the one that stays: it shows on every size and copies the
// live draft. The route header carries no second Copy.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

test("the /tasks/[id] header adds no Copy beside the editor's", () => {
  expect(read("app/(core)/tasks/[id]/page.tsx")).not.toMatch(/<(TaskEditorCopyButtons|RichCopySplit|TextCopySplit|CopySplitButton)\b/);
  expect(read("features/tasks/components/TaskEditor.tsx")).toMatch(/<TaskEditorCopyButtons location="Tasks — task editor"/);
});
