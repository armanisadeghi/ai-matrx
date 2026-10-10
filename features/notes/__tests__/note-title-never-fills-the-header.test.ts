/**
 * A note's title in a host header (a Board tile) is only as wide as its name,
 * so the empty rest of the header still drags the tile (2026-10-10).
 *
 * The class this guards: 2da0bf30bd4 made the Board tile's title `w-full
 * [field-sizing:fixed]` to stop a premature ellipsis; the whole header slot
 * became a text input and dragging empty header space no longer moved the tile.
 * The name is now sized by a hidden mirror of itself, never by filling the slot.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "../../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const FIELD = "features/notes/components/NoteTitleField.tsx";
const TILE = "features/board/items/NoteItemBody.tsx";

describe("a note title never turns its host header into a control", () => {
  const field = read(FIELD);
  const tile = read(TILE);
  const tileTitle = tile.slice(tile.indexOf("export function NoteTileTitle"));

  it("the field is sized by a mirror of its text, not by field-sizing", () => {
    expect(field).toContain("data-note-title-mirror");
    expect(field).not.toMatch(/field-sizing-|\[field-sizing/);
  });

  it("the field's input never stretches itself past its wrapper", () => {
    // the input fills the (text-wide) wrapper, which is `inline-grid`
    expect(field).toMatch(/inline-grid/);
  });

  it("the Board tile title does not make the field fill the header slot", () => {
    const usage = tileTitle.slice(tileTitle.indexOf("<NoteTitleField"));
    const tag = usage.slice(0, usage.indexOf("/>"));
    expect(tag).not.toMatch(/\bw-full\b/);
    expect(tag).not.toMatch(/field-sizing/);
    expect(tag).not.toMatch(/\bflex-1\b/);
  });
});
