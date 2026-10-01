// scripts/agent-harness/shared-dev-servers.cjs — THE one shared dev server, and the refusal
// next.config.js raises for anything else.
//
// ONE DEV SERVER MACHINE-WIDE (Arman, 2026-09-24): every lane that booted its own `next dev`
// brought 70-130 Turbopack workers and 15-25 GB, and the Mac rebooted twice. A second "clone"
// server on another port (2026-09-27) ran beside it until 2026-09-30, when the two together held
// ~41 GB and ~75 workers and stalled the 256 GB Mac again. Ruling (Arman, 2026-09-30): ONE
// server, on port 3001, whose DATABASE is a mode:
//
//   pnpm preview:start          clone mode (default)  dist .next-preview-clone  the nightly clone
//   pnpm preview:start --live   live mode             dist .next-preview        production
//
// `scripts/agent-dev-server.sh` is the only launcher; it sets MATRX_SHARED_PREVIEW to the token
// and MATRX_PREVIEW_MODE to the mode. The bash twin of this table is
// scripts/agent-harness/shared-servers.sh; scripts/__tests__/shared-dev-servers.test.ts pins
// that the two agree, and `pnpm check:one-dev-server` fails on any second port or slot.

"use strict";

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ONE_DEV_SERVER = Object.freeze({
  port: 3001,
  token: "1",
  stateStem: "shared-next-dev",
  defaultMode: "clone",
  // NEXT_PUBLIC_* are inlined at compile time, so each mode compiles into its own dir: a mode
  // switch never serves the other database's bundles. Only ONE process ever runs.
  distDirs: Object.freeze({ clone: ".next-preview-clone", live: ".next-preview" }),
});

/** The -p / --port / --port= value on a `next dev` command line, or null. */
function portFromArgv(argv) {
  const args = Array.isArray(argv) ? argv : [];
  for (let i = 0; i < args.length; i += 1) {
    const a = String(args[i]);
    if (a === "-p" || a === "--port") return Number(args[i + 1]);
    if (a.startsWith("--port=")) return Number(a.slice("--port=".length));
  }
  return null;
}

function hostOf(url) {
  try {
    return new URL(String(url)).host;
  } catch {
    return "";
  }
}

const HOW =
  "  There is exactly ONE dev server on this machine, on port 3001, started by the shared launcher:\n" +
  "    pnpm preview:start          clone database (default)  http://<your-session>.localhost:3001\n" +
  "    pnpm preview:start --live   live database\n" +
  "  Everyone shares it; `pnpm preview:status` shows its mode. Restart: `pnpm preview:stop && pnpm preview:start`.\n" +
  "  Why: extra dev servers exhausted memory and stalled or rebooted the Mac (2026-09-23/24, 2026-09-30).";

/**
 * Null when this `next dev` is THE one server, launched the way the launcher launches it, with
 * no other dev server running; otherwise the sentence to throw. Pure: env, argv and the other
 * running servers are arguments.
 *
 * `others` — dev servers already running that are not this process's own group
 * (otherDevServers() below). A second server is refused even with a valid token.
 *
 * The port: the CLI process carries `-p`; the start-server child that loads this config does
 * not, but Next sets process.env.PORT to the port it actually bound before loading the config.
 */
