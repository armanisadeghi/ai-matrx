/**
 * check-org-gate-not-bare-kernel — nothing feeds the ACTIVE SELECTION to the
 * bare organization kernel.
 *
 * THE CLASS this guards (SCHEDULE-PROMPT 7da1240449, then ORG-GATE-AUDIT)
 * ----------------------------------------------------------------------
 * `requireOrganizationContext` (the package kernel) is synchronous and
 * fail-closed. It is the right LAST line, and the wrong FIRST one: a client
 * that reads the currently selected organization itself —
 *
 *     requireOrganizationContext(selectOrganizationId(store.getState()))
 *     requireOrganizationContext(requireSelectedOrgId())
 *     const organizationId = useAppSelector(selectOrganizationId);
 *     … requireOrganizationContext(organizationId)
 *
 * — refuses a person who pressed a button with no organization selected with
 * a raw "Select an organization before sending this request." toast, and
 * `OrganizationGateDialog` (the app's ask-then-continue picker) never opens,
 * because nothing asked it to. schedulerClient.ts did exactly that on
 * /schedules/new; about twenty feature clients carried the same shape.
 *
 * THE RULE
 * --------
 * A value that came from the active selection reaches the organization kernel
 * only THROUGH THE GATE (`lib/organization/organization-gate.ts`):
 *
 *   ensureOrganizationForRequest({ method })      — a feature fetch client
 *   ensureOrganizationContext({ organizationId }) — an action seam
 *   ensureOrganizationContext({ interactive: false }) — a declared background
 *                                                    or identity read
 *   useNewNoteOrganization()                      — the notes create seam
 *
 * An id that came from the OBJECT (a record's, a folder's, a tool's own
 * `organization_id`) or was handed in by a caller is untouched — that is
 * "access is personal" working, not the class.
 *
 * Deliberate exceptions (non-interactive transport kernels, background
 * auto-creates, admin benches) live in `scripts/org-gate-not-bare-kernel.allowlist.json`
 * with a reason, and an allowlisted file that no longer matches is ALSO a
 * failure — the list only shrinks.
 *
 * Run:  tsx scripts/check-org-gate-not-bare-kernel.ts
 *       tsx scripts/check-org-gate-not-bare-kernel.ts --self-test   (proves it can FAIL)
 *       tsx scripts/check-org-gate-not-bare-kernel.ts --root <dir>  (scan another tree)
 * Part of `pnpm check:organization-context`.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const REPO = resolve(__dirname, "..");
const ALLOWLIST_PATH = join(REPO, "scripts", "org-gate-not-bare-kernel.allowlist.json");
const SCAN_DIRS = ["app", "features", "components", "hooks", "lib", "providers"];
const SKIP_DIR = new Set(["node_modules", ".next", "dist", "build", "__tests__", "__mocks__"]);
const KERNEL = "requireOrganizationContext";

/** Expressions that ARE the active selection. */
const SELECTION_SOURCES: readonly RegExp[] = [
  /\bselectOrganizationId\b/,
  /\brequireSelectedOrgId\s*\(/,
  /\bgetSelectedOrgId\s*\(/,
  /\bpeekSelectedOrganizationId\s*\(/,
  /\bgetStoreSingleton\s*\(/,
  /\.getState\s*\(\s*\)\s*(?:as\s+\w+\s*)?\)?\s*\.appContext\b/,
  /\bappContext\??\.organization_id\b/,
];

export interface Violation {
  file: string;
  line: number;
  shape: "inline" | "alias";
  text: string;
}

function isSelectionExpression(text: string): boolean {
  return SELECTION_SOURCES.some((re) => re.test(text));
}

/** The balanced argument text of the call whose "(" sits at `open`. */
function argumentText(source: string, open: number): string {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return source.slice(open + 1);
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

function stripComments(source: string): string {
  // Keep offsets stable: blank out comment characters instead of removing them.
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, lead: string) => lead + " ".repeat(m.length - lead.length));
}

/** Identifiers bound directly from the active selection in this module. */
function selectionAliases(source: string): Set<string> {
  const aliases = new Set<string>();
  const binding = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*([^;]+)/g;
  for (const match of source.matchAll(binding)) {
    const [, name, rhs] = match;
    if (isSelectionExpression(rhs)) aliases.add(name);
  }
  return aliases;
}

export function scanSource(file: string, raw: string): Violation[] {
  const source = stripComments(raw);
  if (!source.includes(KERNEL)) return [];
  const aliases = selectionAliases(source);
  const violations: Violation[] = [];
  const call = new RegExp(`\\b${KERNEL}\\s*\\(`, "g");
  for (const match of source.matchAll(call)) {
    const open = (match.index ?? 0) + match[0].length - 1;
    // Skip the import specifier / re-export lists (no call follows a name there).
    const args = argumentText(source, open);
    const line = lineOf(source, match.index ?? 0);
    const text = raw.split("\n")[line - 1]?.trim() ?? "";
    if (isSelectionExpression(args)) {
      violations.push({ file, line, shape: "inline", text });
      continue;
    }
    const alias = [...aliases].find((name) => new RegExp(`(^|[^\\w$.])${name.replace(/\$/g, "\\$")}(?![\\w$])`).test(args));
    if (alias) violations.push({ file, line, shape: "alias", text });
  }
  return violations;
}

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIR.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.(ts|tsx)$/.test(entry) && !entry.endsWith(".d.ts")) {
      out.push(full);
    }
  }
}

