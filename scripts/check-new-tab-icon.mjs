#!/usr/bin/env node
/**
 * check-new-tab-icon.mjs — THE NEW-TAB ICON LAW (Arman, 2026-09-26): the
 * lucide `ExternalLink` icon (also imported as `ExternalLinkIcon`) means ONE
 * thing platform-wide — "open in a NEW TAB". It is always a real anchor with
 * `target="_blank" rel="noopener noreferrer"` (or a handler that calls
 * `window.open(url, "_blank", ...)`), and it is NEVER rendered disabled: if
 * there is nothing to open, the control is ABSENT (conditional render), not
 * greyed out.
 *
 * THE CHECK: for every `<ExternalLink` / `<ExternalLinkIcon` JSX usage under
 * app/, features/, components/ (excluding the `(dev)` demo group), look back
 * up to ~15 lines for the nearest enclosing `<a`, `<Link`, `<AppLink`,
 * `<Button`, `<button`, or `<DropdownMenuItem` opening tag. That control's own
 * opening-tag text must contain `target="_blank"` or the surrounding line
 * window must contain a `window.open(` call — otherwise it is flagged
 * `no-new-tab`. If that same opening tag carries a `disabled` prop, it is
 * flagged `disabled-control` regardless of new-tab status.
 *
 * An icon usage with no enclosing interactive tag in the lookback window is
 * treated as decorative (not a control) and is not flagged — many real
 * ExternalLink usages are informational badges beside an anchor that opens
 * correctly elsewhere in the same block; a full JSX/AST cross-reference would
 * be needed to catch every such case with certainty, so this guard trades
 * some false negatives for zero false positives on decorative icons.
 *
 * ESCAPE HATCH: a real exception (e.g. a named `openInNewTab`-style handler
 * defined elsewhere that the guard cannot see calls `window.open`) opts out
 * with a comment on the line immediately before the `<ExternalLink` usage:
 *   {/* new-tab-icon: <reason> *\/}
 *   // new-tab-icon: <reason>
 *
 * SCOPE NOTE: paths owned by another agent per the 2026-09-26 census
 * (features/mandates/feature-intelligence/**, components/official/entity-ref/**,
 * features/organizations/peek/**, features/mandates/peek/**,
 * features/mandates/member-list/MandateMemberPeek.tsx) are SCANNED and their
 * violations are REPORTED but never fail the guard — they are that agent's
 * cleanup, tracked separately so this guard doesn't silently lose visibility
 * of them once adopted into CI.
 *
 * Usage:
 *   node scripts/check-new-tab-icon.mjs              # scan the whole tree
 *   node scripts/check-new-tab-icon.mjs --self-test   # prove fail-then-pass
 *
 * Exit: 0 clean (or only owner-exempt findings) · 1 blocking finding(s) · 3 self-test failed
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARGS = process.argv.slice(2);
const SELF_TEST = ARGS.includes("--self-test");

const OWNER_EXEMPT_PATTERNS = [
  /^features\/mandates\/feature-intelligence\//,
  /^components\/official\/entity-ref\//,
  /^features\/organizations\/peek\//,
  /^features\/mandates\/peek\//,
  /^features\/mandates\/member-list\/MandateMemberPeek\.tsx$/,
];

const ICON_RE = /<ExternalLink(Icon)?(?=[\s/>])/;
const ENCLOSING_RE = /<(a|Link|AppLink|Button|button|DropdownMenuItem)\b/;
const NEW_TAB_RE =
  /target\s*=\s*["']_blank["']|target\s*=\s*\{[^}]*_blank[^}]*\}|window\.open\s*\(/;
const DISABLED_RE = /[\s{]disabled(\s*=|[\s/>])/;
const ESCAPE_RE = /new-tab-icon:/;

/**
 * Given `lines` (array, 0-based) and the index of a line that opens an
 * interactive tag, find where that tag's own opening `>` lands — handling
 * multi-line attribute lists and `{...}` expressions — so we scope the
 * `disabled` check to THIS tag's own attributes, not to whatever follows.
 * Returns { endLine, endCol } or null if unresolved within 40 lines.
 */
