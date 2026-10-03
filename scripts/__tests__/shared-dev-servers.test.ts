/**
 * ONE dev server, ever (Arman, 2026-09-24; reaffirmed 2026-09-30 when a second "clone" server on
 * port 3002 helped stall the Mac). It runs on the live database (Arman, 2026-10-03). Three guards
 * enforce it, and each is proven here to still refuse a second server:
 *
 *   1. next.config.js  — `sharedDevServerRefusal` (scripts/agent-harness/shared-dev-servers.cjs)
 *   2. the PreToolUse hook — scripts/agent-harness/matrx-preview-ports.sh guard / guard-bash
 *   3. the launcher — scripts/agent-dev-server.sh (mode switch on idle, refusal when busy)
 *
 * No server is started; the hook is fed the exact JSON Claude Code sends it.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

type Other = { pid: number; why: string };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const table = require("../agent-harness/shared-dev-servers.cjs") as {
  ONE_DEV_SERVER: { port: number; token: string; stateStem: string; defaultMode: string; distDirs: Record<string, string> };
  isNextDevRoot: (command: string) => boolean;
  sharedDevServerRefusal: (input: { env: Record<string, string | undefined>; argv: string[]; others?: Other[] }) => string | null;
};

const ROOT = resolve(__dirname, "..", "..");
const HARNESS = resolve(ROOT, "scripts", "agent-harness");
const HOOK = resolve(HARNESS, "matrx-preview-ports.sh");
const LAUNCHER = resolve(ROOT, "scripts", "agent-dev-server.sh");

const LIVE_ENV = { MATRX_SHARED_PREVIEW: "1", MATRX_PREVIEW_MODE: "live", NEXT_DISTDIR: ".next-preview" };
const NEXT_ARGV = (port: number) => ["node", "next", "dev", "-p", String(port)];
// The start-server child that loads next.config.js: no -p, Next has set PORT to the bound port.
const CHILD = { argv: ["node", "next-server"] };

function sharedShell(script: string, input = ""): string {
  return execFileSync("bash", ["-c", `source ${JSON.stringify(resolve(HARNESS, "shared-servers.sh"))}; ${script}`], {
    input,
    encoding: "utf8",
  }).trim();
}

function hook(sub: "guard" | "guard-bash" | "label", stdin: string): string {
  return execFileSync("bash", [HOOK, sub], { input: stdin, encoding: "utf8" }).trim();
}

function decision(out: string): string | null {
  return out ? (JSON.parse(out).hookSpecificOutput.permissionDecision as string) : null;
}

describe("guard 1 — next.config.js boots only THE one server, on 3001", () => {
  const refuse = table.sharedDevServerRefusal;

  it("the live server boots on 3001", () => {
    expect(refuse({ env: LIVE_ENV, argv: NEXT_ARGV(3001) })).toBeNull();
    expect(refuse({ env: { ...LIVE_ENV, PORT: "3001" }, argv: CHILD.argv })).toBeNull();
  });

  it("any port but 3001 is refused — on argv, on the bound PORT, or when no port is known", () => {
    for (const port of [3000, 3002, 3003, 4000]) {
      expect(refuse({ env: LIVE_ENV, argv: NEXT_ARGV(port) })).toMatch(/runs on port 3001, not/);
      expect(refuse({ env: { ...LIVE_ENV, PORT: String(port) }, argv: CHILD.argv })).toMatch(/runs on port 3001, not/);
    }
    expect(refuse({ env: LIVE_ENV, argv: ["next", "dev", "--port=3002"] })).toMatch(/not 3002/);
    expect(refuse({ env: LIVE_ENV, argv: CHILD.argv })).toMatch(/no port given/);
    expect(refuse({ env: { ...LIVE_ENV, PORT: "3002" }, argv: NEXT_ARGV(3001) })).toMatch(/disagree/);
  });

  it("a SECOND concurrent server is refused even with the valid token, port and mode", () => {
    const others = [{ pid: 4242, why: "the managed preview lease" }];
    expect(refuse({ env: LIVE_ENV, argv: NEXT_ARGV(3001), others })).toMatch(/SECOND dev server: pid 4242/);
    expect(refuse({ env: LIVE_ENV, argv: NEXT_ARGV(3001), others })).toMatch(/SECOND dev server/);
  });

  it("no token, an old second-server token, a wrong dist dir or an unknown mode is refused", () => {
    expect(refuse({ env: {}, argv: NEXT_ARGV(3001) })).toMatch(/not started by `pnpm preview:start`/);
    expect(refuse({ env: { ...LIVE_ENV, MATRX_SHARED_PREVIEW: "clone" }, argv: NEXT_ARGV(3001) })).toMatch(/not started by/);
    expect(refuse({ env: { ...LIVE_ENV, NEXT_DISTDIR: ".next-agent-1" }, argv: NEXT_ARGV(3001) })).toMatch(/builds into/);
    expect(refuse({ env: { ...LIVE_ENV, NEXT_DISTDIR: ".next-preview-clone" }, argv: NEXT_ARGV(3001) })).toMatch(/builds into/);
    expect(refuse({ env: { ...LIVE_ENV, MATRX_PREVIEW_MODE: undefined }, argv: NEXT_ARGV(3001) })).toMatch(/not live/);
    expect(refuse({ env: { ...LIVE_ENV, MATRX_PREVIEW_MODE: "clone" }, argv: NEXT_ARGV(3001) })).toMatch(/not live/);
  });

  it("only the argv shape of a next dev root counts as a running server", () => {
    expect(table.isNextDevRoot("/opt/homebrew/bin/node /r/node_modules/next/dist/bin/next dev -p 3001")).toBe(true);
    expect(table.isNextDevRoot("node /r/node_modules/.bin/next dev")).toBe(true);
    expect(table.isNextDevRoot("grep -E next dev")).toBe(false);
    expect(table.isNextDevRoot("next-server (v16.4.0)")).toBe(false);
    expect(table.isNextDevRoot("node /r/node_modules/next/dist/bin/next build")).toBe(false);
  });

  it("next.config.js actually calls the rule, with the running servers, for the dev phase", () => {
    const config = readFileSync(resolve(ROOT, "next.config.js"), "utf8");
    expect(config).toContain('require("./scripts/agent-harness/shared-dev-servers.cjs")');
    expect(config).toMatch(/sharedDevServerRefusal\(\{ env: process\.env, argv: process\.argv, others: otherDevServers\(\) \}\)/);
    expect(config).toMatch(/module\.exports = \(phase\) => \{\s*assertSharedDevServer\(phase\);/);
  });

  it("the bash table and the JS table agree", () => {
    const js = table.ONE_DEV_SERVER;
    expect(sharedShell("echo $SHARED_SERVER_PORT")).toBe(String(js.port));
    expect(sharedShell("echo $SHARED_SERVER_TOKEN")).toBe(js.token);
    expect(sharedShell("echo $SHARED_SERVER_STATE_STEM")).toBe(js.stateStem);
    expect(sharedShell("echo $SHARED_SERVER_DEFAULT_MODE")).toBe(js.defaultMode);
    expect(js.defaultMode).toBe("live");
    expect(sharedShell("shared_server_distdir live")).toBe(js.distDirs.live);
    expect(Object.keys(js.distDirs)).toEqual(["live"]);
    // One label under .localhost — aidream's CORS admits exactly one; no per-mode host.
    expect(sharedShell("shared_server_host s1")).toBe("s1.localhost");
  });
});

describe("guard 2 — the PreToolUse hook refuses every raw launch, including a third server", () => {
  const bash = (command: string) => JSON.stringify({ tool_name: "Bash", tool_input: { command } });

  it.each(["pnpm dev", "next dev -p 3003", "npm run dev", "cd x && NEXT_DISTDIR=.next-agent-z next dev --port 3009"])(
    "denies %s",
    (command) => {
      const out = hook("guard-bash", bash(command));
      expect(decision(out)).toBe("deny");
      expect(out).toContain("pnpm preview:start --live");
    },
  );

  it("allows the one launcher in either mode", () => {
    expect(hook("guard-bash", bash("pnpm preview:start --live"))).toBe("");
    expect(hook("guard-bash", bash("pnpm preview:start"))).toBe("");
  });

  it("denies a named preview_start server", () => {
    const out = hook("guard", JSON.stringify({ tool_name: "preview_start", tool_input: { name: "frontend-3003" } }));
    expect(decision(out)).toBe("deny");
  });

  it("labels the one server (either mode's dist dir) and everything else as another server", () => {
    expect(hook("label", "123 node /r/node_modules/next ... /r/.next-preview-clone/dev/x")).toBe("agent-preview");
    expect(hook("label", "123 node /r/.next-preview/dev/server.js")).toBe("agent-preview");
    expect(hook("label", "123 node /r/.next-preview")).toBe("agent-preview");
    expect(hook("label", "123 node /r/.next/dev/server.js next dev")).toBe("human-or-other");
    expect(hook("label", "123 node /r/.next-agent-7/dev/server.js")).toBe("human-or-other");
  });
});

describe("guard 3 — the launcher switches an idle server's mode and never starts a second", () => {
  // A stand-in for a running server: a real process, so `alive` and `kill` act on it.
  function fakeServer(): number {
    const child = spawnSync("bash", ["-c", "sleep 300 >/dev/null 2>&1 & echo $!"], { encoding: "utf8" });
    return Number(child.stdout.trim());
  }
  function isAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
  function run(mode: string, usedAgoSec: number) {
    const dir = mkdtempSync(join(tmpdir(), "one-dev-server-"));
    const pid = fakeServer();
    writeFileSync(
      join(dir, "shared-next-dev.meta"),
      `PORT=3001\nPID=${pid}\nDISTDIR=.next-preview\nROOT=${ROOT}\nOWNER_SESSION=peer\nMODE=live\n`,
    );
    writeFileSync(join(dir, "shared-next-dev.used"), `${Math.floor(Date.now() / 1000) - usedAgoSec}\n`);
    const res = spawnSync("bash", ["-c", `source ${JSON.stringify(LAUNCHER)} start ${mode}; switch_mode_if_idle; echo rc=$?`], {
      env: { ...process.env, MATRX_PREVIEW_STATE_DIR: dir, MATRX_PREVIEW_SESSION: "s1" },
      encoding: "utf8",
    });
    const out = `${res.stdout}${res.stderr}`;
    const result = { out, alive: isAlive(pid) };
    if (result.alive) process.kill(pid, "SIGKILL");
    rmSync(dir, { recursive: true, force: true });
    return result;
  }

  it("--clone is refused and never touches the running server", () => {
    const r = run("--clone", 6 * 60);
    expect(r.alive).toBe(true);
    expect(r.out).toMatch(/--clone is gone/);
  });

  it("the same mode, or no mode flag, never stops a running server", () => {
    expect(run("--live", 6 * 60).alive).toBe(true);
    expect(run("", 6 * 60).alive).toBe(true);
  });
});
