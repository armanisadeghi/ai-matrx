/**
 * NO PROOF FLIPS A LIVE ORGANIZATION'S RECORD-STORE SWITCH WITHOUT BORROWING IT.
 *
 * WHAT THIS CLOSES — V11-A, measured on the main database on 2026-09-22. Rincon Plumbing
 * Co, the crew every guide sends the owner to, read OFF from the admin seat: 401 live
 * records, 36 tables, 10 portals, 4 document templates and a published form all dark
 * behind one setting. The last write on it was `STORE-OFF proof — restored`, from
 * scripts/store-off/proof.sh, which ended with a HARDCODED
 *
 *     platform.unified_data_store_set(ORG, false, ...)   -- "restored"
 *
 * It never read what the crew had before it touched the switch, so "restored" meant
 * "off" no matter what. Two more things made it worse and are the same class: the
 * restore stood on ONE exit path (a failed clause and `set -e` walk out of the script
 * without it), and three proofs were flipping that one organization's switch inside the
 * same second, so even reading the prior value would have read a peer's transient one.
 *
 * THE RULE THIS ENFORCES. A script that flips the record-store switch on an organization
 * it did not create must do it through `scripts/lib/borrow-live-switch.sh`, which
 *   (1) takes an object-scoped lock, `store-switch:<organization>`, in
 *       campaign_watch.build_lock, so two proofs cannot hold one organization;
 *   (2) READS the current value, rather than assuming one;
 *   (3) restores that value from a `trap` on EXIT, INT and TERM — every exit path.
 *
 * WHAT COUNTS AS AN OFFENCE. A file under scripts/ that BOTH writes the switch
 * (`platform.unified_data_store_set`, or an insert/update of `system_enabled` /
 * `code_paths_enabled` in `platform.knob_override`) AND names a bare organization UUID
 * it did not generate in the same file — that is, it reaches for an organization that
 * already exists and has somebody's records in it. A suite that makes its own
 * organization with `gen_random_uuid()` inside a transaction it rolls back names no such
 * UUID and is not an offence.
 *
 *   pnpm check:live-switch-borrow
 *   pnpm check:live-switch-borrow:self-test   # proves it can still go RED
 */

import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, relative } from "path";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = join(__dirname, "..");
const SCRIPTS = join(ROOT, "scripts");
const HELPER = "borrow-live-switch";

