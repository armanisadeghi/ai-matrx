/**
 * component-source-gate — THE ONE write-time check every DB component writer runs.
 *
 * 🚨 WHY THIS EXISTS (Q82 / B-17, 2026-09-11). An organization-authored kind
 * component is arbitrary TSX that the browser compiles with `new Function`
 * (`compile-slot.ts`) inside the signed-in page's own origin. Until this module
 * there were TWO write paths with ONE gate between them:
 *
 *   - the aidream agent-tool path ran an import allowlist
 *     (`component_import_lint`) plus an esbuild syntax gate;
 *   - the browser Studio path (`features/content-ir/studio/
 *     kind-component-code-service.ts`) ran NOTHING, and no database trigger
 *     ever inspected `component_source`.
 *
 * So a component saved through the Studio could `fetch()` the reader's session
 * data to any host it liked, the moment anyone rendered it. The class fix is
 * this module: one rule, expressed once, called by BOTH write paths (the
 * Python twin lives in aidream `kind_shared.py` and a parity test proves the
 * lists byte-identical), with a database trigger as the backstop for anything
 * that reaches the table another way.
 *
 * The lists are DATA, in `component-source-gate.json`, so three runtimes can
 * compare them. Never inline a name here.
 *
 * WHAT THIS IS NOT: a sandbox. A string check cannot stop every escape, and
 * the runtime stubs in `compile-slot.ts` shadow bare identifiers only. Real
 * isolation is an iframe/worker boundary; see the B-17 report's follow-up
 * proposal.
 *
 * DD-124 (2026-09-11) closed three live holes V-17 found: dynamic `import()`
 * reached the table because only this file checked it (the DB trigger and the
 * aidream twin both accepted it, measured); `.constructor(` on a function
 * object is the `Function` evaluator under another name; and
 * `window["fet"+"ch"]` cannot be caught by ANY string rule, because the banned
 * name never appears in the source — so bracket access on `window`,
 * `globalThis` and `self` is refused outright instead. That last one is a
 * blunt instrument standing in for the origin boundary, not a substitute for
 * it: a property chain this file does not name is still reachable.
 */

import gate from "./component-source-gate.json";

/** Every module a DB-authored component may import (the in-page compiler's list). */
export const COMPONENT_ALLOWED_IMPORTS: readonly string[] = gate.allowedImports;

/**
 * Globals a DB-authored component may never name. Verified against all 162
 * live `content_ir.kind_component` bodies on 2026-09-11: zero use any of them
 * as a bare identifier, so this bans nothing that works today.
 */
export const COMPONENT_BANNED_GLOBALS: readonly string[] = gate.bannedGlobals;

/**
 * Code-execution primitives, banned only where they are CALLED or CONSTRUCTED
 * (`eval(...)`, `new Function(...)`, `Function(...)`). The bare word `Function`
 * is a legal TypeScript type annotation and appears in live bodies, so banning
 * the identifier outright would refuse honest code.
 */
export const COMPONENT_BANNED_CALLABLES: readonly string[] = gate.bannedCallables;

/**
 * Names banned as a property read (`window.fetch`, `globalThis.fetch`,
 * `document.cookie`, `navigator.sendBeacon`) — the obvious way around a bare
 * identifier ban. `localStorage`/`sessionStorage` are deliberately ABSENT:
 * two live platform components (`research_report_card`,
 * `agent_mandate_specification_workbench`) persist per-viewer UI state through
 * `window.localStorage`, and browser storage is not an exfiltration channel.
 * Banning storage outright is a product ruling nobody has made.
 */
export const COMPONENT_BANNED_MEMBER_ACCESS: readonly string[] =
  gate.bannedMemberAccess;

/**
 * Names banned as a METHOD CALL on any object — `(()=>{}).constructor(...)`,
 * `[].constructor`, `"".constructor("return 1")`. Reaching `constructor` on a
 * function object hands the author the `Function` evaluator without ever
 * naming `Function` or `eval`, which reconstitutes every other banned
 * primitive (V-17 F3, live probe 2026-09-11). Banned as a CALL only, because
 * reading `x.constructor.name` for a type label is honest code.
 */
export const COMPONENT_BANNED_MEMBER_CALLS: readonly string[] =
  gate.bannedMemberCalls;

/**
 * Roots on which computed (bracket) property access is refused outright:
 * `window["fet" + "ch"]` is not catchable by any name rule, because the name
 * never appears in the source. No string rule can close that class — only an
 * origin boundary can — so the roots themselves lose bracket access. Verified
 * against all 162 live `content_ir.kind_component` bodies on 2026-09-11: zero
 * use bracket access on any of these roots, so this bans nothing that works.
 */
export const COMPONENT_BANNED_COMPUTED_ACCESS: readonly string[] =
  gate.bannedComputedAccess;

/**
 * Syntax rules (not name lists) every runtime must implement, named so the
 * three enforcement points can be compared. `dynamicImport` = `import(...)`.
 */
export const COMPONENT_BANNED_SYNTAX: readonly string[] = gate.bannedSyntax;

