import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const CLIPBOARD_MODULES = new Set([
  "@/hooks/use-clipboard",
  "@ai-matrx/kit",
  "@ai-matrx/kit/clipboard",
]);
const COPY_METHODS = new Set(["copyText", "copyImage", "copyLink"]);

export type BoundCall = {
  file: string;
  line: number;
  method: string;
  localName: string;
  kind:
    | "await-discarded"
    | "promise-discarded"
    | "then-result-ignored"
    | "menu-result-forwarded"
    | "other";
  statement: string;
  nextStatement?: string;
};

export function trackedFiles(): string[] {
  return execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    },
  )
    .split("\n")
    .filter((file) => /\.tsx?$/.test(file));
}

function importBindings(sourceFile: ts.SourceFile) {
  const hookNames = new Set<string>();
  const standalone = new Map<string, string>();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !CLIPBOARD_MODULES.has(statement.moduleSpecifier.text)
    )
      continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const imported = element.propertyName?.text ?? element.name.text;
      if (imported === "useClipboard") hookNames.add(element.name.text);
      if (COPY_METHODS.has(imported))
        standalone.set(element.name.text, imported);
    }
  }
  return { hookNames, standalone };
}

function unwrap(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  )
    current = current.expression;
  return current;
}

function boundLocals(
  sourceFile: ts.SourceFile,
  hookNames: Set<string>,
  standalone: Map<string, string>,
) {
  const locals = new Map(standalone);
  function visit(node: ts.Node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer
    ) {
      const initializer = unwrap(node.initializer);
      if (
        ts.isCallExpression(initializer) &&
        ts.isIdentifier(initializer.expression) &&
        hookNames.has(initializer.expression.text)
      ) {
        for (const element of node.name.elements) {
          if (!ts.isIdentifier(element.name)) continue;
          const method =
            element.propertyName && ts.isIdentifier(element.propertyName)
              ? element.propertyName.text
              : element.name.text;
          if (COPY_METHODS.has(method)) locals.set(element.name.text, method);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return locals;
}

function enclosingStatement(node: ts.Node): ts.Statement | undefined {
  let current: ts.Node | undefined = node;
  while (current && !ts.isStatement(current)) current = current.parent;
  return current as ts.Statement | undefined;
}

function nextStatementText(
  statement: ts.Statement | undefined,
  sourceFile: ts.SourceFile,
): string | undefined {
  let current: ts.Node | undefined = statement;
  while (current) {
    if (
      ts.isStatement(current) &&
      current.parent &&
      ts.isBlock(current.parent)
    ) {
      const siblings = current.parent.statements;
      const index = siblings.indexOf(current);
      const next = index >= 0 ? siblings[index + 1] : undefined;
      if (next)
        return next.getText(sourceFile).replace(/\s+/g, " ").slice(0, 400);
    }
    const block = current.parent;
    if (!block || !ts.isBlock(block)) return undefined;
    const owner = block.parent;
    if (!owner || (!ts.isTryStatement(owner) && !ts.isIfStatement(owner)))
      return undefined;
    current = owner;
  }
  return undefined;
}

function classification(call: ts.CallExpression): BoundCall["kind"] {
  let current: ts.Node = call;
  while (ts.isParenthesizedExpression(current.parent)) current = current.parent;
  if (ts.isAwaitExpression(current.parent)) {
    let awaited: ts.Node = current.parent;
    while (ts.isParenthesizedExpression(awaited.parent))
      awaited = awaited.parent;
    if (ts.isExpressionStatement(awaited.parent)) return "await-discarded";
  }
  let parent: ts.Node = call.parent;
  while (ts.isParenthesizedExpression(parent)) parent = parent.parent;
  if (
    ts.isPropertyAccessExpression(parent) &&
    parent.name.text === "then" &&
    parent.expression === call &&
    ts.isCallExpression(parent.parent)
  ) {
    const callback = parent.parent.arguments[0];
    if (
      (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) &&
      !callbackConsumesResult(callback)
    )
      return "then-result-ignored";
  }
  let discarded: ts.Node = call;
  while (ts.isParenthesizedExpression(discarded.parent)) {
    discarded = discarded.parent;
  }
  if (ts.isVoidExpression(discarded.parent)) discarded = discarded.parent;
  if (ts.isExpressionStatement(discarded.parent)) return "promise-discarded";
  if (isMenuResultForwardedToSuccessToast(call))
    return "menu-result-forwarded";
  return "other";
}

function isMenuResultForwardedToSuccessToast(call: ts.CallExpression): boolean {
  let expression: ts.Expression = call;
  while (ts.isParenthesizedExpression(expression.parent))
    expression = expression.parent;
  const callback = expression.parent;
  if (
    !ts.isArrowFunction(callback) ||
    callback.body !== expression ||
    !ts.isPropertyAssignment(callback.parent) ||
    callback.parent.name.getText() !== "onSelect" ||
    !ts.isObjectLiteralExpression(callback.parent.parent)
  )
    return false;
  const toast = callback.parent.parent.properties.find(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) && property.name.getText() === "toast",
  );
  return Boolean(
    toast &&
      ts.isObjectLiteralExpression(toast.initializer) &&
      toast.initializer.properties.some(
        (property) =>
          ts.isPropertyAssignment(property) &&
          property.name.getText() === "success",
      ),
  );
}

function callbackConsumesResult(
  callback: ts.ArrowFunction | ts.FunctionExpression,
): boolean {
  const parameter = callback.parameters[0];
  if (!parameter || !ts.isIdentifier(parameter.name)) return false;
  const parameterName = parameter.name.text;
  let used = false;
  function visit(node: ts.Node) {
    if (ts.isIdentifier(node) && node.text === parameterName) used = true;
    ts.forEachChild(node, visit);
  }
  visit(callback.body);
  return used;
}

export function censusSource(file: string, source: string): BoundCall[] {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const { hookNames, standalone } = importBindings(sourceFile);
  if (!hookNames.size && !standalone.size) return [];
  const locals = boundLocals(sourceFile, hookNames, standalone);
  const calls: BoundCall[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const method = locals.get(node.expression.text);
      if (method) {
        const statement = enclosingStatement(node);
        const { line } = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(sourceFile),
        );
        calls.push({
          file,
          line: line + 1,
          method,
          localName: node.expression.text,
          kind: classification(node),
          statement:
            statement?.getText(sourceFile).replace(/\s+/g, " ").slice(0, 400) ??
            node.getText(sourceFile),
          nextStatement: nextStatementText(statement, sourceFile),
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return calls;
}

export function census(files = trackedFiles()): BoundCall[] {
  return files.flatMap((file) =>
    censusSource(file, fs.readFileSync(path.join(ROOT, file), "utf8")),
  );
}

function signalsCopySuccess(text: string | undefined): boolean {
  if (!text) return false;
  return (
    /\bset[A-Z]\w*\s*\(/.test(text) ||
    /\btoast(?:\.success)?\s*\(/.test(text) ||
    /\b(?:flash|clear|onClose|dispatch)\s*\(/.test(text) ||
    /\breturn\s+(?!false\b|null\b|undefined\b)/.test(text)
  );
}

function resetsCopiedState(text: string | undefined): boolean {
  if (!text || !/\b(?:setTimeout|window\.setTimeout)\s*\(/.test(text))
    return false;
  return /\bset[A-Z]\w*\s*\(\s*(?:false|null|undefined)\s*\)/.test(text);
}

export function violations(calls: BoundCall[]): BoundCall[] {
  return calls.filter((call) => {
    if (call.kind === "await-discarded" || call.kind === "promise-discarded")
      return signalsCopySuccess(call.nextStatement);
    if (call.kind === "then-result-ignored")
      return signalsCopySuccess(call.statement);
    if (call.kind === "menu-result-forwarded") return true;
    if (
      call.kind === "other" &&
      /\.then\s*\(/.test(call.statement) &&
      signalsCopySuccess(call.statement)
    )
      return resetsCopiedState(call.nextStatement);
    return false;
  });
}

export function selfTest() {
  const unsafeAwait = censusSource(
    "unsafe-await.ts",
    `import { copyText as copy } from "@ai-matrx/kit/clipboard";
     async function run() { await copy("value"); setCopied(true); }`,
  );
  const guardedAwait = censusSource(
    "guarded-await.ts",
    `import { copyText as copy } from "@ai-matrx/kit/clipboard";
     async function run() { if (!(await copy("value"))) return; setCopied(true); }`,
  );
  const unsafeThen = censusSource(
    "unsafe-then.tsx",
    `import { useClipboard as useKitClipboard } from "@ai-matrx/kit/clipboard";
     function View() { const { copyText: copy } = useKitClipboard();
       copy("value").then(() => { toast.success("Copied"); }); }`,
  );
  const guardedThen = censusSource(
    "guarded-then.tsx",
    `import { useClipboard as useKitClipboard } from "@ai-matrx/kit/clipboard";
     function View() { const { copyText: copy } = useKitClipboard();
       copy("value").then((copied) => { if (!copied) return; toast.success("Copied"); }); }`,
  );
  const namedButIgnoredThen = censusSource(
    "named-but-ignored-then.ts",
    `import { copyText } from "@ai-matrx/kit/clipboard";
     function run() { copyText("value").then((copied) => { setCopied(true); }); }`,
  );
  const unsafeDiscardedPromise = censusSource(
    "app/unsafe-promise.ts",
    `import { copyText } from "@ai-matrx/kit/clipboard";
     function run() { copyText("value"); toast.success("Copied"); }`,
  );
  const resetOutsideSuccess = censusSource(
    "reset-outside-success.ts",
    `import { copyText } from "@ai-matrx/kit/clipboard";
     function run() {
       copyText("value").then((copied) => { if (!copied) return; setCopied(true); });
       setTimeout(() => setCopied(false), 1500);
     }`,
  );
  const resetInsideSuccess = censusSource(
    "reset-inside-success.ts",
    `import { copyText } from "@ai-matrx/kit/clipboard";
     function run() {
       copyText("value").then((copied) => {
         if (!copied) return;
         setCopied(true);
         setTimeout(() => setCopied(false), 1500);
       });
     }`,
  );
  const menuForwardsBooleanToSuccessToast = censusSource(
    "menu-forwards-result.ts",
    `import { copyText } from "@ai-matrx/kit/clipboard";
     const item = {
       onSelect: () => copyText("value"),
       toast: { loading: "Copying", success: "Copied" },
     };`,
  );
  const menuUsesHookNotification = censusSource(
    "menu-uses-hook-notification.ts",
    `import { copyText } from "@ai-matrx/kit/clipboard";
     const item = { onSelect: async () => { await copyText("value"); } };`,
  );
  const repositoryFiles = trackedFiles();
  const results = [
    violations(unsafeAwait).length === 1,
    violations(guardedAwait).length === 0,
    violations(unsafeThen).length === 1,
    violations(guardedThen).length === 0,
    violations(namedButIgnoredThen).length === 1,
    violations(unsafeDiscardedPromise).length === 1,
    violations(resetOutsideSuccess).length === 1,
    violations(resetInsideSuccess).length === 0,
    violations(menuForwardsBooleanToSuccessToast).length === 1,
    violations(menuUsesHookNotification).length === 0,
    repositoryFiles.some(
      (file) => file.startsWith("app/") && /\.tsx?$/.test(file),
    ),
  ];
  if (results.some((passed) => !passed)) {
    throw new Error(
      `clipboard success-gating self-test failed: ${JSON.stringify(results)}`,
    );
  }
  console.log("clipboard success-gating self-test passed");
}
