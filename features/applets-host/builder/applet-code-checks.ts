// features/applets-host/builder/applet-code-checks.ts — the builder's code checks, read from the SYNTAX TREE.
//
// Each check refuses one thing a person would hit in a generated Applet (a browser dialog, a dead button,
// a choice spelled two ways, a hand-built sortable list, a field with no input). They used to be regexes
// over the source, and a regex cannot tell code from a string, a comment or JSX text: `label="Image prompt
// (optional)"` read as a call to prompt(), `const L = { draft: "Draft" }` as a misspelled choice, and a
// Button under `<DialogTrigger asChild>` as dead (lane AL review, 2026-10-08). Every check here walks the
// tree `@babel/parser` builds — the same parser family the Applet compiler uses — so it sees only real
// calls, real comparisons and real ancestry, and never blocks a valid Applet.
//
// Loaded on demand with ./check-build-answer.ts (never in the builder's first chunk).
import { parse } from "@babel/parser";
import type * as t from "@babel/types";

import type { BuilderApplet, BuilderFile } from "./build-applet";

type Parsed = { ok: true; ast: t.File } | { ok: false; error: string } | { ok: true; ast: null };

/** The Applet compiler's language rule (`@ai-matrx/code-runtime` languageOf): no extension reads as .tsx. */
function pluginsFor(name: string): ("jsx" | "typescript")[] | null {
  const ext = (/\.([a-z]+)$/i.exec(name)?.[1] ?? "tsx").toLowerCase();
  if (ext === "ts" || ext === "mts" || ext === "cts") return ["typescript"];
  if (ext === "tsx") return ["jsx", "typescript"];
  if (ext === "jsx" || ext === "js" || ext === "mjs" || ext === "cjs") return ["jsx"];
  return null;
}

const cache = new Map<string, Parsed>();

