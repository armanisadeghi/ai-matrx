/**
 * check:no-silent-org-filter — THE ORGANIZATION IS A FILTER, NEVER A SILENT SCOPE (lane
 * ORG-FILTER-CLASS, Arman 2026-09-30).
 *
 * THE DEFECT THAT OPENED THE CLASS. The agent builder's "Fill automatically → From my data" table
 * picker listed the tables of a records provider bound to the ACTIVE organization — one
 * organization's tables, with nothing on the screen saying so — while the data home lists every
 * table the person can see across all her organizations. "The two lists aren't identical."
 *
 * THE RULE. The default for any person is everything they can see across ALL their organizations.
 * A list may narrow to one organization only through a VISIBLE filter on the same surface (the
 * one control: `OrganizationFilterSelect`, the data home's saved pick via
 * `useDataOrganizationFilter`). Reading the active organization is legitimate for exactly three
 * things, each said on the line:
 *   - `visible`         the surface shows which organization it lists and lets the person change it;
 *   - `write-target`    an organization is needed to CREATE or WRITE something (the new row's home);
 *   - `default-for-new` the person's own default for new things (pre-selects a creation control).
 *
 * WHAT IS SCANNED. Every tracked .ts/.tsx under app/ features/ components/ lib/ hooks/ (tests and
 * scripts excluded) that BOTH reads the active organization (useOrganizationRequired,
 * selectOrganizationId, selectActiveOrganizationId, useActiveOrganizationId, getActiveOrgId) AND
 * performs a list read (useTables / tableList / list*() / use*List() / fetch*s() / rpc('list_…') /
 * .from(…).select( / <RecordsProvider / RecordsMount).
 *
 * WHAT PASSES. A file that draws the visible filter (`OrganizationFilterSelect`,
 * `useDataOrganizationFilter`, `data-hub-organization`), or whose every active-organization read
 * carries, on its line or the line above,
 *     // org-filter: <visible|write-target|default-for-new> <reason of 12+ characters>
 * A reasonless or unknown-class annotation fails.
 *
 * THE BASELINE (`scripts/no-silent-org-filter-baseline.json`) holds what this lane could not fix,
 * each with its class from the census and its owner. It only SHRINKS: a baseline entry whose file
 * no longer trips the guard fails until its row is removed, and a new file that trips fails.
 *
 * `--self-test` proves both directions on planted fixtures.
 */

import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { REPO_ROOT, repoFiles } from "./lib/repo-files";

const BASELINE = "scripts/no-silent-org-filter-baseline.json";

