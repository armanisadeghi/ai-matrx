/**
 * THE ONE RESOLVER FOR THE `psql` BINARY.
 *
 * WHY THIS EXISTS. On 2026-09-17 an adversarial read of the unified-data campaign
 * (ATTACK-9, finding 5) measured this machine and found `command -v psql` empty
 * while three usable binaries sat on disk:
 *
 *     /opt/homebrew/Cellar/libpq/18.6/bin/psql          (keg-only, never linked)
 *     /opt/homebrew/opt/postgresql@16/bin/psql
 *     /opt/homebrew/opt/postgresql@17/bin/psql
 *
 * Homebrew's `libpq` is keg-only by design — it deliberately does not link into
 * PATH because it would shadow the server formulae's client. So "psql is not
 * installed" and "psql is not on PATH" are different facts, and every script that
 * shells out to a bare `psql` conflates them: it reports the machine as unequipped
 * when the binary is one absolute path away. That is a silent stand-in with no
 * remedy (law 4), and it is the kind of thing that stalls an unattended lane at
 * 3 a.m. over nothing.
 *
 * THE RULE: no script in this repo shells out to a bare `psql`. It resolves the
 * absolute path through `resolvePsql()` and runs THAT. Never edit a shell profile
 * to fix this — a PATH that only exists in one human's interactive zsh is not a
 * fact any agent, hook, CI job or launchd agent can rely on.
 *
 * RESOLUTION ORDER (first hit wins, each one verified executable before it is
 * returned — an entry that names a path that is gone falls through rather than
 * being handed back to fail later with a confusing ENOENT):
 *
 *   1. $PSQL                      — the explicit override, always wins
 *   2. $(brew --prefix libpq)/bin/psql
 *   3. $(brew --prefix)/opt/postgresql@<N>/bin/psql, highest N first
 *   4. PATH
 *
 * Prove it: `pnpm check:psql` prints the resolved absolute path and its version.
 */

import { accessSync, constants, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

export type PsqlSource =
    | "PSQL env var"
    | "brew libpq"
    | "brew postgresql@N"
    | "PATH";

export interface ResolvedPsql {
    /** Absolute path to the psql binary. */
    path: string;
    /** Which rung of the ladder answered. */
    source: PsqlSource;
}

/** The remedy string every failure carries. Exported so callers print the same words. */
export const PSQL_REMEDY = [
    "psql was not found anywhere this machine looks.",
    "",
    "  Remedy, cheapest first:",
    "    1. export PSQL=/absolute/path/to/psql     (works immediately, no install)",
    "    2. brew install libpq                     (keg-only; this resolver finds it",
    "                                               WITHOUT `brew link`, so do not link it)",
    "    3. brew install postgresql@17",
    "",
    "  Do NOT fix this by editing a shell profile: a PATH that exists only in one",
    "  interactive shell is invisible to agents, hooks, CI and launchd. Resolution",
    "  order and rationale: scripts/lib/psql-path.ts",
].join("\n");

function isExecutable(candidate: string): boolean {
    try {
        accessSync(candidate, constants.X_OK);
        return true;
    } catch {
        return false;
    }
}

function brewPrefix(formula?: string): string | null {
    try {
        const args = formula ? ["--prefix", formula] : ["--prefix"];
        const out = execFileSync("brew", args, {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        return out.length > 0 ? out : null;
    } catch {
        // brew absent, or the formula is not installed. Both are ordinary.
        return null;
    }
}

function fromPath(): string | null {
    const raw = process.env.PATH ?? "";
    for (const dir of raw.split(":")) {
        if (!dir) continue;
        const candidate = join(dir, "psql");
        if (isExecutable(candidate)) return candidate;
    }
    return null;
}

/**
 * Every postgresql@N keg Homebrew knows about, newest major first.
 * `brew --prefix postgresql@17` only answers for a formula that is installed, and
 * we do not know N in advance, so the opt directory is listed instead.
 */
function brewPostgresKegs(): string[] {
    const prefix = brewPrefix();
    if (!prefix) return [];
    const optDir = join(prefix, "opt");
    let entries: string[];
    try {
        entries = readdirSync(optDir);
    } catch {
        return [];
    }
    return entries
        .filter((name) => /^postgresql@\d+(\.\d+)?$/.test(name))
        .sort((a, b) => {
            const major = (n: string) => Number(n.split("@")[1].split(".")[0]);
            return major(b) - major(a);
        })
        .map((name) => join(optDir, name, "bin", "psql"));
}

/**
 * Resolve psql, or return null. Callers that must have it use `requirePsql()`.
 */
export function resolvePsql(): ResolvedPsql | null {
    const override = process.env.PSQL?.trim();
    if (override && isExecutable(override)) {
        return { path: override, source: "PSQL env var" };
    }

    const libpq = brewPrefix("libpq");
    if (libpq) {
        const candidate = join(libpq, "bin", "psql");
        if (isExecutable(candidate)) return { path: candidate, source: "brew libpq" };
    }

    for (const candidate of brewPostgresKegs()) {
        if (isExecutable(candidate)) {
            return { path: candidate, source: "brew postgresql@N" };
        }
    }

    const onPath = fromPath();
    if (onPath) return { path: onPath, source: "PATH" };

    return null;
}

/** Resolve psql or throw with the named remedy. */
export function requirePsql(): ResolvedPsql {
    const found = resolvePsql();
    if (!found) throw new Error(PSQL_REMEDY);
    return found;
}

/** `psql --version`, for the check to print. Never touches a database. */
export function psqlVersion(binary: string): string {
    return execFileSync(binary, ["--version"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    }).trim();
}

// ---------------------------------------------------------------------------
// CLI. Two modes:
//   --print   absolute path on stdout, nothing else (this is what shell scripts
//             consume: PSQL_BIN="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)")
//   (default) the human/CI report behind `pnpm check:psql`
// ---------------------------------------------------------------------------
const invokedDirectly =
    process.argv[1] !== undefined &&
    /psql-path\.(ts|mts|js|mjs)$/.test(process.argv[1]);

if (invokedDirectly) {
    const printOnly = process.argv.includes("--print");
    const found = resolvePsql();

    if (!found) {
        console.error(printOnly ? PSQL_REMEDY : `  ✗ ${PSQL_REMEDY}`);
        process.exit(1);
    }

    if (printOnly) {
        process.stdout.write(`${found.path}\n`);
    } else {
        let version: string;
        try {
            version = psqlVersion(found.path);
        } catch (error) {
            console.error(
                `  ✗ resolved psql at ${found.path} (via ${found.source}) but it would not run:\n` +
                    `    ${error instanceof Error ? error.message : String(error)}\n\n` +
                    PSQL_REMEDY,
            );
            process.exit(1);
        }
        console.log(`  ✓ psql  ${found.path}`);
        console.log(`    via   ${found.source}`);
        console.log(`    ${version}`);
    }
    process.exit(0);
}
