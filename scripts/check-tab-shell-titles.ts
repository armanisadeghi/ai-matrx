/**
 * scripts/check-tab-shell-titles.ts — EVERY TAB OF A TAB SHELL NAMES ITSELF.
 *
 * THE DEFECT (Arman, 2026-09-30): manage.aimatrx.com/administration/users/agent-review
 * showed the browser tab "Users & Access". `administration/users/layout.tsx` is a
 * tab shell — it renders a tab bar over fifteen sibling routes (Agent Review,
 * Admins, Invitations, Entitlements, Usage, Email…) and exports ONE `metadata`
 * for the whole tree. None of the siblings had metadata of its own, so clicking
 * through fifteen completely different admin tools never changed the browser tab:
 * fifteen open tabs all read "Users & Access" and all wore the same badge.
 *
 * WHY THE EXISTING GUARD DID NOT CATCH IT: `check:route-metadata` checks only the
 * FIRST routable level of each route family, on purpose — a genuinely
 * single-purpose sub-page SHOULD inherit its section's identity. That scope is
 * right and stays. This check covers the narrower shape it deliberately skips.
 *
 * THE SHAPE: a directory with a `layout.tsx` whose immediate child route
 * directories (route groups `(x)` are transparent) each hold their own page.
 * Those children are siblings a person switches between. When two or more of
 * them resolve to the SAME effective title, the browser cannot tell them apart.
 * The shell's own index page (`users/page.tsx`) is the shell's front door — it
 * is not a child, so it may keep the section's title.
 *
 * HOW A TITLE IS RESOLVED — the real thing, not a text match. For each child the
 * owner is the nearest file at or above it (page before layout, walking up) that
 * exports `metadata` or `generateMetadata`, exactly as Next.js picks the title.
 *   · A static `createRouteMetadata(path, {...})` / `createDynamicRouteMetadata`
 *     whose title fields are literals is EVALUATED through the shipping helper
 *     and its `.title` read back. A literal `{ title: "…" }` is read directly.
 *   · `createTabMetadata(path, { titlePrefix })` is "<prefix> | <its parent's
 *     resolved title>" — so two tabs of one record shell differ exactly when
 *     their prefixes do, and the record's name is never lost.
 *   · A `generateMetadata` that titles the page from the request PATHNAME through
 *     one imported resolver (Marketing) is evaluated by calling that resolver for
 *     each child's URL — a resolver that sends several children to one fallback
 *     is caught; one that names each child passes.
 *   · Any other `generateMetadata` depends on params and data, so its identity is
 *     its owner file: two siblings owned by the SAME function collide.
 *   · A child whose page only redirects (`redirect`/`permanentRedirect`, no JSX)
 *     owns no browser tab and is not counted.
 *
 * THE ESCAPE, for siblings that genuinely are the same page (an alias, a v2 of
 * the same tool being tried side by side):
 *
 *   // tab-shell-title-ok: <why these siblings may share a title>
 *
 * anywhere in the SHELL's layout.tsx. A bare marker with no reason is itself an
 * offence — the reason is the point.
 *
 * Usage: tsx scripts/check-tab-shell-titles.ts [--strict] [--self-test] [--json]
 *   exit 0 clean (advisory) · exit 2 offences under --strict · exit 3 self-test failed
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import ts from "typescript";
import { emitItem, endItems } from "./checks/items.mjs";
import { exitAfterDrain } from "./lib/exit-after-drain";
import { createDynamicRouteMetadata, createRouteMetadata } from "../utils/route-metadata";

const PAGE_FILES = ["page.tsx", "page.dev.tsx"];
const LAYOUT_FILES = ["layout.tsx", "layout.dev.tsx"];
const ESCAPE = /tab-shell-title-ok:[ \t]*(\S.*)?$/m;

/** A directory is a route-group when its name is `(something)` — not part of the URL. */
const isGroup = (name: string) => name.startsWith("(") && name.endsWith(")");
/** Private folders, parallel slots and intercepting routes are not sibling tabs. */
const isNonRoute = (name: string) =>
  name.startsWith("_") || name.startsWith("@") || name.startsWith("(.") || name === "node_modules";

function firstExisting(dir: string, names: string[]): string | null {
  for (const n of names) if (existsSync(join(dir, n))) return join(dir, n);
  return null;
}

/** Immediate child ROUTE directories that hold a page — route groups are walked through. */
function childRoutes(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || isNonRoute(entry.name)) continue;
    const child = join(dir, entry.name);
    if (isGroup(entry.name)) {
      out.push(...childRoutes(child));
      continue;
    }
    if (firstExisting(child, PAGE_FILES)) out.push(child);
  }
  return out;
}