const WRITES_THE_SWITCH = [
  /unified_data_store_set\s*\(/,
  /knob_override[\s\S]{0,400}?\b(system_enabled|code_paths_enabled)\b/,
  /\b(system_enabled|code_paths_enabled)\b[\s\S]{0,400}?knob_override/,
  // VERIFIER-15, 2026-09-23: the records-ui demo seam wrote the switch with the KEY in a
  // variable — `values ('custom', ${literal(key)}, 'organization', …)` — 400+ characters from
  // the only place `system_enabled` is spelled. A file that WRITES platform.knob_override and
  // names the switch anywhere at all is a file that can write the switch.
  /^(?=[\s\S]*\b(?:insert\s+into|update)\s+platform\.knob_override\b)(?=[\s\S]*\b(?:system_enabled|code_paths_enabled)\b)/i,
];
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

/**
 * A UUID counts as an ORGANIZATION only where the line it sits on says so. A scratchpad
 * path that happens to contain a session uuid is not a crew, and reading it as one is
 * how a guard earns its reputation for crying wolf.
 */
function organizationIdsNamed(body: string): string[] {
  const found = new Set<string>();
  for (const line of body.split("\n")) {
    if (!/\borg\b|organization|_org\b|[a-z]Org\b/i.test(line)) continue;
    for (const u of line.match(UUID) ?? []) {
      const id = u.toLowerCase();
      if (!TEST_IDENTITIES.has(id)) found.add(id);
    }
  }
  return [...found];
}

/**
 * A WRITE THAT NEVER LANDS IS NOT A FLIP. The campaign's SQL suites open a transaction,
 * build a whole organization inside it — switch and all — and `rollback` at the end, so
 * nothing they name survives the statement. They are exempt because the defect this
 * guard exists for is a switch left changed after the script exits.
 */
const ROLLS_ITSELF_BACK = /^\s*["'`]?\s*rollback\s*;/im;

/**
 * READ FIRST, PUT BACK WHAT WAS THERE — the in-transaction form of the borrow, for harnesses
 * that cannot source a zsh helper (VERIFIER-15, 2026-09-23). A TypeScript or Python seam that
 * captures the switch rows into a temporary table from `platform.knob_override` before it opens
 * them, and restores FROM THAT TABLE before commit, has done all three things the helper does:
 * it read, it put back what it read, and every exit path (an aborted transaction included)
 * leaves the switch as it was. A seam that writes a constant back instead is the defect.
 */
function readsFirstAndRestores(body: string): boolean {
  const cap = /create\s+temp(?:orary)?\s+table\s+(\w+)[\s\S]{0,400}?from\s+platform\.knob_override/i.exec(body);
  if (!cap) return false;
  const table = cap[1]!;
  return new RegExp(`update\\s+platform\\.knob_override[\\s\\S]{0,400}?from\\s+${table}\\b`, "i").test(body);
}

/**
 * A SCRIPT THAT MAKES ITS OWN ORGANIZATIONS OWNS THEM. A suite that inserts into
 * iam.organizations is building its own fixture crew from nothing; the switch it flips
 * is on a crew it created, not on somebody's. The defect this guard exists for is a
 * proof reaching into an organization that was already there with records in it.
 */
const MAKES_ITS_OWN_ORGS =
  /insert\s+into\s+iam\.organizations|organization_create|createOrganization|from\(\s*["'`]organizations["'`]\s*\)[\s\S]{0,80}insert/i;

/** The two identities every suite is allowed to name: they are people, not organizations. */
const TEST_IDENTITIES = new Set([
  "87a6e699-3622-4869-8843-d0867456c0dd", // admin@admin.com
  "4060701e-706a-4c76-b3ca-0bbc69fa5a14", // test@test.com
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(sh|sql|ts|tsx|mjs|js|cjs|py)$/.test(name)) out.push(full);
  }
  return out;
}

/**
 * WHERE A HARNESS THAT FLIPS A LIVE SWITCH CAN LIVE (VERIFIER-15, 2026-09-23). This guard
 * scanned matrx-frontend `scripts/` only, and the defect it exists for was found OUTSIDE it:
 * `aidream/apps/shared/records-ui/demo/branch-server.ts` committed a hardcoded `value='false'`
 * on test@test.com's own workspace after every demo request — 511 times in eight hours. So the
 * census also reads aidream's package demos and scripts and its top-level scripts.
 */
const AIDREAM = process.env.AIDREAM_DIR ?? join(ROOT, "..", "aidream");
export function scanRoots(): { roots: string[]; missing: string[] } {
  const roots = [SCRIPTS];
  const missing: string[] = [];
  const shared = join(AIDREAM, "apps", "shared");
  try {
    for (const pkg of readdirSync(shared)) {
      for (const sub of ["demo", "scripts"]) {
        const d = join(shared, pkg, sub);
        try {
          if (statSync(d).isDirectory()) roots.push(d);
        } catch {
          /* this package has no such directory */
        }
      }
    }
  } catch {
    missing.push(shared);
  }
  const top = join(AIDREAM, "scripts");
  try {
    if (statSync(top).isDirectory()) roots.push(top);
  } catch {
    missing.push(top);
  }
  return { roots, missing };
}

export function offences(scriptsDir: string | string[] = SCRIPTS, patterns = WRITES_THE_SWITCH): string[] {
  const bad: string[] = [];
  const dirs = Array.isArray(scriptsDir) ? scriptsDir : [scriptsDir];
  for (const file of dirs.flatMap((d) => walk(d))) {
    const rel = relative(ROOT, file);
    if (rel.includes(HELPER) || rel.includes("check-live-switch-borrow")) continue;
    const body = readFileSync(file, "utf8");
    if (!patterns.some((p) => p.test(body))) continue;
    if (body.includes(HELPER)) continue; // it borrows — that is the whole point
    if (readsFirstAndRestores(body)) continue; // it borrows inside its own transaction
    if (ROLLS_ITSELF_BACK.test(body)) continue; // nothing it wrote outlives the script
    if (MAKES_ITS_OWN_ORGS.test(body)) continue; // its crews are its own

    const named = organizationIdsNamed(body);
    if (named.length === 0) continue; // names no organization that was already there

    bad.push(
      `${rel} — flips an organization's record-store switch and names ${named.length} organization id(s) it did not create (${named
        .slice(0, 3)
        .join(", ")}${named.length > 3 ? ", …" : ""}). It must borrow the switch through scripts/lib/borrow-live-switch.sh, which locks the organization, reads what it has, and puts that back from a trap on every exit path — or, in a TypeScript/Python harness, capture the rows into a temporary table from platform.knob_override inside its transaction and restore FROM that table before commit (aidream/apps/shared/records-ui/demo/branch-server.ts is the worked example). A constant written back is not a restore.`,
    );
  }
  return bad.sort();
}

function main() {
  const selfTest = process.argv.includes("--self-test");

  if (selfTest) {
    // A FORCING-FUNCTION SELF-TEST. Two planted proofs in a scratch directory: one that
    // hardcodes the restore the way scripts/store-off/proof.sh did on 2026-09-22, and
    // one that borrows the switch. The census must see the first and not the second, or
    // it cannot tell a borrow from a hardcode and is worth nothing on the real tree.
    const dir = mkdtempSync(join(tmpdir(), "live-switch-borrow-selftest-"));
    writeFileSync(
      join(dir, "hardcoded-proof.sh"),
      [
        "#!/bin/zsh",
        "ORG=6069a466-1445-42df-a64e-cf37ecdc1b99   # Rincon Plumbing Co",
        "psql -c \"select platform.unified_data_store_set('$ORG'::uuid, true, '$ADMIN'::uuid, 'proof')\"",
        "psql -c \"select platform.unified_data_store_set('$ORG'::uuid, false, '$ADMIN'::uuid, 'proof — restored')\"",
      ].join("\n"),
    );
    writeFileSync(
      join(dir, "borrowed-proof.sh"),
      [
        "#!/bin/zsh",
        "source ../lib/borrow-live-switch.sh",
        "ORG=6069a466-1445-42df-a64e-cf37ecdc1b99   # Rincon Plumbing Co",
        'borrow_store_switch "$ORG" "$ADMIN" "a proof"',
        "set_store_switch true",
      ].join("\n"),
    );

    // VERIFIER-15's harness, planted twice: the pre-fix branch-server.ts shape (open the
    // organization rung, run the body, COMMIT a constant false) and today's shape (capture
    // the prior rows first, restore from them). The first must be red, the second green.
    const seam = (restore: string[], capture: string[]) =>
      [
        'export const DEMO_ORG = process.env["RECORDS_UI_DEMO_ORG"] ?? "8cb71c8b-5b49-4563-a5fe-d77ff600f8ee";',
        // The key is in a variable, exactly as in the real seam, so this plant also pins the
        // widened WRITES_THE_SWITCH pattern (the switch named far from the write).
        'const OPENABLE_KNOBS = new Set(["system_enabled"]);',
        ...Array.from({ length: 12 }, (_, i) => `// padding line ${i} — the real seam spells the key hundreds of characters from its write`),
        "const key = [...OPENABLE_KNOBS][0];",
        "const sql = [",
        '  "begin;",',
        ...capture,
        "  `insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)",
        "     values ('custom', ${literal(key)}, 'organization', '${DEMO_ORG}'::uuid, '${DEMO_ORG}'::uuid, 'true'::jsonb)",
        "     on conflict (feature, key, scope_kind, scope_id, organization_id) do update set value = 'true'::jsonb;`,",
        "  body,",
        ...restore,
        '  "commit;",',
        '].join("\\n");',
      ].join("\n");
    writeFileSync(
      join(dir, "old-demo-seam.ts"),
      seam(
        [
          "  `update platform.knob_override set value='false'::jsonb",
          "     where feature='custom' and key=${literal(key)} and scope_kind='organization'",
          "       and scope_id='${DEMO_ORG}'::uuid and organization_id='${DEMO_ORG}'::uuid;`,",
        ],
        [],
      ),
    );
    writeFileSync(
      join(dir, "today-demo-seam.ts"),
      seam(
        [
          "  `update platform.knob_override o set value = p.value from _switch_prior p",
          "     where o.feature = 'custom' and o.key = p.key and o.organization_id = '${DEMO_ORG}'::uuid;`,",
        ],
        [
          "  `create temporary table _switch_prior on commit drop as",
          "     select key, value from platform.knob_override",
          "      where feature = 'custom' and organization_id = '${DEMO_ORG}'::uuid;`,",
        ],
      ),
    );

    const seen = offences(dir);
    const red = seen.filter((line) => line.includes("hardcoded-proof.sh"));
    const wrong = seen.filter((line) => line.includes("borrowed-proof.sh"));
    const seamRed = seen.filter((line) => line.includes("old-demo-seam.ts"));
    const seamWrong = seen.filter((line) => line.includes("today-demo-seam.ts"));
    if (seamRed.length !== 1) {
      console.error(
        `[FAIL] self-test: the census did NOT flag the pre-fix records-ui demo seam, which committed a constant false on a live workspace (VERIFIER-15). It saw: ${seen.join("; ") || "nothing"}.`,
      );
      exitAfterDrain(1);
    }
    if (seamWrong.length !== 0) {
      console.error(
        `[FAIL] self-test: the census flagged today's demo seam, which reads the switch first and restores what it read — ${seamWrong.join("; ")}.`,
      );
      exitAfterDrain(1);
    }
    if (red.length !== 1) {
      console.error(
        `[FAIL] self-test: the census did NOT flag a proof that hardcodes its restore on a live crew. It saw ${seen.length} thing(s) in ${dir}. This guard cannot go red, so it proves nothing.`,
      );
      exitAfterDrain(1);
    }
    if (wrong.length !== 0) {
      console.error(
        `[FAIL] self-test: the census flagged the proof that DOES borrow the switch — ${wrong.join("; ")}. A guard that refuses the correct shape teaches people to switch it off.`,
      );
      exitAfterDrain(1);
    }
    console.log(
      `[OK] self-test: RED on the hardcoded restore and on the pre-fix demo seam, GREEN on the borrowed proof and on today's seam (fixtures in ${dir}). The guard can still fail.`,
    );
    exitAfterDrain(0);
  }

  const { roots, missing } = scanRoots();
  if (missing.length > 0) {
    // NOT SILENT, NOT A PASS: the aidream half was not read. Said on every run.
    console.warn(
      `[WARN] the aidream half was NOT scanned — ${missing.join(", ")} is not on this machine (set AIDREAM_DIR). Only ${roots.length} root(s) were read.`,
    );
  }
  const bad = offences(roots);
  if (bad.length > 0) {
    console.error("[FAIL] a proof flips a live organization's record-store switch without borrowing it:");
    for (const line of bad) console.error("  - " + line);
    exitAfterDrain(1);
  }
  console.log(
    `[OK] every script and harness that flips a live organization's record-store switch borrows it first — through the shell helper, or by reading the rows inside its own transaction and restoring what it read (${roots.length} roots scanned, matrx-frontend scripts/ and aidream demos and scripts).`,
  );
}

if (require.main === module) main();
