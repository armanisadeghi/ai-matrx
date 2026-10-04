/**
 * THE CANONICAL-OVERRIDE LAW (owner, /agents/all 2026-10-04: "Many of these UI pages are a
 * disaster because they are modifying my core components … figure out how to put guards that
 * will ensure these types of customizations cannot happen").
 *
 * A page USES the package's table and toolbar; it never re-styles them from outside. Two shapes
 * are the whole class, and both are caught by the same predicates here, shared by
 *   - ESLint `matrx/no-canonical-component-override` (error, in the editor and `pnpm lint`), and
 *   - `pnpm findings` / `check:ui-drift` rule `canonical-override` (count ratchet, shrink-only).
 *
 *   1. A class prop (`className`, `tableClassName`, any `*ClassName`) handed to a canonical
 *      table/toolbar component imported from `@ai-matrx/design-system` — the page restyling the
 *      component's own frame, rows or toolbar.
 *   2. A Tailwind arbitrary variant that reaches INTO a package's internals from outside it:
 *      `[&_[data-matrx-table-tabs]]:border-b-0`, `[&_thead]:hidden`, `[&_td]:py-1`,
 *      `[&>[data-matrx-…]]` — whatever element carries the class.
 *
 * The remedy is always the package: use its option (`density`, `frameHeight`, `emptyHeader`,
 * `toolbar.portalInto` / `tabsPortalInto`, …), or add the missing option IN
 * `aidream/apps/shared/design-system`, release it and adopt it the same session.
 */

/** Canonical table/toolbar components a page may not hand a class to. */
export const CANONICAL_TABLE_COMPONENTS = new Set([
  "MatrxDataTable",
  "MatrxTableCard",
  "TableTitleRow",
  "TableViewTabs",
  "TableViewWorkspace",
  "TableScopeBar",
  "TableSearch",
  "SavedViews",
]);

/** The package modules those components come from. */
export function isCanonicalTableModule(src) {
  return src === "@ai-matrx/design-system" || src.startsWith("@ai-matrx/design-system/");
}

/** A prop that carries classes (`className`, `tableClassName`, `rowClassName`…) — scanned for reaches. */
export function isClassProp(name) {
  return name === "className" || /ClassName$/.test(name);
}

/**
 * A class prop that RESTYLES a canonical component's own frame, table or toolbar. `rowClassName` /
 * `cellClassName` are the package's declared per-row / per-cell presentation hooks (data-driven
 * tints after its own state), so they are not this — their strings are still scanned for reaches.
 */
export function isRestylingProp(name) {
  return /^(className|tableClassName|toolbarClassName|headerClassName|frameClassName)$/.test(name);
}

// An arbitrary variant whose selector names a package hook (`data-matrx-…`) or a table element.
const PACKAGE_HOOK = /data-matrx-/;
const TABLE_ELEMENT = /\[&(?:_|>)(?:table|thead|tbody|tfoot|tr|td|th)(?:[\]_:.[>]|$)/;

/**
 * The selector part of a class token (`[&_thead]:hidden` → `[&_thead]`), or null when the token
 * carries no arbitrary variant.
 */
function arbitraryVariants(token) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of token) {
    if (ch === "[") depth++;
    if (ch === "]") depth--;
    if (ch === ":" && depth === 0) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  return out.filter((v) => v.startsWith("[") && v.includes("&"));
}

/**
 * True when this class token reaches into a package's internals (rule 2 above). `onElement` is the
 * tag carrying the class: on a host's own raw `<table>` / `<tbody>` / `<tr>` the cells below are the
 * host's own markup, so only a `data-matrx-` hook counts there.
 */
export function reachesIntoPackage(token, onElement = "") {
  const hostTable = /^(table|thead|tbody|tfoot|tr)$/.test(onElement);
  return arbitraryVariants(token).some((v) => PACKAGE_HOOK.test(v) || (!hostTable && TABLE_ELEMENT.test(v)));
}

/** Files that ARE the package side (vendored copies, the guard's own fixtures) — never flagged. */
export function isExemptFile(file) {
  const f = String(file).split("\\").join("/");
  return (
    /(^|\/)node_modules\//.test(f) ||
    /(^|\/)apps\/shared\//.test(f) ||
    /(^|\/)scripts\/lint-rules\//.test(f) ||
    /(^|\/)scripts\/ui-drift\//.test(f)
  );
}

export const CANONICAL_OVERRIDE_FIX =
  "Use the package's option instead of re-styling it from the page (density, frameHeight, emptyHeader, toolbar.portalInto / tabsPortalInto…); if the option is missing, add it to @ai-matrx/design-system, release and adopt it the same session — never a className or a [&_…] reach into the table.";
