/**
 * THE semantic definition of "an error on screen", shared by the guard
 * (`error-renders-carry-alchemy.test.ts`) and the migration script.
 *
 * It parses JSX (TypeScript compiler API) — never a text regex over a file —
 * and judges each ELEMENT, so one carrier can never cancel an unrelated box
 * elsewhere in the file (the RC-B12 verify F9 hole).
 *
 * An element is an ERROR DISPLAY when any of these hold:
 *   A. it carries role="alert" — whatever its colour (a grey or amber alert
 *      box is still an alert);
 *   B. its class list is error-styled (text/bg/border destructive, red, rose)
 *      and its own children render an error value (`{error}`, `{e.message}`,
 *      `{saveError}`, `{extractErrorMessage(err)}`…) or a failure sentence;
 *   C. its own children state a failure in words ("Couldn't load…",
 *      "Failed to save…", "Something went wrong", "Not saved") whatever its
 *      colour;
 *   D. it is a status/notice element (role="status", or amber/warning styled)
 *      whose children render an error value — a stale-data notice IS a failed
 *      read shown to the person;
 *   E. it is painted red, rose or amber (class or inline style) and sits inside
 *      an error branch (`{load.status === "error" ? … : …}`, `{failed && …}`,
 *      `if (error) return …`) — whatever the rendered value is called.
 * Error values include message-like names (`msg`, `message`, `problem`), and
 * failure sentences include "Unable to…", "Error loading…", "Save failed". A
 * hidden menu (`hidden`, `sr-only`, `invisible`, `opacity-0` with no hover
 * reveal) carries nothing. Round 3 added "Failed to compile", "Template
 * Error", "Permission denied", "timed out", red "Error: {…}", `reason`/`detail`
 * names, orange error text, and any error/message value rendered in an error
 * branch whatever its colour.
 * "Own children" means text and the values an expression actually renders —
 * the leaves of `a ? b : c`, `a && b`, `a ?? b` — never the inside of a
 * callback, a nested element, a comment or a prop. Controls (buttons, inputs,
 * labels) are never displays.
 *
 * Nested matches collapse to the OUTERMOST error-styled box, so one card with a
 * title and a message counts once.
 *
 * A display CARRIES the menu when its box contains `<ErrorAlchemyMenu>`
 * (or has one as a direct sibling — the heading-and-menu row),
 * `<ErrorNotice>`, `<ErrorBox>` or `<ErrorActions>`, or it sits inside a
 * primitive that draws the menu itself (`ErrorNotice`, `ErrorBox`, a
 * destructive `Alert`, `ErrorBoundaryView`). Distance is structural, never
 * file-wide.
 */
import ts from "typescript";

export interface ErrorDisplayHit {
  line: number;
  tag: string;
  reason: "alert" | "red-error" | "failure-words" | "status-error";
  carried: boolean;
  /** The first plain error value rendered inside (`error`, `state.error.message`), when there is one. */
  errorExpression: string | null;
  /** Offset of the box's closing tag, for inserting a menu (null when self-closing). */
  insertAt: number | null;
}

