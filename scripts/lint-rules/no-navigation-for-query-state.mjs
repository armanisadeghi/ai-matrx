/**
 * matrx/no-navigation-for-query-state (lane URL-STATE, 2026-09-24)
 *
 * The address bar changes WITHOUT a navigation in exactly one module:
 * lib/url-state/addressWithoutNavigating.ts. This rule fails on
 *
 *   1. a direct `history.pushState` / `history.replaceState` anywhere else —
 *      the old habit passed `window.history.state`, whose `__NA` marker skips
 *      Next's patch so `useSearchParams` went stale (chat, files, code
 *      workspace, org manage), and every copy re-decided that by hand;
 *   2. `router.replace(...)` whose destination is the CURRENT pathname with a
 *      new query (`${pathname}?…`, `pathname + "?" + …`, `"?…"`, a bare
 *      `pathname`, or a local const holding one of those) — that is an App
 *      Router navigation: a `?_rsc=` server round trip for bookkeeping.
 *
 * Use replaceAddressWithoutNavigating / pushAddressWithoutNavigating instead.
 * The one legitimate router form: the route's SERVER component reads that
 * param from `searchParams`, so only a navigation re-renders it — say so on
 * an `// eslint-disable-next-line matrx/no-navigation-for-query-state` line.
 *
 * Scope: features/, app/, lib/, hooks/, components/, providers/ (test files
 * excluded). Option `{ push: true }` extends check 2 to `router.push` (used
 * for the census, not enabled).
 */

const HELPER = "/lib/url-state/addressWithoutNavigating.ts";
const SCOPED_DIR_RE = /(^|\/)(features|app|lib|hooks|components|providers)\//;
const TEST_FILE_RE = /(\.test\.|\.spec\.|\/__tests__\/)/;

function isPathnameish(node) {
  if (!node) return false;
  if (node.type === "Identifier") return /pathname$/i.test(node.name);
  if (node.type === "MemberExpression" && !node.computed) {
    return node.property.type === "Identifier" && node.property.name === "pathname";
  }
  if (node.type === "CallExpression") {
    return node.callee.type === "Identifier" && node.callee.name === "usePathname";
  }
  if (node.type === "TSNonNullExpression" || node.type === "TSAsExpression") {
    return isPathnameish(node.expression);
  }
  return false;
}

function staticPrefix(node) {
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "TemplateLiteral") return node.quasis[0].value.cooked ?? "";
  return null;
}

/** Text that follows `pathname` must not start a new path segment. */
function continuesSamePath(text) {
  return text === "" || text.startsWith("?") || text.startsWith("#");
}

function resolveLocal(context, node, depth) {
  if (depth > 2 || node.type !== "Identifier") return null;
  const scope = context.sourceCode.getScope(node);
  let s = scope;
  while (s) {
    const v = s.set.get(node.name);
    if (v) {
      const def = v.defs[0];
      if (
        def &&
        def.type === "Variable" &&
        def.node.type === "VariableDeclarator" &&
        def.node.init &&
        def.parent?.kind === "const"
      ) {
        return def.node.init;
      }
      return null;
    }
    s = s.upper;
  }
  return null;
}

