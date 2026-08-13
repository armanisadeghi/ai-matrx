/**
 * scripts/check-url-identity.ts — the CROSS-REPO URL identity guard.
 *
 * `web.page` is unique on `(site_id, url_hash)` where `url_hash` is
 * `sha256(normalize_url(url))`, and every comparison of a CMS route to a
 * measured page runs through the same rule set. Two implementations exist
 * because two runtimes need it:
 *
 *   TS      features/marketing/lib/page-url.ts
 *   Python  aidream packages/matrx-scraper/matrx_scraper/utils/url.py
 *
 * They are held together by ONE language-neutral fixture — `url-identity-rules.json`
 * — which both test suites run and both PIN by SHA-256. This script is the
 * guard that fires BEFORE either suite: it proves the two copies of the fixture
 * are byte-identical and that both pinned digests still describe those bytes.
 * Without it, a one-sided edit only reddens the repo nobody is currently in.
 *
 * Loud, never blocking (no `--strict` exit for a missing aidream checkout —
 * that is an environment fact, not a defect). A genuine mismatch exits 1.
 *
 * Fixing a red here means RE-SYNCING the two copies, never loosening a pin.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..");
const LOCAL_FIXTURE = path.join(
  REPO_ROOT,
  "features/marketing/lib/__tests__/url-identity-rules.json",
);
const LOCAL_TEST = path.join(
  REPO_ROOT,
  "features/marketing/lib/__tests__/page-url.test.ts",
);

const AIDREAM_DIR =
  process.env.AIDREAM_DIR ?? path.resolve(REPO_ROOT, "..", "aidream");
const CANONICAL_FIXTURE = path.join(
  AIDREAM_DIR,
  "packages/matrx-scraper/matrx_scraper/utils/url-identity-rules.json",
);
const PYTHON_TEST = path.join(
  AIDREAM_DIR,
  "packages/matrx-scraper/tests/test_url_identity_rules.py",
);

const sha256 = (file: string): string =>
  createHash("sha256").update(readFileSync(file)).digest("hex");

const pinnedIn = (file: string, variable: string): string | null => {
  const source = readFileSync(file, "utf8");
  const match = new RegExp(`${variable}[^"']*["']([0-9a-f]{64})["']`).exec(
    source,
  );
  return match ? match[1] : null;
};

const problems: string[] = [];

if (!existsSync(LOCAL_FIXTURE)) {
  problems.push(
    `MISSING  ${path.relative(REPO_ROOT, LOCAL_FIXTURE)} — the TS suite has no fixture to run, so the twin is unguarded on this side.`,
  );
}

if (problems.length === 0) {
  const localDigest = sha256(LOCAL_FIXTURE);
  const tsPin = pinnedIn(LOCAL_TEST, "FIXTURE_SHA256");

  if (tsPin === null) {
    problems.push(
      `UNPINNED  ${path.relative(REPO_ROOT, LOCAL_TEST)} declares no FIXTURE_SHA256 — a fixture nobody pins cannot detect a one-sided edit.`,
    );
  } else if (tsPin !== localDigest) {
    problems.push(
      `DRIFT     ${path.relative(REPO_ROOT, LOCAL_TEST)} pins ${tsPin} but the fixture hashes to ${localDigest}.`,
    );
  }

  if (!existsSync(CANONICAL_FIXTURE)) {
    console.warn(
      `\n  note: no aidream checkout at ${AIDREAM_DIR} — checked this repo's half only.` +
        `\n        Set AIDREAM_DIR to compare against the canonical fixture.\n`,
    );
  } else {
    const canonicalDigest = sha256(CANONICAL_FIXTURE);
    if (canonicalDigest !== localDigest) {
      problems.push(
        `DIVERGED  the two fixture copies are NOT byte-identical.\n` +
          `            this repo : ${localDigest}\n` +
          `            aidream   : ${canonicalDigest}\n` +
          `            aidream's copy is canonical — copy it here verbatim and update BOTH pins.`,
      );
    }
    if (existsSync(PYTHON_TEST)) {
      const pyPin = pinnedIn(PYTHON_TEST, "_FIXTURE_SHA256");
      if (pyPin !== canonicalDigest) {
        problems.push(
          `DRIFT     aidream's test_url_identity_rules.py pins ${pyPin ?? "nothing"} but its fixture hashes to ${canonicalDigest}.`,
        );
      }
    }
  }
}

if (problems.length > 0) {
  console.error("\n  URL IDENTITY GUARD — the two twins have drifted apart\n");
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(
    "\n  Changing the rules is a FOUR-file change: the canonical fixture in aidream,\n" +
      "  the copy here, _FIXTURE_SHA256 in the Python suite, FIXTURE_SHA256 in the TS\n" +
      "  suite. Never loosen a pin to make this pass.\n",
  );
  process.exit(1);
}

console.log("  URL identity guard: TS and Python run byte-identical rules.");
