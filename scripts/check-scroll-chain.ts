#!/usr/bin/env tsx
/**
 * Scroll-chain guard — catches broken bounded-height chains, the defect class
 * where a table or list silently stops scrolling and its rows get clipped.
 *
 * THE MECHANISM (live bug, 2026-08-09, the backlinks Insights lens): a
 * scrollable surface bounds itself with `min-h-0 flex-1` (or `h-full`), which
 * resolves to a real height only when EVERY ancestor in the chain is a flex
 * column. One plain `<div className="min-h-0 flex-1">` in the middle — block
 * display, so the child's `flex-1` is inert — leaves the surface at
 * height:auto. It then grows past the viewport and the page's
 * `overflow-hidden` clips it: no scrollbar, unreachable rows, and nothing
 * anywhere throws.
 *
 * THE RULE (intrinsic parents only, where className fully decides display):
 * an element carrying BOTH a grow token (`flex-1` / `flex-auto` / `grow`) AND
 * `min-h-0` — the unmistakable "I am a bounded scroll chain" signature — must
 * sit inside a `flex` / `inline-flex` / `grid` parent. Anything else is a
 * broken chain.
 *
 * THREE PASSES, because the real bugs crossed file and route boundaries:
 *   1. in-file — a `flex-1 min-h-0` element inside a non-flex parent.
 *   2. cross-file — a COMPONENT whose own root element grows (`flex-1`),
 *      rendered inside a non-flex parent somewhere else. This is exactly the
 *      backlinks shape: `<BacklinkObservationTable/>` (root `flex-1 min-h-0
 *      flex-col`) placed in a plain `<div className="min-h-0 flex-1">`.
 *   3. route layout — a layout that wraps `{children}` in `overflow-hidden`
 *      with no vertical scroll fallback. That contract makes every current
 *      and future leaf page responsible for remembering its own scroll owner;
 *      one omission silently amputates the page. The guard follows one local
 *      component boundary because Next layouts commonly delegate their frame
 *      to a `*LayoutClient` component.
 *
 * A third layer catches what static analysis cannot (a chain broken through a
 * prop, a portal, or a runtime-composed tree): the runtime guard in
 * `lib/layout/useClippedContentGuard.ts` measures the rendered surface and
 * screams into the Error Inspector. Each layer is sufficient alone.
 *
 * Modes:
 *   pnpm check:scroll-chain           scan app/ + features/ + components/ + lib/
 *   pnpm check:scroll-chain --strict  exit 1 when violations found
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "features", "components", "lib"] as const;
// These roots are source-only. Do not skip directories named `build` or
// `dist`: both are legitimate App Router segments in this repository, and a
// route-tree guard that silently omits them is worse than no guard.
const SKIP_DIRS = new Set(["node_modules", ".next", ".git"]);

/** Display tokens that make a child's `flex-1` resolve to a real height. */
const PARENT_DISPLAY_OK = ["flex", "inline-flex", "grid", "inline-grid"];
/** Grow tokens that are inert outside a flex parent. */
const GROW_TOKENS = ["flex-1", "flex-auto", "grow"];
/**
 * An element that states its own height does not need the flex parent —
 * `h-full` resolves against any definite-height parent (a flex item counts),
 * and a fixed `h-56` / `h-[40vh]` needs nothing at all. Such elements carry
 * `flex-1` only as a "grow if you can" hint, so they are not chain breaks.
 */
const SELF_BOUNDING = /(^|[\s:])h-(full|screen|dvh|svh|lvh|\d|\[)/;
/**
 * Sentinel for a className this scanner cannot read (a bare identifier, a
 * spread). Never treated as a violation — an unknown parent is not a broken
 * one, and a guard that cries wolf gets muted.
 */
const UNRESOLVED = "\0unresolved";

interface Violation {
  file: string;
  line: number;
  parent: string;
  parentClasses: string;
  child: string;
  childClasses: string;
}

interface RouteLayoutViolation {
  layout: string;
  source: string;
  line: number;
  parent: string;
  parentClasses: string;
}

function parseArgs(): { strict: boolean } {
  if (process.argv.includes("-h") || process.argv.includes("--help")) {
    console.log("Usage: check-scroll-chain [--strict]");
    process.exit(0);
  }
  return { strict: process.argv.includes("--strict") };
}

function walkTsx(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkTsx(full, out);
      continue;
    }
    if (entry.endsWith(".tsx") && !entry.endsWith(".test.tsx")) out.push(full);
  }
  return out;
}

