#!/usr/bin/env tsx
/**
 * check:settings-env-toggles — a BEHAVIOURAL env var read at feature level.
 *
 * 🚨 THE RULING. Arman, 2026-09-10, verbatim:
 *
 *     "Never an env var. Env values are only for secrets, not for controlling
 *      behavior."
 *
 * and 2026-08-25, on why:
 *
 *     "The problem is where agents take something that has nothing to do with
 *      environments and stick it into an environmental variable. So now we're
 *      running things locally and we're getting different results than the
 *      server's getting, than the container's getting."
 *
 * THE LENIENCY IS NOT THE PROBLEM — THE ENVIRONMENT IS. A behavioural choice
 * in code is uniform, reviewable, and changes everywhere at once on the next
 * push. The same choice in the environment lets every machine disagree about
 * identical code, invisibly. A behavioural choice in `platform.feature_knob`
 * is better still: an organization can see it and set it, which is law 6.
 *
 * 🚨 THE DISTINCTION THIS GUARD MUST GET RIGHT. Env vars are not banned —
 * three classes are entirely legitimate and the register lists them as LINKED,
 * not PENDING (USP-036, USP-037, USP-073):
 *
 *   SECRET    an API key, token, password, signing secret, connection string.
 *             Legitimate. Belongs in env (moving to the platform vault is
 *             USP-086, a different lane).
 *   ENDPOINT  a URL, host, port, region, bucket. Legitimate — it genuinely
 *             describes WHERE this copy runs.
 *   IDENTITY  NODE_ENV, VERCEL_ENV, instance id, build id, CI. Legitimate —
 *             it genuinely describes WHAT this copy is.
 *   BEHAVIOUR everything else, read in a boolean shape: a feature switched on
 *             or off, a validation skipped, a mock lane armed. ILLEGAL. This
 *             is a setting, and it belongs in the registry.
 *
 * The guard prints the class it assigned to EVERY boolean-shaped read it found,
 * including the legitimate ones, so a wrong call is visible and arguable rather
 * than silent. Misclassification is the only way a guard like this rots.
 *
 * 🚨 THE ALLOWLIST IS EMPTY, AND THAT IS THE POINT.
 * `scripts/settings-env-toggles-allowlist.json` was seeded 2026-09-11 with 15
 * names / 20 sites; LANE D of the Unified Settings Platform drained it the same
 * day and it now holds ZERO entries. So every BEHAVIOUR finding from here on is
 * NEW and exits 1 — there is no "known bad" tier left to hide in. `--write`
 * shrinks the allowlist to what is still present and can never add an entry, so
 * a new toggle cannot be baselined away.
 *
 * How the 19+3 were drained, because the split is the judgement that matters:
 *   1 became a feature knob   — MATRX_PARITY_SHADOW → `platform.debug.config_parity_shadow`
 *                               (aidream migration 0638), the only one that was
 *                               product runtime behaviour.
 *   14 became real CLI flags  — APPLY → --apply, UNWIRED_DEBUG → --debug,
 *                               MATRX_ALLOW_ARCHIVED_REGENERATOR → --allow-archived,
 *                               PODCAST_E2E_FULL → --full, P6_* → --benchmark /
 *                               --image-benchmark-contract, MATRX_PARITY_REQUIRE_FRONTEND
 *                               → --require-frontend, MATRX_INFO/DEBUG/VERBOSE →
 *                               run_schema_generation() arguments. A one-off
 *                               script's dry-run switch is a CLI flag wearing an
 *                               env var; a knob for it would put a developer's
 *                               keystroke in an organization's settings registry.
 *   6 were deleted outright   — SSR_TIMING and the two NEXT_PUBLIC_*CONTENT_BLOCKS*
 *                               with the dead modules that carried them (zero
 *                               importers), MATRX_BROWSER_PROOF_SERVER (a second
 *                               gate beside a real secret), TWILIO_SKIP_VALIDATION
 *                               (turned off webhook signature validation — no
 *                               organization may choose that, so there was no
 *                               honest setting to move it to).
 *   1 was upheld as legitimate — MATRX_SEO_LOCAL_DEV, reclassified IDENTITY here;
 *                               see the comment on IDENTITY_RE.
 *
 * Sibling guard on the aidream side, by SHAPE rather than by name:
 * `aidream/scripts/check_env_toggles.py`. This one is cross-repo and is the
 * settings-platform half — it grades against the registry's own vocabulary.
 *
 *   pnpm check:settings-env-toggles
 *   pnpm check:settings-env-toggles --all     # list every class, not just BEHAVIOUR
 *   pnpm check:settings-env-toggles --json
 *   pnpm check:settings-env-toggles --write   # SHRINK the allowlist
 *   pnpm check:settings-env-toggles --self-test
 *
 * Exit: 0 clean · 1 NEW behavioural toggle(s) · 2 UNMEASURED (scanned nothing).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";
import {
  AIDREAM_SCAN_DIRS,
  C,
  FRONTEND_SCAN_DIRS,
  ROOT,
  collectAidream,
  collectFrontend,
  lineOf,
  unmeasured,
} from "./settings-guards/lib";

const GUARD = "check:settings-env-toggles";
const ALLOWLIST_FILE = join(ROOT, "scripts", "settings-env-toggles-allowlist.json");

type Klass = "SECRET" | "ENDPOINT" | "IDENTITY" | "BEHAVIOUR";

const SECRET_RE =
  /(SECRET|_KEY$|_KEY_|API_KEY|TOKEN|PASSWORD|PASSWD|CREDENTIAL|PRIVATE|SIGNING|SALT|DSN|CONNECTION_STRING|CLIENT_SECRET|WEBHOOK_SECRET|CLIENT_ID)/;
const ENDPOINT_RE =
  /(_URL$|_URL_|_URI|ENDPOINT|_HOST$|_HOST_|HOSTNAME|_PORT$|DOMAIN|ORIGIN|BASE_URL|REGION|BUCKET|_DSN$|PROJECT_REF|_ADDR|_EMAIL$)/;
// Host identity includes what the RUNNER stamps on a process: CI, the test
// harness (PYTEST_CURRENT_TEST), and the terminal's own colour convention
// (NO_COLOR / FORCE_COLOR / TERM are the terminal describing itself).
// MATRX_SEO_LOCAL_DEV is here by a STANDING WRITTEN RULING, not by convenience
// (common-docs/policies/env-vars-are-values-not-toggles.md, 2026-08-25, § "ruled
// IN, and worth knowing why"). It looks like a toggle and is not: it carries a
// per-environment FACT — which database role this process may run as. Production
// asserts `svc_seo`; the documented local launcher permits the broad pooled login
// on loopback only; DEPLOY.md states deployments must never set it. The test is
// not "is it a boolean" but "does it name something about the ENVIRONMENT, or
// something about the PRODUCT?" A role, a URL, a key: a value. A validation
// strictness, a cutover, an engine choice: a toggle. Lane D re-read the call site
// on 2026-09-11 and upheld the ruling rather than sweeping it up to make a sweep
// look complete. GATE_NESTED_INSTALL is likewise process identity: the pnpm
// launcher stamps its child so the install lock recognizes the same operation;
// it cannot enable, disable, or configure product behavior.
const IDENTITY_RE =
  /^(NODE_ENV|VERCEL_ENV|VERCEL|VERCEL_[A-Z_]*|CI|GITHUB_ACTIONS|ENVIRONMENT|ENV|APP_ENV|DEPLOY_ENV|BUILD_ID|APP_VERSION|INSTANCE_ID|NEXT_RUNTIME|npm_[a-z_]+|HOME|PATH|TMPDIR|PWD|AIDREAM_DIR|TZ|PYTEST_CURRENT_TEST|NO_COLOR|FORCE_COLOR|TERM|MATRX_SEO_LOCAL_DEV|GATE_NESTED_INSTALL)$/;

/** The env-toggle guards themselves — their pattern tables are not reads. */
const GUARD_MODULES = /(check-settings-env-toggles\.ts$|aidream\/scripts\/check_env_toggles\.py$)/;

