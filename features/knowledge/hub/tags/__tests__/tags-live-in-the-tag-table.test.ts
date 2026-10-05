/**
 * FTS-4 GUARD — a tag is a row of `platform.tag`, never a scope (Arman 2026-10-02: tags are used by most
 * users, so they must not live in custom data or scopes).
 *
 * THE BREAK THIS CATCHES: a tag reader or writer that goes back to the scopes — reads `context.scopes`
 * / the scope tree / the scope type whose slug is `tag`, or files and counts tags on `target_type = scope`
 * edges. Such a reader would see none of the tags made since the move and write edges nobody reads.
 *
 * `scopeUseInTagCode` is the detector; the first test plants each break in a string (it must name every
 * one), the second runs the detector over the real tag code (it must name none).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const TAG_CODE = [
  "features/knowledge/hub/tags/tagApi.ts",
  "features/knowledge/hub/tags/tagActions.ts",
  "features/knowledge/hub/tags/PeekTags.tsx",
  "features/knowledge/hub/tags/useHubTags.ts",
  "features/knowledge/hub/tags/useRowTags.ts",
  "features/knowledge/hub/tags/TagDialog.tsx",
  "features/knowledge/api/mentionResolution.ts",
];

/** Every way tag code can reach back into the scopes. */
export function scopeUseInTagCode(src: string): string[] {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const found: string[] = [];
  const rules: [string, RegExp][] = [
    ["reads the scopes table", /schema\(\s*["']context["']\s*\)|\.from\(\s*["']scopes["']\s*\)/],
    ["reads the scope tree", /readScopeTree|readScopeTypes|readScopesById|readArchivedScopesOfType/],
    ["looks for the scope type 'tag'", /slug\s*===?\s*["']tag["']/],
    ["files or counts on scope edges", /target_type["']\s*,\s*["']scope["']|targetType:\s*["']scope["']/],
  ];
  for (const [name, re] of rules) if (re.test(code)) found.push(name);
  return found;
}

describe("tags live in the tag table, not in scopes", () => {
  it("the detector names every way back to the scopes (planted breaks)", () => {
    expect(scopeUseInTagCode('supabase.schema("context").from("scopes").select("id")')).toContain("reads the scopes table");
    expect(scopeUseInTagCode('const r = await readScopeTree(orgIds);')).toContain("reads the scope tree");
    expect(scopeUseInTagCode('res.data.types.filter((t) => t.slug === "tag")')).toContain("looks for the scope type 'tag'");
    expect(scopeUseInTagCode('.eq("target_type", "scope")')).toContain("files or counts on scope edges");
    expect(scopeUseInTagCode('const link = { sourceType: a, targetType: "scope" };')).toContain("files or counts on scope edges");
  });

  it("no tag reader or writer touches the scopes", () => {
    const offenders = TAG_CODE.flatMap((f) => scopeUseInTagCode(readFileSync(join(ROOT, f), "utf8")).map((r) => `${f}: ${r}`));
    expect(offenders).toEqual([]);
  });

  it("tags are read from platform.tag and filed on tag edges", () => {
    const api = readFileSync(join(ROOT, "features/knowledge/hub/tags/tagApi.ts"), "utf8");
    expect(api).toContain('.from("tag")');
    expect(api).toContain('.eq("target_type", "tag")');
  });
});
