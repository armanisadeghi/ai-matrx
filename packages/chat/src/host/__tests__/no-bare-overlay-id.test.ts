/**
 * no-bare-overlay-id (CPM-009c, slice P18).
 *
 * The package names a window only through its registry — `CHAT_WINDOWS.<id>`
 * in `host/windows.ts`. A bare string is how a renamed or retired overlay id
 * keeps compiling (the host's id union widens it back) and then opens nothing.
 *
 * Fails on, anywhere under packages/chat/src (tests included):
 *   1. a string literal equal to a registered window id, outside the registry;
 *   2. a string literal in an overlay-id position, registered or not — an
 *      `overlayId` / `downstreamOverlayId` property or JSX attribute, an
 *      `*OVERLAY_ID*` constant, or the id argument of an overlay call.
 * Comments are ignored (TypeScript parser).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as ts from "typescript";
import { CHAT_WINDOW_IDS } from "../windows";

const SRC = path.resolve(__dirname, "../..");
const REGISTRY = path.join(SRC, "host", "windows.ts");
const IDS: ReadonlySet<string> = new Set(CHAT_WINDOW_IDS);

const ID_PROPERTIES = new Set(["overlayId", "downstreamOverlayId"]);
const ID_CALLS = new Set([
  "openOverlay",
  "closeOverlay",
  "toggleOverlay",
  "closeAllInstancesOfOverlay",
  "selectIsOverlayOpen",
  "selectOverlayData",
  "selectOverlay",
  "selectOpenInstances",
  "useIsChatWindowOpen",
]);
const PORT_METHODS = new Set(["open", "close", "isOpen"]);

function files(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) files(full, out);
    else if (/\.tsx?$/.test(name) && !name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

function nameOf(node: ts.Node | undefined): string | null {
  if (!node) return null;
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) return node.text;
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isJsxNamespacedName(node)) return node.name.text;
  return null;
}

function inIdPosition(literal: ts.Node): boolean {
  let parent = literal.parent;
  if (parent && ts.isJsxExpression(parent)) parent = parent.parent;
  if (!parent) return false;
  if (ts.isPropertyAssignment(parent) && parent.initializer === literal)
    return ID_PROPERTIES.has(nameOf(parent.name) ?? "");
  if (ts.isJsxAttribute(parent))
    return ID_PROPERTIES.has(nameOf(parent.name) ?? "");
  if (ts.isVariableDeclaration(parent))
    return /OVERLAY_ID/i.test(nameOf(parent.name) ?? "");
  if (ts.isCallExpression(parent) && parent.arguments.includes(literal as ts.Expression)) {
    const callee = parent.expression;
    if (ts.isIdentifier(callee)) return ID_CALLS.has(callee.text);
    if (ts.isPropertyAccessExpression(callee))
      return (
        ID_CALLS.has(callee.name.text) ||
        (PORT_METHODS.has(callee.name.text) &&
          /windows/i.test(callee.expression.getText()))
      );
  }
  return false;
}

export function findBareOverlayIds(
  fileList: readonly string[],
  read: (file: string) => string = (file) => fs.readFileSync(file, "utf8"),
): string[] {
  const found: string[] = [];
  for (const file of fileList) {
    if (file === REGISTRY) continue;
    const text = read(file);
    const source = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
      if (
        (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
        !ts.isExternalModuleReference(node.parent) &&
        !(ts.isCallExpression(node.parent) &&
          /^(require|import|jest\.\w+)$/.test(node.parent.expression.getText())) &&
        (IDS.has(node.text) || inIdPosition(node))
      ) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart());
        found.push(`${path.relative(SRC, file)}:${line + 1} "${node.text}"`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found;
}

describe("no bare overlay ids in the chat package", () => {
  it("names every window through CHAT_WINDOWS", () => {
    const found = findBareOverlayIds(files(SRC));
    if (found.length) {
      throw new Error(
        `${found.length} bare overlay id(s) in packages/chat/src. ` +
          "Name the window through CHAT_WINDOWS (host/windows.ts) — add the id there first " +
          "if it is new:\n  " +
          found.join("\n  "),
      );
    }
  });

  it("catches a planted literal in each position", () => {
    const planted = path.join(SRC, "planted.tsx");
    const body = [
      'dispatch(openOverlay({ overlayId: "runControlsWindow" }));',
      'const x = <WindowPanel overlayId="someNewWindow" />;',
      'const OVERLAY_ID = "anotherNewWindow";',
      'selectIsOverlayOpen(state, "brandNewWindow");',
      'host.windows.open("unregisteredWindow");',
      'const ok = CHAT_WINDOWS.quickChat; // "quickChat" in a comment is fine',
    ].join("\n");
    expect(findBareOverlayIds([planted], () => body)).toEqual([
      'planted.tsx:1 "runControlsWindow"',
      'planted.tsx:2 "someNewWindow"',
      'planted.tsx:3 "anotherNewWindow"',
      'planted.tsx:4 "brandNewWindow"',
      'planted.tsx:5 "unregisteredWindow"',
    ]);
  });
});