const RED =
  /(?<!(?:hover|focus|focus-visible|focus-within|active|group-hover|peer-hover|disabled|placeholder|visited):)\b(?:text|bg|border|ring)-(?:destructive|red-\d{2,3}|rose-\d{2,3}|pink-\d{2,3}|fuchsia-\d{2,3})\b|\btext-\[#(?:ff6961|f87171|ef4444|dc2626)\]/i;
const NOTICE =
  /(?<!(?:hover|focus|focus-visible|focus-within|active|group-hover|peer-hover|disabled|placeholder|visited):)\b(?:text|bg|border)-(?:amber-\d{2,3}|orange-\d{2,3}|warning|yellow-\d{2,3})\b/;
const FAILURE_WORDS =
  /something went wrong|\boops\b|did(?:n['’]t| not) work|could(?:n['’]t| not) (?:load|save|read|open|find|update|create|delete|connect|send|start|reach|be (?:loaded|saved|read))|failed to (?:load|save|read|fetch|create|update|delete|send|start|connect|open)|unable to (?:load|save|read|fetch|open|find|create|update|delete|send|start|connect|reach|play|process|generate)|error (?:loading|saving|fetching|reading|creating|updating|deleting|sending|connecting|processing)|\b(?:save|load|upload|download|delete|update|sync|send|fetch|import|export|connection|request|generation) failed\b|\bnot saved\b|unexpected error|an error occurred|failed to compile|\btemplate error\b|permission denied|access denied|\btimed out\b|\bnot authori[sz]ed\b/i;
/** Words that only mean an error when the text is painted red ("Error: {detail}"). */
const RED_ONLY_WORDS = /\berror\b\s*:?|\bdenied\b|\binvalid\b/i;
const ERROR_NAME = /(?:[eE]rror|Err$|^err$|^e$|[fF]ailure|[rR]efusal|^why$|Why$|[pP]roblem)/;
/** Message-like names count only in red text: an amber `{message}` is usually a warning. */
const MESSAGE_NAME = /(?:^msg$|Msg$|^message$|Message$|^reason$|Reason$|^detail$|Detail$)/;
/** A branch condition that means "we are in the error state". */
const ERROR_CONDITION = /[eE]rror|[fF]ail|[pP]roblem|[rR]efus|===?\s*["'`](?:error|failed)["'`]/;
/** An inline style that paints text red. */
const STYLE_RED = /color\s*:\s*["'`]?(?:red\b|#(?:f|e|d)[0-9a-f]{2,5}\b|rgb\(\s*2[0-5]\d|hsl\(\s*0\b|var\(--(?:destructive|red))/i;
const CARRIER_NAMES = new Set(["ErrorAlchemyMenu", "ErrorNotice", "ErrorBox", "ErrorActions"]);
const WRAPPER_NAMES = new Set(["ErrorNotice", "ErrorBox", "ErrorBoundaryView"]);
const CONTROLS = /^(button|Button|option|input|textarea|select|label|Label|title|TooltipContent)$/;

type JsxLike = ts.JsxElement | ts.JsxSelfClosingElement;

function tagName(node: JsxLike): string {
  const tag = ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName;
  return tag.getText();
}

function attributes(node: JsxLike): ts.JsxAttributes {
  return ts.isJsxElement(node) ? node.openingElement.attributes : node.attributes;
}

function attrText(node: JsxLike, name: string): string | null {
  for (const prop of attributes(node).properties) {
    if (ts.isJsxAttribute(prop) && prop.name.getText() === name) {
      return prop.initializer ? prop.initializer.getText() : "true";
    }
  }
  return null;
}

/**
 * The classes an element ALWAYS carries. A class added under a condition
 * (`cn("row", error && "bg-destructive/10")`) does not make the element an
 * error box — the error box is the element rendered in the error branch — and
 * counting it once made a whole editor row the "box", so a menu put there
 * showed on every row, error or not.
 */
function alwaysClasses(node: JsxLike): string {
  for (const prop of attributes(node).properties) {
    if (!ts.isJsxAttribute(prop) || prop.name.getText() !== "className" || !prop.initializer) continue;
    const init = prop.initializer;
    if (ts.isStringLiteral(init)) return init.text;
    if (!ts.isJsxExpression(init) || !init.expression) return "";
    const out: string[] = [];
    const visit = (n: ts.Node) => {
      if (ts.isConditionalExpression(n) || (ts.isBinaryExpression(n) && n.operatorToken.kind !== ts.SyntaxKind.PlusToken)) {
        return; // conditional classes are not "always"
      }
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) out.push(n.text);
      else if (ts.isTemplateExpression(n)) {
        out.push(n.head.text);
        for (const span of n.templateSpans) out.push(span.literal.text);
      } else if (ts.isObjectLiteralExpression(n)) {
        return; // { "text-destructive": hasError } is conditional
      }
      n.forEachChild(visit);
    };
    visit(init.expression);
    return out.join(" ");
  }
  return "";
}

function isDestructiveAlert(node: JsxLike): boolean {
  return tagName(node) === "Alert" && /destructive/.test(attrText(node, "variant") ?? "");
}

function hasAlertRole(node: JsxLike): boolean {
  return /^\{?\s*["'`]alert["'`]\s*\}?$/.test((attrText(node, "role") ?? "").trim());
}

function isErrorStyled(node: JsxLike): boolean {
  return hasAlertRole(node) || RED.test(alwaysClasses(node));
}

/**
 * The values an expression actually renders: the leaves of `a ? b : c`,
 * `a && b`, `a ?? b`, `(a)` — never the inside of a callback.
 */
function renderedLeaves(exp: ts.Expression, out: ts.Expression[]): void {
  if (ts.isParenthesizedExpression(exp)) return renderedLeaves(exp.expression, out);
  if (ts.isConditionalExpression(exp)) {
    renderedLeaves(exp.whenTrue, out);
    renderedLeaves(exp.whenFalse, out);
    return;
  }
  if (ts.isBinaryExpression(exp)) {
    const op = exp.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return renderedLeaves(exp.right, out);
    if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
      renderedLeaves(exp.left, out);
      renderedLeaves(exp.right, out);
      return;
    }
  }
  out.push(exp);
}

/** Is this rendered leaf an error value? (`error`, `saveError.message`, `extractErrorMessage(err)`). */
function isErrorLeaf(leaf: ts.Expression, names: RegExp = ERROR_NAME): boolean {
  if (ts.isStringLiteral(leaf) || ts.isNoSubstitutionTemplateLiteral(leaf) || ts.isNumericLiteral(leaf)) return false;
  if (ts.isJsxElement(leaf) || ts.isJsxSelfClosingElement(leaf) || ts.isJsxFragment(leaf)) return false;
  if (ts.isArrowFunction(leaf) || ts.isFunctionExpression(leaf)) return false;
  if (ts.isTemplateExpression(leaf)) return leaf.templateSpans.some((span) => isErrorLeaf(span.expression, names));
  if (ts.isNonNullExpression(leaf) || ts.isAsExpression(leaf) || ts.isParenthesizedExpression(leaf)) {
    return isErrorLeaf(leaf.expression, names);
  }
  if (ts.isCallExpression(leaf)) {
    const callee = leaf.expression.getText();
    if (/\.(map|filter|flatMap|reduce|forEach|sort|join|slice)$/.test(callee)) return false;
    return /[eE]rror|[fF]ailure|[rR]efusal/.test(callee) || leaf.arguments.some((arg) => isErrorLeaf(arg, names));
  }
  if (ts.isPropertyAccessExpression(leaf) || ts.isElementAccessExpression(leaf)) {
    const text = leaf.getText();
    if (/\.(length|count|size|total)$/.test(text)) return false;
    // An identifier of an error (its digest, id or code) is a reference, not the error shown.
    if (/\.(digest|id|code|errorId|error_id|error_code|errorCode)$/.test(text)) return false;
    return text.split(/\??\.|\[|\]/).some((part) => names.test(part));
  }
  if (ts.isIdentifier(leaf)) return names.test(leaf.text);
  return false;
}

/** Words and error values that are this element's OWN children (not nested elements'). */
function ownChildren(node: JsxLike): {
  words: string;
  errorLeaves: string[];
  messageLeaves: string[];
  renderedAny: boolean;
} {
  const texts: string[] = [];
  const errorLeaves: string[] = [];
  const messageLeaves: string[] = [];
  let renderedAny = false;
  if (!ts.isJsxElement(node)) return { words: "", errorLeaves, messageLeaves, renderedAny };
  for (const child of node.children) {
    if (ts.isJsxText(child)) texts.push(child.getText());
    else if (ts.isJsxExpression(child) && child.expression) {
      const leaves: ts.Expression[] = [];
      renderedLeaves(child.expression, leaves);
      for (const leaf of leaves) {
        if (ts.isStringLiteral(leaf) || ts.isNoSubstitutionTemplateLiteral(leaf)) texts.push(leaf.text);
        else if (ts.isTemplateExpression(leaf)) texts.push(leaf.getText());
        if (isErrorLeaf(leaf)) errorLeaves.push(leaf.getText().trim());
        else if (isErrorLeaf(leaf, MESSAGE_NAME)) messageLeaves.push(leaf.getText().trim());
        if (
          !ts.isJsxElement(leaf) &&
          !ts.isJsxSelfClosingElement(leaf) &&
          !ts.isJsxFragment(leaf) &&
          leaf.kind !== ts.SyntaxKind.NullKeyword &&
          !(ts.isIdentifier(leaf) && leaf.text === "undefined")
        ) {
          renderedAny = true;
        }
      }
    }
  }
  return { words: texts.join(" "), errorLeaves, messageLeaves, renderedAny };
}

/** Is this element rendered only in an error state (inside a branch on an error value)? */
function inErrorBranch(node: ts.Node): boolean {
  let child: ts.Node = node;
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isConditionalExpression(current)) {
      const cond = current.condition.getText();
      if (child === current.whenTrue && ERROR_CONDITION.test(cond) && !/^!/.test(cond.trim())) return true;
      if (child === current.whenFalse && /^!/.test(cond.trim()) && ERROR_CONDITION.test(cond)) return true;
    }
    if (
      ts.isBinaryExpression(current) &&
      current.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      child === current.right &&
      ERROR_CONDITION.test(current.left.getText()) &&
      !/^!/.test(current.left.getText().trim())
    ) {
      return true;
    }
    if (ts.isIfStatement(current) && child === current.thenStatement) {
      const cond = current.expression.getText();
      if (ERROR_CONDITION.test(cond) && !/^!/.test(cond.trim())) return true;
    }
    if (ts.isFunctionLike(current)) return false;
    child = current;
    current = current.parent;
  }
  return false;
}

function classify(node: JsxLike): ErrorDisplayHit["reason"] | null {
  if (CONTROLS.test(tagName(node))) return null;
  if (hasAlertRole(node)) return "alert";
  const { words, errorLeaves, messageLeaves, renderedAny } = ownChildren(node);
  const className = alwaysClasses(node);
  // A destructive Badge / Button variant is red — but a status chip ("Error",
  // "failed", "3 errors") is a label, not an error to copy. It counts only when
  // it renders the error itself (`<Badge variant="destructive">{error}</Badge>`).
  const variantRed =
    /destructive/.test(attrText(node, "variant") ?? "") &&
    [...errorLeaves, ...messageLeaves].some((leaf) => !/count|Count|length|\bn\b/.test(leaf));
  const red = RED.test(className) || STYLE_RED.test(attrText(node, "style") ?? "") || variantRed;
  if (red && (errorLeaves.length > 0 || messageLeaves.length > 0 || FAILURE_WORDS.test(words) || RED_ONLY_WORDS.test(words))) {
    return "red-error";
  }
  // Orange/amber text rendering an error value is an error shown in warning colours.
  if (NOTICE.test(className) && /\borange-\d/.test(className) && errorLeaves.length > 0) return "red-error";
  // Whatever its colour, an error or message value rendered only in the error state IS the error.
  if ((errorLeaves.length > 0 || messageLeaves.length > 0) && inErrorBranch(node)) return "red-error";
  // Anything painted red, rose or amber inside an error branch is the error
  // shown (`{load.status === "error" ? <p className="text-destructive">{load.detail}</p> : …}`).
  if ((red || NOTICE.test(className)) && (renderedAny || words.trim()) && inErrorBranch(node)) return "red-error";
  if (FAILURE_WORDS.test(words)) return "failure-words";
  const role = attrText(node, "role") ?? "";
  if ((/status/.test(role) || NOTICE.test(className)) && errorLeaves.length > 0) return "status-error";
  return null;
}

/**
 * A menu the person can never see carries nothing: `hidden`, `sr-only`,
 * `invisible`, or `opacity-0` with no hover/focus reveal (a dense row's
 * `opacity-0 group-hover:opacity-100` menu IS visible when it matters).
 */
function isHiddenMenu(node: JsxLike): boolean {
  const cls = attrText(node, "className") ?? "";
  if (isHiddenElement(cls)) return true;
  // Zero size: nothing to see or tap.
  if (/(?<![\w:-])size-0\b/.test(cls) || (/(?<![\w:-])w-0\b/.test(cls) && /(?<![\w:-])h-0\b/.test(cls))) return true;
  return /(?<![\w:-])opacity-0\b/.test(cls) && !/(?:hover|focus|focus-within|focus-visible):opacity-/.test(cls);
}

/** Hidden at every width: `hidden` / `sr-only` / `invisible` with no responsive reveal. */
function isHiddenElement(cls: string): boolean {
  if (!/(?<![\w:-])(?:hidden|sr-only|invisible)\b/.test(cls)) return false;
  return !/(?:^|\s)[\w-]+:(?:block|inline|inline-block|inline-flex|flex|grid|visible|not-sr-only)\b/.test(cls);
}

function containsCarrier(node: ts.Node): boolean {
  let found = false;
  node.forEachChild(function visit(n) {
    if (found) return;
    // A menu inside a hidden element of the box is never seen.
    if ((ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) && isHiddenElement(attrText(n, "className") ?? "")) return;
    if ((ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) && CARRIER_NAMES.has(tagName(n))) {
      // A hidden menu carries nothing.
      if (!isHiddenMenu(n)) {
        found = true;
        return;
      }
    }
    n.forEachChild(visit);
  });
  return found;
}

/**
 * A bare `<ErrorAlchemyMenu>` placed as a direct sibling of the box — the
 * heading-and-menu row (`<div><h2>Something went wrong</h2><ErrorAlchemyMenu/></div>`).
 * Only the menu itself counts here, never an unrelated ErrorNotice beside it
 * (that is the F9 hole).
 */
function hasSiblingMenu(box: JsxLike): boolean {
  // An alert box must hold its own menu: the menu reads the words of the
  // alert it sits in, and a menu beside it reads the row instead.
  if (hasAlertRole(box) || isDestructiveAlert(box)) return false;
  const parent = box.parent;
  if (!parent || !(ts.isJsxElement(parent) || ts.isJsxFragment(parent))) return false;
  return parent.children.some(
    (child) =>
      (ts.isJsxSelfClosingElement(child) || ts.isJsxElement(child)) &&
      tagName(child) === "ErrorAlchemyMenu" &&
      !isHiddenMenu(child),
  );
}

function jsxAncestors(node: ts.Node): JsxLike[] {
  const out: JsxLike[] = [];
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isJsxElement(current)) out.push(current);
    // A box never spans components.
    if (ts.isFunctionLike(current)) break;
    current = current.parent;
  }
  return out;
}

