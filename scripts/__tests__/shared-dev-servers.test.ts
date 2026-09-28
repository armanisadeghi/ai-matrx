/**
 * TWO named dev servers, never a third (Arman, 2026-09-24 one-server rule; 2026-09-27 the
 * clone preview allowed as the one exception). Three guards enforce it, and each is proven
 * here to still refuse a third server:
 *
 *   1. next.config.js  — `sharedDevServerRefusal` (scripts/agent-harness/shared-dev-servers.cjs)
 *   2. the PreToolUse hook — scripts/agent-harness/matrx-preview-ports.sh guard / guard-bash
 *   3. the launcher's slot rule — shared_server_slot_occupants (scripts/agent-harness/shared-servers.sh)
 *
 * No server is started; the hook is fed the exact JSON Claude Code sends it.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const table = require("../agent-harness/shared-dev-servers.cjs") as {
  SHARED_DEV_SERVERS: Record<"live" | "clone", { token: string; port: number; distDir: string }>;
  sharedDevServerRefusal: (input: { env: Record<string, string | undefined>; argv: string[] }) => string | null;
};

const ROOT = resolve(__dirname, "..", "..");
const HARNESS = resolve(ROOT, "scripts", "agent-harness");
const HOOK = resolve(HARNESS, "matrx-preview-ports.sh");
const CLONE = "hykobnqyuxspbcijrodb";

const LIVE_ENV = { MATRX_SHARED_PREVIEW: "1", NEXT_DISTDIR: ".next-preview" };
const CLONE_ENV = {
  MATRX_SHARED_PREVIEW: "clone",
  NEXT_DISTDIR: ".next-preview-clone",
  MATRX_CLONE_PAIRED: CLONE,
  NEXT_PUBLIC_SUPABASE_URL: `https://${CLONE}.supabase.co`,
};
const NEXT_ARGV = (port: number) => ["node", "next", "dev", "-p", String(port)];

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

describe("guard 1 — next.config.js boots only the two named servers", () => {
  const refuse = table.sharedDevServerRefusal;

  it("the live and the paired clone server boot", () => {
    expect(refuse({ env: LIVE_ENV, argv: NEXT_ARGV(3001) })).toBeNull();
    expect(refuse({ env: CLONE_ENV, argv: NEXT_ARGV(3002) })).toBeNull();
    // A Next child process whose argv carries no port is judged on env alone.
    expect(refuse({ env: LIVE_ENV, argv: ["node", "start-server.js"] })).toBeNull();
  });

  it("a THIRD server is refused: no token, an unknown token, or a named token on another port", () => {
    expect(refuse({ env: {}, argv: NEXT_ARGV(3000) })).toMatch(/third \/ per-agent/);
    expect(refuse({ env: { MATRX_SHARED_PREVIEW: "mine", NEXT_DISTDIR: ".next-agent-x" }, argv: NEXT_ARGV(3005) })).toMatch(
      /third \/ per-agent/,
    );
    expect(refuse({ env: LIVE_ENV, argv: NEXT_ARGV(3003) })).toMatch(/runs on port 3001, not 3003/);
    expect(refuse({ env: CLONE_ENV, argv: ["next", "dev", "--port=3004"] })).toMatch(/runs on port 3002, not 3004/);
    expect(refuse({ env: { ...LIVE_ENV, NEXT_DISTDIR: ".next-agent-1" }, argv: NEXT_ARGV(3001) })).toMatch(/builds into/);
  });

  it("an UNPAIRED clone is refused, and the live server never takes clone wiring", () => {
    const { MATRX_CLONE_PAIRED: _paired, ...unpaired } = CLONE_ENV;
    expect(refuse({ env: unpaired, argv: NEXT_ARGV(3002) })).toMatch(/UNPAIRED clone/);
    expect(
      refuse({ env: { ...CLONE_ENV, NEXT_PUBLIC_SUPABASE_URL: "https://db.matrxserver.com" }, argv: NEXT_ARGV(3002) }),
    ).toMatch(/UNPAIRED clone/);
    expect(refuse({ env: { ...LIVE_ENV, MATRX_CLONE_PAIRED: CLONE }, argv: NEXT_ARGV(3001) })).toMatch(/live server/);
  });

  it("next.config.js actually calls the rule for the dev phase", () => {
    const config = readFileSync(resolve(ROOT, "next.config.js"), "utf8");
    expect(config).toContain('require("./scripts/agent-harness/shared-dev-servers.cjs")');
    expect(config).toMatch(/sharedDevServerRefusal\(\{ env: process\.env, argv: process\.argv \}\)/);
    expect(config).toMatch(/module\.exports = \(phase\) => \{\s*assertSharedDevServer\(phase\);/);
  });

  it("the bash table and the JS table agree", () => {
    for (const name of ["live", "clone"] as const) {
      const js = table.SHARED_DEV_SERVERS[name];
      expect(sharedShell(`shared_server_port ${name}`)).toBe(String(js.port));
      expect(sharedShell(`shared_server_distdir ${name}`)).toBe(js.distDir);
      expect(sharedShell(`shared_server_token ${name}`)).toBe(js.token);
    }
    expect(sharedShell("shared_server_host live s1")).toBe("s1.localhost");
    // One label under .localhost — aidream's CORS admits exactly one.
    expect(sharedShell("shared_server_host clone s1")).toBe("s1-clone.localhost");
  });
});

describe("guard 2 — the PreToolUse hook refuses every raw launch, including a third server", () => {
  const bash = (command: string) => JSON.stringify({ tool_name: "Bash", tool_input: { command } });

  it.each(["pnpm dev", "next dev -p 3003", "npm run dev", "cd x && NEXT_DISTDIR=.next-agent-z next dev --port 3009"])(
    "denies %s",
    (command) => {
      const out = hook("guard-bash", bash(command));
      expect(decision(out)).toBe("deny");
      expect(out).toContain("pnpm preview:start --clone");
    },
  );

  it("allows the two named launchers", () => {
    expect(hook("guard-bash", bash("pnpm preview:start --clone"))).toBe("");
    expect(hook("guard-bash", bash("pnpm preview:start"))).toBe("");
  });

  it("denies a named preview_start server", () => {
    const out = hook("guard", JSON.stringify({ tool_name: "preview_start", tool_input: { name: "frontend-3003" } }));
    expect(decision(out)).toBe("deny");
  });

  it("labels the two named servers apart and everything else as a third", () => {
    expect(hook("label", "123 node /r/node_modules/next ... /r/.next-preview-clone/dev/x")).toBe("agent-preview-clone");
    expect(hook("label", "123 node /r/.next-preview/dev/server.js")).toBe("agent-preview");
    expect(hook("label", "123 node /r/.next-preview")).toBe("agent-preview");
    expect(hook("label", "123 node /r/.next/dev/server.js next dev")).toBe("human-or-other");
    expect(hook("label", "123 node /r/.next-agent-7/dev/server.js")).toBe("human-or-other");
  });
});

describe("guard 3 — the launcher's slot rule", () => {
  const occupants = (server: string, lines: string[]) =>
    sharedShell(`shared_server_slot_occupants ${server}`, lines.join("\n") + "\n");

  it("each named server's slot ignores only the OTHER named server on its own port", () => {
    const both = ["111 3001 agent-preview", "222 3002 agent-preview-clone"];
    expect(occupants("live", both)).toBe("111 3001 agent-preview");
    expect(occupants("clone", both)).toBe("222 3002 agent-preview-clone");
    expect(occupants("live", ["222 3002 agent-preview-clone"])).toBe("");
    expect(occupants("clone", ["111 3001 agent-preview"])).toBe("");
  });

  it("a third server occupies BOTH slots, so neither named server starts beside it", () => {
    const third = "333 3000 human-or-other";
    expect(occupants("live", [third])).toBe(third);
    expect(occupants("clone", [third])).toBe(third);
    // A named server on a foreign port is a third server too.
    expect(occupants("live", ["444 3007 agent-preview-clone"])).toBe("444 3007 agent-preview-clone");
  });
});