const IMPORT_RE = /^\s*import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/gm;
const DYNAMIC_IMPORT_RE = /(?<![.\w$])import\s*\(/;

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The module paths this source imports, in source order, de-duplicated. */
export function componentImportPaths(source: string): string[] {
  const found = new Set<string>();
  IMPORT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = IMPORT_RE.exec(source ?? "")) !== null) found.add(match[1]);
  return [...found];
}

/**
 * Refuse imports outside the compiler's allowlist. The in-page compiler SKIPS
 * an unknown import with a console warning instead of failing, so the component
 * mounts with undefined identifiers and breaks at render with no incident —
 * and a module the allowlist never vetted is also the widest data reach an
 * author could ask for. Returns the human sentence, or null when it passes.
 */
export function componentImportLint(source: string): string | null {
  const unknown = componentImportPaths(source ?? "")
    .filter((path) => !COMPONENT_ALLOWED_IMPORTS.includes(path))
    .sort();
  if (DYNAMIC_IMPORT_RE.test(source ?? "")) {
    return (
      "This component uses a dynamic import(). The in-page compiler has no " +
      "module loader, so the call would either fail at render or reach code " +
      "nobody vetted. Import from the allowlist at the top of the file instead."
    );
  }
  if (unknown.length === 0) return null;
  return (
    `This component imports modules outside the sandbox allowlist: ${unknown.join(", ")}. ` +
    "The browser compiler skips unknown imports silently, so they would be " +
    "undefined at render. Rewrite it using only allowlisted modules " +
    "(react, lucide-react, recharts, @/lib/utils, @/components/ui/*, " +
    "@/components/kind-kit/*, CopyButtons/CopyForAiButton, Markdown)."
  );
}

/**
 * Refuse the globals that let an organization-authored component read or send
 * whatever the signed-in page can see. Returns the human sentence naming the
 * offending global, or null when it passes.
 */
export function componentGlobalsLint(source: string): string | null {
  const code = source ?? "";
  for (const name of COMPONENT_BANNED_GLOBALS) {
    if (new RegExp(`(?<![.\\w$])${escapeForRegExp(name)}\\b`).test(code)) {
      return bannedGlobalMessage(name);
    }
  }
  for (const name of COMPONENT_BANNED_CALLABLES) {
    const escaped = escapeForRegExp(name);
    if (
      new RegExp(`\\bnew\\s+${escaped}\\s*\\(`).test(code) ||
      new RegExp(`(?<![.\\w$])${escaped}\\s*\\(`).test(code)
    ) {
      return bannedGlobalMessage(name);
    }
  }
  for (const name of COMPONENT_BANNED_MEMBER_ACCESS) {
    if (new RegExp(`\\.\\s*${escapeForRegExp(name)}\\b`).test(code)) {
      return bannedGlobalMessage(name);
    }
  }
  for (const name of COMPONENT_BANNED_MEMBER_CALLS) {
    if (new RegExp(`\\.\\s*${escapeForRegExp(name)}\\s*\\(`).test(code)) {
      return bannedMemberCallMessage(name);
    }
  }
  for (const name of COMPONENT_BANNED_COMPUTED_ACCESS) {
    if (
      new RegExp(`(?<![.\\w$])${escapeForRegExp(name)}\\s*\\[`).test(code) ||
      new RegExp(`\\.\\s*${escapeForRegExp(name)}\\s*\\[`).test(code)
    ) {
      return bannedComputedAccessMessage(name);
    }
  }
  return null;
}

function bannedGlobalMessage(name: string): string {
  return (
    `This component uses "${name}", which components stored in the database may ` +
    "not use. They run inside the signed-in page, so anything that reaches the " +
    "network, browser storage, or the JavaScript evaluator could read or send " +
    "the reader's data. Render what the Shape hands you in props.data and use " +
    "a Shape action for anything the component needs from the server."
  );
}

function bannedMemberCallMessage(name: string): string {
  return (
    `This component uses ".${name}(", which components stored in the database ` +
    "may not use. Calling a value's constructor reaches the JavaScript " +
    "evaluator, so it could run code nobody reviewed inside the signed-in " +
    "page. Write the logic out directly instead."
  );
}

function bannedComputedAccessMessage(name: string): string {
  return (
    `This component uses "${name}[", which components stored in the database ` +
    "may not use. Looking a property up by a computed name hides which " +
    "browser capability the component reaches, so no review can tell whether " +
    `it is safe. Name what you need directly, or use props.data and a Shape ` +
    "action for anything the component needs from the server."
  );
}

/**
 * THE ONE GATE. Every writer of `content_ir.kind_component.component_source`
 * calls this before the write. Returns the human sentence to refuse with, or
 * null when the source may be stored.
 *
 * `flavor: "html"` bodies are NOT checked here: they never reach the in-page
 * compiler — they render in `KindHtmlFrame`, an iframe with
 * `sandbox="allow-scripts allow-forms"` and no `allow-same-origin`, so they
 * hold no session and no same-origin reach. Pass the row's flavor so this
 * module, not each caller, owns that decision.
 */
export function componentSourceGate(
  source: string,
  options?: { flavor?: string | null },
): string | null {
  if ((options?.flavor ?? "").toLowerCase() === "html") return null;
  return componentImportLint(source) ?? componentGlobalsLint(source);
}
