/**
 * check:object-pages-read-the-objects-organization — ACCESS IS PERSONAL (lane ACCESS-IS-PERSONAL).
 *
 * THE OWNER'S LAW (2026-09-23): "The permission is to the person, not the org. ALWAYS … My
 * active org has no impact on what I can see … For any RECORD I try to see, the active org is
 * meaningless." The active organization may filter a LIST that shows which organization it is
 * filtering for; it may never decide whether ONE object opens.
 *
 * THE CLASS. Every object page of the record store read the organization from the person's
 * context (`useOrganizationRequired`, `selectActiveOrganizationId`, …) and handed THAT to doors
 * whose first line is the organization wall (`custom.read_record(p_organization_id, …)`). A
 * member of the table's organization, working in another of her organizations, was told the
 * table was "not in the organization you are working in … or it may have been deleted"
 * (VERIFIER-15 M8, VERIFIER-16 verdict 2). The fix is one resolver —
 * `features/unified-data/objectOrganization.ts` over `custom.where_id_opens(p_id)` — and
 * this guard keeps the door shut behind it.
 *
 * WHAT IS SCANNED.
 *   1. OBJECT ROUTES — every file under `app/` whose path has a dynamic segment (`[tableId]`,
 *      `[sheetId]`, `[id]`, …) and that opens the record store (imports `@ai-matrx/records-ui`,
 *      `@ai-matrx/records`, or `@/features/unified-data/…`).
 *   2. OBJECT HELPERS — the declared list below: modules that open ONE named object for a
 *      caller that is not a route.
 * WHAT FAILS. Any of these reads of the person's active organization in a scanned file:
 *   useOrganizationRequired · selectOrganizationId · selectActiveOrganizationId ·
 *   useActiveOrganization · ensureOrgId · selectOrganizationName
 * A single line may be excused by a comment on it or on the line above —
 *   `// object-org-exempt: <reason>` — and the reason must say why that line is not about
 * opening an object (creating a NEW table in the organization the person picked is the worked
 * example). A reasonless exemption fails.
 *
 * The one module allowed to read the active organization for an object is the resolver
 * itself, for its announced stand-in while the door is absent from a database; it is not in
 * the scan set.
 *
 * `--self-test` proves both directions on planted fixtures: RED on a route reading the active
 * organization, RED on a reasonless exemption, GREEN on the resolver's shape and on a reasoned
 * exemption.
 */

import { readFileSync, readdirSync, statSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { tmpdir } from "node:os";

const ROOT = join(__dirname, "..");

/** Modules that open ONE named object and are not routes. */
export const OBJECT_HELPERS: readonly string[] = [
  "features/unified-data/whereThisTableLives.ts",
  "features/data-tables/data-source/locate-table.ts",
  "features/record-change-approvals/applyRecordChange.ts",
  "features/list-change-proposals/applyListChange.ts",
  "features/unified-data/components/EntityCustomFields.tsx",
  // /vault/<id> — the credential workspace the route mounts (ACTIVE-ORG-PAGES).
  "features/secrets/components/VaultWorkspace.tsx",
];

/**
 * MUST ASK THE OBJECT — an object page outside the record store answers "where does this live"
 * through its own row-level door, not `custom.where_id_opens`. Reading no active organization is
 * not enough there: the page must CALL its resolver, or a routed id is looked up inside whatever
 * list happens to be showing (the /vault/<id> defect: a credential of one of her organizations
 * opened as nothing because the list showed "Mine"). Each file here must match its pattern.
 */
export const MUST_ASK_THE_OBJECT: Readonly<Record<string, RegExp>> = {
  "features/secrets/components/VaultWorkspace.tsx": /\buseCredentialHome\s*\(/,
};

/**
 * RECORDED EXCEPTIONS — a file whose object read is already decided by the object, but which
 * still reads the active organization for something that is NOT whether the object opens.
 * Only shrinks: an entry whose file no longer trips the guard FAILS, so a fix removes its row.
 */
export const EXCUSED: Readonly<Record<string, string>> = {
  "app/(core)/d/[renderId]/page.tsx":
    "Owner's own fix 72ffbeacaa: custom.doc_render_read finds the document by id and checks the record in the document's organization; the selection is read only to offer 'Switch to <org>' beside a document that already opened.",
};

const FORBIDDEN: readonly RegExp[] = [
  /\buseOrganizationRequired\s*\(/,
  /\bselectOrganizationId\b/,
  /\bselectActiveOrganizationId\b/,
  /\buseActiveOrganization\b/,
  /\bensureOrgId\s*\(/,
  /\bselectOrganizationName\b/,
];

const OPENS_THE_STORE = /from\s+["'](@ai-matrx\/records-ui|@ai-matrx\/records|@\/features\/unified-data\/[^"']*)["']/;
const EXEMPT = /\/\/\s*object-org-exempt:(.*)$/;

export interface Finding {
  file: string;
  line: number;
  text: string;
  why: string;
}

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(tsx?|mts)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name) && !full.includes(`${sep}__tests__${sep}`)) {
      out.push(full);
    }
  }
}