export function findErrorDisplays(source: string, fileName = "file.tsx"): ErrorDisplayHit[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hits: ErrorDisplayHit[] = [];
  const counted = new Set<ts.Node>();

  const visit = (n: ts.Node) => {
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
      const name = tagName(n);
      const reason = CARRIER_NAMES.has(name) || isDestructiveAlert(n) ? null : classify(n);
      if (reason) {
        const ancestors = jsxAncestors(n);
        const wrapped = ancestors.some((a) => WRAPPER_NAMES.has(tagName(a)) || isDestructiveAlert(a));
        // The box: climb while the ancestor is itself error-styled or a display.
        // Plain layout wrappers between two error-styled elements belong to the
        // same box (a destructive card > plain column > red title + red text).
        let box: JsxLike = n;
        for (let i = 0; i < ancestors.length; i += 1) {
          const a = ancestors[i];
          if (CONTROLS.test(tagName(a))) break;
          if (isErrorStyled(a) || classify(a)) {
            box = a;
            continue;
          }
          // Up to three plain wrappers (card > content > row > column), the same
          // reach the menu's DOM read climbs to find its card (errorRootFor).
          const next = ancestors.slice(i + 1, i + 4).findIndex((b) => isErrorStyled(b));
          if (next === -1) break;
          box = ancestors[i + 1 + next];
          i += 1 + next;
        }
        if (!wrapped && !counted.has(box)) {
          counted.add(box);
          hits.push({
            line: sf.getLineAndCharacterOfPosition(box.getStart()).line + 1,
            tag: tagName(box),
            reason,
            carried: containsCarrier(box) || hasSiblingMenu(box),
            errorExpression:
              [...ownChildren(n).errorLeaves, ...ownChildren(n).messageLeaves].find((text) =>
                /^[\w$.?!]+$/.test(text),
              ) ?? null,
            insertAt: ts.isJsxElement(box) ? box.closingElement.getStart() : null,
          });
        }
      }
    }
    n.forEachChild(visit);
  };
  visit(sf);
  return hits.sort((a, b) => a.line - b.line);
}