const METADATA_EXPORT =
  /export\s+(?:const\s+metadata\b|(?:async\s+)?function\s+generateMetadata\b|const\s+generateMetadata\b)/;

/**
 * Nearest file at or above `dir` exporting metadata — the child's own page first,
 * then layouts walking up. With `fromParent`, the search starts at the segment
 * ABOVE `dir` and reads layouts only: that is what Next hands a segment's
 * `generateMetadata` as its `parent`.
 */
function ownerOf(dir: string, appRoot: string, fromParent = false): string | null {
  let cur = fromParent ? dirname(dir) : dir;
  for (;;) {
    const candidates = [
      ...(!fromParent && cur === dir ? PAGE_FILES.map((p) => join(cur, p)) : []),
      ...LAYOUT_FILES.map((l) => join(cur, l)),
    ];
    for (const f of candidates) {
      if (!existsSync(f)) continue;
      if (METADATA_EXPORT.test(readFileSync(f, "utf8"))) return f;
    }
    if (cur === appRoot) return null;
    const up = dirname(cur);
    if (up === cur) return null;
    cur = up;
  }
}

/** Read a string-literal-ish value (plain or no-substitution template). */
function literal(node: ts.Expression | undefined): string | undefined {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return undefined;
}

/** How a file's metadata export decides its title. */
type TitleInfo =
  | { kind: "title"; title: string }
  | { kind: "tab"; titlePrefix: string }
  | { kind: "pathname"; module: string; exportName: string }
  | { kind: "dynamic" }
  | { kind: "opaque" };