export function scanTree(root: string): Violation[] {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) walk(join(root, dir), files);
  return files.flatMap((full) => scanSource(relative(root, full), readFileSync(full, "utf8")));
}

function loadAllowlist(): Record<string, string> {
  if (!existsSync(ALLOWLIST_PATH)) return {};
  const parsed = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8")) as {
    files?: Record<string, string>;
  };
  return parsed.files ?? {};
}

function selfTest(): number {
  const failures: string[] = [];
  const mustFlag: Record<string, string> = {
    "old schedulerClient (store read inline)": `
      const store = getStoreSingleton();
      const organizationId = requireOrganizationContext(
        store ? selectOrganizationId(store.getState()) : null,
        explicitOrganizationId,
      );`,
    "requireSelectedOrgId inline": `const organizationId = requireOrganizationContext(requireSelectedOrgId());`,
    "peek inline": `organizationId: requireOrganizationContext(peekSelectedOrganizationId()),`,
    "explicit ?? selection": `requireOrganizationContext(args.organizationId ?? (store ? selectOrganizationId(store.getState()) : null));`,
    "multi-line store alias": `
      const selectedOrganizationId = store
        ? (selectOrganizationId(store.getState() as RootState) ?? null)
        : null;
      return requireOrganizationContext(selectedOrganizationId, opts.organizationId);`,
    "hook alias": `
      const organizationId = useAppSelector(selectOrganizationId);
      const onClick = () => { const id = requireOrganizationContext(organizationId); };`,
  };
  const mustPass: Record<string, string> = {
    "record's own organization": `const organizationId = requireOrganizationContext(tool.organization_id);`,
    "explicit caller id": `requireOrganizationContext(undefined, args.organizationId);`,
    "the gate": `const organizationId = await ensureOrganizationForRequest({ method });`,
    "a comment naming the old shape": `// used to call requireOrganizationContext(selectOrganizationId(state)) here`,
    "alias not reaching the kernel": `
      const activeOrgId = useAppSelector(selectOrganizationId);
      const id = requireOrganizationContext(destination.folder.organizationId);`,
  };
  for (const [name, source] of Object.entries(mustFlag)) {
    if (scanSource("fixture.ts", source).length === 0) failures.push(`did NOT flag: ${name}`);
  }
  for (const [name, source] of Object.entries(mustPass)) {
    const found = scanSource("fixture.ts", source);
    if (found.length > 0) failures.push(`falsely flagged: ${name} (${found[0].text})`);
  }
  if (failures.length) {
    console.error("check-org-gate-not-bare-kernel --self-test FAILED:");
    for (const f of failures) console.error(`  - ${f}`);
    return 1;
  }
  console.log(
    `check-org-gate-not-bare-kernel --self-test: ${Object.keys(mustFlag).length} planted violations caught, ${Object.keys(mustPass).length} clean shapes passed.`,
  );
  return 0;
}

function main(): number {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) return selfTest();
  const rootFlag = args.indexOf("--root");
  const root = rootFlag >= 0 ? resolve(args[rootFlag + 1]) : REPO;
  const allowlist = loadAllowlist();
  const violations = scanTree(root);
  const unallowed = violations.filter((v) => !(v.file in allowlist));
  const flaggedFiles = new Set(violations.map((v) => v.file));
  const stale = rootFlag >= 0 ? [] : Object.keys(allowlist).filter((file) => !flaggedFiles.has(file));

  if (unallowed.length === 0 && stale.length === 0) {
    console.log(
      `check-org-gate-not-bare-kernel: OK — no module feeds the active selection to the bare kernel (${Object.keys(allowlist).length} reasoned exceptions).`,
    );
    return 0;
  }
  if (unallowed.length) {
    console.error(
      "check-org-gate-not-bare-kernel: the ACTIVE SELECTION reaches `requireOrganizationContext` without the gate.\n" +
        "A person with no organization selected gets a bare refusal and the picker never opens.\n" +
        "Fix: `await ensureOrganizationForRequest({ method })` (feature fetch client) or\n" +
        "`await ensureOrganizationContext({ organizationId })` (action seam) from lib/organization/organization-gate.ts;\n" +
        "a genuine background read declares `interactive: false`. See the header of this script.\n",
    );
    for (const v of unallowed) console.error(`  ${v.file}:${v.line}  [${v.shape}]  ${v.text}`);
  }
  if (stale.length) {
    console.error("\nAllowlisted files that no longer match — strike them from scripts/org-gate-not-bare-kernel.allowlist.json:");
    for (const file of stale) console.error(`  ${file}`);
  }
  return 1;
}

process.exit(main());