function findTagOpenEnd(lines, startIdx) {
  let depth = 0;
  for (let i = startIdx; i < Math.min(startIdx + 40, lines.length); i++) {
    const line = lines[i];
    let j = 0;
    if (i === startIdx) {
      const m = line.match(/<[A-Za-z]/);
      j = m ? m.index : 0;
    }
    while (j < line.length) {
      const c = line[j];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) {
        if (j > 0 && line[j - 1] === "=") {
          j++;
          continue;
        }
        return { endLine: i, endCol: j };
      }
      j++;
    }
  }
  return null;
}

/**
 * Scan one file's source for violations. Returns an array of
 * { line, kind: "no-new-tab" | "disabled-control", tag }.
 */
export function findViolations(source) {
  const lines = source.split("\n");
  const findings = [];

  for (let i = 0; i < lines.length; i++) {
    if (!ICON_RE.test(lines[i])) continue;

    // Escape hatch: a comment naming "new-tab-icon:" on the line right above.
    let prevIdx = i - 1;
    while (prevIdx >= 0 && lines[prevIdx].trim() === "") prevIdx--;
    if (prevIdx >= 0 && ESCAPE_RE.test(lines[prevIdx])) continue;

    // Find the nearest enclosing interactive tag, looking back up to 15 lines
    // (including the icon's own line, for a same-line anchor/button).
    let enclosing = null;
    for (let back = 0; back <= 15; back++) {
      const li = i - back;
      if (li < 0) break;
      const m = lines[li].match(ENCLOSING_RE);
      if (m) {
        enclosing = { line: li, tag: m[1] };
        break;
      }
    }
    if (!enclosing) continue; // decorative icon, no interactive wrapper found

    const tagEnd = findTagOpenEnd(lines, enclosing.line);
    if (!tagEnd) continue; // couldn't resolve the tag's own bounds; don't guess

    // Self-closing tag before the icon means it isn't actually enclosing it.
    const closeText = lines[tagEnd.endLine].slice(0, tagEnd.endCol + 1);
    if (closeText.trimEnd().endsWith("/>")) continue;
    if (tagEnd.endLine > i) continue; // opening tag hasn't even closed yet — odd shape, skip rather than guess

    const ownTagText = lines
      .slice(enclosing.line, tagEnd.endLine + 1)
      .join("\n");

    if (DISABLED_RE.test(ownTagText)) {
      findings.push({ line: i + 1, kind: "disabled-control", tag: enclosing.tag });
    }

    // New-tab check: the enclosing tag's own attributes, OR a wider window
    // (matching the lookback distance used to find the enclosing tag, plus a
    // few lines past the icon) for a `target="_blank"`/`window.open(` that
    // sits on an OUTER wrapper — e.g. a plain <Button> nested inside a <Link
    // target="_blank"> two lines above it is still correctly a new-tab door.
    const wideWindow = lines
      .slice(Math.max(0, i - 15), Math.min(lines.length, i + 4))
      .join("\n");
    if (!NEW_TAB_RE.test(ownTagText) && !NEW_TAB_RE.test(wideWindow)) {
      findings.push({ line: i + 1, kind: "no-new-tab", tag: enclosing.tag });
    }
  }
  return findings;
}

function isOwnerExempt(relPath) {
  return OWNER_EXEMPT_PATTERNS.some((re) => re.test(relPath));
}

function listTrackedTsxFiles() {
  const out = execFileSync(
    "git",
    ["ls-files", "--", "app/*.tsx", "app/**/*.tsx", "features/*.tsx", "features/**/*.tsx", "components/*.tsx", "components/**/*.tsx"],
    { cwd: ROOT, encoding: "utf8" },
  );
  return out
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((p) => !p.startsWith("app/(dev)/"));
}