/** The object routes under `appDir`: a dynamic segment in the path AND a record-store import. */
export function objectRoutes(root: string, appDir = "app"): string[] {
  const files: string[] = [];
  const base = join(root, appDir);
  try {
    walk(base, files);
  } catch {
    return [];
  }
  return files
    .filter((f) => /\[[^\]]+\]/.test(relative(root, f)))
    .filter((f) => OPENS_THE_STORE.test(readFileSync(f, "utf8")))
    .map((f) => relative(root, f));
}

export function scanFile(root: string, file: string): Finding[] {
  const findings: Finding[] = [];
  let text: string;
  try {
    text = readFileSync(join(root, file), "utf8");
  } catch {
    return [{ file, line: 0, text: "", why: "declared object helper is missing — remove it from OBJECT_HELPERS or restore it" }];
  }
  const lines = text.split("\n");
  lines.forEach((raw, i) => {
    const code = raw.replace(/\/\/.*$/, "");
    if (/^\s*(\*|\/\*)/.test(raw)) return; // prose inside a block comment
    const hit = FORBIDDEN.find((re) => re.test(code));
    if (!hit) return;
    const exemption = EXEMPT.exec(raw) ?? (i > 0 ? EXEMPT.exec(lines[i - 1] ?? "") : null);
    if (exemption) {
      if ((exemption[1] ?? "").trim().length < 12) {
        findings.push({ file, line: i + 1, text: raw.trim(), why: "`object-org-exempt:` carries no reason" });
      }
      return;
    }
    findings.push({
      file,
      line: i + 1,
      text: raw.trim(),
      why: "reads the ACTIVE organization in an object page — resolve it from the object with useObjectOrganization / resolveObjectOrganization (features/unified-data/objectOrganization.ts)",
    });
  });
  return findings;
}

export function scan(
  root: string,
  helpers: readonly string[] = OBJECT_HELPERS,
  excused: Readonly<Record<string, string>> = {},
  mustAsk: Readonly<Record<string, RegExp>> = {},
): { scanned: string[]; findings: Finding[] } {
  const scanned = [...new Set([...objectRoutes(root), ...helpers])].sort();
  const findings: Finding[] = [];
  for (const [f, re] of Object.entries(mustAsk)) {
    let body = "";
    try {
      body = readFileSync(join(root, f), "utf8");
    } catch {
      findings.push({ file: f, line: 0, text: "", why: "MUST_ASK_THE_OBJECT names a file that is missing — restore it or remove its row" });
      continue;
    }
    if (!re.test(body)) {
      findings.push({
        file: f,
        line: 0,
        text: "",
        why: `never asks the object where it lives (expected ${re}) — a routed id is being looked up inside whatever list is showing`,
      });
    }
  }
  for (const f of scanned) {
    const hits = scanFile(root, f);
    if (excused[f] !== undefined) {
      if (hits.length === 0) {
        findings.push({ file: f, line: 0, text: "", why: "STALE exception: this file no longer reads the active organization — delete its EXCUSED row" });
      }
      continue;
    }
    findings.push(...hits);
  }
  for (const f of Object.keys(excused)) {
    if (!scanned.includes(f)) findings.push({ file: f, line: 0, text: "", why: "STALE exception: this file is no longer an object page — delete its EXCUSED row" });
  }
  return { scanned, findings };
}

function report(findings: Finding[], scanned: string[]): number {
  if (findings.length === 0) {
    console.log(`[ OK ] object pages read the object's organization — ${scanned.length} files scanned, 0 read the active organization.`);
    return 0;
  }
  console.error(`[FAIL] ${findings.length} read(s) of the ACTIVE organization in object pages (${scanned.length} scanned):`);
  for (const f of findings) console.error(`  ${f.file}:${f.line}  ${f.text}\n      ${f.why}`);
  console.error(
    "\n  THE LAW: the permission is to the person, not the organization. An object page asks\n" +
      "  custom.where_id_opens through features/unified-data/objectOrganization.ts and hands\n" +
      "  the doors THAT organization. The active organization may only filter a list that says so.",
  );
  return 1;
}