function sharedDevServerRefusal({ env, argv, others = [] }) {
  if (env.MATRX_SHARED_PREVIEW !== ONE_DEV_SERVER.token) {
    return "[one-dev-server] Refusing a Next.js dev server not started by `pnpm preview:start`.\n" + HOW;
  }
  const argvPort = portFromArgv(argv);
  const envPort = env.PORT ? Number(env.PORT) : null;
  if (argvPort !== null && envPort !== null && argvPort !== envPort) {
    return `[one-dev-server] Refusing: -p ${argvPort} and PORT=${envPort} disagree. The one server runs on port ${ONE_DEV_SERVER.port}.\n` + HOW;
  }
  const port = argvPort ?? envPort;
  if (port !== ONE_DEV_SERVER.port) {
    return (
      `[one-dev-server] Refusing: the one dev server runs on port ${ONE_DEV_SERVER.port}, not ` +
      `${port === null ? "(no port given)" : port}. A dev server on any other port is a second server.\n` + HOW
    );
  }
  if (Array.isArray(others) && others.length > 0) {
    const named = others.map((o) => `pid ${o.pid} (${o.why})`).join(", ");
    return (
      `[one-dev-server] Refusing a SECOND dev server: ${named} is already running. ` +
      "Use it at your own hostname (`pnpm preview:start` prints it); never start another.\n" + HOW
    );
  }
  const mode = env.MATRX_PREVIEW_MODE;
  const distDir = ONE_DEV_SERVER.distDirs[mode];
  if (!distDir) {
    return `[one-dev-server] Refusing: MATRX_PREVIEW_MODE is '${mode || "(unset)"}', not clone or live.\n` + HOW;
  }
  if (env.NEXT_DISTDIR !== distDir) {
    return (
      `[one-dev-server] Refusing: ${mode} mode builds into ${distDir}, not ` +
      `${env.NEXT_DISTDIR || "(unset)"}.\n` + HOW
    );
  }
  if (mode === "clone") {
    // Arman's pairing condition: a clone page must never read one database and call a
    // server that writes another. The launcher sets MATRX_CLONE_PAIRED only after the local
    // clone-wired aidream answered /health/database-identity with this ref.
    const ref = env.MATRX_CLONE_PAIRED || "";
    const supabaseHost = hostOf(env.NEXT_PUBLIC_SUPABASE_URL);
    if (!/^[a-z0-9]{20}$/.test(ref) || supabaseHost !== `${ref}.supabase.co`) {
      return (
        "[one-dev-server] Refusing an UNPAIRED clone-mode server: NEXT_PUBLIC_SUPABASE_URL is " +
        `'${supabaseHost || "(unset)"}' and MATRX_CLONE_PAIRED is '${ref || "(unset)"}'. ` +
        "Only `pnpm preview:start` may start clone mode, after proving the local aidream on " +
        "port 8200 is wired to the same clone.\n" + HOW
      );
    }
  }
  if (mode === "live" && env.MATRX_CLONE_PAIRED) {
    return (
      "[one-dev-server] Refusing: live mode was handed clone wiring (MATRX_CLONE_PAIRED is set). " +
      "Clone mode is `pnpm preview:start`; live is `pnpm preview:start --live`.\n" + HOW
    );
  }
  return null;
}

function pgidOf(pid) {
  try {
    const out = execFileSync("ps", ["-o", "pgid=", "-p", String(pid)], { encoding: "utf8" }).trim();
    return /^\d+$/.test(out) ? Number(out) : null;
  } catch {
    return null;
  }
}

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error && error.code === "EPERM";
  }
}

function stateDir(env) {
  if (env.MATRX_PREVIEW_STATE_DIR) return env.MATRX_PREVIEW_STATE_DIR;
  const uid = typeof process.getuid === "function" ? process.getuid() : os.userInfo().uid;
  return path.join(env.TMPDIR || "/tmp", `matrx-frontend-preview-${uid}`);
}

/**
 * True for the root process of a `next dev` server: `<node> <…/next> dev …`. Only the argv
 * SHAPE counts, so a shell or grep that merely mentions "next dev" is never mistaken for one.
 */
function isNextDevRoot(command) {
  const [exe, script, sub] = String(command).trim().split(/\s+/);
  return /(?:^|\/)node\d*$/.test(exe || "") && /(?:^|\/)next$/.test(script || "") && sub === "dev";
}

/**
 * Every OTHER dev server on this machine: the live lease's server when it is not this process's
 * group, and any `next dev` root process in another group. Impure (ps, the lease file); the
 * verdict on its answer is sharedDevServerRefusal's.
 */
function otherDevServers({ env = process.env, pid = process.pid } = {}) {
  const own = pgidOf(pid);
  const mine = (p) => p === pid || p === process.ppid || (own !== null && (p === own || pgidOf(p) === own));
  const found = new Map();

  let leasePid = null;
  try {
    const meta = fs.readFileSync(path.join(stateDir(env), `${ONE_DEV_SERVER.stateStem}.meta`), "utf8");
    const m = /^PID=(\d+)$/m.exec(meta);
    leasePid = m ? Number(m[1]) : null;
  } catch {
    /* no lease: nothing managed is running */
  }
  if (leasePid !== null && alive(leasePid) && !mine(leasePid)) {
    found.set(leasePid, { pid: leasePid, why: "the managed preview lease" });
  }

  let table = "";
  try {
    table = execFileSync("ps", ["-Ao", "pid=,pgid=,command="], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch {
    /* no ps: the lease check above still holds */
  }
  for (const line of table.split("\n")) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    if (!m) continue;
    const [, p, g, command] = m;
    if (!isNextDevRoot(command)) continue;
    const otherPid = Number(p);
    if (mine(otherPid) || (own !== null && Number(g) === own)) continue;
    if (!found.has(otherPid)) found.set(otherPid, { pid: otherPid, why: "a running next dev" });
  }
  return [...found.values()];
}

module.exports = {
  ONE_DEV_SERVER,
  isNextDevRoot,
  otherDevServers,
  portFromArgv,
  sharedDevServerRefusal,
};
