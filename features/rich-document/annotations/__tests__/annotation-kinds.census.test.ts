/**
 * Every door the annotation service REMOVES something through is a declared annotation kind
 * (annotation-kinds.ts) — so a new kind cannot soft-delete without the live trash check
 * (`pnpm check:annotation-trash`) seeing it. A removal door is a `cmt_delete`-style RPC, a
 * `deleted_at` write, or an association removal.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ANNOTATION_KINDS } from "../annotation-kinds";

const SERVICE = readFileSync(join(__dirname, "..", "service.ts"), "utf8");

/** Every removal-shaped call in a source text, as the door string the declaration uses. */
export function removalDoors(source: string): string[] {
  const doors = new Set<string>();
  for (const m of source.matchAll(/rpc\(\s*["'](\w*(?:delete|remove|archive|trash)\w*)["']/g)) doors.add(m[1]);
  for (const m of source.matchAll(/schema\(\s*["'](\w+)["']\s*\)[\s\S]{0,160}?deleted_at:/g)) doors.add(`schema("${m[1]}")`);
  if (/associationsService\.remove\(/.test(source)) doors.add("associationsService.remove");
  return [...doors].sort();
}

it("every removal door in the annotation service is a declared annotation kind", () => {
  const declared = new Set(ANNOTATION_KINDS.map((k) => k.removalDoor));
  const undeclared = removalDoors(SERVICE).filter((d) => !declared.has(d));
  expect(undeclared).toEqual([]);
});

it("the census sees a new removal door (planted text, never the real file)", () => {
  const planted = `${SERVICE}\nexport async function deleteBookmark(id: string) { await rpc("bmk_delete", { p_id: id }, "x"); }\n`;
  const declared = new Set(ANNOTATION_KINDS.map((k) => k.removalDoor));
  expect(removalDoors(planted).filter((d) => !declared.has(d))).toEqual(["bmk_delete"]);
});

it("every soft-deleting kind can be undone from its toast", () => {
  expect(ANNOTATION_KINDS.filter((k) => !k.toastUndo).map((k) => k.kinds.join("/"))).toEqual([]);
});