/** true when `node` evaluates to the current pathname plus (at most) a new query/hash. */
function isQueryOnlyDestination(context, node, depth = 0) {
  if (!node) return false;
  if (node.type === "ChainExpression") return isQueryOnlyDestination(context, node.expression, depth);
  if (node.type === "TSAsExpression" || node.type === "TSNonNullExpression") {
    return isQueryOnlyDestination(context, node.expression, depth);
  }
  // "?a=1" / `?${qs}`
  const prefix = staticPrefix(node);
  if (prefix !== null && (prefix.startsWith("?") || (prefix === "" && node.type === "Literal"))) {
    return prefix.startsWith("?");
  }
  // bare pathname
  if (isPathnameish(node)) return true;
  // `${pathname}…`
  if (node.type === "TemplateLiteral") {
    if (node.quasis[0].value.cooked !== "" || node.expressions.length === 0) return false;
    if (!isPathnameish(node.expressions[0])) return false;
    return continuesSamePath(node.quasis[1]?.value.cooked ?? "");
  }
  // pathname + "?" + …
  if (node.type === "BinaryExpression" && node.operator === "+") {
    let left = node;
    while (left.type === "BinaryExpression" && left.operator === "+") left = left.left;
    if (!isPathnameish(left)) return false;
    // the operand right after pathname
    let parent = node;
    while (parent.left !== left) parent = parent.left;
    const next = staticPrefix(parent.right);
    return next === null ? true : continuesSamePath(next);
  }
  // cond ? `${pathname}?…` : pathname
  if (node.type === "ConditionalExpression") {
    return (
      isQueryOnlyDestination(context, node.consequent, depth) &&
      isQueryOnlyDestination(context, node.alternate, depth)
    );
  }
  if (node.type === "Identifier") {
    const init = resolveLocal(context, node, depth + 1);
    return init ? isQueryOnlyDestination(context, init, depth + 1) : false;
  }
  return false;
}

function isHistoryObject(node) {
  if (node.type === "Identifier") return node.name === "history";
  if (node.type === "MemberExpression" && !node.computed) {
    return (
      node.property.type === "Identifier" &&
      node.property.name === "history" &&
      node.object.type === "Identifier" &&
      (node.object.name === "window" || node.object.name === "globalThis" || node.object.name === "self")
    );
  }
  return false;
}

export const noNavigationForQueryState = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Change the address without navigating only through lib/url-state/addressWithoutNavigating.ts; never a raw history write, never router.replace to the same pathname.",
    },
    schema: [
      {
        type: "object",
        properties: { push: { type: "boolean" } },
        additionalProperties: false,
      },
    ],
    messages: {
      rawHistory:
        "Direct history.{{method}}. Use replaceAddressWithoutNavigating / pushAddressWithoutNavigating from @/lib/url-state/addressWithoutNavigating — the one door that passes `null` so Next's patch keeps useSearchParams/usePathname in step (passing window.history.state forwards `__NA` and leaves useSearchParams stale).",
      queryOnlyRouter:
        "router.{{method}} to the SAME pathname is an App Router navigation (a `?_rsc=` server round trip) just to change query state. Use {{helper}} from @/lib/url-state/addressWithoutNavigating. If this route's server component reads the param from `searchParams`, keep the router and say so on an eslint-disable-next-line comment.",
    },
  },
  create(context) {
    const filename = (context.filename || "").replace(/\\/g, "/");
    const rel = filename.startsWith(context.cwd ?? "") ? filename.slice((context.cwd ?? "").length) : filename;
    if (!SCOPED_DIR_RE.test(rel)) return {};
    if (TEST_FILE_RE.test(rel) || rel.endsWith(HELPER)) return {};
    const checkPush = Boolean(context.options[0]?.push);
    return {
      CallExpression(node) {
        const callee = node.callee.type === "ChainExpression" ? node.callee.expression : node.callee;
        if (callee.type !== "MemberExpression" || callee.computed) return;
        if (callee.property.type !== "Identifier") return;
        const method = callee.property.name;
        if ((method === "pushState" || method === "replaceState") && isHistoryObject(callee.object)) {
          context.report({ node, messageId: "rawHistory", data: { method } });
          return;
        }
        if (method !== "replace" && !(checkPush && method === "push")) return;
        const obj = callee.object;
        const isRouter =
          (obj.type === "Identifier" && /router$/i.test(obj.name)) ||
          (obj.type === "MemberExpression" &&
            !obj.computed &&
            obj.property.type === "Identifier" &&
            /router$/i.test(obj.property.name));
        if (!isRouter) return;
        if (!isQueryOnlyDestination(context, node.arguments[0])) return;
        context.report({
          node,
          messageId: "queryOnlyRouter",
          data: {
            method,
            helper: method === "push" ? "pushAddressWithoutNavigating" : "replaceAddressWithoutNavigating",
          },
        });
      },
    };
  },
};