export function uncarriedErrorDisplays(source: string, fileName?: string): ErrorDisplayHit[] {
  return findErrorDisplays(source, fileName).filter((hit) => !hit.carried);
}

/**
 * A DOM-read menu (no `input`) that sits outside any error display and outside
 * any error branch renders when nothing failed — a copy-for-AI icon on a
 * healthy row. Every such menu is a placement defect (RC-B12 round 2).
 */
export function findOrphanMenus(source: string, fileName = "file.tsx"): number[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lines: number[] = [];
  const visit = (n: ts.Node) => {
    if ((ts.isJsxSelfClosingElement(n) || ts.isJsxElement(n)) && tagName(n) === "ErrorAlchemyMenu") {
      const hasInput = attrText(n, "input") !== null;
      if (!hasInput) {
        const ancestors = jsxAncestors(n);
        const inDisplay = ancestors.some(
          (a) =>
            isErrorStyled(a) ||
            classify(a) !== null ||
            WRAPPER_NAMES.has(tagName(a)) ||
            isDestructiveAlert(a),
        );
        if (!inDisplay && !inErrorBranch(n)) {
          lines.push(sf.getLineAndCharacterOfPosition(n.getStart()).line + 1);
        }
      }
    }
    n.forEachChild(visit);
  };
  visit(sf);
  return lines;
}

