/**
 * check-org-gate-not-bare-kernel — nothing feeds the ACTIVE SELECTION to the
 * bare organization kernel.
 *
 * THE CLASS this guards (SCHEDULE-PROMPT 7da1240449, then ORG-GATE-AUDIT)
 * ----------------------------------------------------------------------
 * `requireOrganizationContext` (the package kernel) is synchronous and
 * fail-closed. It is the right LAST line, and the wrong FIRST one: a client
 * that reads the currently selected organization itself —
 *
 *     requireOrganizationContext(selectOrganizationId(store.getState()))
 *     requireOrganizationContext(requireSelectedOrgId())
 *     const organizationId = useAppSelector(selectOrganizationId);
 *     … requireOrganizationContext(organizationId)
 *
 * — refuses a person who pressed a button with no organization selected with
 * a raw "Select an organization before sending this request." toast, and
 * `OrganizationGateDialog` (the app's ask-then-continue picker) never opens,
 * because nothing asked it to. schedulerClient.ts did exactly that on
 * /schedules/new; about twenty feature clients carried the same shape.
 *
 * THE RULE
 * --------
 * A value that came from the active selection reaches the organization kernel
 * only THROUGH THE GATE (`lib/organization/organization-gate.ts`):
 *
 *   ensureOrganizationForRequest({ method })      — a feature fetch client
 *   ensureOrganizationContext({ organizationId }) — an action seam
 *   ensureOrganizationContext({ interactive: false }) — a declared background
 *                                                    or identity read
 *   useNewNoteOrganization()                      — the notes create seam
 *
 * An id that came from the OBJECT (a record's, a folder's, a tool's own
 * `organization_id`) or was handed in by a caller is untouched — that is
 * "access is personal" working, not the class.
 *
 * Deliberate exceptions (non-interactive transport kernels, background
 * auto-creates, admin benches) live in `scripts/org-gate-not-bare-kernel.allowlist.json`
 * with a reason, and an allowlisted file that no longer matches is ALSO a
 * failure — the list only shrinks.
 *
 * Run:  tsx scripts/check-org-gate-not-bare-kernel.ts
 *       tsx scripts/check-org-gate-not-bare-kernel.ts --self-test   (proves it can FAIL)
 *       tsx scripts/check-org-gate-not-bare-kernel.ts --root <dir>  (scan another tree)
 * Part of `pnpm check:organization-context`.
 *
 * SECOND CLASS, same file (CANCEL-FALLBACKS, 2026-09-24): ORG-GATE-AUDIT made
 * closing the picker silent AT THE TOAST BOUNDARY (`lib/toast.ts` drops a toast
 * carrying `OrganizationSelectionCancelled`), but a caller that renders its OWN
 * inline fallback after a `catch` — `setError(err instanceof Error ? err.message
 * : "Connection failed")`, a hardcoded `setFailure(...)` — still shows that
 * fallback on a cancel, because the toast boundary never sees it. Real
 * instance: `AgentToolsManager.tsx`'s three manual MCP connect forms dispatch
 * `connectServerWithCredentials` (which asks via `ensureOrganizationForRequest`
 * when nothing is selected) through `.unwrap()`; Redux Toolkit SERIALIZES a
 * thrown `Error` before `.unwrap()` rethrows it, so the cancellation arrives as
 * a plain object — `err instanceof Error` is FALSE — and the form showed the
 * literal "Connection failed" line instead of nothing.
 *
 * THE RULE: a `try` block that calls something `tryIsGatedInteractively` can
 * throw `OrganizationSelectionCancelled` from, paired with a `catch` block
 * that sets local UI state from the caught value or a hardcoded fallback
 * (`CATCH_FALLBACK_MARKERS`), must also reference `isOrganizationSelectionCancelled`
 * inside that same `catch` block. `tryIsGatedInteractively` starts with the two
 * gate entry points plus the one Redux thunk this class was proven on; extend
 * it as ORG-GATE-AUDIT's other fixed services (schedulerClient, attachments.service,
 * mcp-connections.service, directive-catalog/service, dataforseo/client,
 * marketing/google/service, crawler/direct-client, bing/service, vault-service,
 * authenticator-service, vaultAttachmentTransport, cloud-browser/service,
 * google-workspace/service, google-workspace/documents/service, notes' `copyNote`)
 * get audited callers.
 *
 * Deliberate exceptions live in
 * `scripts/org-gate-cancel-fallback.allowlist.json` with a reason, same
 * only-shrinks rule as the class above.
 *
 * Run:  tsx scripts/check-org-gate-not-bare-kernel.ts --cancel-fallback
 *       tsx scripts/check-org-gate-not-bare-kernel.ts --cancel-fallback --self-test
 * Both classes run together under `pnpm check:org-gate-not-bare-kernel` (no flag).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const REPO = resolve(__dirname, "..");
const ALLOWLIST_PATH = join(REPO, "scripts", "org-gate-not-bare-kernel.allowlist.json");
const SCAN_DIRS = ["app", "features", "components", "hooks", "lib", "providers"];
const SKIP_DIR = new Set(["node_modules", ".next", "dist", "build", "__tests__", "__mocks__"]);
const KERNEL = "requireOrganizationContext";

/** Expressions that ARE the active selection. */
const SELECTION_SOURCES: readonly RegExp[] = [
  /\bselectOrganizationId\b/,
  /\brequireSelectedOrgId\s*\(/,
  /\bgetSelectedOrgId\s*\(/,
  /\bpeekSelectedOrganizationId\s*\(/,
  /\bgetStoreSingleton\s*\(/,
  /\.getState\s*\(\s*\)\s*(?:as\s+\w+\s*)?\)?\s*\.appContext\b/,
  /\bappContext\??\.organization_id\b/,
];

export interface Violation {
  file: string;
  line: number;
  shape: "inline" | "alias";
  text: string;
}

function isSelectionExpression(text: string): boolean {
  return SELECTION_SOURCES.some((re) => re.test(text));
}

/** The balanced argument text of the call whose "(" sits at `open`. */
function argumentText(source: string, open: number): string {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return source.slice(open + 1);
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

function stripComments(source: string): string {
  // Keep offsets stable: blank out comment characters instead of removing them.
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, lead: string) => lead + " ".repeat(m.length - lead.length));
}

/** Identifiers bound directly from the active selection in this module. */
function selectionAliases(source: string): Set<string> {
  const aliases = new Set<string>();
  const binding = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*([^;]+)/g;
  for (const match of source.matchAll(binding)) {
    const [, name, rhs] = match;
    if (isSelectionExpression(rhs)) aliases.add(name);
  }
  return aliases;
}

export function scanSource(file: string, raw: string): Violation[] {
  const source = stripComments(raw);
  if (!source.includes(KERNEL)) return [];
  const aliases = selectionAliases(source);
  const violations: Violation[] = [];
  const call = new RegExp(`\\b${KERNEL}\\s*\\(`, "g");
  for (const match of source.matchAll(call)) {
    const open = (match.index ?? 0) + match[0].length - 1;
    // Skip the import specifier / re-export lists (no call follows a name there).
    const args = argumentText(source, open);
    const line = lineOf(source, match.index ?? 0);
    const text = raw.split("\n")[line - 1]?.trim() ?? "";
    if (isSelectionExpression(args)) {
      violations.push({ file, line, shape: "inline", text });
      continue;
    }
    const alias = [...aliases].find((name) => new RegExp(`(^|[^\\w$.])${name.replace(/\$/g, "\\$")}(?![\\w$])`).test(args));
    if (alias) violations.push({ file, line, shape: "alias", text });
  }
  return violations;
}

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIR.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.(ts|tsx)$/.test(entry) && !entry.endsWith(".d.ts")) {
      out.push(full);
    }
  }
}

