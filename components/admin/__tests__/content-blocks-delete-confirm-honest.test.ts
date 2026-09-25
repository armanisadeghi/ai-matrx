/**
 * `ContentBlocksManager.tsx`'s delete confirm said "Are you sure you want to
 * delete ...? This action cannot be undone." for both a content block and a
 * category — but `confirmDelete()` in the same file soft-deletes the block
 * (`skill.render_definition.deleted_at`) and archives the category via the
 * `cat_archive` RPC (its own comment: "🚨 SOFT, NOW. This was a HARD
 * `.delete()`"). UNDONE-COPY-CENSUS, continuing GATES-TAIL #4's census.
 *
 * Class guard: the delete confirm dialog in this file must never claim
 * permanence.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FILE = join(__dirname, "..", "ContentBlocksManager.tsx");

const PERMANENCE_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: '"cannot be undone"', re: /cannot be undone/i },
  { label: '"can\'t be undone"', re: /can(?:'|’|&rsquo;)t be undone/i },
];

describe("content blocks admin delete confirm is honest about a soft delete", () => {
  it("neither the block nor category delete confirm claims permanence", () => {
    const source = readFileSync(FILE, "utf8");
    const offences = PERMANENCE_PATTERNS.filter(({ re }) => re.test(source)).map(
      (p) => p.label,
    );
    expect(offences).toEqual([]);
  });

  it("both dialogs name the truth: archive and restore, not permanence", () => {
    const source = readFileSync(FILE, "utf8");
    expect(source).toMatch(/This archives\{" "\}/);
    expect(source).toMatch(/This archives the category\{" "\}/);
    const restoreMentions = source.match(/an admin can restore it\./g) ?? [];
    expect(restoreMentions.length).toBeGreaterThanOrEqual(2);
  });
});