function titleOf(file: string): TitleInfo {
  const source = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  const imports = new Map<string, string>();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    const named = st.importClause?.namedBindings;
    if (named && ts.isNamedImports(named))
      for (const el of named.elements) imports.set(el.name.text, st.moduleSpecifier.text);
  }

  let result: TitleInfo | null = null;
  const visit = (node: ts.Node) => {
    if (result) return;
    if (ts.isVariableStatement(node) && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
      for (const decl of node.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
        if (decl.name.text === "generateMetadata") {
          result = tabCall(decl.initializer) ?? { kind: "dynamic" };
          return;
        }
        if (decl.name.text === "metadata") {
          result = evaluate(decl.initializer);
          return;
        }
      }
    }
    if (ts.isFunctionDeclaration(node) && node.name?.text === "generateMetadata") {
      result = pathnameRouted(node, imports) ?? { kind: "dynamic" };
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return result ?? { kind: "opaque" };
}

/** `export const generateMetadata = createTabMetadata("/x", { titlePrefix: "Tab" })`. */
function tabCall(init: ts.Expression): TitleInfo | null {
  if (!ts.isCallExpression(init) || !ts.isIdentifier(init.expression)) return null;
  if (init.expression.text !== "createTabMetadata") return null;
  const opts = init.arguments[1];
  if (!opts || !ts.isObjectLiteralExpression(opts)) return null;
  const titlePrefix = prop(opts, "titlePrefix");
  return titlePrefix ? { kind: "tab", titlePrefix } : null;
}

/**
 * A generateMetadata that titles the page from the REQUEST PATHNAME through one
 * imported resolver (the Marketing module's shape) is evaluated per child by
 * calling that resolver — so a resolver that maps every child to its own title
 * passes, and one that sends several to a shared fallback is caught.
 */
function pathnameRouted(fn: ts.FunctionDeclaration, imports: Map<string, string>): TitleInfo | null {
  const body = fn.body;
  if (!body || !body.getText().includes("x-pathname")) return null;
  for (const st of body.statements) {
    if (!ts.isReturnStatement(st) || !st.expression || !ts.isCallExpression(st.expression)) continue;
    const callee = st.expression.expression;
    if (!ts.isIdentifier(callee) || st.expression.arguments.length !== 1) continue;
    const module = imports.get(callee.text);
    if (module) return { kind: "pathname", module, exportName: callee.text };
  }
  return null;
}

function evaluate(init: ts.Expression): TitleInfo {
  if (ts.isObjectLiteralExpression(init)) {
    const t = prop(init, "title");
    return t !== undefined ? { kind: "title", title: t } : { kind: "opaque" };
  }
  if (ts.isCallExpression(init) && ts.isIdentifier(init.expression)) {
    const fn = init.expression.text;
    const [pathArg, optsArg] = init.arguments;
    const path = literal(pathArg as ts.Expression);
    if (
      (fn === "createRouteMetadata" || fn === "createDynamicRouteMetadata") &&
      path !== undefined &&
      optsArg &&
      ts.isObjectLiteralExpression(optsArg)
    ) {
      const title = prop(optsArg, "title");
      const titlePrefix = prop(optsArg, "titlePrefix");
      // A title field that is present but not a literal cannot be evaluated statically.
      if (hasProp(optsArg, "title") && title === undefined) return { kind: "opaque" };
      if (hasProp(optsArg, "titlePrefix") && titlePrefix === undefined) return { kind: "opaque" };
      const md =
        fn === "createRouteMetadata"
          ? createRouteMetadata(path, { title, titlePrefix })
          : createDynamicRouteMetadata(path, { title: title ?? "", titlePrefix });
      return typeof md.title === "string" ? { kind: "title", title: md.title } : { kind: "opaque" };
    }
  }
  return { kind: "opaque" };
}

function hasProp(obj: ts.ObjectLiteralExpression, name: string): boolean {
  return obj.properties.some(
    (p) => (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && p.name.getText() === name,
  );
}

function prop(obj: ts.ObjectLiteralExpression, name: string): string | undefined {
  for (const p of obj.properties) {
    if (ts.isPropertyAssignment(p) && p.name.getText() === name) return literal(p.initializer);
  }
  return undefined;
}

/**
 * A page that only redirects never owns a browser tab — nobody sees its title.
 * (The legacy Marketing pillars are this: every one `permanentRedirect`s.)
 */
function isRedirectShim(childDir: string): boolean {
  const page = firstExisting(childDir, PAGE_FILES);
  if (!page) return false;
  const src = readFileSync(page, "utf8");
  return /\b(?:permanentRedirect|redirect)\(/.test(src) && !/<[A-Za-z]/.test(src);
}

/** The URL of a route directory, with dynamic segments filled by a sample id. */
const SAMPLE_ID = "00000000-0000-4000-8000-000000000000";
function sampleUrl(dir: string, appRoot: string): string {
  const segs = relative(appRoot, dir)
    .split("/")
    .filter((s) => s && !isGroup(s))
    .map((s) => (s.startsWith("[") ? SAMPLE_ID : s));
  return "/" + segs.join("/");
}

export interface Offence {
  shell: string;
  title: string;
  children: string[];
  /** The one file every child in this group takes its title from. */
  owner: string;
  /** How that title is known. */
  kind: "title" | "tab" | "pathname" | "dynamic" | "opaque" | "marker";
}

type Resolved = { key: string; title: string | null; kind: Offence["kind"]; owner: string };

async function resolveTitle(
  child: string,
  appRoot: string,
  repoRoot: string,
  depth = 0,
): Promise<Resolved | null> {
  const owner = ownerOf(child, appRoot, depth > 0);
  if (!owner) return null;
  const info = titleOf(owner);
  switch (info.kind) {
    case "title":
      return { key: `title:${info.title}`, title: info.title, kind: "title", owner };
    case "tab": {
      // The tab's own words + whatever its parent resolves to.
      const parent = depth < 8 ? await resolveTitle(dirname(owner), appRoot, repoRoot, depth + 1) : null;
      const parentTitle = parent?.title ?? "(record)";
      return {
        key: `tab:${info.titlePrefix}::${parent?.key ?? "none"}`,
        title: `${info.titlePrefix} | ${parentTitle}`,
        kind: "tab",
        owner,
      };
    }
    case "pathname": {
      const spec = info.module.startsWith("@/")
        ? join(repoRoot, info.module.slice(2))
        : join(dirname(owner), info.module);
      try {
        const mod = (await import(spec)) as Record<string, (p: string) => { title?: unknown }>;
        const md = mod[info.exportName](sampleUrl(child, appRoot));
        const t = typeof md.title === "string" ? md.title : JSON.stringify(md.title);
        return { key: `title:${t}`, title: t, kind: "pathname", owner };
      } catch {
        return { key: `dynamic:${owner}`, title: null, kind: "dynamic", owner };
      }
    }
    default:
      return { key: `${info.kind}:${owner}`, title: null, kind: info.kind, owner };
  }
}

export async function scan(
  appRoot: string,
  repoRoot: string,
): Promise<{ offences: Offence[]; shells: number }> {
  const offences: Offence[] = [];
  let shells = 0;
  const shellDirs: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && !isNonRoute(entry.name)) walk(join(dir, entry.name));
    }
    if (!firstExisting(dir, LAYOUT_FILES)) return;
    // `app/` and `app/(group)/` roots belong to check:route-metadata (first routable level).
    const rel = relative(appRoot, dir);
    if (rel === "" || rel.split("/").every(isGroup)) return;
    shellDirs.push(dir);
  };
  walk(appRoot);

  for (const dir of shellDirs) {
    const layout = firstExisting(dir, LAYOUT_FILES)!;
    const children = childRoutes(dir).filter((c) => !isRedirectShim(c));
    if (children.length < 2) continue;
    shells++;

    const escape = ESCAPE.exec(readFileSync(layout, "utf8"));
    if (escape && escape[1]) continue;

    const byTitle = new Map<string, { r: Resolved; children: string[] }>();
    for (const child of children) {
      const r = await resolveTitle(child, appRoot, repoRoot);
      if (!r) continue; // no metadata anywhere — check:route-metadata's finding, not ours
      const slot = byTitle.get(r.key) ?? { r, children: [] };
      slot.children.push(relative(repoRoot, child));
      byTitle.set(r.key, slot);
    }

    for (const { r, children: group } of byTitle.values()) {
      if (group.length < 2) continue;
      const owner = relative(repoRoot, r.owner);
      offences.push({
        shell: relative(repoRoot, layout),
        title:
          r.title ??
          (r.kind === "dynamic"
            ? `(per-request generateMetadata in ${owner})`
            : `(unevaluable metadata in ${owner})`),
        children: group.sort(),
        owner,
        kind: r.kind,
      });
    }
    if (escape && !escape[1]) {
      offences.push({
        shell: relative(repoRoot, layout),
        title: "(bare tab-shell-title-ok marker — give a reason)",
        children: [],
        owner: relative(repoRoot, layout),
        kind: "marker",
      });
    }
  }

  return { offences, shells };
}

