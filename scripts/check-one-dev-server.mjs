#!/usr/bin/env node
// check-one-dev-server.mjs — ONE Next.js dev server on this machine, on port 3001, ever.
//
// Arman, 2026-09-24 (one server after extra dev servers rebooted the Mac twice) and 2026-09-30
// (a second "clone" server on another port, added 2026-09-27, stalled the Mac again; the
// database became a MODE of the one server). This check fails when the launcher, next.config.js,
// the hook guard or the server table define or allow any dev port other than 3001 or a second
// server slot — statically (ports, slot markers) and behaviorally (it loads the real refusal
// rule and asks it about every other port and about a second concurrent server).
//
//   node scripts/check-one-dev-server.mjs                # check this checkout
//   node scripts/check-one-dev-server.mjs --root <dir>   # check another tree (same layout)
//   node scripts/check-one-dev-server.mjs --self-test    # RED on the two-server commit and on
//                                                        # planted mutants, GREEN on this tree

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3001;
// The commit that made the dev server two (live :3001 + clone :3002). The self-test proves this
// check is RED against it.
const TWO_SERVER_COMMIT = "a5daef427e";

const FILES = Object.freeze({
  launcher: "scripts/agent-dev-server.sh",
  config: "next.config.js",
  hook: "scripts/agent-harness/matrx-preview-ports.sh",
  table: "scripts/agent-harness/shared-dev-servers.cjs",
  bashTable: "scripts/agent-harness/shared-servers.sh",
});

// Words that only exist when there is a second server slot.
const SECOND_SLOT_MARKERS = [
  "shared-next-dev-clone",
  "agent-preview-clone",
  "-clone.localhost",
  "slot_occupants",
  "TWO_SERVERS",
  "select_server",
  "SHARED_DEV_SERVERS",
];

const OTHER_PORTS = [3000, 3002, 3003, 3004, 3005, 3010, 4000, 8080];