/** The file's syntax tree; `ast: null` for a file that is not code (json, css, text). */
export function parseAppletFile(file: BuilderFile): Parsed {
  const key = `${file.name}\u0000${file.source}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const plugins = pluginsFor(file.name);
  let out: Parsed;
  if (!plugins) out = { ok: true, ast: null };
  else {
    try {
      out = { ok: true, ast: parse(file.source, { sourceType: "module", plugins }) };
    } catch (err) {
      out = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
  if (cache.size > 64) cache.clear();
  cache.set(key, out);
  return out;
}

function treeOf(file: BuilderFile): t.File | null {
  const parsed = parseAppletFile(file);
  return parsed.ok ? parsed.ast : null;
}

const SKIP_KEYS = new Set(["loc", "start", "end", "extra", "range", "leadingComments", "trailingComments", "innerComments", "comments", "tokens"]);

function isNode(v: unknown): v is t.Node {
  return typeof v === "object" && v !== null && typeof (v as { type?: unknown }).type === "string";
}

/** Depth-first over every node, with its ancestors (nearest last). */
function walk(root: t.Node, visit: (node: t.Node, ancestors: readonly t.Node[]) => void): void {
  const ancestors: t.Node[] = [];
  const go = (node: t.Node) => {
    visit(node, ancestors);
    ancestors.push(node);
    for (const key of Object.keys(node)) {
      if (SKIP_KEYS.has(key)) continue;
      const value = (node as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        for (const child of value) if (isNode(child)) go(child);
      } else if (isNode(value)) go(value);
    }
    ancestors.pop();
  };
  go(root);
}

/** `<Foo>` → "Foo", `<Dialog.Trigger>` → "Dialog.Trigger". */
function elementName(el: t.JSXElement): string {
  const name = el.openingElement.name;
  if (name.type === "JSXIdentifier") return name.name;
  if (name.type === "JSXNamespacedName") return `${name.namespace.name}:${name.name.name}`;
  const parts: string[] = [];
  let cur: t.JSXMemberExpression | t.JSXIdentifier = name;
  while (cur.type === "JSXMemberExpression") {
    parts.unshift(cur.property.name);
    cur = cur.object;
  }
  parts.unshift(cur.name);
  return parts.join(".");
}

function attribute(el: t.JSXElement, name: string): t.JSXAttribute | null {
  for (const a of el.openingElement.attributes) if (a.type === "JSXAttribute" && a.name.type === "JSXIdentifier" && a.name.name === name) return a;
  return null;
}

/** The string an attribute holds (`type="submit"`, `type={"submit"}`), or null when it is computed. */
function attributeString(a: t.JSXAttribute): string | null {
  const v = a.value;
  if (!v) return "";
  if (v.type === "StringLiteral") return v.value;
  if (v.type === "JSXExpressionContainer" && v.expression.type === "StringLiteral") return v.expression.value;
  return null;
}

/** The property's name: `status:`, `"status":`, `["status"]:` — null when computed from a variable. */
function propertyName(key: t.Node, computed: boolean): string | null {
  if (!computed && key.type === "Identifier") return key.name;
  if (key.type === "StringLiteral") return key.value;
  return null;
}

function memberName(node: t.Node): string | null {
  if (node.type !== "MemberExpression" && node.type !== "OptionalMemberExpression") return null;
  return propertyName(node.property, node.computed);
}

/** Every name a pattern binds (`a`, `{ a, b: c }`, `[a, ...rest]`, `a = 1`). */
function patternNames(node: t.Node | null | undefined, out: Set<string>): void {
  if (!node) return;
  switch (node.type) {
    case "Identifier":
      out.add(node.name);
      return;
    case "ObjectPattern":
      for (const p of node.properties) patternNames(p.type === "RestElement" ? p.argument : p.value, out);
      return;
    case "ArrayPattern":
      for (const e of node.elements) patternNames(e, out);
      return;
    case "RestElement":
      patternNames(node.argument, out);
      return;
    case "AssignmentPattern":
      patternNames(node.left, out);
      return;
    case "TSParameterProperty":
      patternNames(node.parameter, out);
      return;
    default:
      return;
  }
}

/** Every name the file itself binds, anywhere (imports, declarations, parameters, catch clauses). */
function boundNames(ast: t.File): Set<string> {
  const out = new Set<string>();
  walk(ast, (node) => {
    switch (node.type) {
      case "ImportSpecifier":
      case "ImportDefaultSpecifier":
      case "ImportNamespaceSpecifier":
        out.add(node.local.name);
        break;
      case "FunctionDeclaration":
      case "FunctionExpression":
      case "ArrowFunctionExpression":
      case "ObjectMethod":
      case "ClassMethod":
        if ("id" in node && node.id) out.add(node.id.name);
        for (const p of node.params) patternNames(p, out);
        break;
      case "ClassDeclaration":
        if (node.id) out.add(node.id.name);
        break;
      case "VariableDeclarator":
        patternNames(node.id, out);
        break;
      case "CatchClause":
        patternNames(node.param, out);
        break;
      default:
        break;
    }
  });
  return out;
}

const DIALOGS: ReadonlySet<string> = new Set(["confirm", "alert", "prompt"]);
const GLOBAL_OBJECTS: ReadonlySet<string> = new Set(["window", "globalThis", "self"]);

/**
 * NO BROWSER DIALOG. A generated page asked `window.confirm("Delete this brand?")` (social planner,
 * 2026-10-08) — the platform's confirm is `confirmAction` from "@ai-matrx/applets/react". Only a real
 * call of the browser's own confirm / alert / prompt is named: `window.confirm(…)`, `window.alert`, or a
 * bare `confirm(…)` the file never imports or defines. Words in a string, JSX text or a comment
 * (`label="Image prompt (optional)"`) are not calls.
 */
export function browserDialogs(file: BuilderFile): string[] {
  const ast = treeOf(file);
  if (!ast) return [];
  const bound = boundNames(ast);
  const out = new Set<string>();
  walk(ast, (node) => {
    if ((node.type === "CallExpression" || node.type === "OptionalCallExpression") && node.callee.type === "Identifier") {
      if (DIALOGS.has(node.callee.name) && !bound.has(node.callee.name)) out.add(node.callee.name);
      return;
    }
    if (node.type === "MemberExpression" || node.type === "OptionalMemberExpression") {
      const name = memberName(node);
      if (name && DIALOGS.has(name) && node.object.type === "Identifier" && GLOBAL_OBJECTS.has(node.object.name) && !bound.has(node.object.name)) out.add(name);
    }
  });
  return [...out];
}

/** What a button says: its text, collapsed. */
function buttonLabel(el: t.JSXElement): string {
  const words: string[] = [];
  walk(el, (node) => {
    if (node.type === "JSXText") words.push(node.value);
    else if (node.type === "JSXExpressionContainer" && node.expression.type === "StringLiteral") words.push(node.expression.value);
  });
  return words.join(" ").replace(/\s+/g, " ").trim().slice(0, 30);
}

/** A press on the button itself does something. */
const LIVE_ATTRIBUTES: ReadonlySet<string> = new Set(["onClick", "onPointerDown", "onPointerUp", "onMouseDown", "onMouseUp", "onKeyDown", "form", "formAction", "asChild", "href"]);
/** A wrapper whose child is the thing pressed: a link, or a Radix-style trigger/close. */
const LINK_ELEMENTS: ReadonlySet<string> = new Set(["Link", "NavLink", "a"]);

/** Something around the button makes it do something. */
function liveByAncestor(ancestors: readonly t.Node[]): boolean {
  for (const a of ancestors) {
    // Passed as a prop (`trigger={<Button>Delete</Button>}`): the component it is given wires it.
    if (a.type === "JSXAttribute") return true;
    if (a.type !== "JSXElement") continue;
    const name = elementName(a);
    if (attribute(a, "asChild")) return true;
    if ((name === "form" || name === "Form") && (attribute(a, "onSubmit") || attribute(a, "action"))) return true;
    if (LINK_ELEMENTS.has(name)) return true;
    if (/(?:Trigger|Close)$/.test(name)) return true;
  }
  return false;
}

/**
 * NO BUTTON THAT DOES NOTHING. "New Post" rendered with no handler: the person presses it and nothing
 * happens (2026-10-08). A button is live when it has a handler (or spreads props that may carry one), is
 * `type="submit"`, or sits where something else gives it its job: under an `asChild` wrapper
 * (`<DialogTrigger asChild>`), inside a form with `onSubmit`, inside a `<Link>`, or handed to a component
 * as a prop.
 */
export function deadButtons(file: BuilderFile): string[] {
  const ast = treeOf(file);
  if (!ast) return [];
  const out: string[] = [];
  walk(ast, (node, ancestors) => {
    if (node.type !== "JSXElement") return;
    const name = elementName(node);
    if (name !== "Button" && name !== "button") return;
    for (const a of node.openingElement.attributes) {
      if (a.type === "JSXSpreadAttribute") return;
      if (a.name.type === "JSXIdentifier" && LIVE_ATTRIBUTES.has(a.name.name)) return;
    }
    const type = attribute(node, "type");
    if (type) {
      const value = attributeString(type);
      if (value === null || value === "submit" || value === "reset") return;
    }
    if (liveByAncestor(ancestors)) return;
    out.push(buttonLabel(node) || name);
  });
  return out;
}

/** An icon that says "this header sorts". */
const SORT_ICON = /^(?:ArrowUpDown|ArrowDownUp|ArrowUp|ArrowDown|ChevronUp|ChevronDown|ChevronsUpDown|ChevronsDownUp|Sort\w*|\w*Sort(?:Asc|Desc|Ascending|Descending)?\w*)$/;

/** A header cell that looks pressable to sort: a handler, `aria-sort`, or a sort icon inside it. */
function sortableHeader(th: t.JSXElement): boolean {
  let sortable = false;
  walk(th, (node) => {
    if (sortable) return;
    if (node.type === "JSXAttribute" && node.name.type === "JSXIdentifier" && (node.name.name === "onClick" || node.name.name === "aria-sort")) sortable = true;
    else if (node.type === "JSXElement" && SORT_ICON.test(elementName(node))) sortable = true;
  });
  return sortable;
}

/** The `<tr>` is what a `.map(…)` callback returns — one row per item. */
function mappedRow(ancestors: readonly t.Node[]): boolean {
  for (let i = ancestors.length - 1; i > 0; i--) {
    const fn = ancestors[i];
    if (fn?.type === "JSXElement" && elementName(fn) === "table") return false;
    if (fn?.type !== "ArrowFunctionExpression" && fn?.type !== "FunctionExpression") continue;
    const call = ancestors[i - 1];
    if ((call?.type === "CallExpression" || call?.type === "OptionalCallExpression") && memberName(call.callee) === "map" && call.arguments.includes(fn as t.Expression)) return true;
  }
  return false;
}

/**
 * A RECORD LIST IS THE PLATFORM TABLE. A generated "All Posts" page hand-built a `<table>` whose headers
 * looked clickable and sorted nothing (social planner live test, v0.4.3010). Refused only for a record
 * LIST: a file that reads rows, whose `<table>` draws one `<tr>` per item from a `.map(…)` under header
 * cells that look sortable. A calendar grid, a pivot, or a plain summary table RecordTable cannot draw
 * is never refused — `<RecordTable>` from "@ai-matrx/applets/react" sorts and filters every column itself.
 */
export function handBuiltTables(file: BuilderFile): boolean {
  const ast = treeOf(file);
  if (!ast) return false;
  let readsRows = false;
  walk(ast, (node) => {
    if ((node.type === "CallExpression" || node.type === "OptionalCallExpression") && node.callee.type === "Identifier" && node.callee.name === "useRows") readsRows = true;
  });
  if (!readsRows) return false;
  let found = false;
  walk(ast, (node) => {
    if (found || node.type !== "JSXElement" || elementName(node) !== "table") return;
    let rowsMapped = false;
    let sorts = false;
    walk(node, (inner, ancestors) => {
      if (inner.type !== "JSXElement") return;
      const name = elementName(inner);
      if (name === "tr" && mappedRow(ancestors)) rowsMapped = true;
      if (name === "th" && sortableHeader(inner)) sorts = true;
    });
    found = rowsMapped && sorts;
  });
  return found;
}

/** A call that writes a row to the store: `posts.create(…)`, `row.update(…)`, or a local `save(…)`. */
const WRITE_METHODS: ReadonlySet<string> = new Set(["create", "update", "upsert", "insert", "save"]);
const WRITE_FUNCTION = /^(?:on)?(?:save|create|submit|update|upsert|insert|add)(?:[A-Z]\w*)?$/;

function isStoreWrite(call: t.CallExpression | t.OptionalCallExpression): boolean {
  const method = memberName(call.callee);
  if (method) return WRITE_METHODS.has(method);
  return call.callee.type === "Identifier" && WRITE_FUNCTION.test(call.callee.name);
}

function mentions(node: t.Node, name: string): boolean {
  let hit = false;
  walk(node, (n) => {
    if (!hit && n.type === "Identifier" && n.name === name) hit = true;
  });
  return hit;
}

/**
 * EVERY FIELD SHE ASKED FOR HAS ITS OWN INPUT. A form keeps `requirements` in state and saves it, but no
 * input ever calls `setRequirements` — the box labelled "Brand Requirements & Guidance" wrote `guidance`, so
 * what she typed there landed in the wrong field and Requirements stayed empty (social planner,
 * 2026-10-08). Named only when the never-set value is WRITTEN TO THE STORE (a property of the values a
 * `create` / `update` / save call sends); a never-set state used anywhere else (`{ s: filter }` handed to a
 * read) is not a field she fills.
 */
export function fieldsWithNoInput(file: BuilderFile): string[] {
  const ast = treeOf(file);
  if (!ast) return [];
  const pairs: { value: string; setter: string }[] = [];
  const objects = new Map<string, t.ObjectExpression>();
  const setterUses = new Map<string, number>();
  const sentObjects: t.ObjectExpression[] = [];
  const sentNames: string[] = [];
  walk(ast, (node) => {
    if (node.type === "VariableDeclarator" && node.id.type === "Identifier" && node.init?.type === "ObjectExpression") objects.set(node.id.name, node.init);
    if (node.type === "VariableDeclarator" && node.id.type === "ArrayPattern" && node.init?.type === "CallExpression") {
      const callee = node.init.callee;
      const isUseState = (callee.type === "Identifier" && callee.name === "useState") || memberName(callee) === "useState";
      const [value, setter] = node.id.elements;
      if (isUseState && value?.type === "Identifier" && setter?.type === "Identifier") pairs.push({ value: value.name, setter: setter.name });
    }
    if (node.type === "Identifier") setterUses.set(node.name, (setterUses.get(node.name) ?? 0) + 1);
    if ((node.type === "CallExpression" || node.type === "OptionalCallExpression") && isStoreWrite(node)) {
      for (const arg of node.arguments) {
        if (arg.type === "ObjectExpression") sentObjects.push(arg);
        else if (arg.type === "Identifier") sentNames.push(arg.name);
      }
    }
  });
  // A write that passes a named object (`const values = {…}; posts.create(values)`) sends that object.
  const sent = [...sentObjects, ...sentNames.flatMap((n) => objects.get(n) ?? [])];
  const out: string[] = [];
  for (const { value, setter } of pairs) {
    // The declaration itself is the one use; any other is an input (or code) that sets it.
    if ((setterUses.get(setter) ?? 0) > 1) continue;
    const saved = sent.some((obj) => obj.properties.some((p) => p.type === "ObjectProperty" && mentions(p.value, value)));
    if (saved) out.push(value);
  }
  return out;
}

/** Every new-table choice field: its key and its declared choices. */
function choiceFields(applet: Pick<BuilderApplet, "sources">): { alias: string; key: string; options: string[] }[] {
  return applet.sources.flatMap((s) =>
    "new_table" in s && Array.isArray(s.new_table.fields)
      ? s.new_table.fields
          .filter((f) => f.type === "select" || f.type === "multi_select")
          .map((f) => ({ alias: s.alias, key: f.key, options: Array.isArray(f.options) ? f.options : [] }))
      : [],
  );
}

/** The expression IS the field's value: `row.status`, `row["status"]`, `status`, `row.status!`. */
function refersTo(node: t.Node, key: string): boolean {
  if (node.type === "TSNonNullExpression" || node.type === "TSAsExpression" || node.type === "ParenthesizedExpression") return refersTo(node.expression, key);
  if (node.type === "Identifier") return node.name === key;
  return memberName(node) === key;
}

const COMPARE: ReadonlySet<string> = new Set(["===", "==", "!==", "!="]);

/** The literal's text: a string, or a template with no `${}`. */
function literalText(node: t.Node): string | null {
  if (node.type === "StringLiteral") return node.value;
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) return node.quasis[0]?.value.cooked ?? null;
  return null;
}

/**
 * Which choice field a literal is a VALUE of, from where it stands: compared with the field
 * (`row.status === "X"`, `case "X":` of `switch (row.status)`), written to it (`{ status: "X" }`,
 * `row.status = "X"`, `set("status", "X")`), or an option's value (`{ value: "X" }`,
 * `<option value="X">`). Null for display text — a label, a heading, a map from choice to words.
 * `"*"` means any choice field (an option value names no field).
 */
function choiceSlot(node: t.Node, ancestors: readonly t.Node[]): string | null {
  const parent = ancestors.at(-1);
  if (!parent) return null;
  if (parent.type === "BinaryExpression" && COMPARE.has(parent.operator)) {
    const other = parent.left === node ? parent.right : parent.left;
    return other.type === "Identifier" ? other.name : memberName(other);
  }
  if (parent.type === "SwitchCase" && parent.test === node) {
    const sw = ancestors.at(-2);
    if (sw?.type === "SwitchStatement") return sw.discriminant.type === "Identifier" ? sw.discriminant.name : memberName(sw.discriminant);
    return null;
  }
  if (parent.type === "ObjectProperty" && parent.value === node) {
    const key = propertyName(parent.key, parent.computed);
    return key === "value" ? "*" : key;
  }
  if (parent.type === "AssignmentExpression" && parent.right === node) return memberName(parent.left) ?? (parent.left.type === "Identifier" ? parent.left.name : null);
  if ((parent.type === "CallExpression" || parent.type === "OptionalCallExpression") && parent.arguments.includes(node as t.Expression)) {
    const i = parent.arguments.indexOf(node as t.Expression);
    const before = i > 0 ? parent.arguments[i - 1] : null;
    return before ? literalText(before) : null;
  }
  if (parent.type === "JSXAttribute" && parent.name.type === "JSXIdentifier" && parent.name.name === "value") {
    const el = ancestors.at(-3);
    return el?.type === "JSXElement" && /option|item/i.test(elementName(el)) ? "*" : null;
  }
  if (parent.type === "JSXExpressionContainer") {
    const attr = ancestors.at(-2);
    if (attr?.type === "JSXAttribute" && attr.name.type === "JSXIdentifier" && attr.name.name === "value") {
      const el = ancestors.at(-4);
      return el?.type === "JSXElement" && /option|item/i.test(elementName(el)) ? "*" : null;
    }
  }
  return null;
}

/**
 * ONE SPELLING PER CHOICE. The pipeline compared `status === "Assets Ready"` while the table's choice is
 * "Assets ready" (social planner, v0.4.3010) — a row whose status is the table's word never lands in a
 * column spelled otherwise. Named only where the string is the field's VALUE: compared with it, written to
 * it, or an option's value. Display text (`const L = { draft: "Draft" }`, `<h2>Scheduled</h2>`) is never
 * named; the choices are `useColumns(alias)` words.
 */
export function misspelledChoices(applet: Pick<BuilderApplet, "files" | "sources">): { alias: string; key: string; wrote: string; choice: string }[] {
  const fields = choiceFields(applet);
  if (fields.length === 0) return [];
  const out: { alias: string; key: string; wrote: string; choice: string }[] = [];
  const seen = new Set<string>();
  for (const file of applet.files) {
    const ast = treeOf(file);
    if (!ast) continue;
    walk(ast, (node, ancestors) => {
      const wrote = literalText(node);
      if (wrote === null || wrote.length === 0) return;
      const slot = choiceSlot(node, ancestors);
      if (!slot) return;
      for (const field of fields) {
        if (slot !== "*" && slot !== field.key) continue;
        const choice = field.options.find((o) => o !== wrote && o.toLowerCase() === wrote.toLowerCase());
        // An option value may belong to any choice field: name it only where no field spells it this way.
        if (!choice || (slot === "*" && fields.some((f) => f.options.includes(wrote)))) continue;
        const id = `${field.alias}.${field.key}.${wrote}`;
        if (seen.has(id)) continue;
        seen.add(id);
        out.push({ alias: field.alias, key: field.key, wrote, choice });
      }
    });
  }
  return out;
}

/** The parse refusal: a file the Applet compiler could not read either. */
export function parseProblem(file: BuilderFile): string | null {
  const parsed = parseAppletFile(file);
  return parsed.ok ? null : `${file.name} does not parse: ${parsed.error}`;
}
