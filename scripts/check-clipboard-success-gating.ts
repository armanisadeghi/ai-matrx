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
/**
 * The app's bound copy (`lib/clipboard/copy.ts`): the kit `copyText` with the app toast as `notify`.
 * It ALWAYS notifies a failure (unless `options.failureMessage` replaces the words) and notifies
 * success when its second argument is given. Only the double-notice rules read it.
 */
const APP_COPY_MODULE = "@/lib/clipboard/copy";
const APP_COPY = "copyToClipboard";

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
  const appCopy = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === APP_COPY_MODULE
    ) {
      const named = statement.importClause?.namedBindings;
      if (named && ts.isNamedImports(named))
        for (const element of named.elements)
          if ((element.propertyName?.text ?? element.name.text) === APP_COPY)
            appCopy.add(element.name.text);
      continue;
    }
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
  return { hookNames, standalone, appCopy };
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

/**
 * The kit copy NEVER throws: it resolves `false`. Two shapes hide that:
 *
 * - `dead-catch` — a try/catch whose only possible thrower is the awaited
 *   copy, with a catch that does more than log. That catch (a specific toast,
 *   a manual-copy fallback) never runs; its handling belongs in the `false`
 *   branch.
 * - `work-skipped` — `if (!(await copy(x))) return;` followed, later in the
 *   same function, by work that must run whether or not the copy landed:
 *   closing, navigating, opening an overlay, or calling an `on*` callback.
 *   Only the copied indicator may depend on the result. (Callbacks named for
 *   the copy itself — `onCopy`, `onCopied`, `onPathCopy` — are success
 *   signals and stay gated.)
 * - `double-toast` — a copy that ALREADY notifies its own failure (a
 *   `useClipboard({ notify })` hook copy, or a standalone copy given `notify`,
 *   with no per-call `failureMessage`) whose `false` branch toasts again: a
 *   refused copy then shows two toasts. Pass the specific words as
 *   `failureMessage` (kit 0.30) and drop the branch toast, or construct the
 *   hook without `notify`. The second notice may be any toast (info and
 *   warning included, a `?:` false arm too) or an inline error setter.
 * - `double-success` — a copy that ALREADY notifies its own success (every
 *   copy from a `useClipboard({ notify })` hook — the kit falls back to "Text
 *   copied to clipboard!" — a standalone copy given `notify` +
 *   `successMessage`, or `copyToClipboard(text, words)`) followed on its
 *   success path by the component's own success/info toast: one copy, two
 *   toasts. Pass the words as the call's success argument and drop the toast.
 */
export type DoorMisuse = {
  file: string;
  line: number;
  rule: "dead-catch" | "work-skipped" | "double-toast" | "double-success";
  detail: string;
};