export function scanTree(root: string): Violation[] {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) walk(join(root, dir), files);
  return files.flatMap((full) => scanSource(relative(root, full), readFileSync(full, "utf8")));
}

function loadAllowlist(): Record<string, string> {
  if (!existsSync(ALLOWLIST_PATH)) return {};
  const parsed = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8")) as {
    files?: Record<string, string>;
  };
  return parsed.files ?? {};
}

function selfTest(): number {
  const failures: string[] = [];
  const mustFlag: Record<string, string> = {
    "old schedulerClient (store read inline)": `
      const store = getStoreSingleton();
      const organizationId = requireOrganizationContext(
        store ? selectOrganizationId(store.getState()) : null,
        explicitOrganizationId,
      );`,
    "requireSelectedOrgId inline": `const organizationId = requireOrganizationContext(requireSelectedOrgId());`,
    "peek inline": `organizationId: requireOrganizationContext(peekSelectedOrganizationId()),`,
    "explicit ?? selection": `requireOrganizationContext(args.organizationId ?? (store ? selectOrganizationId(store.getState()) : null));`,
    "multi-line store alias": `
      const selectedOrganizationId = store
        ? (selectOrganizationId(store.getState() as RootState) ?? null)
        : null;
      return requireOrganizationContext(selectedOrganizationId, opts.organizationId);`,
    "hook alias": `
      const organizationId = useAppSelector(selectOrganizationId);
      const onClick = () => { const id = requireOrganizationContext(organizationId); };`,
  };
  const mustPass: Record<string, string> = {
    "record's own organization": `const organizationId = requireOrganizationContext(tool.organization_id);`,
    "explicit caller id": `requireOrganizationContext(undefined, args.organizationId);`,
    "the gate": `const organizationId = await ensureOrganizationForRequest({ method });`,
    "a comment naming the old shape": `// used to call requireOrganizationContext(selectOrganizationId(state)) here`,
    "alias not reaching the kernel": `
      const activeOrgId = useAppSelector(selectOrganizationId);
      const id = requireOrganizationContext(destination.folder.organizationId);`,
  };
  for (const [name, source] of Object.entries(mustFlag)) {
    if (scanSource("fixture.ts", source).length === 0) failures.push(`did NOT flag: ${name}`);
  }
  for (const [name, source] of Object.entries(mustPass)) {
    const found = scanSource("fixture.ts", source);
    if (found.length > 0) failures.push(`falsely flagged: ${name} (${found[0].text})`);
  }
  if (failures.length) {
    console.error("check-org-gate-not-bare-kernel --self-test FAILED:");
    for (const f of failures) console.error(`  - ${f}`);
    return 1;
  }
  console.log(
    `check-org-gate-not-bare-kernel --self-test: ${Object.keys(mustFlag).length} planted violations caught, ${Object.keys(mustPass).length} clean shapes passed.`,
  );
  return 0;
}