function hasToken(classes: string, token: string): boolean {
  return new RegExp(`(^|[\\s:])${token.replace(/-/g, "\\-")}(\\s|$)`).test(
    classes,
  );
}

/**
 * Every string literal reachable from the element's `className` value, joined.
 * Covers `className="a b"`, `className={cn("a", cond && "b")}`, and template
 * chunks — a class present in ANY branch counts as present, which keeps the
 * guard conservative: it never invents a violation out of a conditional class.
 */
function classNameOf(node: ts.JsxOpeningLikeElement): string {
  const attribute = node.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) &&
      ts.isIdentifier(property.name) &&
      property.name.text === "className",
  );
  if (!attribute?.initializer) return "";
  if (
    node.attributes.properties.some((property) =>
      ts.isJsxSpreadAttribute(property),
    )
  ) {
    return UNRESOLVED;
  }

  const literals: string[] = [];
  let sawNonLiteral = false;
  const collect = (value: ts.Node): void => {
    if (ts.isIdentifier(value) || ts.isPropertyAccessExpression(value)) {
      // `className={wrapperClass}` / `{styles.foo}` — the real classes live
      // behind a binding this scanner cannot follow. Unknown, not a violation.
      sawNonLiteral = true;
    }
    if (
      ts.isStringLiteral(value) ||
      ts.isNoSubstitutionTemplateLiteral(value) ||
      ts.isTemplateHead(value) ||
      ts.isTemplateMiddle(value) ||
      ts.isTemplateTail(value)
    ) {
      literals.push(value.text);
    }
    value.forEachChild(collect);
  };
  collect(attribute.initializer);
  if (literals.length === 0 && sawNonLiteral) return UNRESOLVED;
  return literals.join(" ");
}

/** Intrinsic elements (lowercase) are the only parents whose display we know. */
function tagNameOf(node: ts.JsxOpeningLikeElement): string {
  return node.tagName.getText();
}

function isIntrinsic(tag: string): boolean {
  return /^[a-z]/.test(tag) && !tag.includes(".");
}

/**
 * The nearest enclosing JSX element — crossing fragments, expression
 * containers, arrow functions, and `.map()` callbacks, all of which are
 * transparent to layout. A `null` result means the element's parent lives in
 * another file (a prop or a component boundary), which only the runtime guard
 * can judge.
 */
