#!/usr/bin/env tsx
/**
 * P12 interactive-root inventory.
 *
 * Route and overlay registries expose two strong surface identity axes, but
 * direct Dialog/Drawer/Sheet/Tabs roots have no shared registry. This scanner
 * deliberately reports only conservative AUDIT CANDIDATES: canonical roots
 * that own explicit state and sit inside a component whose identity names the
 * interaction. A candidate is not automatically a Surface finding; the owner
 * and data meaning still require review under the surface-authoring skill.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, relative, resolve } from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const SOURCE_ROOTS = ["app", "components", "features"] as const;
const TEST_FILE_RE =
  /(?:^|\/)(?:__tests__\/|[^/]+\.(?:test|spec|stories)\.tsx$)/;

type InteractiveRootKind =
  "dialog" | "alert-dialog" | "drawer" | "sheet" | "tabs";

const ROOT_IMPORTS: ReadonlyMap<
  string,
  ReadonlyMap<string, InteractiveRootKind>
> = new Map([
  [
    "@/components/ui/dialog",
    new Map<string, InteractiveRootKind>([["Dialog", "dialog"]]),
  ],
  [
    "@/components/ui/alert-dialog",
    new Map<string, InteractiveRootKind>([["AlertDialog", "alert-dialog"]]),
  ],
  [
    "@/components/ui/drawer",
    new Map<string, InteractiveRootKind>([["Drawer", "drawer"]]),
  ],
  [
    // Sheet moved to the design-system package (C9 swap, 2026-08-30).
    "@ai-matrx/design-system",
    new Map<string, InteractiveRootKind>([["Sheet", "sheet"]]),
  ],
  [
    "@/components/ui/tabs",
    new Map<string, InteractiveRootKind>([["Tabs", "tabs"]]),
  ],
]);

const MODAL_IDENTITY_RE = /(?:Dialog|Modal|Drawer|Sheet)$/;
const TABS_IDENTITY_RE =
  /(?:Tabs|Workspace|Workbench|Editor|Viewer|Panel|Console|Page)$/;
const ACTION_IDENTITY_RE =
  /^(?:Add|Apply|Attach|Auth|Choose|Confirm|Confirmation|Convert|Create|Crop|Delete|Duplicate|Edit|Export|Import|Invite|Link|Move|New|Notify|Open|Paste|Pick|Promote|Reassign|Remove|Rename|Request|Rerun|Save|Select|Share|Split|Sync|Unlink|Upload|Upgrade)|(?:Input|Confirm|Confirmation|Picker|Preview|Selector)Dialog$/;
const MIN_MODAL_JSX_ELEMENTS = 8;

export interface InteractiveRootCandidate {
  file: string;
  line: number;
  component: string;
  kind: InteractiveRootKind;
  stateProp: "open" | "value" | "defaultValue";
  runtimeProvider: boolean;
}

export interface InteractiveRootAnalysis {
  roots: number;
  statefulRoots: number;
  subordinateRoots: number;
  candidates: InteractiveRootCandidate[];
}

function jsxName(node: ts.JsxTagNameExpression): string | null {
  return ts.isIdentifier(node) ? node.text : null;
}

function attributeName(node: ts.JsxAttributeLike): string | null {
  return ts.isJsxAttribute(node) ? node.name.getText() : null;
}

function componentIdentity(
  node: ts.Node,
): { name: string; node: ts.Node } | null {
  let current: ts.Node | undefined = node;
  while (current && !ts.isSourceFile(current)) {
    if (
      ts.isFunctionDeclaration(current) &&
      current.name &&
      /^[A-Z]/.test(current.name.text)
    ) {
      return { name: current.name.text, node: current };
    }
    if (
      (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) &&
      ts.isVariableDeclaration(current.parent) &&
      ts.isIdentifier(current.parent.name) &&
      /^[A-Z]/.test(current.parent.name.text)
    ) {
      return { name: current.parent.name.text, node: current };
    }
    current = current.parent;
  }
  return null;
}

function containsRuntimeProvider(node: ts.Node): boolean {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (ts.isJsxOpeningLikeElement(child)) {
      const name = jsxName(child.tagName);
      if (
        name === "SurfaceRuntimeProvider" ||
        name === "StaticSurfaceRuntimeProvider"
      ) {
        found = true;
        return;
      }
    }
    if (!found) ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function identityMatches(
  kind: InteractiveRootKind,
  component: string,
): boolean {
  return kind === "tabs"
    ? TABS_IDENTITY_RE.test(component)
    : MODAL_IDENTITY_RE.test(component);
}

function jsxElementCount(node: ts.Node): number {
  let count = 0;
  const visit = (child: ts.Node): void => {
    if (ts.isJsxOpeningLikeElement(child)) count += 1;
    ts.forEachChild(child, visit);
  };
  visit(node);
  return count;
}

function isIndependentCandidate(
  kind: InteractiveRootKind,
  identity: { name: string; node: ts.Node },
): boolean {
  if (!identityMatches(kind, identity.name)) return false;
  if (kind === "tabs") return true;
  return (
    !ACTION_IDENTITY_RE.test(identity.name) &&
    jsxElementCount(identity.node) >= MIN_MODAL_JSX_ELEMENTS
  );
}

function importedRoots(
  source: ts.SourceFile,
): Map<string, InteractiveRootKind> {
  const roots = new Map<string, InteractiveRootKind>();
  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !statement.importClause?.namedBindings ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      continue;
    }
    const known = ROOT_IMPORTS.get(statement.moduleSpecifier.text);
    if (!known) continue;
    for (const element of statement.importClause.namedBindings.elements) {
      const imported = (element.propertyName ?? element.name).text;
      const kind = known.get(imported);
      if (kind) roots.set(element.name.text, kind);
    }
  }
  return roots;
}

export function analyzeInteractiveRootSource(
  file: string,
  sourceText: string,
): InteractiveRootAnalysis {
  const source = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const roots = importedRoots(source);
  const candidates: InteractiveRootCandidate[] = [];
  let rootCount = 0;
  let statefulRootCount = 0;
  let subordinateRootCount = 0;

  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningLikeElement(node)) {
      const localName = jsxName(node.tagName);
      const kind = localName ? roots.get(localName) : undefined;
      if (kind) {
        rootCount += 1;
        const acceptedStateProps =
          kind === "tabs" ? ["value", "defaultValue"] : ["open"];
        const stateProp = node.attributes.properties
          .map(attributeName)
          .find((name): name is InteractiveRootCandidate["stateProp"] =>
            acceptedStateProps.includes(name ?? ""),
          );
        if (stateProp) {
          statefulRootCount += 1;
          const identity = componentIdentity(node);
          if (identity && isIndependentCandidate(kind, identity)) {
            const position = source.getLineAndCharacterOfPosition(
              node.getStart(source),
            );
            candidates.push({
              file,
              line: position.line + 1,
              component: identity.name,
              kind,
              stateProp,
              runtimeProvider: containsRuntimeProvider(identity.node),
            });
          } else {
            subordinateRootCount += 1;
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  return {
    roots: rootCount,
    statefulRoots: statefulRootCount,
    subordinateRoots: subordinateRootCount,
    candidates,
  };
}

function trackedTsxFiles(): string[] {
  const output = execFileSync(
    "git",
    ["ls-files", "-z", "--", ...SOURCE_ROOTS.map((root) => `${root}/**/*.tsx`)],
    { cwd: ROOT, encoding: "utf8" },
  );
  return output
    .split("\0")
    .filter(Boolean)
    .filter((file) => !TEST_FILE_RE.test(file))
    .sort();
}

export function scanInteractiveRoots(
  repoRoot = ROOT,
): InteractiveRootAnalysis & { files: number } {
  const files = trackedTsxFiles();
  const combined: InteractiveRootAnalysis = {
    roots: 0,
    statefulRoots: 0,
    subordinateRoots: 0,
    candidates: [],
  };
  for (const file of files) {
    const absolute = resolve(repoRoot, file);
    const analysis = analyzeInteractiveRootSource(
      relative(repoRoot, absolute),
      readFileSync(absolute, "utf8"),
    );
    combined.roots += analysis.roots;
    combined.statefulRoots += analysis.statefulRoots;
    combined.subordinateRoots += analysis.subordinateRoots;
    combined.candidates.push(...analysis.candidates);
  }
  combined.candidates.sort(
    (left, right) =>
      left.file.localeCompare(right.file) || left.line - right.line,
  );
  return { files: files.length, ...combined };
}

function main(): void {
  const result = scanInteractiveRoots();
  const withRuntime = result.candidates.filter(
    (candidate) => candidate.runtimeProvider,
  ).length;
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(
    `Interactive surface roots: ${result.files} TSX files, ${result.roots} canonical roots, ${result.statefulRoots} with explicit state, ${result.candidates.length} independent identity+state audit candidates.`,
  );
  console.log(
    `  subordinate/uncertain roots excluded: ${result.subordinateRoots}; runtime provider in candidate owner: ${withRuntime}; provider evidence absent: ${result.candidates.length - withRuntime}.`,
  );
  if (result.candidates.length === 0) return;
  console.warn(
    "\nAUDIT CANDIDATES (not automatic findings): verify independent data meaning before declaring a Surface:",
  );
  for (const candidate of result.candidates) {
    console.warn(
      `  - ${candidate.file}:${candidate.line} | ${candidate.component} | ${candidate.kind} ${candidate.stateProp} | runtime ${candidate.runtimeProvider ? "present" : "not evidenced"}`,
    );
  }
}

if (basename(process.argv[1] ?? "") === "check-surface-interactive-roots.ts")
  main();
