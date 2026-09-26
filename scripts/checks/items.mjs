/**
 * THE ITEM LINE — how a check names each thing it found, so the runner can file ONE finding per
 * item instead of one per check. Protocol (the one copy): common-docs/projects/checks-run-in-the-app/ITEM-PROTOCOL.md.
 * aidream's twin is scripts/checks/items.py; both parse exactly the same line.
 *
 *   MATRX-ITEM {"key":"<stable id>","status":"new"|"known","title":"…","file":"…","line":12,"rule":"…"}
 *
 * - `key` is REQUIRED and EQUALS the key the check's own allowlist/baseline uses for the item
 *   (a table name, a function signature, a file path without its line number, a rule id…), so an
 *   accept names the same thing the check matches.
 * - `status` is the ratchet: "known" = covered by the check's allowlist/baseline (debt, counted,
 *   never handed off); "new" = not covered. A check with no baseline omits it (= "new").
 * - Items are printed ONLY when the runner asks (MATRX_ITEMS=1), so a hand run stays readable.
 */
import { createHash } from "node:crypto";

export const ITEM_PREFIX = "MATRX-ITEM ";
export const ITEMS_ENV = "MATRX_ITEMS";
export const ITEM_STATUSES = new Set(["new", "known"]);
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
  return null;
}

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
  if (item.title) clean.title = String(item.title).slice(0, TITLE_LIMIT);
  if (item.file) clean.file = String(item.file);
  if (Number.isInteger(item.line)) clean.line = item.line;
  if (item.rule) clean.rule = String(item.rule);
  write(`${ITEM_PREFIX}${JSON.stringify(clean)}\n`);
}

const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;

/**
 * Every item line in a check's output, merged by key: `count` = occurrences, `status` is "new" when
 * ANY occurrence is new (one uncovered occurrence under a key is not accepted debt), and the first
 * title/file/line win. Returns `{ items, errors }` — `errors` are the malformed lines.
 */
export function parseItems(output) {
  const byKey = new Map();
  const errors = [];
  for (const raw of String(output ?? "").replace(ANSI, "").split("\n")) {
    const line = raw.trimStart();
    if (!line.startsWith(ITEM_PREFIX)) continue;
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
    if (seen) {
      seen.count += 1;
      if (status === "new") seen.status = "new";
      continue;
    }
    byKey.set(item.key, {
      key: item.key,
      status,
      title: item.title ?? "",
      file: item.file ?? "",
      line: Number.isInteger(item.line) ? item.line : null,
      rule: item.rule ?? "",
      count: 1,
    });
  }
  return { items: [...byKey.values()], errors };
}

/** An item's identity across runs: independent of counts, ordering, titles and line drift. */
export function itemFingerprint(check, key) {
  return createHash("sha1").update(`${check}\nitem:${key}`).digest("hex");
}