function nearestJsxParent(node: ts.Node): ts.JsxElement | null {
  let current = node.parent;
  while (current) {
    if (ts.isJsxElement(current) && current.openingElement !== node) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

/** Every intrinsic JSX ancestor inside the current component return tree. */
function intrinsicJsxAncestors(node: ts.Node): ts.JsxElement[] {
  const ancestors: ts.JsxElement[] = [];
  let current = node.parent;
  while (current) {
    if (ts.isJsxElement(current)) {
      const tag = tagNameOf(current.openingElement);
      if (isIntrinsic(tag)) ancestors.push(current);
    }
    // A nested component/callback owns a different render tree. Do not accuse
    // an outer wrapper that is not actually an ancestor of this `children`.
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isArrowFunction(current) ||
      ts.isFunctionExpression(current)
    ) {
      break;
    }
    current = current.parent;
  }
  return ancestors;
}

const CLIP_TOKENS = [
  "overflow-hidden",
  "overflow-clip",
  "overflow-y-hidden",
  "overflow-y-clip",
];
const SCROLL_TOKENS = [
  "overflow-auto",
  "overflow-scroll",
  "overflow-y-auto",
  "overflow-y-scroll",
];

function clipsWithoutScrollFallback(classes: string): boolean {
  return (
    classes !== UNRESOLVED &&
    CLIP_TOKENS.some((token) => hasToken(classes, token)) &&
    !SCROLL_TOKENS.some((token) => hasToken(classes, token))
  );
}

function hasScrollFallback(classes: string): boolean {
  return (
    classes !== UNRESOLVED &&
    SCROLL_TOKENS.some((token) => hasToken(classes, token))
  );
}

/**
 * Route `children` must never be placed behind an unconditional clipper. A
 * nested editor/table can still own its scroll; `overflow-y-auto` on the
 * boundary is only the safe fallback when a leaf renders natural-height
 * content.
 */
function routeChildrenClipViolations(
  sourceFile: ts.SourceFile,
  sourcePath: string,
  layoutPath: string,
): RouteLayoutViolation[] {
  const violations: RouteLayoutViolation[] = [];
  const seen = new Set<number>();

  const visit = (node: ts.Node): void => {
    if (
      ts.isIdentifier(node) &&
      node.text === "children" &&
      ts.isJsxExpression(node.parent)
    ) {
      for (const parent of intrinsicJsxAncestors(node)) {
        const opening = parent.openingElement;
        const classes = classNameOf(opening);
        // The first vertical scroll owner makes every outer clipper safe: the
        // route content is bounded and reachable before it reaches them.
        if (hasScrollFallback(classes)) break;
        if (clipsWithoutScrollFallback(classes) && !seen.has(opening.pos)) {
          seen.add(opening.pos);
          violations.push({
            layout: relative(ROOT, layoutPath),
            source: relative(ROOT, sourcePath),
            line: lineOf(sourceFile, opening),
            parent: tagNameOf(opening),
            parentClasses: classes,
          });
        }
      }
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
  return violations;
}

/**
 * The release guard self-tests the two opposite cases that previously fooled
 * it. Keeping these fixtures inside the executable means the gate cannot pass
 * after somebody accidentally restores the nearest-parent-only blind spot or
 * starts flagging safe outer shell clippers again.
 */
function verifyRouteLayoutDetector(): void {
  const findingsFor = (source: string) =>
    routeChildrenClipViolations(
      ts.createSourceFile(
        "fixture.tsx",
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      ),
      join(ROOT, "fixture.tsx"),
      join(ROOT, "layout.tsx"),
    );

  const nestedClipper = findingsFor(`
    function Layout({ children }) {
      return <div className="h-full overflow-hidden"><div className="min-h-0 flex-1">{children}</div></div>;
    }
  `);
  if (nestedClipper.length !== 1) {
    throw new Error(
      "scroll-chain self-test failed: a clipper above a neutral route-child wrapper was not detected.",
    );
  }

  const safeInnerScroller = findingsFor(`
    function Layout({ children }) {
      return <div className="h-full overflow-hidden"><div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">{children}</div></div>;
    }
  `);
  if (safeInnerScroller.length !== 0) {
    throw new Error(
      "scroll-chain self-test failed: an inner vertical scroll fallback did not protect the outer shell clipper.",
    );
  }
}

function parseFile(path: string): ts.SourceFile {
  return ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
}

/**
 * The JSX element a component actually returns. A component with several
 * returns contributes each of them — if ANY returned root grows, every call
 * site must supply a flex parent.
 */
function rootElementsOfComponents(
  sourceFile: ts.SourceFile,
): Map<string, string[]> {
  const roots = new Map<string, string[]>();

  const record = (name: string, node: ts.Node): void => {
    const unwrapped = ts.isParenthesizedExpression(node)
      ? node.expression
      : node;
    if (!ts.isJsxElement(unwrapped) && !ts.isJsxSelfClosingElement(unwrapped)) {
      return;
    }
    const opening = ts.isJsxElement(unwrapped)
      ? unwrapped.openingElement
      : unwrapped;
    const classes = classNameOf(opening);
    if (!classes) return;
    roots.set(name, [...(roots.get(name) ?? []), classes]);
  };

  const visit = (node: ts.Node): void => {
    let name: string | null = null;
    let body: ts.Node | undefined;

    if (ts.isFunctionDeclaration(node) && node.name) {
      name = node.name.text;
      body = node.body;
    } else if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) ||
        ts.isFunctionExpression(node.initializer))
    ) {
      name = node.name.text;
      body = node.initializer.body;
    }

    if (name && /^[A-Z]/.test(name) && body) {
      if (!ts.isBlock(body)) {
        record(name, body);
      } else {
        const walkReturns = (inner: ts.Node): void => {
          // Don't descend into nested components/callbacks — their returns
          // are not this component's root.
          if (
            inner !== body &&
            (ts.isFunctionDeclaration(inner) ||
              ts.isArrowFunction(inner) ||
              ts.isFunctionExpression(inner))
          ) {
            return;
          }
          if (ts.isReturnStatement(inner) && inner.expression) {
            record(name as string, inner.expression);
          }
          inner.forEachChild(walkReturns);
        };
        walkReturns(body);
      }
    }

    node.forEachChild(visit);
  };
  visit(sourceFile);

  return roots;
}