function classify(name: string): Klass {
  if (IDENTITY_RE.test(name)) return "IDENTITY";
  if (SECRET_RE.test(name)) return "SECRET";
  if (ENDPOINT_RE.test(name)) return "ENDPOINT";
  return "BEHAVIOUR";
}

/**
 * BOOLEAN SHAPE, not a name list. An agent inventing a new toggle does not name
 * it after an old one, so matching names would miss precisely the ones that
 * matter. A read whose value is USED as a value — a URL, an int, a key — never
 * matches these and is never reported.
 */
const TS_SHAPES: Array<[RegExp, string]> = [
  [/process\.env\.([A-Z][A-Z0-9_]*)\s*(?:===|!==|==|!=)\s*["'](?:1|0|true|false|yes|no|on|off)["']/g, 'compared to "1"/"true"'],
  [/process\.env\[["']([A-Z][A-Z0-9_]*)["']\]\s*(?:===|!==|==|!=)\s*["'](?:1|0|true|false|yes|no|on|off)["']/g, 'compared to "1"/"true"'],
  [/Boolean\s*\(\s*process\.env\.([A-Z][A-Z0-9_]*)/g, "Boolean(...)"],
  [/!!\s*process\.env\.([A-Z][A-Z0-9_]*)/g, "!!..."],
  [/\bif\s*\(\s*!?\s*process\.env\.([A-Z][A-Z0-9_]*)\s*\)/g, "if (...)"],
  [/process\.env\.([A-Z][A-Z0-9_]*)\s*\?\??\s*(?:false|true)\b/g, "?? true/false"],
  [/\[\s*["'](?:1|true)["'][^\]]*\]\s*\.includes\s*\(\s*process\.env\.([A-Z][A-Z0-9_]*)/g, "includes(...)"],
];

const PY_SHAPES: Array<[RegExp, string]> = [
  [/os\.(?:environ\.get|getenv)\s*\(\s*["']([A-Z][A-Z0-9_]*)["'][^)]*\)\s*(?:==|!=)\s*["'](?:1|0|true|false|yes|no|on|off)["']/gi, 'compared to "1"/"true"'],
  [/os\.environ\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]\s*(?:==|!=)\s*["'](?:1|0|true|false|yes|no|on|off)["']/gi, 'compared to "1"/"true"'],
  [/os\.(?:environ\.get|getenv)\s*\(\s*["']([A-Z][A-Z0-9_]*)["'][^)]*\)[^\n]{0,60}?\bin\s*[({[]/g, "in {truthy set}"],
  [/bool\s*\(\s*os\.(?:environ\.get|getenv)\s*\(\s*["']([A-Z][A-Z0-9_]*)["']/g, "bool(...)"],
  [/\bif\s+(?:not\s+)?os\.(?:environ\.get|getenv)\s*\(\s*["']([A-Z][A-Z0-9_]*)["'][^)]*\)\s*:/g, "if ...:"],
];

interface Site {
  file: string;
  line: number;
  name: string;
  shape: string;
  klass: Klass;
}
interface AllowEntry {
  name: string;
  file: string;
  reason: string;
}

function siteKey(s: { file: string; name: string }): string {
  return `${s.file}::${s.name}`;
}

function main(): void {
  const json = process.argv.includes("--json");
  const all = process.argv.includes("--all");
  const write = process.argv.includes("--write");
  const selfTest = process.argv.includes("--self-test");

  // `scripts` is IN SCOPE. A safety gate relaxed by an env var in a generator
  // is the same class as one relaxed in a feature — MATRX_ALLOW_ARCHIVED_REGENERATOR
  // is exactly that, and excluding tooling would have hidden two of the six
  // known violators behind a definition.
  const fe = collectFrontend([...FRONTEND_SCAN_DIRS, "scripts"]);
  const ai = collectAidream([...AIDREAM_SCAN_DIRS, "scripts"]);
  const files = [...fe, ...(ai ?? [])];
  if (fe.length === 0) {
    unmeasured(GUARD, "Scanned ZERO frontend files.", "run from the matrx-frontend checkout");
  }
  if (!ai && write) {
    unmeasured(GUARD, "No aidream checkout — --write would drop every aidream baseline entry.", "clone aidream beside this repo or set AIDREAM_DIR, then --write");
  }
  if (!ai && !json) {
    console.log(`${C.yellow}[WARN] no aidream checkout — only matrx-frontend env reads were scanned this run${C.reset}`);
  }

  const seen = new Set<string>();
  const sites: Site[] = [];
  for (const f of files) {
    if (GUARD_MODULES.test(f.rel)) continue;
    const isPy = f.rel.endsWith(".py");
    if (isPy ? !/os\.(environ|getenv)/.test(f.text) : !/process\.env/.test(f.text)) continue;
    for (const [re, shape] of isPy ? PY_SHAPES : TS_SHAPES) {
      re.lastIndex = 0;
      for (let m = re.exec(f.text); m; m = re.exec(f.text)) {
        const name = m[1];
        const line = lineOf(f.text, m.index);
        const k = `${f.rel}::${name}::${line}`;
        if (seen.has(k)) continue;
        seen.add(k);
        sites.push({ file: f.rel, line, name, shape, klass: classify(name) });
      }
    }
  }

  const behaviour = sites.filter((s) => s.klass === "BEHAVIOUR");

  const allow: AllowEntry[] = existsSync(ALLOWLIST_FILE)
    ? (JSON.parse(readFileSync(ALLOWLIST_FILE, "utf8")).entries as AllowEntry[])
    : [];
  const allowByName = new Map(allow.map((a) => [a.name, a]));

  if (selfTest) {
    behaviour.push({
      file: "SELF-TEST (not a real file)",
      line: 1,
      name: "SELF_TEST_ENABLE_NEW_THING",
      shape: 'compared to "1"/"true"',
      klass: "BEHAVIOUR",
    });
  }

  const known = behaviour.filter((s) => allowByName.has(s.name));
  const fresh = behaviour.filter((s) => !allowByName.has(s.name));

  if (write) {
    const liveNames = new Set(behaviour.map((s) => s.name));
    const seeding = !existsSync(ALLOWLIST_FILE);
    // SHRINK ONLY once seeded. The seed itself records what exists TODAY, each
    // entry with its first file so a human can write the reason.
    const kept = seeding
      ? [...new Map(behaviour.map((s) => [s.name, { name: s.name, file: s.file, reason: "baselined at seed — convert to a platform.feature_knob row (LANE D)" }])).values()]
          .sort((a, b) => a.name.localeCompare(b.name))
      : allow.filter((a) => liveNames.has(a.name));
    writeFileSync(
      ALLOWLIST_FILE,
      `${JSON.stringify(
        {
          _law:
            'Arman, 2026-09-10: "Never an env var. Env values are only for secrets, not for ' +
            'controlling behavior."',
          _rule:
            "THIS LIST ONLY SHRINKS, AND IT IS NOW EMPTY. It was seeded 2026-09-11 with the 15 " +
            "behavioural env toggles that existed that day; LANE D of the Unified Settings " +
            "Platform drained all 15 the same day (register USP-035 / USP-085) — one became a " +
            "platform.feature_knob row, most became real CLI flags, the rest were deleted with " +
            "the dead code or the unsafe bypass that carried them. Every BEHAVIOUR finding from " +
            "here on is therefore NEW and fails the guard. Adding an entry here is the defect " +
            "this guard exists to catch: convert it or delete it instead.",
          _how:
            "`pnpm check:settings-env-toggles --write` removes entries that no longer exist in " +
            "the tree. It cannot add one.",
          _baselined: "2026-09-11",
          entries: kept,
        },
        null,
        2,
      )}\n`,
    );
    console.log(
      `${seeding ? "Seeded" : "Ratcheted"} ${relative(ROOT, ALLOWLIST_FILE)}: ${kept.length} entr${kept.length === 1 ? "y" : "ies"}${seeding ? "" : ` (removed ${allow.length - kept.length})`}.`,
    );
    process.exit(0);
  }

  if (json) {
    console.log(JSON.stringify({ sites, behaviour, known, fresh }, null, 2));
    process.exit(fresh.length > 0 ? 1 : 0);
  }

  const counts = { SECRET: 0, ENDPOINT: 0, IDENTITY: 0, BEHAVIOUR: 0 };
  for (const s of sites) counts[s.klass]++;

  console.log(`\n${C.bold}${C.white}BEHAVIOURAL ENV TOGGLES${C.reset} ${C.dim}(${GUARD})${C.reset}`);
  console.log(
    `${C.dim}${sites.length} boolean-shaped env read(s) across ${files.length} files — ${counts.BEHAVIOUR} BEHAVIOUR (illegal), ${counts.SECRET} SECRET, ${counts.ENDPOINT} ENDPOINT, ${counts.IDENTITY} IDENTITY (all three legitimate)${C.reset}\n`,
  );

  if (fresh.length === 0 && known.length === 0) {
    console.log(`${C.green}✓ No behavioural env toggles anywhere.${C.reset}`);
  }

  if (fresh.length > 0) {
    console.log(
      `${C.red}${C.bold}[LOUD] ${fresh.length} NEW behavioural env toggle(s) — not in the allowlist${C.reset}`,
    );
    console.log(
      `${C.dim}Identical code, different behaviour per machine, invisible to the organization.${C.reset}\n`,
    );
    for (const s of fresh) {
      console.log(
        `  ${C.cyan}${s.file}:${s.line}${C.reset}  ${C.bold}${s.name}${C.reset} ${C.dim}(${s.shape}) → classified BEHAVIOUR${C.reset}`,
      );
    }
    console.log(
      `\n  ${C.yellow}Fix:${C.reset} seed the choice as a platform.feature_knob row and read it through the`,
    );
    console.log(
      `  ${C.dim}resolution API, then DELETE the env var. If this guard called it wrong — it is${C.reset}`,
    );
    console.log(
      `  ${C.dim}really a secret, an endpoint, or host identity — fix classify() here, not the list.${C.reset}\n`,
    );
  }

  if (known.length > 0) {
    console.log(
      `${C.yellow}${C.bold}[BASELINED] ${known.length} KNOWN behavioural env toggle(s) still in the tree${C.reset} ${C.dim}— allowlisted 2026-09-11, LANE D is removing them; the list only shrinks. Not a pass: each one is a machine-local opinion.${C.reset}`,
    );
    for (const s of known) {
      console.log(
        `  ${C.yellow}${s.file}:${s.line}${C.reset}  ${C.bold}${s.name}${C.reset} ${C.dim}— ${allowByName.get(s.name)?.reason ?? ""}${C.reset}`,
      );
    }
    const goneNames = allow.filter((a) => !behaviour.some((s) => s.name === a.name));
    if (goneNames.length > 0) {
      console.log(
        `\n${C.green}${goneNames.length} allowlisted toggle(s) are GONE from the tree${C.reset} ${C.dim}— the ratchet moved. Run --write to lock it in.${C.reset}`,
      );
      for (const a of goneNames) console.log(`  ${C.dim}${a.name}${C.reset}`);
    }
  }

  if (all) {
    console.log(`\n${C.bold}Every boolean-shaped env read, with its class:${C.reset}`);
    for (const s of [...sites].sort((a, b) => a.klass.localeCompare(b.klass) || a.name.localeCompare(b.name))) {
      const color = s.klass === "BEHAVIOUR" ? C.red : C.dim;
      console.log(`  ${color}${s.klass.padEnd(9)}${C.reset} ${s.name}  ${C.dim}${s.file}:${s.line}${C.reset}`);
    }
  }

  console.log("");
  process.exit(fresh.length > 0 ? 1 : 0);
}

main();
