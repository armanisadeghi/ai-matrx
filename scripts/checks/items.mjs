/**
 * THE ITEM LINE — how a check names each thing it found, so the runner can file ONE finding per
 * item instead of one per check. Protocol (the one copy): common-docs/projects/checks-run-in-the-app/ITEM-PROTOCOL.md.
 * aidream's twin is scripts/checks/items.py; both parse exactly the same line.
 *
 *   MATRX-ITEM {"key":"<stable id>","status":"new"|"known","basis":"accepted"|"debt","unit":"…","title":"…","file":"…","line":12,"rule":"…"}
 *   MATRX-ITEMS-END {"count":<item lines printed>}
 *
 * - `key` is REQUIRED and EQUALS the key the check's own allowlist/baseline uses for the item
 *   (a table name, a function signature, a file path without its line number, a rule id…), so an
 *   accept names the same thing the check matches.
 * - `status` is the ratchet: "known" = covered by the check's allowlist/baseline (debt, counted,
 *   never handed off); "new" = not covered. A check with no baseline omits it (= "new").
 * - `basis` (only on a "known" item) says WHY it is covered: "accepted" = an allowlist entry that
 *   carries a reason (a reasoned accept); "debt" = grandfathered baseline debt nobody justified.
 *   Omitted when the check's data cannot tell.
 * - `unit` names the work area (a table, a module…) when the file is not it; the runner's unit is
 *   `<check>|<unit or file or rule or key>`.
 * - `MATRX-ITEMS-END` is printed by `endItems()` ONLY after the check finished its FULL scan. A
 *   truncated, filtered or crashed scan never prints it, so its absent keys are never taken as fixed.
 * - Items are printed ONLY when the runner asks (MATRX_ITEMS=1), so a hand run stays readable.
 */
import { createHash } from "node:crypto";

export const ITEM_PREFIX = "MATRX-ITEM ";
export const ITEMS_ENV = "MATRX_ITEMS";
export const ITEMS_END_PREFIX = "MATRX-ITEMS-END ";
export const ITEM_STATUSES = new Set(["new", "known"]);
export const ITEM_BASES = new Set(["accepted", "debt"]);
const KEY_LIMIT = 300;
const TITLE_LIMIT = 200;

export function itemsRequested(env = process.env) {
  return env[ITEMS_ENV] === "1";
}

/** Validate one item; returns an error sentence, or null when it is well-formed. */
export function itemError(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return "not a JSON object";
  if (typeof item.key !== "string" || !item.key.trim()) return "no key";
  if (item.key.length > KEY_LIMIT) return `key longer than ${KEY_LIMIT} characters`;
  if (item.status !== undefined && !ITEM_STATUSES.has(item.status)) return `status "${item.status}" is not new|known`;
  if (item.line !== undefined && item.line !== null && !Number.isInteger(item.line)) return "line is not an integer";
  if (item.basis !== undefined && item.basis !== null) {
    if (!ITEM_BASES.has(item.basis)) return `basis "${item.basis}" is not accepted|debt`;
    if (item.status !== "known") return "basis is only for a known item";
  }
  if (item.unit !== undefined && item.unit !== null) {
    if (typeof item.unit !== "string" || !item.unit.trim()) return "unit is not a non-empty string";
    if (item.unit.length > KEY_LIMIT) return `unit longer than ${KEY_LIMIT} characters`;
  }
  return null;
}

// Item lines this process printed — what endItems() declares, so the runner can tell a complete
// scan (count matches the lines it saw) from one that lost lines.
let printed = 0;

/**
 * Print one item line — only when the runner asked for items. A malformed item is a bug in the
 * check, so it throws (the check crashes loudly rather than emitting a key nobody can match).
 */
