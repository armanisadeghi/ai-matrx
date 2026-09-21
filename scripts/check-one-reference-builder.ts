/**
 * check:one-reference-builder — THERE IS ONE REFERENCE BUILDER AND ONE LABEL RESOLVER.
 *
 * lane RELATION-DISPLAY · 2026-09-21
 *
 * THE RULE, from the owner's ruling of 2026-09-21: *a column that offers choices from
 * ANOTHER table is a relation; the stored value is always the id; what is DISPLAYED is
 * resolved by one primitive.* Two things follow, and this guard is about both:
 *
 *   1. A surface that lets a person CHOOSE a target table mounts `ReferenceBuilder`
 *      (`@ai-matrx/records-ui`). It does not build its own dropdown over `useTables()` /
 *      `tableList()` and call it a picker.
 *   2. A surface that turns a stored id into WORDS asks the store — `client.relationWords`
 *      or `client.relationWordsMany`, which land on the one resolver `custom._words_for`,
 *      which asks the visibility ladder before it reads a name. It does not re-implement
 *      "read tableList, find title_field, call rowName" for the fourth time.
 *
 * WHY, MEASURED. Before this lane there were three independent copies of that resolution —
 * `labels.tsx`, `RelationPicker.tsx` and `PortalsPanel.tsx` — plus a fourth private picker,
 * `TableToPointAt`, inside `FieldEditor.tsx`. `TableToPointAt` is deleted and its callers now
 * mount `ReferenceBuilder`. Writing this guard then found THREE MORE the census had not
 * named — `Grid.tsx`, `Peek.tsx` and this repo's `TryEverythingScreen.tsx` — so the real
 * number is SIX, and all six are the BASELINE below. Not one of them could ever have shown
 * two columns of the target joined into one string, because none of them knew a display spec
 * existed.
 *
 * 🚨 THIS GUARD CARRIES A BASELINE, NOT A ZERO, AND SAYS SO OUT LOUD.
 * The brief this lane was given asked for "the known-good allowlist at zero". It is not
 * zero: six copies of the label resolution are still live, and moving them onto the store
 * door is a behaviour change to every grid, board, gallery, picker, peek and portal card in
 * the product — real work with its own verification, not a line in a guard. Claiming zero by
 * allowlisting them would be the same lie with extra steps. The baseline ONLY SHRINKS (the
 * same shape as `check:fields-stay-masked`), so the next lane to move one gets a guard that
 * refuses to let it come back.
 *
 * SCOPE: this repo, and the `@ai-matrx/records*` packages in the sibling aidream checkout.
 * Run: `pnpm check:one-reference-builder` · `pnpm check:one-reference-builder --self-test`
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const ROOT = resolve(__dirname, "..");
const AIDREAM = process.env.AIDREAM_DIR ?? resolve(ROOT, "..", "aidream");

/** The one component and the two doors. A file that mentions these is doing it right. */
const THE_PRIMITIVE = /\bReferenceBuilder\b|\brelationWordsMany\b|\brelationWords\b|\brelation_words\b/;

/**
 * A TABLE-REFERENCE PICKER built by hand: a table list rendered as options a person picks
 * from. `useTables()`/`tableList()` alone is not the offence — `TablesHome` navigates with
 * it and `PortalBuilder` ticks tables for exposure; the offence is turning it into a
 * chooser for a column's target.
 */
const HAND_BUILT_PICKER =
  /(useTables\(\)|tableList\(\))[\s\S]{0,1200}?(SelectItem|<option|role="option"|onValueChange)[\s\S]{0,400}?(relation_target|relationTarget|points at|target[_ ]?table)/i;

/**
 * A RELATION LABEL RESOLVED OUTSIDE THE STORE: the shape all three known copies share —
 * find the target Table's `title_field` and hand it to a name function.
 */