/** Does this class list depend on a flex parent for its height? */
function needsFlexParent(classes: string): boolean {
  return (
    GROW_TOKENS.some((token) => hasToken(classes, token)) &&
    hasToken(classes, "min-h-0") &&
    !SELF_BOUNDING.test(classes)
  );
}

/** A component whose own root needs a flex parent to get any height. */
function isGrowRooted(rootClassLists: string[]): boolean {
  return rootClassLists.some(needsFlexParent);
}

/**
 * Where each imported name comes from, resolved to a file on disk. Pass 2 uses
 * this instead of matching component names globally — two unrelated files both
 * exporting a `HistoryList` must not contaminate each other.
 */
function importSources(
  sourceFile: ts.SourceFile,
  filePath: string,
): Map<string, string> {
  const sources = new Map<string, string>();
  const dir = dirname(filePath);

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !statement.importClause
    ) {
      continue;
    }
    const specifier = statement.moduleSpecifier.text;
    const base = specifier.startsWith("@/")
      ? join(ROOT, specifier.slice(2))
      : specifier.startsWith(".")
        ? resolve(dir, specifier)
        : null;
    if (!base) continue;

    const resolved = [`${base}.tsx`, join(base, "index.tsx")].find(
      (candidate) => {
        try {
          return statSync(candidate).isFile();
        } catch {
          return false;
        }
      },
    );
    if (!resolved) continue;

    const { name, namedBindings } = statement.importClause;
    if (name) sources.set(name.text, resolved);
    if (namedBindings && ts.isNamedImports(namedBindings)) {
      for (const element of namedBindings.elements) {
        sources.set(element.name.text, resolved);
      }
    }
  }
  return sources;
}

function scanFile(
  path: string,
  growRootedByFile: ReadonlyMap<string, ReadonlyMap<string, string>>,
): Violation[] {
  const rel = relative(ROOT, path);
  const sourceFile = parseFile(path);
  const violations: Violation[] = [];
  const imports = importSources(sourceFile, path);

  /** The grow-rooted definition behind a tag name, or null. */
  const growRootOf = (tag: string): string | null => {
    const sameFile = growRootedByFile.get(path)?.get(tag);
    if (sameFile) return sameFile;
    const from = imports.get(tag);
    return (from && growRootedByFile.get(from)?.get(tag)) ?? null;
  };

  const flag = (
    node: ts.JsxOpeningLikeElement,
    childLabel: string,
    childClasses: string,
  ): void => {
    const parent = nearestJsxParent(node);
    const parentTag = parent ? tagNameOf(parent.openingElement) : null;
    if (!parent || !parentTag || !isIntrinsic(parentTag)) return;
    const parentClasses = classNameOf(parent.openingElement);
    if (
      parentClasses === UNRESOLVED ||
      PARENT_DISPLAY_OK.some((token) => hasToken(parentClasses, token))
    ) {
      return;
    }
    violations.push({
      file: rel,
      line: lineOf(sourceFile, node),
      parent: parentTag,
      parentClasses: parentClasses || "(no className)",
      child: childLabel,
      childClasses,
    });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = tagNameOf(node);
      const classes = classNameOf(node);

      if (needsFlexParent(classes)) {
        // Pass 1 — the element declares the chain itself.
        flag(node, tag, classes);
      } else if (!classes && !isIntrinsic(tag)) {
        // Pass 2 — the element IS a component whose root declares the chain.
        const root = growRootOf(tag);
        if (root) flag(node, tag, `root: ${root} (in its own file)`);
      }
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);

  return violations;
}

