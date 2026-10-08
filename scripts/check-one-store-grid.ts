/**
 * check-one-store-grid — every place a custom table is shown mounts the ONE table page
 * (`useUnifiedTable` + `UnifiedTableBody`, the component /data/<table> renders), never the old grid
 * and never a second host binding (lane CHAIR-ONE-GRID, 2026-10-04; Arman: "adopt, don't replace").
 * Red on any hit:
 *
 *  1. old-grid      — the retired classic sheet (`UserTableViewer`, and `SheetLayout` that drew it as
 *                     the table page's "Sheet" layout; both deleted, FTS-5e) is imported nowhere.
 *  2. table-page    — records-ui's `TablePage` is mounted only by `UnifiedTable.tsx`; a host that
 *                     opens a table by id goes through `LocatedTableViewer` / `UnifiedTableBody`.
 *  3. second-host   — `RecordStoreTableHost` (the retired second binding) is named nowhere.
 *
 * Tests (`__tests__/`, `*.test.*`) may mock these and are not scanned.
 * Usage: pnpm check:one-store-grid   ·   pnpm check:one-store-grid --self-test
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const SELF = "scripts/check-one-store-grid.ts";
const THE_TABLE_PAGE = "features/unified-data/table-page/UnifiedTable.tsx";

type Rule = "old-grid" | "table-page" | "second-host";
export type Finding = { file: string; line: number; rule: Rule; text: string };

const IMPORT_FROM = /\bfrom\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/;

// An entity source (`{kind: "entity", token}` — tasks, projects, deals…) is not a custom table: it has no
// table id for the one table page to open, so mounting `TablePage` on it directly is the sanctioned door.
function mountsOnlyEntitySources(text: string): boolean {
  const mounts = [...text.matchAll(/<TablePage\b[\s\S]*?\/?>/g)].map((m) => m[0]);
  return mounts.length > 0 && mounts.every((tag) => /source=\{\{\s*kind:\s*["']entity["']/.test(tag));
}

export function scan(files: ReadonlyArray<{ path: string; text: string }>): Finding[] {
  const out: Finding[] = [];
  for (const { path, text } of files) {
    if (path === SELF || /(^|\/)__tests__\//.test(path) || /\.test\.[tj]sx?$/.test(path)) continue;
    // Whole import statements (they may span lines), with the line each starts on.
    const statements = [...text.matchAll(/(?:^|\n)\s*(import[\s\S]*?from\s+["'][^"']+["'];?|.*import\(\s*["'][^"']+["']\s*\).*)/g)];
    for (const m of statements) {
      const stmt = m[1];
      const spec = IMPORT_FROM.exec(stmt);
      const from = spec?.[1] ?? spec?.[2] ?? "";
      const line = text.slice(0, m.index ?? 0).split("\n").length + (text[m.index ?? 0] === "\n" ? 1 : 0);
      const say = stmt.replace(/\s+/g, " ").trim().slice(0, 160);
      if (/user-generated-table-data\/UserTableViewer$|data-tables\/components\/SheetLayout$/.test(from)) {
        out.push({ file: path, line, rule: "old-grid", text: say });
      }
      if (
        /^@ai-matrx\/records-ui$/.test(from) &&
        !/^import\s+type\b/.test(stmt) &&
        /[{,]\s*TablePage\s*[,}]/.test(stmt.replace(/\btype\s+TablePage\b/g, "")) &&
        path !== THE_TABLE_PAGE &&
        !mountsOnlyEntitySources(text)
      ) {
        out.push({ file: path, line, rule: "table-page", text: say });
      }
    }
    text.split("\n").forEach((ln, i) => {
      if (/\bRecordStoreTableHost\b/.test(ln)) out.push({ file: path, line: i + 1, rule: "second-host", text: ln.trim() });
    });
  }
  return out;
}

function trackedFiles(): string[] {
  return execFileSync("git", ["ls-files", "--", "app", "features", "components", "lib", "packages", "hooks", "providers"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\n")
    .filter((f) => /\.(tsx?|m?jsx?)$/.test(f) && existsSync(f));
}

function selfTest(): void {
  const red = scan([
    { path: "features/window-panels/windows/W.tsx", text: 'import UserTableViewer from "@/components/user-generated-table-data/UserTableViewer";' },
    { path: "features/x/Lazy.tsx", text: 'const V = lazy(() => import("@/components/user-generated-table-data/UserTableViewer"));' },
    { path: "features/canvas/T.tsx", text: 'import { SheetLayout } from "@/features/data-tables/components/SheetLayout";' },
    { path: "features/chat/Block.tsx", text: 'import {\n  RecordsMount,\n  TablePage,\n} from "@ai-matrx/records-ui";' },
    { path: "features/data-tables/records-ui-host/h.tsx", text: "export function RecordStoreTableHost() {}" },
    { path: "features/spaces/Mixed.tsx", text: 'import { TablePage } from "@ai-matrx/records-ui";\n<TablePage source={{ kind: "entity", token }} />\n<TablePage source={{ kind: "table", tableId }} />' },
  ]);
  const green = scan([
    { path: THE_TABLE_PAGE, text: 'import { RecordsMount, TablePage } from "@ai-matrx/records-ui";' },
    { path: "features/spaces/E.tsx", text: 'import { TablePage } from "@ai-matrx/records-ui";\nconst x = <TablePage source={{ kind: "entity", token }} layout="board" />;' },
    { path: "features/x/a.tsx", text: 'import type { TablePageActionHost } from "@ai-matrx/records-ui";\nimport { TablesHome, type TablePage } from "@ai-matrx/records-ui";' },
    { path: "features/x/__tests__/a.test.tsx", text: 'jest.mock("@/features/data-tables/records-ui-host/recordsUiHost", () => ({ RecordStoreTableHost: () => null }));' },
    { path: "features/x/b.tsx", text: 'import { LocatedTableViewer } from "@/features/data-tables/components/LocatedTableViewer";' },
  ]);
  const ok = red.length === 6 && green.length === 0;
  console.log(ok ? "self-test: PASS (6 red, 0 green)" : `self-test: FAIL red=${JSON.stringify(red)} green=${JSON.stringify(green)}`);
  process.exit(ok ? 0 : 1);
}

if (process.argv.includes("--self-test")) selfTest();
else {
  const findings = scan(trackedFiles().map((path) => ({ path, text: readFileSync(path, "utf8") })));
  if (findings.length === 0) {
    console.log("check-one-store-grid: PASS — every custom table mounts the one table page.");
    process.exit(0);
  }
  for (const f of findings) console.log(`${f.file}:${f.line}  [${f.rule}]  ${f.text}`);
  console.log(`check-one-store-grid: FAIL — ${findings.length} finding(s).`);
  process.exit(1);
}
