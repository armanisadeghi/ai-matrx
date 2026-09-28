// scripts/agent-harness/shared-dev-servers.cjs — the TWO named shared dev servers, and the
// refusal next.config.js raises for anything else.
//
// ONE DEV SERVER MACHINE-WIDE (Arman, 2026-09-24): every lane that booted its own `next dev`
// brought 70-130 Turbopack workers and 15-25 GB, and the Mac rebooted twice. On 2026-09-27 he
// allowed exactly ONE more: the clone preview, pointed only at the nightly copy of production,
// so agents over the live-database walk cap work there. So there are two NAMED servers and no
// third, ever:
//
//   live  — `pnpm preview:start`          port 3001, dist .next-preview        live database
//   clone — `pnpm preview:start --clone`  port 3002, dist .next-preview-clone  the clone only
//
// `scripts/agent-dev-server.sh` is the only launcher; it sets MATRX_SHARED_PREVIEW to the
// server's token. The bash twin of this table is scripts/agent-harness/shared-servers.sh;
// scripts/__tests__/shared-dev-servers.test.ts pins that the two agree.

const SHARED_DEV_SERVERS = Object.freeze({
  live: Object.freeze({ token: "1", port: 3001, distDir: ".next-preview" }),
  clone: Object.freeze({ token: "clone", port: 3002, distDir: ".next-preview-clone" }),
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
  "  There are exactly TWO dev servers on this machine, both started by the shared launcher:\n" +
  "    pnpm preview:start          live database, port 3001, http://<your-session>.localhost:3001\n" +
  "    pnpm preview:start --clone  the clone only, port 3002, http://<your-session>-clone.localhost:3002\n" +
  "  Everyone shares them; restart with `pnpm preview:stop [--clone] && pnpm preview:start [--clone]`.\n" +
  "  Why: extra dev servers exhausted memory and rebooted the Mac twice (2026-09-23/24).";

/**
 * Null when this `next dev` is one of the two named servers, launched the way the launcher
 * launches it; otherwise the sentence to throw. Pure: env and argv are arguments.
 */
function sharedDevServerRefusal({ env, argv }) {
  const token = env.MATRX_SHARED_PREVIEW;
  const entry = Object.entries(SHARED_DEV_SERVERS).find(([, s]) => s.token === token);
  if (!entry) {
    return "[one-dev-server] Refusing to start a third / per-agent Next.js dev server.\n" + HOW;
  }
  const [name, server] = entry;
  const port = portFromArgv(argv);
  if (port !== null && port !== server.port) {
    return (
      `[one-dev-server] Refusing: the ${name} server runs on port ${server.port}, not ${port}. ` +
      "A dev server on any other port is a third server.\n" + HOW
    );
  }
  if (env.NEXT_DISTDIR !== server.distDir) {
    return (
      `[one-dev-server] Refusing: the ${name} server builds into ${server.distDir}, not ` +
      `${env.NEXT_DISTDIR || "(unset)"}.\n` + HOW
    );
  }
  if (name === "clone") {
    // Arman's pairing condition: a clone page must never read one database and call a
    // server that writes another. The launcher sets MATRX_CLONE_PAIRED only after the local
    // clone-wired aidream answered /health/database-identity with this ref.
    const ref = env.MATRX_CLONE_PAIRED || "";
    const supabaseHost = hostOf(env.NEXT_PUBLIC_SUPABASE_URL);
    if (!/^[a-z0-9]{20}$/.test(ref) || supabaseHost !== `${ref}.supabase.co`) {
      return (
        "[one-dev-server] Refusing an UNPAIRED clone preview: NEXT_PUBLIC_SUPABASE_URL is " +
        `'${supabaseHost || "(unset)"}' and MATRX_CLONE_PAIRED is '${ref || "(unset)"}'. ` +
        "Only `pnpm preview:start --clone` may start it, after proving the local aidream on " +
        "port 8200 is wired to the same clone.\n" + HOW
      );
    }
  }
  if (name === "live" && env.MATRX_CLONE_PAIRED) {
    return (
      "[one-dev-server] Refusing: the live server (port 3001) was handed a clone Supabase URL " +
      "(MATRX_CLONE_PAIRED is set). The clone runs only as `pnpm preview:start --clone`.\n" + HOW
    );
  }
  return null;
}

module.exports = {
  SHARED_DEV_SERVERS,
  portFromArgv,
  sharedDevServerRefusal,
};