function main(): void {
  const { strict } = parseArgs();
  verifyRouteLayoutDetector();
  const files = SCAN_DIRS.flatMap((dir) => walkTsx(join(ROOT, dir)));

  // Pass 0 — index, per file, every component whose own root element needs a
  // flex parent to get any height.
  const growRootedByFile = new Map<string, Map<string, string>>();
  for (const file of files) {
    const perFile = new Map<string, string>();
    for (const [name, rootClassLists] of rootElementsOfComponents(
      parseFile(file),
    )) {
      const growRoot = rootClassLists.find(needsFlexParent);
      if (growRoot) perFile.set(name, growRoot);
    }
    if (perFile.size > 0) growRootedByFile.set(file, perFile);
  }

  const violations = files.flatMap((file) => scanFile(file, growRootedByFile));

  // Pass 3 — route layouts may delegate their frame to one local client
  // component, so inspect the layout and every directly imported TSX module.
  const layoutFiles = files.filter((file) => file.endsWith("/layout.tsx"));
  const routePageFiles = files.filter((file) => file.endsWith("/page.tsx"));
  const routeLayoutViolations = layoutFiles.flatMap((layoutFile) => {
    const layoutSource = parseFile(layoutFile);
    const candidates = new Set<string>([
      layoutFile,
      ...importSources(layoutSource, layoutFile).values(),
    ]);
    return [...candidates].flatMap((sourcePath) =>
      routeChildrenClipViolations(
        parseFile(sourcePath),
        sourcePath,
        layoutFile,
      ),
    );
  });

  if (violations.length === 0 && routeLayoutViolations.length === 0) {
    console.log(
      `scroll-chain: OK — ${files.length} files, ${routePageFiles.length} route pages, and ${layoutFiles.length} route layouts; no broken bounded-height chains or unsafe route clippers.`,
    );
    return;
  }

  if (violations.length > 0) {
    console.log(
      `\nscroll-chain: ${violations.length} broken chain(s) — a \`flex-1 min-h-0\` child inside a non-flex parent is height:auto, so its scroll area never bounds:\n`,
    );
    for (const violation of violations) {
      console.log(`  ${violation.file}:${violation.line}`);
      console.log(
        `    <${violation.parent} class="${violation.parentClasses}">   <-- needs \`flex\` + \`flex-col\` (or grid)`,
      );
      console.log(
        `      <${violation.child} class="${violation.childClasses}">`,
      );
    }
    console.log(
      `\nFix: give the parent \`flex flex-col\`, or drop the child's \`flex-1 min-h-0\` if it is not a scroll chain.\n`,
    );
  }

  if (routeLayoutViolations.length > 0) {
    console.log(
      `\nscroll-chain: ${routeLayoutViolations.length} unsafe route-layout clipper(s) — route children can be taller than the viewport, but the layout provides no vertical scroll fallback:\n`,
    );
    for (const violation of routeLayoutViolations) {
      console.log(`  ${violation.source}:${violation.line}`);
      if (violation.source !== violation.layout) {
        console.log(`    imported by ${violation.layout}`);
      }
      console.log(
        `    <${violation.parent} class="${violation.parentClasses}">{children}</${violation.parent}>`,
      );
    }
    console.log(
      `\nFix: replace the layout boundary's vertical clip with \`overflow-y-auto overflow-x-hidden\`. Full-height editors and tables keep their own inner scroll; natural-height pages inherit the safe fallback.\n`,
    );
  }

  if (strict) process.exit(1);
}

main();
