/**
 * Univer documents and workbooks are their own features (domain tree: content > documents,
 * content > workbooks), split out of data-tables on 2026-10-07. Data tables are the record-store
 * grid; they hold no Univer editor, model, service or history view.
 *
 * Breaks if a document/workbook/Univer file comes back under features/data-tables, if data-tables
 * code imports Univer itself, or if any code imports a document/workbook module through the old
 * data-tables path. One named exception: `export-targets.ts` builds the workbook or document a
 * table is exported INTO, so it speaks Univer's data shape.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(__dirname, "../../..");
const DT = "features/data-tables";
const UNIVER_SPEAKERS = new Set(["export-targets.ts", "export-targets.test.ts"]);
const OLD_NAME = /(univer|workbook|document|xlsx)/i;
const OLD_IMPORT =
  /["']@\/features\/data-tables\/(components\/(Document|Workbook|RemoteCursors)|collab\/|univer-|document-|workbook-|xlsx-|markdown-to-univer|canvas\/(Document|Workbook|historyKinds)|hooks\/use(Univer|Workbook|OpenDocument)|utils\/(disposeUniver|registerUniver|sanitizeUniver|isSnapshot|documentsHub)|agent-context\/(buildDocuments|documentWrite))/;
const SKIP = new Set(["node_modules", ".next", ".git", "migrations", "supabase", "coverage", "dist"]);

function walk(dir: string, out: string[]) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(e.name)) out.push(full);
  }
}

export function scan(root: string, wholeRepo = true): string[] {
  const hits: string[] = [];
  const inside: string[] = [];
  walk(path.join(root, DT), inside);
  for (const f of inside) {
    const rel = path.relative(root, f);
    const name = path.basename(f);
    if (name === path.basename(__filename)) continue;
    if (OLD_NAME.test(name) && !UNIVER_SPEAKERS.has(name)) hits.push(`${rel}: a document/workbook file under data-tables`);
    if (!UNIVER_SPEAKERS.has(name) && /from\s+["']@univerjs\//.test(fs.readFileSync(f, "utf8"))) {
      hits.push(`${rel}: data-tables code imports Univer`);
    }
  }
  const all: string[] = [];
  for (const top of wholeRepo ? ["app", "features", "components", "lib", "hooks", "providers", "utils", "packages"] : ["."]) {
    walk(path.join(root, top), all);
  }
  for (const f of all) {
    if (path.basename(f) === path.basename(__filename)) continue;
    if (OLD_IMPORT.test(fs.readFileSync(f, "utf8"))) hits.push(`${path.relative(root, f)}: imports a document/workbook module through data-tables`);
  }
  return hits;
}

test("the guard sees a Univer file planted back under data-tables", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "univer-split-"));
  fs.mkdirSync(path.join(tmp, DT, "components"), { recursive: true });
  fs.writeFileSync(path.join(tmp, DT, "components", "WorkbookEditor.tsx"), 'import { Univer } from "@univerjs/core";\n');
  fs.writeFileSync(path.join(tmp, "x.ts"), 'import { x } from "@/features/data-tables/document-service";\n');
  expect(scan(tmp, false)).toHaveLength(3);
});

test("documents and workbooks live in their own features, not in data-tables", () => {
  expect(fs.existsSync(path.join(REPO, "features/documents/components/DocumentEditor.tsx"))).toBe(true);
  expect(fs.existsSync(path.join(REPO, "features/workbooks/components/WorkbookEditor.tsx"))).toBe(true);
  expect(scan(REPO)).toEqual([]);
});