// ---------------------------------------------------------------------------
// CANCEL-FALLBACKS: a try{} that can throw OrganizationSelectionCancelled
// paired with a catch{} that renders its own inline fallback and never checks.
// ---------------------------------------------------------------------------

const CANCEL_ALLOWLIST_PATH = join(REPO, "scripts", "org-gate-cancel-fallback.allowlist.json");

/**
 * True when a `try` block contains a call that can THROW
 * `OrganizationSelectionCancelled`: the two gate entry points (with
 * `ensureOrganizationContext` judged call-by-call, since `{ interactive: false
 * }` never asks and so never cancels) or the one Redux thunk this class was
 * proven on. Extend this list as ORG-GATE-AUDIT's other fixed services
 * (schedulerClient, attachments.service, mcp-connections.service,
 * directive-catalog/service, dataforseo/client, marketing/google/service,
 * crawler/direct-client, bing/service, vault-service, authenticator-service,
 * vaultAttachmentTransport, cloud-browser/service, google-workspace/service,
 * google-workspace/documents/service, notes' `copyNote`) get audited callers.
 */
function tryIsGatedInteractively(tryText: string): boolean {
  if (/\bensureOrganizationForRequest\s*\(/.test(tryText)) return true;
  if (/\bconnectServerWithCredentials\s*\(/.test(tryText)) return true;
  const call = /\bensureOrganizationContext\s*\(/g;
  for (const match of tryText.matchAll(call)) {
    const open = (match.index ?? 0) + match[0].length - 1;
    const args = argumentText(tryText, open);
    if (!/interactive\s*:\s*false/.test(args)) return true;
  }
  return false;
}

/**
 * A `catch` block rendering its own fallback INLINE — local component/hook
 * state, never `toast.*`: `lib/toast.ts`'s `isSilentNotice` already drops any
 * error/warning toast whose title is empty, which is exactly what
 * `err.message` (or `extractErrorMessage(err)`) resolves to for
 * `OrganizationSelectionCancelled` — so a toast-only catch is already safe at
 * the boundary and is deliberately NOT a marker here (flagging it would be a
 * false positive: `features/message-templates/quick-save/
 * QuickMessageTemplateSaveCore.tsx` toasts `error.message`, which is silenced
 * regardless of this class).
 */
const CATCH_FALLBACK_MARKERS: readonly RegExp[] = [
  /\bset[A-Z]\w*\s*\(\s*(?:err|error|cause|e)\b/,
  /\bset[A-Z]\w*\s*\(\s*[A-Za-z_$][\w$]*\s+instanceof\s+Error/,
];

export interface CancelFallbackViolation {
  file: string;
  line: number;
  text: string;
}

/** Balanced-brace body of the block whose "{" is at `open` (exclusive of the braces). */
function braceBody(source: string, open: number): { body: string; close: number } {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return { body: source.slice(open + 1, i), close: i };
    }
  }
  return { body: source.slice(open + 1), close: source.length - 1 };
}

export function scanCancelFallbackSource(file: string, raw: string): CancelFallbackViolation[] {
  const source = stripComments(raw);
  const violations: CancelFallbackViolation[] = [];
  const tryRe = /\btry\s*\{/g;
  for (const tryMatch of source.matchAll(tryRe)) {
    const tryOpen = (tryMatch.index ?? 0) + tryMatch[0].length - 1;
    const { body: tryBody, close: tryClose } = braceBody(source, tryOpen);
    if (!tryIsGatedInteractively(tryBody)) continue;

    // The `catch (...) {` immediately following (allowing whitespace/`finally`
    // reordering never occurs in valid JS — catch always comes first).
    const afterTry = source.slice(tryClose + 1);
    const catchMatch = /^\s*catch\s*\(([^)]*)\)\s*\{/.exec(afterTry);
    if (!catchMatch) continue;
    const catchOpen = tryClose + 1 + (catchMatch.index ?? 0) + catchMatch[0].length - 1;
    const { body: catchBody } = braceBody(source, catchOpen);

    if (catchBody.includes("isOrganizationSelectionCancelled")) continue;
    if (!CATCH_FALLBACK_MARKERS.some((re) => re.test(catchBody))) continue;

    const line = lineOf(source, catchOpen);
    const text = raw.split("\n")[line - 1]?.trim() ?? "";
    violations.push({ file, line, text });
  }
  return violations;
}

export function scanTreeCancelFallback(root: string): CancelFallbackViolation[] {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) walk(join(root, dir), files);
  return files.flatMap((full) => scanCancelFallbackSource(relative(root, full), readFileSync(full, "utf8")));
}

function loadCancelAllowlist(): Record<string, string> {
  if (!existsSync(CANCEL_ALLOWLIST_PATH)) return {};
  const parsed = JSON.parse(readFileSync(CANCEL_ALLOWLIST_PATH, "utf8")) as { files?: Record<string, string> };
  return parsed.files ?? {};
}

function cancelFallbackSelfTest(): number {
  const failures: string[] = [];
  const mustFlag: Record<string, string> = {
    "the real AgentToolsManager shape (.unwrap() serializes the cancellation, so instanceof Error is false)": `
      try {
        await dispatch(connectServerWithCredentials({ serverId, authMethod: "bearer", fields, transport })).unwrap();
        setToken("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Connection failed");
      }`,
    "direct gate call with a hardcoded catch fallback": `
      try {
        const organizationId = await ensureOrganizationForRequest({ method: "POST" });
        await doThing(organizationId);
      } catch (err) {
        setFailure(err instanceof Error ? err.message : String(err));
      }`,
    "direct ensureOrganizationContext (interactive) with a hardcoded catch fallback": `
      try {
        await ensureOrganizationContext({ organizationId: null });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed");
      }`,
  };
  const mustPass: Record<string, string> = {
    "a toast-only catch is already silenced at the toast boundary": `
      try {
        await ensureOrganizationContext({ organizationId: null });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed");
      }`,
    "guard already present": `
      try {
        await dispatch(connectServerWithCredentials(params)).unwrap();
      } catch (err) {
        if (isOrganizationSelectionCancelled(err)) return;
        setError(err instanceof Error ? err.message : "Connection failed");
      }`,
    "a non-interactive identity read cannot cancel": `
      try {
        const organizationId = await ensureOrganizationContext({ interactive: false });
        await doThing(organizationId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      }`,
    "an ordinary GET with no organization gate at all": `
      try {
        const data = await fetchMcpServerConfigs(serverId);
        setConfigs(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load config");
      }`,
    "catch does nothing with the value (rethrow / log only)": `
      try {
        await ensureOrganizationForRequest({ method: "POST" });
      } catch (err) {
        console.error(err);
        throw err;
      }`,
  };
  for (const [name, source] of Object.entries(mustFlag)) {
    if (scanCancelFallbackSource("fixture.ts", source).length === 0) failures.push(`did NOT flag: ${name}`);
  }
  for (const [name, source] of Object.entries(mustPass)) {
    const found = scanCancelFallbackSource("fixture.ts", source);
    if (found.length > 0) failures.push(`falsely flagged: ${name} (${found[0].text})`);
  }
  if (failures.length) {
    console.error("check-org-gate-not-bare-kernel --cancel-fallback --self-test FAILED:");
    for (const f of failures) console.error(`  - ${f}`);
    return 1;
  }
  console.log(
    `check-org-gate-not-bare-kernel --cancel-fallback --self-test: ${Object.keys(mustFlag).length} planted violations caught, ${Object.keys(mustPass).length} clean shapes passed.`,
  );
  return 0;
}

function runCancelFallback(root: string, rootFlag: boolean): number {
  const allowlist = loadCancelAllowlist();
  const violations = scanTreeCancelFallback(root);
  const unallowed = violations.filter((v) => !(v.file in allowlist));
  const flaggedFiles = new Set(violations.map((v) => v.file));
  const stale = rootFlag ? [] : Object.keys(allowlist).filter((file) => !flaggedFiles.has(file));

  if (unallowed.length === 0 && stale.length === 0) {
    console.log(
      `check-org-gate-not-bare-kernel --cancel-fallback: OK — no caught OrganizationSelectionCancelled falls through to an inline fallback (${Object.keys(allowlist).length} reasoned exceptions).`,
    );
    return 0;
  }
  if (unallowed.length) {
    console.error(
      "check-org-gate-not-bare-kernel --cancel-fallback: a try{} that can throw OrganizationSelectionCancelled\n" +
        "is caught by a catch{} that renders its own fallback without checking it.\n" +
        "Fix: `if (isOrganizationSelectionCancelled(err)) return;` before the fallback\n" +
        "(from @/lib/organization/selection-cancelled). See the header of this script.\n",
    );
    for (const v of unallowed) console.error(`  ${v.file}:${v.line}  ${v.text}`);
  }
  if (stale.length) {
    console.error("\nAllowlisted files that no longer match — strike them from scripts/org-gate-cancel-fallback.allowlist.json:");
    for (const file of stale) console.error(`  ${file}`);
  }
  return 1;
}

function main(): number {
  const args = process.argv.slice(2);
  const cancelFallback = args.includes("--cancel-fallback");
  if (args.includes("--self-test")) {
    if (cancelFallback) return cancelFallbackSelfTest();
    const bareKernel = selfTest();
    const cancel = cancelFallbackSelfTest();
    return bareKernel || cancel;
  }
  const rootFlag = args.indexOf("--root");
  const root = rootFlag >= 0 ? resolve(args[rootFlag + 1]) : REPO;
  if (cancelFallback) return runCancelFallback(root, rootFlag >= 0);

  const allowlist = loadAllowlist();
  const violations = scanTree(root);
  const unallowed = violations.filter((v) => !(v.file in allowlist));
  const flaggedFiles = new Set(violations.map((v) => v.file));
  const stale = rootFlag >= 0 ? [] : Object.keys(allowlist).filter((file) => !flaggedFiles.has(file));

  if (unallowed.length === 0 && stale.length === 0) {
    console.log(
      `check-org-gate-not-bare-kernel: OK — no module feeds the active selection to the bare kernel (${Object.keys(allowlist).length} reasoned exceptions).`,
    );
  } else {
    if (unallowed.length) {
      console.error(
        "check-org-gate-not-bare-kernel: the ACTIVE SELECTION reaches `requireOrganizationContext` without the gate.\n" +
          "A person with no organization selected gets a bare refusal and the picker never opens.\n" +
          "Fix: `await ensureOrganizationForRequest({ method })` (feature fetch client) or\n" +
          "`await ensureOrganizationContext({ organizationId })` (action seam) from lib/organization/organization-gate.ts;\n" +
          "a genuine background read declares `interactive: false`. See the header of this script.\n",
      );
      for (const v of unallowed) console.error(`  ${v.file}:${v.line}  [${v.shape}]  ${v.text}`);
    }
    if (stale.length) {
      console.error("\nAllowlisted files that no longer match — strike them from scripts/org-gate-not-bare-kernel.allowlist.json:");
      for (const file of stale) console.error(`  ${file}`);
    }
  }
  const bareKernelExit = unallowed.length === 0 && stale.length === 0 ? 0 : 1;

  // Both classes run under the plain (no-flag) invocation, so
  // `pnpm check:org-gate-not-bare-kernel` alone covers CANCEL-FALLBACKS too.
  const cancelExit = runCancelFallback(root, rootFlag >= 0);
  return bareKernelExit || cancelExit;
}

process.exit(main());