const HAND_ROLLED_RESOLVER = /\btitle_field\b/;
const NAMES_A_RECORD = /\b(recordName|rowName)\s*\(/;

/** Files that define the primitive itself, and this guard. Not offenders by construction. */
const IS_THE_PRIMITIVE_ITSELF = (rel: string) =>
  rel.endsWith("records-ui/src/ReferenceBuilder.tsx") ||
  rel.endsWith("records-ui/src/names.ts") ||
  rel.endsWith("records/src/core/doors.ts") ||
  rel.endsWith("records/src/core/client.ts") ||
  rel.endsWith("records/src/field.ts") ||
  rel.includes("check-one-reference-builder");

/**
 * THE BASELINE — the three copies that were already there when this guard was written, each
 * with the reason it is still there. A new one is a FAILURE; removing one lowers the number
 * and the guard then refuses to let it grow back.
 */
const BASELINE: Record<string, string> = {
  "aidream/apps/shared/records-ui/src/labels.tsx":
    "the bulk label lane every grid, board and gallery cell reads through; moving it to relationWordsMany changes how every relation cell in the product is fetched",
  "aidream/apps/shared/records-ui/src/RelationPicker.tsx":
    "the relation editor's own copy, which also chases ids outside the first page",
  "aidream/apps/shared/records-ui/src/PortalsPanel.tsx":
    "the portal card's copy, on a surface a stranger can open",
  // THE THREE THE WIDENED PATTERN FOUND, which the first version of this guard missed.
  // These name the record a person is ALREADY looking at rather than the far side of a
  // relation, so they are a milder form of the same question — but it is the same question,
  // and the same one answer should serve it.
  "aidream/apps/shared/records-ui/src/Grid.tsx":
    "names the row for the Talk action from the table's title_field",
  "aidream/apps/shared/records-ui/src/Peek.tsx":
    "names the record being peeked at from the table's title_field",
  "matrx-frontend/features/unified-data/test-bench/TryEverythingScreen.tsx":
    "the test bench's own copy, in this repo rather than the package",
};

const SKIP_DIR = new Set([
  "node_modules", ".git", ".next", "dist", "build", "coverage", ".turbo", ".wt", "tmp",
]);

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP_DIR.has(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(full);
  }
  return out;
}

interface Finding {
  file: string;
  what: "picker" | "resolver";
}

function scan(extraSource?: { file: string; text: string }): Finding[] {
  const files: { path: string; rel: string }[] = [];

  for (const d of [join(ROOT, "features"), join(ROOT, "components"), join(ROOT, "lib"), join(ROOT, "app")]) {
    if (existsSync(d)) for (const f of walk(d)) files.push({ path: f, rel: relative(resolve(ROOT, ".."), f) });
  }
  for (const pkg of ["records", "records-ui"]) {
    const d = join(AIDREAM, "apps", "shared", pkg, "src");
    if (existsSync(d)) for (const f of walk(d)) files.push({ path: f, rel: relative(resolve(ROOT, ".."), f) });
  }

  const findings: Finding[] = [];
  const consider = (rel: string, text: string) => {
    if (IS_THE_PRIMITIVE_ITSELF(rel)) return;
    if (/\.test\.tsx?$/.test(rel)) return;
    // FILE-LEVEL, deliberately. The first version of this guard required the two halves
    // within 600 characters of each other and MISSED RelationPicker.tsx, where the
    // `title_field` read (line 78) and the `rowName` call (line 103) sit twenty-five lines
    // apart behind a piece of state — a guard that reads green on a copy it was written
    // about is worse than no guard. Reading a target Table's `title_field` AND naming a
    // record in the same file IS the shape, however far apart they are.
    if (HAND_ROLLED_RESOLVER.test(text) && NAMES_A_RECORD.test(text) && !THE_PRIMITIVE.test(text)) {
      findings.push({ file: rel, what: "resolver" });
    }
    if (HAND_BUILT_PICKER.test(text) && !THE_PRIMITIVE.test(text)) {
      findings.push({ file: rel, what: "picker" });
    }
  };

  for (const { path, rel } of files) {
    let text: string;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      continue;
    }
    consider(rel.split("\\").join("/"), text);
  }
  if (extraSource) consider(extraSource.file, extraSource.text);
  return findings;
}

