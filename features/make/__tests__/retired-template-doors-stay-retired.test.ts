// features/make/__tests__/retired-template-doors-stay-retired.test.ts — guard (lane TEMPLATES, RETIRE-1).
//
// THE USE CASE. Harbor Dental's office manager wants a ready-made patient-intake setup. Every door
// that offers one — the organization page's "Templates", the scopes page's "Add from template", the
// data home's "Start from a template" — leads to ONE gallery: published templates read through
// custom.templates and installed through custom.template_install. The two older mechanisms were
// retired onto it: the scope-template apply (custom.context_template_apply, through the
// TemplateGalleryDrawer) and the store's example tables (records' client.tableFromExample with a
// use-case id, through records-ui's ExampleTables). The day either is wired back, this fails.
//
// WHAT IT READS: every tracked or new .ts/.tsx/.mjs in the app's code roots that git grep says
// mentions a retired name, with comments removed by the TypeScript printer — so a comment that names
// a retired door (this guard's own docs, galleryHref.ts) is never a finding, and code always is.
//
// RED ON A PLANT: `RETIRED_TEMPLATE_DOORS_ROOT=<scratch dir>` points the guard at a copy; a planted
// `callDoor("context_template_apply", …)` or `client.tableFromExample({ home_id, useCaseId })` turns
// it red. Never plant in the tracked tree (a sweep would ship the mutant).

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const REPO = join(__dirname, "..", "..", "..");
const ROOT = process.env.RETIRED_TEMPLATE_DOORS_ROOT ?? REPO;
const CODE_ROOTS = ["app", "features", "components", "lib", "hooks", "utils", "providers", "packages", "scripts"];

const RETIRED: Array<{ name: string; test: RegExp }> = [
  { name: "custom.context_template_apply (the scope-template apply)", test: /context_template_apply/ },
  { name: "tableFromExample (the use-case example tables)", test: /\btableFromExample\b/ },
  { name: "ExampleTables (records-ui's example list)", test: /\bExampleTables\b/ },
  { name: "TemplateGalleryDrawer (the scope-template drawer)", test: /\bTemplateGalleryDrawer\b/ },
];

/** Files that mention a retired name at all (comments included); the printer then judges the code. */
function candidates(): string[] {
  const pattern = "context_template_apply|tableFromExample|ExampleTables|TemplateGalleryDrawer";
  const roots = CODE_ROOTS.filter((r) => {
    try {
      readFileSync(join(ROOT, r, ".")); // throws EISDIR for a directory that exists
      return false;
    } catch (e) {
      return (e as NodeJS.ErrnoException).code === "EISDIR";
    }
  });
  if (roots.length === 0) return [];
  let out = "";
  try {
    out = execFileSync(
      "git",
      [
        "grep",
        ...(process.env.RETIRED_TEMPLATE_DOORS_ROOT ? ["--no-index"] : ["--untracked"]),
        "-l", "-E", pattern, "--", ...roots.flatMap((r) => [`${r}/*.ts`, `${r}/*.tsx`, `${r}/*.mjs`])],
      { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
  } catch (e) {
    // git grep exits 1 when nothing matches
    if ((e as { status?: number }).status === 1) return [];
    throw e;
  }
  return out
    .split("\n")
    .filter(Boolean)
    // a guard that NAMES a retired door to forbid it is not a caller: test files are not surfaces
    .filter((f) => !f.includes("node_modules/") && !f.includes("__tests__/") && !/\.test\.(ts|tsx|mjs)$/.test(f))
    .map((f) => join(ROOT, f));
}

function codeOnly(path: string): string {
  const kind = path.endsWith(".tsx") ? ts.ScriptKind.TSX : path.endsWith(".mjs") ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, kind);
  return ts.createPrinter({ removeComments: true }).printFile(source);
}

describe("RETIRE-1 — the scope-template apply and the example tables stay retired", () => {
  it("measures something: the gallery href every door uses is found", () => {
    expect(readFileSync(join(REPO, "features", "make", "gallery", "galleryHref.ts"), "utf8")).toMatch(/TEMPLATE_GALLERY_HREF = "\/make#make-templates"/);
  });

  it("no code calls context_template_apply, tableFromExample, ExampleTables or the scope-template drawer", () => {
    const findings: string[] = [];
    for (const f of candidates()) {
      const code = codeOnly(f);
      for (const rule of RETIRED) if (rule.test.test(code)) findings.push(`${relative(ROOT, f)} uses ${rule.name}`);
    }
    expect(findings).toEqual([]);
  });
});
