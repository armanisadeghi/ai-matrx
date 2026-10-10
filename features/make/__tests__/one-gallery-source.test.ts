// features/make/__tests__/one-gallery-source.test.ts — guard G3 (lane MAKE-HOME, wave 4).
//
// THE USE CASE. Cedar Ridge Physical Therapy's front desk opens /make and sees ONE template
// gallery: the catalogue lane 8 fills, read through the catalogue door `custom.templates`. She never
// sees a second list stitched beside it — the four store examples, the AI-setup kits, scope
// templates — each from its own mechanism, each disagreeing about what a "template" is (HANDOFF
// MAKE-HOME §2 item 4: six mechanisms). The day someone wires one back into the hub, this fails.
//
// WHAT IT READS: every .ts/.tsx under features/make (tests excluded), comments removed by the TypeScript
// printer — so a comment that NAMES a forbidden source (this guard's own
// docs do) is never a finding, and code that uses it always is.
//
// RED ON A PLANT: `MAKE_GALLERY_GUARD_ROOT=<scratch copy of features/make>` points the guard at a copy;
// a planted `import { ExampleTables } from "@ai-matrx/records-ui"` or `.from("catalog_entries")` in
// the copy turns it red (proof run in the wave-4 report). Never plant in the tracked tree.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOT = process.env.MAKE_GALLERY_GUARD_ROOT ?? join(__dirname, "..");

/** Code that reads a template source other than the catalogue door. */
const FORBIDDEN: Array<{ name: string; test: RegExp }> = [
  { name: "context.templates (scope templates)", test: /\bschema\(\s*["']context["']\s*\)[\s\S]{0,80}["']templates["']|["']context\.templates["']/ },
  { name: "catalog_entries (kits)", test: /["']catalog_entries["']/ },
  { name: "the kits service", test: /["']@\/features\/kits\/(service|installer|publish)["']/ },
  { name: "the use-case registry", test: /["']@ai-matrx\/records\/use-cases["']|\bUSE_CASES\b|\bexampleSpec\b/ },
  { name: "the examples list (reads the use-case registry)", test: /\bExampleTables\b/ },
];

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== "__tests__" && name !== "node_modules") out.push(...sources(path));
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(path);
    }
  }
  return out;
}

/** The file's code with every comment removed (strings and identifiers kept), as the TS printer writes it. */
function codeOnly(path: string): string {
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  return ts.createPrinter({ removeComments: true }).printFile(source);
}

describe("G3 — /make has one gallery source: the catalogue door", () => {
  const files = sources(ROOT);

  it("measures something (the hub's files are found)", () => {
    expect(files.map((f) => relative(ROOT, f))).toContain("MakeHome.tsx");
    expect(files.map((f) => relative(ROOT, f))).toContain(join("gallery", "TemplateGallery.tsx"));
  });

  it("no file under features/make reads context.templates, catalog_entries, the kits service or the use-case registry", () => {
    const findings: string[] = [];
    for (const f of files) {
      const code = codeOnly(f);
      for (const rule of FORBIDDEN) if (rule.test.test(code)) findings.push(`${relative(ROOT, f)} reads ${rule.name}`);
    }
    // Every template card on /make comes from custom.templates.
    expect(findings).toEqual([]);
  });

  it("the gallery reads the catalogue door and installs through runTemplateDoor", () => {
    const gallery = codeOnly(files.find((f) => f.endsWith("TemplateGallery.tsx"))!);
    // The catalogue door is the package's (storeDoors(...).templates): the app file never says the schema.
    expect(gallery).toMatch(/storeDoors\([^)]*\)\.templates\(|doors\.templates\(/);
    expect(gallery).not.toMatch(/schema: "custom"|\.schema\("custom"\)/);
    expect(gallery).toMatch(/runTemplateDoor/);
  });
});