function runScan() {
  const files = listTrackedTsxFiles();
  let blocking = 0;
  let exempt = 0;
  const blockingRows = [];
  const exemptRows = [];

  for (const rel of files) {
    let source;
    try {
      source = readFileSync(resolve(ROOT, rel), "utf8");
    } catch {
      continue;
    }
    const findings = findViolations(source);
    if (findings.length === 0) continue;
    const exemptPath = isOwnerExempt(rel);
    for (const f of findings) {
      const row = `${rel}:${f.line}\t[${f.kind}]\t<${f.tag}>`;
      if (exemptPath) {
        exempt++;
        exemptRows.push(row);
      } else {
        blocking++;
        blockingRows.push(row);
      }
    }
  }

  if (blockingRows.length > 0) {
    console.log("BLOCKING new-tab-icon violations:");
    for (const r of blockingRows) console.log("  " + r);
  }
  if (exemptRows.length > 0) {
    console.log(
      `\nOwner-exempt findings (reported only — not this guard's to fix): ${exempt}`,
    );
    for (const r of exemptRows) console.log("  " + r);
  }
  console.log(
    `\ncheck:new-tab-icon — ${blocking} blocking, ${exempt} owner-exempt, ${files.length} files scanned.`,
  );
  return blocking === 0;
}

function runSelfTest() {
  const bad = [
    'function Row() {',
    '  return (',
    '    <button type="button" onClick={() => doThing()}>',
    '      <ExternalLink className="h-3 w-3" />',
    '    </button>',
    '  );',
    '}',
  ].join("\n");

  const badDisabled = [
    'function Row() {',
    '  return (',
    '    <a href={url} target="_blank" rel="noopener noreferrer" disabled={!url}>',
    '      <ExternalLink className="h-3 w-3" />',
    '    </a>',
    '  );',
    '}',
  ].join("\n");

  const good = [
    'function Row() {',
    '  return (',
    '    <Link href={url} target="_blank" rel="noopener noreferrer">',
    '      <ExternalLink className="h-3 w-3" />',
    '    </Link>',
    '  );',
    '}',
  ].join("\n");

  const goodEscaped = [
    'function Row() {',
    '  return (',
    '    <button type="button" onClick={openInNewTabElsewhere}>',
    '      {/* new-tab-icon: openInNewTabElsewhere calls window.open in a shared hook */}',
    '      <ExternalLink className="h-3 w-3" />',
    '    </button>',
    '  );',
    '}',
  ].join("\n");

  const badFindings = findViolations(bad);
  const badDisabledFindings = findViolations(badDisabled);
  const goodFindings = findViolations(good);
  const goodEscapedFindings = findViolations(goodEscaped);

  let ok = true;
  if (!badFindings.some((f) => f.kind === "no-new-tab")) {
    console.error("SELF-TEST FAILED: expected a no-new-tab finding on the bad snippet, got none.");
    ok = false;
  }
  if (!badDisabledFindings.some((f) => f.kind === "disabled-control")) {
    console.error("SELF-TEST FAILED: expected a disabled-control finding, got none.");
    ok = false;
  }
  if (goodFindings.length !== 0) {
    console.error("SELF-TEST FAILED: expected zero findings on the good snippet, got " + JSON.stringify(goodFindings));
    ok = false;
  }
  if (goodEscapedFindings.length !== 0) {
    console.error("SELF-TEST FAILED: expected zero findings on the escaped snippet, got " + JSON.stringify(goodEscapedFindings));
    ok = false;
  }

  if (ok) {
    console.log("SELF-TEST PASSED: fails on bad shapes, passes on good and escaped shapes.");
    return true;
  }
  return false;
}

if (SELF_TEST) {
  process.exit(runSelfTest() ? 0 : 3);
} else {
  process.exit(runScan() ? 0 : 1);
}