function selfTest(): number {
  const dir = mkdtempSync(join(tmpdir(), "object-org-"));
  const write = (rel: string, body: string) => {
    const full = join(dir, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, body);
  };
  let failures = 0;
  const expect = (label: string, ok: boolean) => {
    console.log(`${ok ? "[ OK ]" : "[FAIL]"} ${label}`);
    if (!ok) failures += 1;
  };

  // RED-1: an object route that mounts the store for the active organization.
  write(
    "app/(core)/data-v2/[tableId]/page.tsx",
    `import { TablePage } from "@ai-matrx/records-ui";\nimport { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";\nexport default function P() { const { organizationId } = useOrganizationRequired(); return organizationId; }\n`,
  );
  // RED-2: a helper reading the Redux active organization with a reasonless exemption.
  write(
    "features/x/helper.ts",
    `import { selectActiveOrganizationId } from "a";\n// object-org-exempt:\nconst o = selectActiveOrganizationId(s);\n`,
  );
  // GREEN-1: a list route (no dynamic segment) may read the active organization.
  write(
    "app/(core)/data-v2/page.tsx",
    `import { OrganizationHub } from "@/features/unified-data/hub/OrganizationHub";\nimport { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";\nconst x = useOrganizationRequired();\n`,
  );
  // GREEN-2: an object route that resolves from the object.
  write(
    "app/(link)/capture/[sheetId]/page.tsx",
    `import { useObjectOrganization } from "@/features/unified-data/objectOrganization";\nconst o = useObjectOrganization(ds, id);\n`,
  );
  // GREEN-3: a reasoned exemption.
  write(
    "features/x/born.ts",
    `// object-org-exempt: a NEW table is born in the organization the person picked; no object exists yet\nconst org = await ensureOrgId(null);\n`,
  );

  const red1 = scan(dir, []).findings;
  expect("RED-1 an object route reading useOrganizationRequired fails", red1.some((f) => f.file.includes("[tableId]")));
  expect("GREEN-1 a list route (no dynamic segment) is not scanned", !red1.some((f) => f.file === join("app", "(core)", "data-v2", "page.tsx")));
  expect("GREEN-2 an object route using useObjectOrganization passes", !red1.some((f) => f.file.includes("[sheetId]")));
  const red2 = scan(dir, ["features/x/helper.ts"]).findings;
  expect("RED-2 a reasonless object-org-exempt fails", red2.some((f) => f.file === "features/x/helper.ts" && /no reason/.test(f.why)));
  const green3 = scan(dir, ["features/x/born.ts"]).findings;
  expect("GREEN-3 a reasoned exemption passes", !green3.some((f) => f.file === "features/x/born.ts"));
  const missing = scan(dir, ["features/x/gone.ts"]).findings;
  expect("RED-3 a declared helper that is missing fails", missing.some((f) => f.file === "features/x/gone.ts"));

  const excusedStale = scan(dir, [], { "app/(link)/capture/[sheetId]/page.tsx": "fixture reason long enough" }).findings;
  expect("RED-4 an exception for a file that is already clean fails as STALE", excusedStale.some((f) => /STALE/.test(f.why)));
  const excusedHeld = scan(dir, [], { "app/(core)/data-v2/[tableId]/page.tsx": "fixture reason long enough" }).findings;
  expect("GREEN-4 a recorded exception holds its file", !excusedHeld.some((f) => f.file.includes("[tableId]")));

  // MUST ASK THE OBJECT: a workspace that finds a routed id only inside the showing list.
  write("features/x/workspace.tsx", `const selected = items.find((i) => i.id === routedId);\n`);
  write("features/x/asks.tsx", `const home = useCredentialHome(routedId);\n`);
  const red5 = scan(dir, [], {}, { "features/x/workspace.tsx": /\buseCredentialHome\s*\(/ }).findings;
  expect("RED-5 an object workspace that never asks the object fails", red5.some((f) => f.file === "features/x/workspace.tsx" && /never asks/.test(f.why)));
  const green5 = scan(dir, [], {}, { "features/x/asks.tsx": /\buseCredentialHome\s*\(/ }).findings;
  expect("GREEN-5 an object workspace that asks the object passes", !green5.some((f) => f.file === "features/x/asks.tsx"));

  console.log(failures === 0 ? "[ OK ] self-test: every arm answered as designed" : `[FAIL] self-test: ${failures} arm(s) wrong`);
  return failures === 0 ? 0 : 1;
}

if (require.main === module) {
  if (process.argv.includes("--self-test")) {
    process.exit(selfTest());
  }
  const { scanned, findings } = scan(ROOT, OBJECT_HELPERS, EXCUSED, MUST_ASK_THE_OBJECT);
  process.exit(report(findings, scanned));
}