function report(findings: Finding[]): number {
  const known = new Set(Object.keys(BASELINE));
  const fresh = findings.filter((f) => !known.has(f.file));
  const stillThere = findings.filter((f) => known.has(f.file)).map((f) => f.file);

  for (const [file, why] of Object.entries(BASELINE)) {
    if (!stillThere.includes(file)) {
      console.log(
        `[ OK ] ${file} no longer resolves a relation label itself. LOWER THE BASELINE in ` +
          `scripts/check-one-reference-builder.ts — a guard whose baseline is looser than ` +
          `reality stops guarding. (It was there because: ${why})`,
      );
    }
  }

  if (fresh.length === 0) {
    console.log(
      `[ OK ] one reference builder: ${stillThere.length} known copy/copies of the relation ` +
        `label resolution remain (baseline ${Object.keys(BASELINE).length}), and no NEW ` +
        `table-reference picker or hand-rolled resolver was added.`,
    );
    return 0;
  }

  console.error(
    `[FAIL] ${fresh.length} surface(s) build a table-reference picker, or resolve a relation ` +
      `label, outside the primitive:`,
  );
  for (const f of fresh) {
    console.error(
      `       ${f.file} — ${
        f.what === "picker"
          ? "builds its own target-table chooser. Mount `ReferenceBuilder` from @ai-matrx/records-ui instead: it asks which table, shows that table's own reference column, lets a person override it with several columns and a separator, and previews the answer on real rows."
          : "resolves a relation's words itself from `title_field`. Ask the store instead: `client.relationWords({ field_id, value })` for one cell, `client.relationWordsMany({ field_id, record_ids })` for a page. They land on `custom._words_for`, the one resolver, which asks the visibility ladder BEFORE it reads a name — a hand-rolled one does not."
      }`,
  );
  }
  return 1;
}

const selfTest = process.argv.includes("--self-test");

if (selfTest) {
  // A guard nobody has watched fail is not a guard. This plants, in memory, exactly the
  // shape this lane deleted — FieldEditor's private `TableToPointAt` — and the resolver
  // shape the three known copies share, and requires BOTH to be caught.
  const plantedPicker = `
    const tables = useTables();
    return <Select onValueChange={onChange}>
      {offered.map((t) => <SelectItem value={t.id}>{tableName(t)}</SelectItem>)}
    </Select>;
    // relation_target is what this writes
  `;
  const plantedResolver = `
    const titleKey = tables.data.find((t) => t.id === target)?.title_field ?? null;
    for (const row of rows) next[row.id] = recordName(row.document, titleKey, "Untitled");
  `;
  let failures = 0;
  for (const [name, text] of [
    ["planted/TableToPointAt.tsx", plantedPicker],
    ["planted/labelsCopy.tsx", plantedResolver],
  ] as const) {
    const found = scan({ file: name, text }).some((f) => f.file === name);
    console.log(`${found ? "[ OK ]" : "[FAIL]"} self-test: ${name} is ${found ? "" : "NOT "}caught`);
    if (!found) failures += 1;
  }
  // And the primitive itself must NOT be flagged, or the guard would refuse the fix.
  const clean = scan({
    file: "planted/GoodSurface.tsx",
    text: `const words = await client.relationWordsMany({ field_id, record_ids }); <ReferenceBuilder />`,
  }).some((f) => f.file === "planted/GoodSurface.tsx");
  console.log(`${clean ? "[FAIL]" : "[ OK ]"} self-test: a surface using the primitive is not flagged`);
  if (clean) failures += 1;
  process.exit(failures === 0 ? 0 : 1);
} else {
  process.exit(report(scan()));
}