export function emitItem(item, { env = process.env, write = (s) => process.stdout.write(s) } = {}) {
  if (!itemsRequested(env)) return;
  const error = itemError(item);
  if (error) throw new Error(`emitItem: ${error}: ${JSON.stringify(item)}`);
  const clean = { key: item.key };
  if (item.status) clean.status = item.status;
  if (item.basis) clean.basis = item.basis;
  if (item.unit) clean.unit = item.unit;
  if (item.title) clean.title = String(item.title).slice(0, TITLE_LIMIT);
  if (item.file) clean.file = String(item.file);
  if (Number.isInteger(item.line)) clean.line = item.line;
  if (item.rule) clean.rule = String(item.rule);
  write(`${ITEM_PREFIX}${JSON.stringify(clean)}\n`);
  printed += 1;
}

/**
 * The end-of-scan marker. Call it ONCE, after the check has scanned EVERYTHING it covers — never
 * from a run narrowed by paths, a limit, or a changed-files filter, and never from a catch block.
 * Without it the run's items are still findings, but nothing may treat an absent key as fixed.
 */
export function endItems({ env = process.env, write = (s) => process.stdout.write(s), count = printed } = {}) {
  if (!itemsRequested(env)) return;
  write(`${ITEMS_END_PREFIX}${JSON.stringify({ count })}\n`);
}

const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;

/**
 * Every item line in a check's output, merged by key: `count` = occurrences, `status` is "new" when
 * ANY occurrence is new (one uncovered occurrence under a key is not accepted debt), and the first
 * title/file/line/unit win; a key whose known occurrences disagree on `basis` is "debt" (the
 * unjustified reading wins). Returns `{ items, errors, complete }` — `errors` are the malformed
 * lines; `complete` is true only when the output carries exactly ONE well-formed MATRX-ITEMS-END
 * whose count equals the item lines seen (malformed ones included).
 */
export function parseItems(output) {
  const byKey = new Map();
  const errors = [];
  const ends = [];
  let seenLines = 0;
  for (const raw of String(output ?? "").replace(ANSI, "").split("\n")) {
    const line = raw.trimStart();
    if (line.startsWith(ITEMS_END_PREFIX)) {
      let end;
      try {
        end = JSON.parse(line.slice(ITEMS_END_PREFIX.length));
      } catch {
        end = null;
      }
      if (end && typeof end === "object" && Number.isInteger(end.count) && end.count >= 0) ends.push(end.count);
      else errors.push(`malformed end marker: ${line.slice(0, 160)}`);
      continue;
    }
    if (!line.startsWith(ITEM_PREFIX)) continue;
    seenLines += 1;
    let item;
    try {
      item = JSON.parse(line.slice(ITEM_PREFIX.length));
    } catch {
      errors.push(`unparseable JSON: ${line.slice(0, 160)}`);
      continue;
    }
    const error = itemError(item);
    if (error) {
      errors.push(`${error}: ${line.slice(0, 160)}`);
      continue;
    }
    const status = item.status ?? "new";
    const seen = byKey.get(item.key);
    const basis = status === "known" ? item.basis ?? null : null;
    if (seen) {
      seen.count += 1;
      if (status === "new") seen.status = "new";
      if (seen.basis !== basis) seen.basis = seen.basis === null || basis === null ? (seen.basis ?? basis) : "debt";
      if (!seen.unit && item.unit) seen.unit = item.unit;
      continue;
    }
    byKey.set(item.key, {
      key: item.key,
      status,
      basis,
      unit: item.unit ?? "",
      title: item.title ?? "",
      file: item.file ?? "",
      line: Number.isInteger(item.line) ? item.line : null,
      rule: item.rule ?? "",
      count: 1,
    });
  }
  const items = [...byKey.values()];
  // A basis describes a KNOWN key; once any occurrence is new, the key is not covered.
  for (const item of items) if (item.status !== "known") item.basis = null;
  return { items, errors, complete: ends.length === 1 && ends[0] === seenLines };
}

/** The work unit an item belongs to: check × (the emitter's unit, else its file, rule or key). */
export function itemUnit(check, item) {
  return `${check}|${item.unit || item.file || item.rule || item.key}`;
}

/** An item's identity across runs: independent of counts, ordering, titles and line drift. */
export function itemFingerprint(check, key) {
  return createHash("sha1").update(`${check}\nitem:${key}`).digest("hex");
}