async function selfTest(): Promise<number> {
  const root = mkdtempSync(join(tmpdir(), "tab-shell-"));
  const app = join(root, "app");
  const write = (p: string, body: string) => {
    mkdirSync(dirname(join(app, p)), { recursive: true });
    writeFileSync(join(app, p), body);
  };
  const shellLayout = `import { createRouteMetadata } from "@/utils/route-metadata";
export const metadata = createRouteMetadata("/administration", { title: "Users & Access", letter: "US" });
export default function L({ children }) { return children; }`;
  const page = `export default function P() { return null; }`;

  let failed = 0;
  const expect = (name: string, got: number, want: number) => {
    if (got !== want) {
      console.error(`  SELF-TEST FAILED: ${name} — expected ${want} offence(s), got ${got}`);
      failed++;
    } else console.log(`  ok: ${name}`);
  };

  try {
    // RED — the 2026-09-30 shape: one shell title, two sibling tools inheriting it.
    write("(admin)/administration/users/layout.tsx", shellLayout);
    write("(admin)/administration/users/page.tsx", page);
    write("(admin)/administration/users/agent-review/page.tsx", page);
    write("(admin)/administration/users/admins/page.tsx", page);
    expect("two siblings inheriting the shell's one title is an offence", (await scan(app, root)).offences.length, 1);

    // GREEN — each sibling names itself through the real helper.
    write(
      "(admin)/administration/users/agent-review/layout.tsx",
      `import { createRouteMetadata } from "@/utils/route-metadata";
export const metadata = createRouteMetadata("/administration", { titlePrefix: "Agent Review", title: "Users & Access", letter: "AR" });`,
    );
    write(
      "(admin)/administration/users/admins/layout.tsx",
      `import { createRouteMetadata } from "@/utils/route-metadata";
export const metadata = createRouteMetadata("/administration", { titlePrefix: "Admins", title: "Users & Access", letter: "AD" });`,
    );
    expect("each sibling with its own titlePrefix is clean", (await scan(app, root)).offences.length, 0);

    // RED — own layouts, but a copy-paste left the SAME evaluated title on both.
    write(
      "(admin)/administration/users/admins/layout.tsx",
      `import { createRouteMetadata } from "@/utils/route-metadata";
export const metadata = createRouteMetadata("/administration", { titlePrefix: "Agent Review", title: "Users & Access" });`,
    );
    expect("two own layouts that evaluate to one title still collide", (await scan(app, root)).offences.length, 1);

    // GREEN — the shell's own index page is its front door, never a child.
    rmSync(join(app, "(admin)/administration/users/admins"), { recursive: true });
    expect("the shell's own index page is not counted as a sibling", (await scan(app, root)).offences.length, 0);

    // GREEN — a reasoned escape silences a deliberate pair; RED — a bare one does not.
    write("(admin)/administration/users/v2/page.tsx", page);
    write("(admin)/administration/users/v3/page.tsx", page);
    writeFileSync(
      join(app, "(admin)/administration/users/layout.tsx"),
      shellLayout + "\n// tab-shell-title-ok: v2 and v3 are the same intake form, trialled side by side\n",
    );
    expect("a reasoned escape silences the shell", (await scan(app, root)).offences.length, 0);
    writeFileSync(join(app, "(admin)/administration/users/layout.tsx"), shellLayout + "\n// tab-shell-title-ok:\n");
    expect("a bare escape is itself an offence", (await scan(app, root)).offences.length >= 1 ? 1 : 0, 1);

    // A RECORD shell: the section title is per request (generateMetadata fetches it).
    const dyn = `export async function generateMetadata({ params }) { return { title: "x" }; }
export default function L({ children }) { return children; }`;
    write("(core)/research/topics/[topicId]/layout.tsx", dyn);
    write("(core)/research/topics/[topicId]/page.tsx", page);
    write("(core)/research/topics/[topicId]/sources/page.tsx", page);
    write("(core)/research/topics/[topicId]/keywords/page.tsx", page);
    const before = (await scan(app, root)).offences.filter((o) => o.shell.includes("[topicId]")).length;
    expect("record-shell siblings sharing the one per-request title collide", before, 1);

    const tab = (prefix: string) => `import { createTabMetadata } from "@/utils/route-metadata";
export const generateMetadata = createTabMetadata("/research", { titlePrefix: "${prefix}", letter: "XX" });
export default function L({ children }) { return children; }`;
    write("(core)/research/topics/[topicId]/sources/layout.tsx", tab("Sources"));
    write("(core)/research/topics/[topicId]/keywords/layout.tsx", tab("Keywords"));
    const tabbed = (await scan(app, root)).offences.filter((o) => o.shell.includes("[topicId]")).length;
    expect("createTabMetadata with distinct prefixes keeps the record name and is clean", tabbed, 0);

    write("(core)/research/topics/[topicId]/keywords/layout.tsx", tab("Sources"));
    const same = (await scan(app, root)).offences.filter((o) => o.shell.includes("[topicId]")).length;
    expect("createTabMetadata with the SAME prefix on two tabs still collides", same, 1);

    // A page that only redirects owns no browser tab, so it never counts.
    write("(core)/research/topics/[topicId]/keywords/layout.tsx", tab("Keywords"));
    write("(core)/research/topics/[topicId]/old-a/page.tsx", `import { permanentRedirect } from "next/navigation";
export default function P() { permanentRedirect("/x"); }`);
    write("(core)/research/topics/[topicId]/old-b/page.tsx", `import { redirect } from "next/navigation";
export default function P() { redirect("/y"); }`);
    const shims = (await scan(app, root)).offences.filter((o) => o.shell.includes("[topicId]")).length;
    expect("two redirect-only siblings are not tabs and never collide", shims, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  return failed === 0 ? 0 : 3;
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) {
    console.log("check-tab-shell-titles self-test");
    return await selfTest();
  }
  const strict = args.includes("--strict");
  const repoRoot = process.cwd();
  const { offences, shells } = await scan(join(repoRoot, "app"), repoRoot);

  if (args.includes("--json")) {
    console.log(JSON.stringify({ shells, offences }, null, 2));
    return 0;
  }

  for (const o of offences) {
    emitItem({
      key: `shared-title|${o.shell}|${o.title}`,
      status: "new",
      title: `${o.children.length} sibling tabs share the title "${o.title}"`,
      file: o.shell,
      rule: "shared-title",
    });
  }
  endItems();

  console.log(`check-tab-shell-titles: ${shells} tab shells read`);
  if (offences.length === 0) {
    console.log("\nEvery sibling tab of every tab shell names itself.");
    return 0;
  }

  const pages = offences.reduce((n, o) => n + o.children.length, 0);
  console.error(`\n${offences.length} tab shell(s) where ${pages} sibling pages share one title:`);
  for (const o of offences) {
    console.error(`  ${o.shell}  — "${o.title}"`);
    for (const c of o.children) console.error(`      ${c}`);
  }
  console.error(
    `\nGive each sibling its own metadata — createRouteMetadata(<section path>, { titlePrefix:\n` +
      `"<Tab name>", title: "<Section>", letter: "<2 chars>" }) in a layout.tsx beside its\n` +
      `page — or, when two siblings are genuinely the same page, mark the shell with\n` +
      `  // tab-shell-title-ok: <reason>.`,
  );
  return strict ? 2 : 0;
}

void main().then(exitAfterDrain);