const LOG_ONLY = /^(?:console\.\w+|vcprint)\s*\(/;
const REQUIRED_WORK =
  /\b(?:onClose|router\.(?:push|replace|back)|openOverlay|navigate)\s*\(|\bon(?!\w*Cop(?:y|ied))[A-Z]\w*\??\.?\s*\(/;

function awaitedCopy(call: ts.CallExpression): ts.AwaitExpression | undefined {
  let current: ts.Node = call;
  while (ts.isParenthesizedExpression(current.parent)) current = current.parent;
  return ts.isAwaitExpression(current.parent) ? current.parent : undefined;
}

function isFailedCopyReturn(
  statement: ts.Node,
  awaited: ts.AwaitExpression,
): statement is ts.IfStatement {
  if (!ts.isIfStatement(statement)) return false;
  let condition = statement.expression;
  while (ts.isParenthesizedExpression(condition)) condition = condition.expression;
  if (
    !ts.isPrefixUnaryExpression(condition) ||
    condition.operator !== ts.SyntaxKind.ExclamationToken
  )
    return false;
  let operand: ts.Expression = condition.operand;
  while (ts.isParenthesizedExpression(operand)) operand = operand.expression;
  if (operand !== awaited) return false;
  // Only a BARE early return skips work silently; a false branch that
  // handles the failure itself (a manual-copy dialog) chose its outcome.
  const then = statement.thenStatement;
  return ts.isReturnStatement(then) ||
    (ts.isBlock(then) &&
      then.statements.length === 1 &&
      ts.isReturnStatement(then.statements[0]));
}

/**
 * A second failure notice: any toast (error, warning, info, message, bare), a `notify`, or an
 * inline error setter (`setError(…)`, `setErrorMsg(…)`, `setCopyError(…)`). One refused copy gets
 * ONE surface: pass the words as `failureMessage`, or build the hook without `notify` and keep
 * the inline error.
 */
const FAILURE_TOAST =
  /\b(?:toast|copyToast)\.(?:error|warning|info|message)\s*\(|\b(?:toast|copyToast)\s*\(|\bnotify\s*\(|\bset(?:Error\w*|\w+Error)\s*\(/;
/** A success notice the component adds itself: a success/info/message/bare toast. */
const SUCCESS_TOAST_CALLEE = /^(?:toast|copyToast)(?:\.(?:success|info|message))?$/;

/** Local copy names whose hook was built with a `notify` (they already toast a failure). */
function notifyingHookLocals(
  sourceFile: ts.SourceFile,
  hookNames: Set<string>,
): Set<string> {
  const names = new Set<string>();
  function visit(node: ts.Node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer
    ) {
      const init = unwrap(node.initializer);
      if (
        ts.isCallExpression(init) &&
        ts.isIdentifier(init.expression) &&
        hookNames.has(init.expression.text) &&
        init.arguments[0] &&
        ts.isObjectLiteralExpression(init.arguments[0]) &&
        init.arguments[0].properties.some(
          (p) => p.name && ts.isIdentifier(p.name) && p.name.text === "notify",
        )
      ) {
        for (const element of node.name.elements) {
          if (!ts.isIdentifier(element.name)) continue;
          const method =
            element.propertyName && ts.isIdentifier(element.propertyName)
              ? element.propertyName.text
              : element.name.text;
          if (COPY_METHODS.has(method)) names.add(element.name.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return names;
}

type CopyKind = "hook" | "standalone" | "app";

function objectHas(options: ts.Expression | undefined, name: string): boolean {
  return Boolean(
    options &&
      ts.isObjectLiteralExpression(options) &&
      options.properties.some(
        (p) => p.name && ts.isIdentifier(p.name) && p.name.text === name,
      ),
  );
}

/** True when this call notifies its own failure with the generic words (no per-call `failureMessage`). */
function callNotifiesFailure(
  call: ts.CallExpression,
  hookNotifying: boolean,
  kind: CopyKind,
  method: string,
): boolean {
  if (kind === "app") return !objectHas(call.arguments[2], "failureMessage");
  if (kind === "standalone") {
    const options = call.arguments[1];
    return objectHas(options, "notify") && !objectHas(options, "failureMessage");
  }
  if (!hookNotifying) return false;
  const failureIndex = method === "copyLink" ? 3 : 2;
  return call.arguments.length <= failureIndex;
}

/**
 * True when this call already notifies its own success: every copy from a hook built with
 * `notify` (the kit falls back to "Text copied to clipboard!"), a standalone copy given both
 * `notify` and `successMessage`, and the app copy given its success words.
 */
function callNotifiesSuccess(
  call: ts.CallExpression,
  hookNotifying: boolean,
  kind: CopyKind,
): boolean {
  if (kind === "app") return call.arguments.length >= 2;
  if (kind === "standalone")
    return (
      objectHas(call.arguments[1], "notify") &&
      objectHas(call.arguments[1], "successMessage")
    );
  return hookNotifying;
}

function doubleToastSource(
  file: string,
  sourceFile: ts.SourceFile,
  locals: Map<string, string>,
  standalone: Map<string, string>,
  hookNotifying: Set<string>,
  appCopy: Set<string>,
): DoorMisuse[] {
  const found: DoorMisuse[] = [];
  const lineOf = (node: ts.Node) =>
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  const strip = (e: ts.Expression) => {
    let c = e;
    while (ts.isParenthesizedExpression(c)) c = c.expression;
    return c;
  };
  /**
   * Failure branches of every `if` / `?:` in `scope` that tests `matches` (negated: then,
   * plain: else), plus everything after a bare `if (!result) return;` is NOT failure.
   */
  function failureBranches(scope: ts.Node, matches: (e: ts.Expression) => boolean) {
    const branches: ts.Node[] = [];
    const walk = (n: ts.Node) => {
      if (ts.isIfStatement(n) || ts.isConditionalExpression(n)) {
        const cond = strip(ts.isIfStatement(n) ? n.expression : n.condition);
        const whenTrue = ts.isIfStatement(n) ? n.thenStatement : n.whenTrue;
        const whenFalse = ts.isIfStatement(n) ? n.elseStatement : n.whenFalse;
        if (
          ts.isPrefixUnaryExpression(cond) &&
          cond.operator === ts.SyntaxKind.ExclamationToken &&
          matches(strip(cond.operand))
        )
          branches.push(whenTrue);
        else if (matches(cond) && whenFalse) branches.push(whenFalse);
      }
      ts.forEachChild(n, walk);
    };
    walk(scope);
    return branches;
  }
  /** Where the copy's result is decided, and which branches of it are the refused path. */
  function resultScope(call: ts.CallExpression): {
    scope: ts.Node;
    failure: ts.Node[];
  } {
    let top: ts.Node = call;
    while (ts.isParenthesizedExpression(top.parent)) top = top.parent;
    const parent = top.parent;
    if (
      ts.isPropertyAccessExpression(parent) &&
      parent.name.text === "then" &&
      ts.isCallExpression(parent.parent)
    ) {
      const cb = parent.parent.arguments[0];
      if (cb && (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb))) {
        const param = cb.parameters[0];
        const id = param && ts.isIdentifier(param.name) ? param.name.text : undefined;
        return {
          scope: cb.body,
          failure: id
            ? failureBranches(cb, (e) => ts.isIdentifier(e) && e.text === id)
            : [],
        };
      }
    }
    let fn: ts.Node = call;
    while (fn.parent && !ts.isFunctionLike(fn)) fn = fn.parent;
    const scope = ts.isFunctionLike(fn) && "body" in fn && fn.body ? fn.body : sourceFile;
    if (ts.isAwaitExpression(parent)) {
      const holder = parent.parent;
      if (ts.isVariableDeclaration(holder) && ts.isIdentifier(holder.name)) {
        const id = holder.name.text;
        return {
          scope,
          failure: failureBranches(scope, (e) => ts.isIdentifier(e) && e.text === id),
        };
      }
      return { scope, failure: failureBranches(scope, (e) => e === parent) };
    }
    return { scope, failure: [] };
  }
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      const kind: CopyKind | undefined = appCopy.has(name)
        ? "app"
        : locals.has(name)
          ? standalone.has(name)
            ? "standalone"
            : "hook"
          : undefined;
      if (kind) {
        const method = locals.get(name) ?? "copyText";
        const notifiesFailure = callNotifiesFailure(
          node,
          hookNotifying.has(name),
          kind,
          method,
        );
        const notifiesSuccess = callNotifiesSuccess(node, hookNotifying.has(name), kind);
        if (notifiesFailure || notifiesSuccess) {
          const { scope, failure } = resultScope(node);
          if (notifiesFailure)
            for (const branch of failure) {
              const text = branch.getText(sourceFile);
              if (FAILURE_TOAST.test(text)) {
                found.push({
                  file,
                  line: lineOf(branch),
                  rule: "double-toast",
                  detail: text.replace(/\s+/g, " ").slice(0, 160),
                });
                break;
              }
            }
          if (notifiesSuccess) {
            const inFailure = (n: ts.Node) =>
              failure.some((b) => n.pos >= b.pos && n.end <= b.end);
            let reported = false;
            const walk = (n: ts.Node) => {
              if (reported) return;
              // A toast in a nested function (a timer, a later handler) or a catch is not this copy's success notice.
              if (n !== scope && ts.isFunctionLike(n)) return;
              if (ts.isCatchClause(n)) return;
              if (
                ts.isCallExpression(n) &&
                n.pos >= node.end &&
                SUCCESS_TOAST_CALLEE.test(n.expression.getText(sourceFile)) &&
                !inFailure(n)
              ) {
                reported = true;
                found.push({
                  file,
                  line: lineOf(n),
                  rule: "double-success",
                  detail: n.getText(sourceFile).replace(/\s+/g, " ").slice(0, 160),
                });
                return;
              }
              ts.forEachChild(n, walk);
            };
            walk(scope);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

export function doorMisuseSource(file: string, source: string): DoorMisuse[] {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const { hookNames, standalone, appCopy } = importBindings(sourceFile);
  if (!hookNames.size && !standalone.size && !appCopy.size) return [];
  const locals = boundLocals(sourceFile, hookNames, standalone);
  const found: DoorMisuse[] = [];
  const lineOf = (node: ts.Node) =>
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      locals.has(node.expression.text)
    ) {
      const awaited = awaitedCopy(node);
      if (awaited) {
        let current: ts.Node = awaited;
        while (current.parent && !ts.isFunctionLike(current.parent)) {
          const parent: ts.Node = current.parent;
          if (
            ts.isTryStatement(parent) &&
            parent.catchClause &&
            current === parent.tryBlock
          ) {
            let otherAwait = false;
            const scan = (inner: ts.Node) => {
              if (ts.isAwaitExpression(inner) && inner !== awaited) otherAwait = true;
              ts.forEachChild(inner, scan);
            };
            scan(parent.tryBlock);
            const handling = parent.catchClause.block.statements.filter(
              (statement) => !LOG_ONLY.test(statement.getText(sourceFile)),
            );
            if (!otherAwait && handling.length)
              found.push({
                file,
                line: lineOf(parent.catchClause),
                rule: "dead-catch",
                detail: handling[0].getText(sourceFile).replace(/\s+/g, " ").slice(0, 160),
              });
            break;
          }
          current = parent;
        }
        let statement: ts.Node = awaited;
        while (statement && !ts.isStatement(statement)) statement = statement.parent;
        if (statement && isFailedCopyReturn(statement, awaited)) {
          let cursor: ts.Node = statement;
          let skipped: string | undefined;
          while (cursor.parent && !ts.isFunctionLike(cursor.parent) && !skipped) {
            const parent: ts.Node = cursor.parent;
            if (ts.isBlock(parent)) {
              const after = parent.statements.slice(
                parent.statements.indexOf(cursor as ts.Statement) + 1,
              );
              skipped = after
                .map((later) => later.getText(sourceFile))
                .find((text) => REQUIRED_WORK.test(text));
            }
            cursor = parent;
          }
          if (skipped)
            found.push({
              file,
              line: lineOf(statement),
              rule: "work-skipped",
              detail: skipped.replace(/\s+/g, " ").slice(0, 160),
            });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  found.push(
    ...doubleToastSource(
      file,
      sourceFile,
      locals,
      standalone,
      notifyingHookLocals(sourceFile, hookNames),
      appCopy,
    ),
  );
  return found;
}

export function doorMisuse(files = trackedFiles()): DoorMisuse[] {
  return files.flatMap((file) =>
    doorMisuseSource(file, fs.readFileSync(path.join(ROOT, file), "utf8")),
  );
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
    // Work that must run whether or not the copy landed (closing, navigating, a caller's
    // callback) is not a success signal: gating it is the `work-skipped` defect.
    if (call.kind === "await-discarded" || call.kind === "promise-discarded")
      return (
        signalsCopySuccess(call.nextStatement) &&
        !REQUIRED_WORK.test(call.nextStatement ?? "")
      );
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
  const kit = `import { useClipboard } from "@ai-matrx/kit/clipboard";`;
  const deadCatch = doorMisuseSource(
    "dead-catch.tsx",
    `${kit} function V() { const { copyText } = useClipboard();
       async function run() { try { if (!(await copyText("v"))) return; setCopied(true); }
         catch { setFallback("v"); } } }`,
  );
  const logOnlyCatch = doorMisuseSource(
    "log-only-catch.tsx",
    `${kit} function V() { const { copyText } = useClipboard();
       async function run() { try { if (!(await copyText("v"))) return; setCopied(true); }
         catch (e) { console.error(e); } } }`,
  );
  const catchGuardsOtherWork = doorMisuseSource(
    "catch-guards-other-work.tsx",
    `${kit} function V() { const { copyText } = useClipboard();
       async function run() { try { const t = await load(); if (!(await copyText(t))) return; }
         catch { toast.error("Export failed"); } } }`,
  );
  const falseBranchHandles = doorMisuseSource(
    "false-branch.tsx",
    `${kit} function V() { const { copyText } = useClipboard();
       async function run() { if (!(await copyText("v"))) { setFallback("v"); return; } setCopied(true); } }`,
  );
  const workSkipped = doorMisuseSource(
    "work-skipped.tsx",
    `${kit} function V({ onClose }) { const { copyText } = useClipboard();
       async function run() { if (x) { try { if (!(await copyText("v"))) return; } catch {} }
         onClose(); router.push("/chat"); } }`,
  );
  const workRunsRegardless = doorMisuseSource(
    "work-runs.tsx",
    `${kit} function V({ onShare }) { const { copyText } = useClipboard();
       async function run() { if (await copyText("v")) setCopied(true); onShare(); } }`,
  );
  const handledFailureSkips = doorMisuseSource(
    "handled-failure.tsx",
    `${kit} function V({ onTextReplace }) { const { copyText } = useClipboard();
       async function run() { if (!(await copyText("v"))) { showManualCopy({ text: "v" }); return; } onTextReplace(""); } }`,
  );
  const successCallbackGated = doorMisuseSource(
    "success-callback.tsx",
    `${kit} function V({ onCopy }) { const { copyText } = useClipboard();
       async function run() { if (!(await copyText("v"))) return; setCopied(true); onCopy(); } }`,
  );
  const hookN = `${kit} function V() { const { copyText } = useClipboard({ notify });`;
  const doubleToast = doorMisuseSource(
    "double-toast.tsx",
    `${hookN} async function run() { if (!(await copyText("v"))) { toast.error("Couldn't copy"); return; } setCopied(true); } }`,
  );
  const doubleToastThen = doorMisuseSource(
    "double-toast-then.tsx",
    `${hookN} function run() { void copyText("v").then((ok) => { if (!ok) toast.error("no"); }); } }`,
  );
  const doubleToastVar = doorMisuseSource(
    "double-toast-var.tsx",
    `${hookN} async function run() { const ok = await copyText("v"); if (ok) setCopied(true); else toast.error("no"); } }`,
  );
  const doubleToastFixed = doorMisuseSource(
    "double-toast-fixed.tsx",
    `${hookN} async function run() { if (!(await copyText("v", undefined, "Couldn't copy"))) return; setCopied(true); } }`,
  );
  const quietHookToasts = doorMisuseSource(
    "quiet-hook.tsx",
    `${kit} function V() { const { copyText } = useClipboard();
       async function run() { if (!(await copyText("v"))) { toast.error("Couldn't copy"); return; } } }`,
  );
  const standaloneDouble = doorMisuseSource(
    "standalone-double.tsx",
    `import { copyText } from "@ai-matrx/kit/clipboard";
     async function run() { if (!(await copyText("v", { notify }))) { toast.error("no"); } }`,
  );
  const rule = (found: DoorMisuse[], name: DoorMisuse["rule"]) =>
    found.filter((f) => f.rule === name).length;
  const doubleSuccess = doorMisuseSource(
    "double-success.tsx",
    `${hookN} async function run() { if (!(await copyText("v"))) return; setCopied(true); toast.success("URL copied"); } }`,
  );
  const doubleSuccessThen = doorMisuseSource(
    "double-success-then.tsx",
    `${hookN} function run() { void copyText("v").then((ok) => { if (!ok) return; toast({ title: "Copied" }); }); } }`,
  );
  const doubleSuccessIf = doorMisuseSource(
    "double-success-if.tsx",
    `${hookN} async function run() { if (await copyText("v")) toast.info("Paste it in chat"); } }`,
  );
  const successWordsPassed = doorMisuseSource(
    "success-words.tsx",
    `${hookN} async function run() { if (!(await copyText("v", "URL copied"))) return; setCopied(true); setTimeout(() => toast.success("later"), 1); } }`,
  );
  const quietHookSuccess = doorMisuseSource(
    "quiet-hook-success.tsx",
    `${kit} function V() { const { copyText } = useClipboard();
       async function run() { if (!(await copyText("v"))) return; toast.success("Copied"); } }`,
  );
  const failureToastNotSuccess = doorMisuseSource(
    "failure-only.tsx",
    `${hookN} async function run() { const ok = await copyText("v", "Copied", "No"); if (!ok) { toast.info("x"); } } }`,
  );
  const appCopyDouble = doorMisuseSource(
    "app-copy.tsx",
    `import { copyToClipboard } from "@/lib/clipboard/copy";
     async function run() { if (await copyToClipboard("v", "Copied")) toast.success("Copied!"); }`,
  );
  const appCopyQuiet = doorMisuseSource(
    "app-copy-quiet.tsx",
    `import { copyToClipboard } from "@/lib/clipboard/copy";
     async function run() { if (await copyToClipboard("v")) toast.success("Copied!"); }`,
  );
  const appCopyFailure = doorMisuseSource(
    "app-copy-failure.tsx",
    `import { copyToClipboard } from "@/lib/clipboard/copy";
     async function run() { if (!(await copyToClipboard("v"))) toast.error("no"); }`,
  );
  const ternaryDouble = doorMisuseSource(
    "ternary.tsx",
    `${hookN} function run() { void copyText("v").then((ok) => ok ? toast.success("Copied.") : toast.warning("Could not copy.")); } }`,
  );
  const infoFailure = doorMisuseSource(
    "info-failure.tsx",
    `${hookN} async function run() { if (!(await copyText("v", "Copied"))) { toast.info("Paste it by hand"); } onClose(); } }`,
  );
  const inlineErrorFailure = doorMisuseSource(
    "inline-error.tsx",
    `${hookN} async function run() { if (!(await copyText("v"))) { setErrorMsg("Could not write"); return; } setCopied(true); } }`,
  );
  const inlineErrorQuietHook = doorMisuseSource(
    "inline-error-quiet.tsx",
    `${kit} function V() { const { copyText } = useClipboard();
       async function run() { if (!(await copyText("v"))) { setErrorMsg("Could not write"); return; } } }`,
  );
  const requiredWorkAfterDiscard = censusSource(
    "required-work.tsx",
    `${hookN} async function run() { await copyText("v", "Copied", "Not copied"); onClose(); router.push("/chat"); } }`,
  );
  const repositoryFiles = trackedFiles();
  const results = [
    rule(doubleSuccess, "double-success") === 1,
    rule(doubleSuccessThen, "double-success") === 1,
    rule(doubleSuccessIf, "double-success") === 1,
    rule(successWordsPassed, "double-success") === 0,
    rule(quietHookSuccess, "double-success") === 0,
    rule(failureToastNotSuccess, "double-success") === 0,
    rule(appCopyDouble, "double-success") === 1,
    rule(appCopyQuiet, "double-success") === 0,
    rule(appCopyFailure, "double-toast") === 1,
    rule(ternaryDouble, "double-toast") === 1 &&
      rule(ternaryDouble, "double-success") === 1,
    rule(infoFailure, "double-toast") === 1 && rule(infoFailure, "double-success") === 0,
    rule(inlineErrorFailure, "double-toast") === 1,
    rule(inlineErrorQuietHook, "double-toast") === 0,
    violations(requiredWorkAfterDiscard).length === 0,
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
    deadCatch.length === 1 && deadCatch[0].rule === "dead-catch",
    logOnlyCatch.length === 0,
    catchGuardsOtherWork.length === 0,
    falseBranchHandles.length === 0,
    workSkipped.length === 1 && workSkipped[0].rule === "work-skipped",
    workRunsRegardless.length === 0,
    successCallbackGated.length === 0,
    handledFailureSkips.length === 0,
    doubleToast.length === 1 && doubleToast[0].rule === "double-toast",
    doubleToastThen.length === 1,
    doubleToastVar.length === 1,
    doubleToastFixed.length === 0,
    quietHookToasts.length === 0,
    standaloneDouble.length === 1,
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