/**
 * Two menus on one box (`AgentAppsGrid`: one after the title and one at the
 * right edge) — the person sees two identical icons and does not know which
 * is the error. Menus in exclusive branches (`a ? <p>…<Menu/></p> : …`) are
 * never on screen together and do not count. An ErrorNotice / ErrorBox draws
 * its own menu, so one beside a bare menu in the same box is also a double.
 */
export function findDoubleMenus(source: string, fileName = "file.tsx"): number[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lines = new Set<number>();
  const isBox = (n: JsxLike) => hasAlertRole(n) || RED.test(alwaysClasses(n));
  /** The branch a node renders under, inside `box`: the innermost conditional arm, or the box itself. */
  const branchOf = (n: ts.Node, box: ts.Node): ts.Node => {
    let child: ts.Node = n;
    let cur: ts.Node | undefined = n.parent;
    while (cur && cur !== box) {
      if (ts.isConditionalExpression(cur) && (child === cur.whenTrue || child === cur.whenFalse)) return child;
      if (ts.isBinaryExpression(cur) && child === cur.right) return child;
      if (ts.isCallExpression(cur) || ts.isFunctionLike(cur)) return cur;
      child = cur;
      cur = cur.parent;
    }
    return box;
  };
  const visit = (n: ts.Node) => {
    if ((ts.isJsxElement(n) && isBox(n))) {
      const menus: ts.Node[] = [];
      n.forEachChild(function inner(m) {
        if (ts.isFunctionLike(m)) return;
        if ((ts.isJsxElement(m) || ts.isJsxSelfClosingElement(m)) && CARRIER_NAMES.has(tagName(m))) {
          if (!isHiddenMenu(m)) menus.push(m);
          return;
        }
        m.forEachChild(inner);
      });
      const seen = new Set<ts.Node>();
      for (const m of menus) {
        const b = branchOf(m, n);
        if (seen.has(b)) lines.add(sf.getLineAndCharacterOfPosition(n.getStart()).line + 1);
        seen.add(b);
      }
    }
    n.forEachChild(visit);
  };
  visit(sf);
  return [...lines].sort((a, b) => a - b);
}
