/**
 * THE FINDINGS REGISTRY — every check converted to the item line (C5), what it watches, how its
 * item gets fixed, and (when it has one) the ACCEPT ADAPTER that writes an accepted key into the
 * check's OWN allowlist/baseline in the format the check already reads (PLAN.md C1: an accept
 * lives with the check, so CI, hand runs and finalize-and-ship all agree).
 *
 * aidream's twin: scripts/findings.py (same interface, same rules).
 * Protocol: common-docs/projects/checks-run-in-the-app/ITEM-PROTOCOL.md · keys: P2-ITEMS.md.
 *
 * An entry:
 *   id       — the runner's row id (scripts/checks/run.mjs --list)
 *   watch    — repo-relative paths the check scans; `findings <paths>` runs it only when one matches
 *   fix      — the exact fix hint printed under each new item
 *   accept   — { files, apply({ key, reason, by, date, root }) } or null
 *   noAccept — when accept is null: how this check is accepted today, and what adding an adapter needs
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { appendToJsonArray } from "./json-edit.mjs";

const read = (root, rel) => readFileSync(join(root, rel), "utf8");
const write = (root, rel, text) => writeFileSync(join(root, rel), text);

/**
 * A detector-sectioned allowlist ({ "<detector>": [{ file, line?, justification, date, addedBy }] })
 * keyed `<detector>|<file>|<line or *>`. The entry is appended in place (these files are hand-kept).
 */
function detectorAllowlist(rel, detectors) {
  return {
    files: [rel],
    apply({ key, reason, by, date, root }) {
      const [detector, file, line, ...rest] = key.split("|");
      if (rest.length || !detectors.includes(detector) || !file || !line) {
        throw new Error(`key "${key}" is not <${detectors.join("|")}>|<file>|<line or *>`);
      }
      const entry = { file, ...(line === "*" ? {} : { line: Number(line) }), justification: reason, addedBy: by, date };
      write(root, rel, appendToJsonArray(read(root, rel), detector, entry));
    },
  };
}

/** A plain JSON array of keys, plus the reasons map the plain array cannot hold, in a sibling file. */
function arrayBaselineWithSiblingReasons(rel, reasonsRel) {
  return {
    files: [rel, reasonsRel],
    apply({ key, reason, by, date, root }) {
      const list = JSON.parse(read(root, rel));
      write(root, rel, `${JSON.stringify([...new Set([...list, key])].sort(), null, 2)}\n`);
      const reasons = existsSync(join(root, reasonsRel))
        ? JSON.parse(read(root, reasonsRel))
        : { _readme: `Why each entry of ${rel} was accepted (written by \`pnpm findings accept\`). ${rel} is a plain array the check reads as-is, so the reasons live here.` };
      reasons[key] = { reason, accepted_by: by, date };
      write(root, reasonsRel, `${JSON.stringify(reasons, null, 2)}\n`);
    },
  };
}

export const FINDINGS_CHECKS = [
  {
    id: "visibility-vocabulary",
    watch: /(\.tsx?$)|^scripts\/visibility-vocab\//,
    fix: "Use the canonical visibility values (features/files/types.ts#Visibility) and normalize legacy reads with toVisibility(); never claim 'only you' where access is wider.",
    accept: detectorAllowlist("scripts/visibility-vocab/allowlist.json", ["retiredSpelling", "collapsedUnion", "onlyYouClaim"]),
  },
  {
    id: "access-guard-check",
    watch: /(\.(tsx?|sql)$)|^scripts\/access-guards\//,
    fix: "Declare the list's scope (THE VIEW LAW, docs/official/db-rules.md), never read the active org for an access decision, and use the canonical access ladder — the check's own fix line names the exact rule (scripts/access-guards/FEATURE.md).",
    accept: detectorAllowlist("scripts/access-guards/allowlist.json", ["lowestTierDefault", "activeOrgAccess", "handRolledLadder", "bareRlsList"]),
  },
  {
    id: "url-state-written-outside-the-canonical-primitive",
    watch: /\.tsx?$/,
    fix: "Write the URL through lib/url-state/useUrlState.ts (one param → useUrlState + a codec; a cluster → useMirroredUrlState; a MatrxDataTable → @ai-matrx/design-system/data-table/url-state), never a raw history.pushState/replaceState.",
    accept: null,
    noAccept: "scripts/check-url-state.ts has no allowlist (its exemptions are code rules). Accepting needs an allowlist there first, then an adapter in scripts/findings/registry.mjs.",
  },
  {
    id: "complete-list-reads-postgrest-silently-caps-at-1000",
    watch: /^(scripts|lib|features|app|utils)\/.*\.tsx?$/,
    fix: "Read a list you treat as complete with readAllRows from @ai-matrx/data/db (PostgREST caps a bare .select() at 1000 rows), or bound it and say so.",
    accept: null,
    noAccept: "scripts/check-unbounded-reads.ts has no allowlist or baseline (it is an advisory census). Accepting needs one there first, then an adapter in scripts/findings/registry.mjs.",
  },
  {
    id: "api-contract-ratchet",
    watch: /(^(features|app|lib|components|hooks)\/.*\.tsx?$)|^scripts\/api-contracts-baseline/,
    fix: "Call the server through the typed client (lib/api/typed-client.ts, generated api-types) instead of importing the raw python client.",
    accept: arrayBaselineWithSiblingReasons("scripts/api-contracts-baseline.json", "scripts/api-contracts-baseline.reasons.json"),
  },
  {
    id: "cx-source-attribution-is-registered",
    watch: /\.tsx?$/,
    fix: "Register the value once in aidream's source-attribution registry and regenerate types/python-generated/source-attribution.ts (pnpm sync-types) — or stamp an already-registered value.",
    accept: null,
    noAccept: "The registry is a vocabulary, not an allowlist of defects: the fix IS registering the value. There is nothing to accept.",
  },
  {
    id: "record-naming-toasts-carry-their-record",
    watch: /(^(features|lib|app|components|hooks)\/.*\.tsx?$)|^scripts\/record-toasts\.baseline\.json$/,
    fix: "Route the toast through recordToast (lib/toast.ts) so it carries its record and stays until read.",
    accept: {
      files: ["scripts/record-toasts.baseline.json"],
      // Baseline `ids` has no reason field; the reason goes in a `reasons` map in the same file,
      // which the check ignores and `--update` keeps for every id that survives.
      apply({ key, reason, by, date, root }) {
        const rel = "scripts/record-toasts.baseline.json";
        const data = JSON.parse(read(root, rel));
        const ids = [...new Set([...(data.ids ?? []), key])].sort();
        const reasons = { ...(data.reasons ?? {}), [key]: { reason, accepted_by: by, date } };
        write(root, rel, `${JSON.stringify({ ...data, count: ids.length, ids, reasons }, null, 2)}\n`);
      },
    },
  },
  {
    id: "access-errors-surfaces-that-guess-why-a-read-failed",
    watch: /^(app|features|components|lib|hooks)\/.*\.tsx?$/,
    fix: "Render the failure through the shared access presenter (<AccessGate>/recordUnavailable) and read the hook's error instead of guessing why a read failed.",
    accept: null,
    noAccept: "This check is accepted by an inline `// access-errors: ok — <reason>` marker on the flagged line or the line above it (a source edit you make by hand), never a key list. An adapter would go in scripts/findings/registry.mjs.",
  },
];

export const byId = (id) => FINDINGS_CHECKS.find((c) => c.id === id);
