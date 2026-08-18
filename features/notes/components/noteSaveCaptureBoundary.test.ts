import { readFileSync } from "node:fs";
import { join } from "node:path";

const componentSource = (name: string) =>
  readFileSync(join(__dirname, name), "utf8");

describe("notes save failure capture boundary", () => {
  it.each(["NoteTabItem.tsx", "mobile/MobileNoteEditor.tsx"])(
    "%s renders the derived save notice without recapturing it",
    (name) => {
      const source = componentSource(name);

      expect(source).toContain(
        'toastErrorAlreadyCaptured("Failed to save note")',
      );
      expect(source).not.toContain('toast.error("Failed to save note")');
    },
  );
});