const ACTIVE_ORG: readonly RegExp[] = [
  /\buseOrganizationRequired\s*\(/,
  /\bselectOrganizationId\b(?!\s*[,}])/,
  /\bselectActiveOrganizationId\b(?!\s*[,}])/,
  /\buseActiveOrganizationId\s*\(/,
  /\bgetActiveOrgId\s*\(/,
];

const LIST_READS: readonly RegExp[] = [
  /\buseTables\s*\(/,
  /\.tableList\s*\(/,
  /\blist[A-Z]\w*\s*\(/,
  /\buse\w+List\s*\(/,
  /\bfetch\w+s\s*\(/,
  /\.rpc\(\s*["'`]list_/,
  /\.from\([^)]*\)\s*\.select\(/,
  /<RecordsProvider\b/,
  /\bRecordsMount\b/,
];

const VISIBLE_FILTER = /\bOrganizationFilterSelect\b|\buseDataOrganizationFilter\b|data-hub-organization/;
const ANNOTATION = /\/\/\s*org-filter:\s*(\S+)\s*(.*)$/;
const CLASSES = new Set(["visible", "write-target", "default-for-new"]);

export interface Finding {
  file: string;
  line: number;
  text: string;
  why: string;
}

export interface BaselineEntry {
  /** Census class: silent-filter (defect) · write-target · visible · default-for-new. */
  class: string;
  owner: string;
  note: string;
}

/** Comments blanked (offsets kept), so prose naming a selector is never a read. */
function codeOf(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/.*$/gm, (m, lead: string) => lead + " ".repeat(m.length - lead.length));
}

export function scanText(file: string, text: string): Finding[] {
  const code = codeOf(text);
  if (!ACTIVE_ORG.some((re) => re.test(code))) return [];
  if (!LIST_READS.some((re) => re.test(code))) return [];
  if (VISIBLE_FILTER.test(code)) return [];
  const raw = text.split("\n");
  const lines = code.split("\n");
  const findings: Finding[] = [];
  lines.forEach((line, i) => {
    if (!ACTIVE_ORG.some((re) => re.test(line))) return;
    const note = ANNOTATION.exec(raw[i] ?? "") ?? ANNOTATION.exec(raw[i - 1] ?? "");
    if (note) {
      const cls = note[1] ?? "";
      const reason = (note[2] ?? "").trim();
      if (CLASSES.has(cls) && reason.length >= 12) return;
      findings.push({
        file,
        line: i + 1,
        text: (raw[i] ?? "").trim(),
        why: `org-filter annotation must name visible | write-target | default-for-new and a reason of 12+ characters (got "${cls}")`,
      });
      return;
    }
    findings.push({
      file,
      line: i + 1,
      text: (raw[i] ?? "").trim(),
      why: "reads the ACTIVE organization in a file that lists things, with no visible organization filter — a silent filter. Use OrganizationFilterSelect / useDataOrganizationFilter (default All Orgs), or say why on the line: // org-filter: write-target|default-for-new|visible <reason>",
    });
  });
  return findings;
}

export function scan(root: string, files: readonly string[]): Map<string, Finding[]> {
  const out = new Map<string, Finding[]>();
  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(join(root, file), "utf8");
    } catch {
      continue;
    }
    const found = scanText(file, text);
    if (found.length > 0) out.set(file, found);
  }
  return out;
}

export function scannedFiles(root: string): string[] {
  return repoFiles(root, {
    under: ["app", "features", "components", "lib", "hooks"],
    match: /\.(ts|tsx)$/,
  }).filter((f) => !/(__tests__|\.test\.|\.spec\.|\/__mocks__\/)/.test(f));
}

function readBaseline(root: string): Record<string, BaselineEntry> {
  try {
    return JSON.parse(readFileSync(join(root, BASELINE), "utf8")).files ?? {};
  } catch {
    return {};
  }
}

/** Exit code: 0 = no new silent filter and no stale baseline row. */
export function judge(found: Map<string, Finding[]>, baseline: Record<string, BaselineEntry>, log = console.log): number {
  const fresh = [...found.keys()].filter((f) => !(f in baseline));
  const stale = Object.keys(baseline).filter((f) => !found.has(f));
  for (const f of fresh) {
    for (const x of found.get(f) ?? []) log(`[FAIL] ${x.file}:${x.line}  ${x.text}\n       ${x.why}`);
  }
  for (const f of stale) {
    log(`[FAIL] ${f} is in ${BASELINE} but no longer trips the guard — remove its row (the baseline only shrinks).`);
  }
  log(
    `${fresh.length === 0 && stale.length === 0 ? "[ OK ]" : "[FAIL]"} check:no-silent-org-filter — ${found.size} file(s) read the active organization in a list without a visible filter; ${found.size - fresh.length} known (baseline, with owners), ${fresh.length} new, ${stale.length} stale baseline row(s).`,
  );
  return fresh.length === 0 && stale.length === 0 ? 0 : 1;
}

function selfTest(): number {
  const dir = mkdtempSync(join(tmpdir(), "no-silent-org-filter-"));
  const plant = (rel: string, body: string) => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
    return rel;
  };
  const cases: Array<{ name: string; file: string; expectFindings: boolean }> = [
    {
      name: "RED: a picker listing the active organization's tables with no filter",
      file: plant(
        "features/a/Picker.tsx",
        `import { useTables, RecordsProvider } from "@ai-matrx/records/react";\nimport { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";\nexport function P() { const { organizationId } = useOrganizationRequired(); const t = useTables(); return <RecordsProvider config={{ organizationId }}>{t.data}</RecordsProvider>; }\n`,
      ),
      expectFindings: true,
    },
    {
      name: "GREEN: the same list with the visible organization filter",
      file: plant(
        "features/b/Picker.tsx",
        `import { OrganizationFilterSelect } from "@/features/unified-data/hub/OrganizationFilterSelect";\nexport function P() { const { organizationId } = useOrganizationRequired(); const rows = listThings(organizationId); return <OrganizationFilterSelect value="all" choices={[]} />; }\n`,
      ),
      expectFindings: false,
    },
    {
      name: "GREEN: a reasoned write-target annotation",
      file: plant(
        "features/c/Create.tsx",
        `export function C() {\n  // org-filter: write-target the new table is created in the organization the person is working in\n  const { organizationId } = useOrganizationRequired();\n  const rows = listTemplates();\n  return null;\n}\n`,
      ),
      expectFindings: false,
    },
    {
      name: "RED: a reasonless annotation",
      file: plant(
        "features/d/Create.tsx",
        `export function C() {\n  // org-filter: write-target ok\n  const { organizationId } = useOrganizationRequired();\n  const rows = listTemplates();\n  return null;\n}\n`,
      ),
      expectFindings: true,
    },
    {
      name: "RED: an unknown class",
      file: plant(
        "features/e/List.tsx",
        `export function C() {\n  // org-filter: scoped because the list is about the active organization only\n  const id = useAppSelector(selectOrganizationId);\n  const rows = useThingsList(id);\n  return null;\n}\n`,
      ),
      expectFindings: true,
    },
    {
      name: "GREEN: reads the active organization but lists nothing",
      file: plant(
        "features/f/Badge.tsx",
        `export function B() { const { organizationId } = useOrganizationRequired(); return organizationId; }\n`,
      ),
      expectFindings: false,
    },
    {
      name: "GREEN: a selector named only in a comment or an import list",
      file: plant(
        "features/g/Doc.tsx",
        `import { selectOrganizationId, other } from "x";\n// selectOrganizationId( is prose here\nexport const rows = listThings();\n`,
      ),
      expectFindings: false,
    },
  ];
  let failures = 0;
  for (const c of cases) {
    const got = (scan(dir, [c.file]).get(c.file) ?? []).length > 0;
    const ok = got === c.expectFindings;
    if (!ok) failures += 1;
    console.log(`${ok ? "[ OK ]" : "[FAIL]"} ${c.name}`);
  }
  // The baseline arms: a new offender fails, a stale row fails, a known offender passes.
  const found = scan(dir, ["features/a/Picker.tsx"]);
  const quiet = () => {};
  const arms: Array<[string, number, number]> = [
    ["RED: a new offender not in the baseline", judge(found, {}, quiet), 1],
    [
      "GREEN: a known offender in the baseline",
      judge(found, { "features/a/Picker.tsx": { class: "silent-filter", owner: "x", note: "y" } }, quiet),
      0,
    ],
    [
      "RED: a stale baseline row",
      judge(
        found,
        {
          "features/a/Picker.tsx": { class: "silent-filter", owner: "x", note: "y" },
          "features/gone.tsx": { class: "silent-filter", owner: "x", note: "y" },
        },
        quiet,
      ),
      1,
    ],
  ];
  for (const [name, got, want] of arms) {
    const ok = got === want;
    if (!ok) failures += 1;
    console.log(`${ok ? "[ OK ]" : "[FAIL]"} ${name}`);
  }
  console.log(failures === 0 ? "[ OK ] self-test: every arm answered as designed" : `[FAIL] self-test: ${failures} arm(s) wrong`);
  return failures === 0 ? 0 : 1;
}

function main(): number {
  if (process.argv.includes("--self-test")) return selfTest();
  const found = scan(REPO_ROOT, scannedFiles(REPO_ROOT));
  if (process.argv.includes("--list")) {
    for (const [file, xs] of found) console.log(`${file}\t${xs.map((x) => x.line).join(",")}`);
    return 0;
  }
  return judge(found, readBaseline(REPO_ROOT));
}

process.exit(main());
