/**
 * matrx/one-control + matrx/no-styled-raw-button — THE ONE CONTROL in the editor.
 * Predicates: ./one-control.mjs (shared with `pnpm check:one-control`, the findings census).
 *
 * matrx/one-control (error):
 *   1. a retired prototype class (`uc-btn`, `uc-field`, `uc-row`, …) in a className or a class
 *      helper call (cn / clsx / cva / twMerge / cx / classNames);
 *   2. a VISUAL class or style key handed to a control imported from
 *      `@ai-matrx/design-system/controls` (the package locks it anyway — the class is a lie).
 * matrx/no-styled-raw-button (warn): a raw <button> whose className carries visual classes.
 *
 * Never an eslint-disable: the census of what is left is `pnpm findings`.
 * Self-test: node --test scripts/lint-rules/one-control.selftest.mjs
 */
import {
  ONE_CONTROL_FIX,
  PROTOTYPE_FIX,
  RAW_BUTTON_FIX,
  controlVisualTokens,
  isControlsModule,
  isExemptFile,
  isVisualStyleKey,
  LAYOUT_EXPORTS,
  prototypeTokens,
  rawButtonVisualTokens,
} from "./one-control.mjs";

const CLASS_CALLS = /^(cn|clsx|cva|twMerge|classNames|cx)$/;

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

const elementName = (node) => (node.name.type === "JSXIdentifier" ? node.name.name : null);

export const oneControl = {
  meta: {
    type: "problem",
    docs: { description: "The one control: no retired uc-* classes; no visual className/style on a package control." },
    schema: [],
    messages: {
      prototype: `\`{{tokens}}\` — ${PROTOTYPE_FIX}`,
      override: `<{{component}}> is THE control: \`{{tokens}}\` would restyle it. ${ONE_CONTROL_FIX}`,
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename?.() ?? "";
    if (isExemptFile(filename)) return {};
    const controls = new Set();
    const seen = new WeakSet();
    const prototype = (node) => {
      if (seen.has(node)) return;
      seen.add(node);
      const toks = prototypeTokens(strings(node).join(" "));
      if (toks.length) context.report({ node, messageId: "prototype", data: { tokens: toks.join(" ") } });
    };
    return {
      ImportDeclaration(node) {
        if (!isControlsModule(String(node.source.value))) return;
        for (const spec of node.specifiers) {
          if (spec.type !== "ImportSpecifier") continue;
          const imported = spec.imported.type === "Identifier" ? spec.imported.name : String(spec.imported.value);
          if (!LAYOUT_EXPORTS.has(imported)) controls.add(spec.local.name);
        }
      },
      JSXOpeningElement(node) {
        const name = elementName(node);
        for (const attr of node.attributes) {
          if (attr.type !== "JSXAttribute" || attr.name.type !== "JSXIdentifier" || !attr.value) continue;
          const prop = attr.name.name;
          if (prop === "className") {
            prototype(attr);
            if (name && controls.has(name)) {
              const toks = controlVisualTokens(strings(attr.value).join(" "));
              if (toks.length) context.report({ node: attr, messageId: "override", data: { component: name, tokens: toks.join(" ") } });
            }
          }
          if (prop === "style" && name && controls.has(name) && attr.value.type === "JSXExpressionContainer" && attr.value.expression.type === "ObjectExpression") {
            const keys = attr.value.expression.properties
              .filter((p) => p.type === "Property" && p.key.type === "Identifier" && isVisualStyleKey(p.key.name))
              .map((p) => p.key.name);
            if (keys.length) context.report({ node: attr, messageId: "override", data: { component: name, tokens: `style: ${keys.join(", ")}` } });
          }
        }
      },
      CallExpression(node) {
        if (node.callee.type === "Identifier" && CLASS_CALLS.test(node.callee.name)) prototype(node);
      },
    };
  },
};

export const noStyledRawButton = {
  meta: {
    type: "suggestion",
    docs: { description: "A raw <button> with visual classes is a hand-rolled control; use the package Button." },
    schema: [],
    messages: { raw: `<button> \`{{tokens}}\` — ${RAW_BUTTON_FIX}` },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename?.() ?? "";
    if (isExemptFile(filename)) return {};
    return {
      JSXOpeningElement(node) {
        if (elementName(node) !== "button") return;
        const cls = node.attributes.find((a) => a.type === "JSXAttribute" && a.name.type === "JSXIdentifier" && a.name.name === "className");
        if (!cls?.value) return;
        const toks = rawButtonVisualTokens(strings(cls.value).join(" "));
        if (toks.length) context.report({ node: cls, messageId: "raw", data: { tokens: toks.join(" ") } });
      },
    };
  },
};