function staticFindings(root) {
  const findings = [];
  for (const rel of Object.values(FILES)) {
    const path = join(root, rel);
    if (!existsSync(path)) {
      findings.push(`${rel}: missing`);
      continue;
    }
    readFileSync(path, "utf8")
      .split("\n")
      .forEach((line, i) => {
        for (const m of line.matchAll(/\b3\d{3}\b/g)) {
          if (Number(m[0]) !== PORT) findings.push(`${rel}:${i + 1}: names dev port ${m[0]} — the one server is on ${PORT}`);
        }
        for (const m of line.matchAll(/(?:\s-p\s+|--port[= ]\s*|\bPORT=)(\d{2,5})\b/g)) {
          if (Number(m[1]) !== PORT && !/^3\d{3}$/.test(m[1])) findings.push(`${rel}:${i + 1}: names dev port ${m[1]}`);
        }
        for (const marker of SECOND_SLOT_MARKERS) {
          if (line.includes(marker)) findings.push(`${rel}:${i + 1}: '${marker}' — a second server slot`);
        }
      });
  }
  const config = existsSync(join(root, FILES.config)) ? readFileSync(join(root, FILES.config), "utf8") : "";
  if (!/sharedDevServerRefusal\(\{[^}]*\bothers:\s*otherDevServers\(\)/.test(config)) {
    findings.push(`${FILES.config}: does not pass the running dev servers (others: otherDevServers()) to the refusal — a second server with a valid token would boot`);
  }
  return findings;
}

/**
 * Every env the table's own entries could hand a dev server: tokens x dist dirs x modes x pairing.
 * Clone mode is gone (the one server runs on live, owner ruling 2026-10-03); "clone" and a paired
 * clone URL stay here as ADVERSARIAL probes only — a table that admits them again reads RED, and
 * the RED-on-history leg (the two-server commit served :3002 in clone mode) needs them to fail.
 */
function candidateEnvs(mod) {
  const servers = [];
  if (mod.ONE_DEV_SERVER) {
    const s = mod.ONE_DEV_SERVER;
    for (const distDir of Object.values(s.distDirs || {})) servers.push({ token: s.token, distDir });
  }
  for (const s of Object.values(mod.SHARED_DEV_SERVERS || {})) servers.push({ token: s.token, distDir: s.distDir });
  const ref = "abcdefghijklmnopqrst";
  const envs = [];
  for (const { token, distDir } of servers) {
    for (const mode of ["clone", "live", undefined]) {
      for (const paired of [true, false]) {
        envs.push({
          MATRX_SHARED_PREVIEW: token,
          NEXT_DISTDIR: distDir,
          ...(mode ? { MATRX_PREVIEW_MODE: mode } : {}),
          ...(paired ? { MATRX_CLONE_PAIRED: ref, NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co` } : {}),
        });
      }
    }
  }
  return envs;
}

function behaviorFindings(root) {
  const findings = [];
  const path = join(root, FILES.table);
  if (!existsSync(path)) return [`${FILES.table}: missing`];
  let mod;
  try {
    mod = createRequire(import.meta.url)(path);
  } catch (error) {
    return [`${FILES.table}: does not load (${error instanceof Error ? error.message : error})`];
  }
  const refuse = mod.sharedDevServerRefusal;
  if (typeof refuse !== "function") return [`${FILES.table}: exports no sharedDevServerRefusal`];
  const envs = candidateEnvs(mod);
  if (envs.length === 0) return [`${FILES.table}: exports no server table`];

  const argv = (port) => ["node", "next", "dev", "-p", String(port)];
  const bootable = envs.filter((env) => refuse({ env, argv: argv(PORT) }) === null);
  if (bootable.length === 0) findings.push(`${FILES.table}: refuses every launch on ${PORT} — the one server could never start`);
  for (const env of envs) {
    for (const port of OTHER_PORTS) {
      if (refuse({ env, argv: argv(port) }) === null) {
        findings.push(`${FILES.table}: ALLOWS a dev server on port ${port} (token '${env.MATRX_SHARED_PREVIEW}', dist ${env.NEXT_DISTDIR})`);
      }
    }
  }
  for (const env of bootable) {
    if (refuse({ env, argv: argv(PORT), others: [{ pid: 4242, why: "the managed preview lease" }] }) === null) {
      findings.push(`${FILES.table}: ALLOWS a SECOND concurrent dev server with a valid token (token '${env.MATRX_SHARED_PREVIEW}', dist ${env.NEXT_DISTDIR})`);
    }
  }
  return [...new Set(findings)];
}

export function checkOneDevServer(root) {
  return [...staticFindings(root), ...behaviorFindings(root)];
}

function report(root, findings) {
  if (findings.length === 0) {
    console.log(`check:one-dev-server OK — one dev server, port ${PORT}, one slot (${root})`);
    return 0;
  }
  console.error(`check:one-dev-server FAILED — ${findings.length} finding(s) in ${root}:`);
  for (const f of findings) console.error(`  - ${f}`);
  console.error(`Remedy: there is ONE dev server on port ${PORT}; its database is a mode (pnpm preview:start [--live]). Never add a second port or slot.`);
  return 1;
}

/** Copy the five files of `fromRoot` (or of a git revision) into a fresh temp tree. */
function materialize({ fromRoot, revision }) {
  const dir = mkdtempSync(join(tmpdir(), "one-dev-server-"));
  for (const rel of Object.values(FILES)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    if (revision) {
      writeFileSync(join(dir, rel), execFileSync("git", ["show", `${revision}:${rel}`], { cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024 }));
    } else {
      cpSync(join(fromRoot, rel), join(dir, rel));
    }
  }
  return dir;
}

function mutate(dir, rel, from, to) {
  const path = join(dir, rel);
  const text = readFileSync(path, "utf8");
  if (!text.includes(from)) throw new Error(`self-test mutant anchor missing in ${rel}: ${from}`);
  writeFileSync(path, text.replace(from, to));
}

function selfTest() {
  let failures = 0;
  const expect = (label, ok, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `\n        ${detail}` : ""}`);
    if (!ok) failures += 1;
  };

  const green = checkOneDevServer(REPO_ROOT);
  expect("GREEN: this checkout has one dev server on 3001 and one slot", green.length === 0, green.join("\n        "));

  let haveCommit = true;
  try {
    execFileSync("git", ["cat-file", "-e", `${TWO_SERVER_COMMIT}^{commit}`], { cwd: REPO_ROOT, stdio: "ignore" });
  } catch {
    haveCommit = false;
    console.log(`UNMEASURED  ${TWO_SERVER_COMMIT} is not in this clone (shallow?) — the RED-on-history leg did not run; the planted mutants below still prove RED`);
  }
  const old = haveCommit ? materialize({ revision: TWO_SERVER_COMMIT }) : null;
  if (old) try {
    const red = checkOneDevServer(old);
    expect(
      `RED: the two-server commit ${TWO_SERVER_COMMIT} (live :3001 + clone :3002) is refused`,
      red.some((f) => /ALLOWS a dev server on port 3002/.test(f)) &&
        red.some((f) => /SECOND concurrent/.test(f)) &&
        red.some((f) => /names dev port 3002/.test(f)),
      red.slice(0, 6).join("\n        "),
    );
  } finally {
    rmSync(old, { recursive: true, force: true });
  }

  const mutants = [
    ["a second port in the launcher", FILES.launcher, 'PORT="$SHARED_SERVER_PORT"', 'PORT="${PREVIEW_PORT:-3002}"', /names dev port 3002/],
    ["a second state slot in the hook", FILES.hook, 'shared-next-dev.meta"', 'shared-next-dev-clone.meta"', /second server slot/],
    ["the table allowing another port", FILES.table, "if (port !== ONE_DEV_SERVER.port) {", "if (port !== ONE_DEV_SERVER.port && port < 3000) {", /ALLOWS a dev server on port/],
    ["the table ignoring a running server", FILES.table, "if (Array.isArray(others) && others.length > 0) {", "if (false) {", /SECOND concurrent/],
    ["next.config.js not passing the running servers", FILES.config, ", others: otherDevServers() })", " })", /does not pass the running dev servers/],
  ];
  for (const [label, rel, from, to, want] of mutants) {
    const dir = materialize({ fromRoot: REPO_ROOT });
    try {
      mutate(dir, rel, from, to);
      const found = checkOneDevServer(dir);
      expect(`RED: planted mutant — ${label}`, found.some((f) => want.test(f)), found.slice(0, 3).join("\n        "));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  console.log(failures ? `check:one-dev-server self-test FAILED (${failures})` : "check:one-dev-server self-test passed");
  return failures ? 1 : 0;
}

const args = process.argv.slice(2);
if (args.includes("--self-test")) {
  process.exit(selfTest());
} else {
  const i = args.indexOf("--root");
  const root = i >= 0 ? resolve(args[i + 1]) : REPO_ROOT;
  process.exit(report(root, checkOneDevServer(root)));
}
