/**
 * matrx/no-canonical-component-override — THE CANONICAL-OVERRIDE LAW in the editor.
 *
 * Fails on (predicates: ./canonical-override.mjs, shared with check:ui-drift `canonical-override`):
 *   1. `className` / `tableClassName` / any `*ClassName` handed to a canonical table/toolbar
 *      component imported from `@ai-matrx/design-system` (MatrxDataTable, MatrxTableCard,
 *      TableTitleRow, TableViewTabs, TableScopeBar, …);
 *   2. a Tailwind arbitrary variant reaching into a package's internals from outside it —
 *      `[&_[data-matrx-…]]:…`, `[&_thead]:hidden`, `[&_td]:py-1` — in a className or a class
 *      helper call (cn / clsx / cva / twMerge / cx / classNames), on any element.
 *
 * Remedy: the package's option, or a new option added IN the package (released + adopted the
 * same session). Never an eslint-disable: the census of what is left is `pnpm findings`.
 *
 * Self-test: node --test scripts/lint-rules/no-canonical-component-override.selftest.mjs
 */
import {
  CANONICAL_OVERRIDE_FIX,
  CANONICAL_TABLE_COMPONENTS,
  isCanonicalTableModule,
  isClassProp,
  isRestylingProp,
  isExemptFile,
  reachesIntoPackage,
} from "./canonical-override.mjs";

const TEST_FILE_RE = /(\.test\.|\.spec\.|\/__tests__\/|\.selftest\.)/;
const CLASS_CALLS = /^(cn|clsx|cva|twMerge|classNames|cx)$/;

/** Every static string inside a node (string literals and template text). */
function strings(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (node.type === "Literal" && typeof node.value === "string") out.push(node.value);
  else if (node.type === "TemplateElement") out.push(node.value.cooked ?? node.value.raw ?? "");
  for (const key of Object.keys(node)) {
    if (key === "parent" || key === "loc" || key === "range") continue;
    const child = node[key];
    if (Array.isArray(child)) for (const c of child) strings(c, out);
    else if (child && typeof child === "object" && typeof child.type === "string") strings(child, out);
  }
  return out;
}

const reachTokens = (node, onElement) =>
  [...new Set(strings(node).join(" ").split(/\s+/).filter((t) => t && reachesIntoPackage(t, onElement)))];

export const noCanonicalComponentOverride = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow re-styling the package's canonical table/toolbar from a page: a class prop on the component, or an arbitrary variant reaching into its internals.",
    },
    schema: [],
    messages: {
      classProp: `<{{component}}> is a canonical @ai-matrx/design-system component: a page never hands it \`{{prop}}\`. ${CANONICAL_OVERRIDE_FIX}`,
      reach: `\`{{tokens}}\` reaches into a package's internals from outside it. ${CANONICAL_OVERRIDE_FIX}`,
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename?.() ?? "";
    if (isExemptFile(filename) || TEST_FILE_RE.test(filename)) return {};
    const canonical = new Map(); // local name → imported name
    const handled = new WeakSet();
    const checkReach = (node, onElement = "") => {
      if (handled.has(node)) return;
      handled.add(node);
      const toks = reachTokens(node, onElement);
      if (toks.length) context.report({ node, messageId: "reach", data: { tokens: toks.join(" ") } });
    };
    const markCalls = (node) => {
      if (!node || typeof node !== "object") return;
      if (node.type === "CallExpression") handled.add(node);
      for (const key of Object.keys(node)) {
        if (key === "parent") continue;
        const child = node[key];
        if (Array.isArray(child)) for (const c of child) markCalls(c);
        else if (child && typeof child === "object" && typeof child.type === "string") markCalls(child);
      }
    };
    return {
      ImportDeclaration(node) {
        if (!isCanonicalTableModule(String(node.source.value))) return;
        for (const spec of node.specifiers) {
          if (spec.type !== "ImportSpecifier") continue;
          const imported = spec.imported.type === "Identifier" ? spec.imported.name : String(spec.imported.value);
          if (CANONICAL_TABLE_COMPONENTS.has(imported)) canonical.set(spec.local.name, imported);
        }
      },
      JSXOpeningElement(node) {
        const name = node.name.type === "JSXIdentifier" ? node.name.name : null;
        const component = name ? canonical.get(name) : undefined;
        for (const attr of node.attributes) {
          if (attr.type !== "JSXAttribute" || attr.name.type !== "JSXIdentifier") continue;
          const prop = attr.name.name;
          if (!isClassProp(prop)) continue;
          if (component && isRestylingProp(prop)) context.report({ node: attr, messageId: "classProp", data: { component, prop } });
          if (attr.value) {
            markCalls(attr.value);
            checkReach(attr, name ?? "");
          }
        }
      },
      CallExpression(node) {
        if (node.callee.type !== "Identifier" || !CLASS_CALLS.test(node.callee.name)) return;
        checkReach(node);
        markCalls(node);
      },
    };
  },
};
