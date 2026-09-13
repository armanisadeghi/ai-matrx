#!/usr/bin/env node
// scripts/check-preview-session.mjs --self-test
//
// Forcing proof for W56: many agents, one machine, one dev server — and no
// shared cookie jar.
//
// THE INCIDENT (2026-09-12). Five agent sessions drove this app on
// http://localhost:3001 / :3000 at the same time. Cookies are scoped to a HOST
// and ignore the PORT, so all of those tabs shared ONE jar: the instant one
// session ran /api/dev-login, every other session's tab was signed in as
// somebody else. The app paused itself ("Account Changed…"), which is correct,
// and also the end of that agent's half-typed form. On top of that, all of them
// read ONE `.dev-login-nonce`, so any agent's failed navigation burned the nonce
// another agent had just minted.
//
// THE FIX under test here: one server, one hostname per session
// (`<label>.localhost`). Each case proves the property, and the cookie case
// also runs the BROKEN configuration in the same run so the probe is known to
// be able to fail.
//
// Wired as `pnpm check:preview-session`.

import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { lookup } from "node:dns/promises";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The probe server below lives in THIS process, so its curl calls must not
// block the event loop — execFileSync would deadlock the server it is calling.
const execFileAsync = promisify(execFile);

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SESSION_SH = join(REPO_ROOT, "scripts/agent-harness/preview-session.sh");
const DEV_SERVER = join(REPO_ROOT, "scripts/agent-dev-server.sh");
const ROUTE_TS = join(REPO_ROOT, "app/api/dev-login/route.ts");

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  PASS  ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error });
    console.log(`  FAIL  ${name}\n        ${String(error.message).split("\n")[0]}`);
  }
}

/** Run one of the real shell helpers with a chosen session identity. */
function sessionShell(script, env = {}) {
  return execFileSync(
    "bash",
    ["-c", `source ${JSON.stringify(SESSION_SH)}; ${script}`],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
      // A clean slate: the harness must not pick up THIS process's own session.
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR ?? "/tmp",
        ...env,
      },
    },
  ).trim();
}

console.log("\npreview session isolation — forcing self-test\n");

await check("two sessions get two different hostnames", () => {
  const a = sessionShell("preview_session_host", {
    CLAUDE_CODE_HOST_SESSION_ID: "local_f1eb9c52-cb40-49e9-b2db-e8fd48933e32",
  });
  const b = sessionShell("preview_session_host", {
    CLAUDE_CODE_HOST_SESSION_ID: "local_70c1d4ae-1111-2222-3333-444455556666",
  });
  assert.notEqual(a, b, `both sessions landed on ${a} — the shared-jar defect`);
  assert.match(a, /^[a-z][a-z0-9-]*\.localhost$/, `not a usable host: ${a}`);
  assert.match(b, /^[a-z][a-z0-9-]*\.localhost$/, `not a usable host: ${b}`);
});

await check("one session gets the SAME hostname every call", () => {
  const env = { CLAUDE_SESSION_ID: "9f2c-a-single-session" };
  const first = sessionShell("preview_session_host", env);
  const second = sessionShell("preview_session_host", env);
  // The shell is re-created between every agent tool call, so a hostname that
  // drifts would silently sign the agent out halfway through its own task.
  assert.equal(first, second);
});

await check("an operator-named session is used as written", () => {
  assert.equal(
    sessionShell("preview_session_host", { MATRX_PREVIEW_SESSION: "watson" }),
    "watson.localhost",
  );
});

await check("an unnamed session is FLAGGED, never silently shared", () => {
  const anonymous = sessionShell(
    "preview_session_is_anonymous && echo anonymous || echo named",
  );
  assert.equal(anonymous, "anonymous");
  const named = sessionShell(
    "preview_session_is_anonymous && echo anonymous || echo named",
    { CLAUDE_SESSION_ID: "x" },
  );
  assert.equal(named, "named");
});

await check("a session hostname really resolves to loopback", async () => {
  const host = sessionShell("preview_session_host", {
    MATRX_PREVIEW_SESSION: "loopbackprobe",
  });
  const { address } = await lookup(host);
  assert.ok(
    address === "127.0.0.1" || address === "::1",
    `${host} resolved to ${address}, not loopback — no /etc/hosts entry exists for it`,
  );
});

await check("the harness and the route name the SAME nonce file", () => {
  const fromShell = sessionShell('preview_nonce_file "abc.localhost"');
  assert.equal(fromShell, ".dev-login-nonce.abc.localhost");
  const route = readFileSync(ROUTE_TS, "utf8");
  // The route builds it from the request hostname; if that template ever moves,
  // the harness mints a file nothing reads and every sign-in 401s.
  assert.ok(
    route.includes("`.dev-login-nonce.${safe}`"),
    "app/api/dev-login/route.ts no longer derives the nonce file from the host",
  );
});

await check("the slot rule NAMES the owner and offers this session's URL", () => {
  // The real function, with only the two process probes stubbed: an occupant
  // serving THIS checkout is not a refusal any more — it is your own code, and
  // all you were ever missing was your own hostname on its port.
  const script = `
    set -uo pipefail
    source ${JSON.stringify(DEV_SERVER)}
    server_cwd() { printf '%s' "$REPO_ROOT"; }
    meta_value() { case "$1" in PID) echo 4242;; OWNER_SESSION) echo "peer-session-7";; esac; }
    slot_occupied 4242 3001 agent-preview
  `;
  const out = execFileSync("bash", ["-c", script], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: { ...process.env, MATRX_PREVIEW_SESSION: "mysess" },
  });
  assert.match(out, /peer-session-7/, "the refusal never named the owner session");
  assert.match(out, /pid 4242/);
  assert.match(out, /http:\/\/mysess\.localhost:3001/, "it never offered this session's URL");
});

await check("a FOREIGN checkout still holds the slot — a hostname cannot fix that", () => {
  const script = `
    set -uo pipefail
    source ${JSON.stringify(DEV_SERVER)}
    server_cwd() { printf '/somewhere/else'; }
    meta_value() { case "$1" in PID) echo 99;; OWNER_SESSION) echo "peer-session-9";; esac; }
    slot_occupied 4242 3001 agent-preview
  `;
  let failed = false;
  let output = "";
  try {
    execFileSync("bash", ["-c", script], { cwd: REPO_ROOT, encoding: "utf8", stdio: "pipe" });
  } catch (error) {
    failed = true;
    output = String(error.stderr ?? "");
  }
  assert.ok(failed, "it adopted another checkout's server — that certifies the wrong diff");
  assert.match(output, /DIFFERENT checkout/);
  assert.match(output, /unmanaged/, "an occupant with no lease was not named as unmanaged");
});

// ---------------------------------------------------------------------------
// THE POINT OF ALL OF IT: a login on host A must be invisible on host B.
// Run through a REAL HTTP server and REAL curl cookie jars, with the app's own
// cookie attributes — and, in the same run, with the broken `Domain=.localhost`
// variant, so a probe that cannot fail is not mistaken for a passing one.
// ---------------------------------------------------------------------------
async function cookieLeaks(setCookieSuffix, hostA = "hosta.localhost", hostB = "hostb.localhost") {
  const jarDir = mkdtempSync(join(tmpdir(), "preview-jar-"));
  const server = createServer((req, res) => {
    if (req.url === "/set") {
      res.setHeader(
        "Set-Cookie",
        `sb-matrx-auth-v2=session-of-host-a; Path=/; HttpOnly; SameSite=Lax${setCookieSuffix}`,
      );
      res.end("set");
      return;
    }
    res.end(req.headers.cookie ?? "");
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const port = server.address().port;
  const jar = join(jarDir, "jar.txt");
  const curl = async (args) =>
    (await execFileAsync("curl", ["-sS", "--max-time", "10", ...args], { encoding: "utf8" })).stdout;
  try {
    await curl(["-c", jar, "-b", jar, "-o", "/dev/null", `http://${hostA}:${port}/set`]);
    const onB = await curl(["-b", jar, `http://${hostB}:${port}/echo`]);
    const onA = await curl(["-b", jar, `http://${hostA}:${port}/echo`]);
    return { onA, onB };
  } finally {
    server.close();
    rmSync(jarDir, { recursive: true, force: true });
  }
}

await check("BASELINE: a domain-wide cookie DOES leak across session hosts", async () => {
  // A deeper pair of labels on purpose: an HTTP client refuses `Domain=.localhost`
  // outright (a single-label domain is a TLD to a cookie jar), which would make
  // the baseline pass for a reason that has nothing to do with our fix. With a
  // real superdomain the leak happens, so the clean result below means something.
  const { onB } = await cookieLeaks(
    "; Domain=.probe.localhost",
    "hosta.probe.localhost",
    "hostb.probe.localhost",
  );
  assert.match(
    onB,
    /sb-matrx-auth-v2/,
    "the probe cannot detect a leak, so its clean result below proves nothing",
  );
});

await check("a dev-login on host A sets NO cookie readable on host B", async () => {
  const { onA, onB } = await cookieLeaks("");
  assert.match(onA, /sb-matrx-auth-v2=session-of-host-a/, "host A lost its own session");
  assert.equal(onB.trim(), "", `host B received host A's session: ${onB}`);
});

await check("the app never sets a domain-wide cookie off aimatrx.com", () => {
  // authCookieOptions() only attaches `domain` on the apex. If that apex ever
  // grows to cover localhost, every session host shares one jar again and the
  // curl proof above goes quietly green for the wrong reason.
  const source = readFileSync(join(REPO_ROOT, "utils/supabase/authCookie.ts"), "utf8");
  assert.match(source, /apexDomain:\s*"aimatrx\.com"/);
});

console.log("");
const failed = results.filter((r) => !r.ok);
if (failed.length > 0) {
  console.error(`preview session self-test: ${failed.length} of ${results.length} FAILED\n`);
  for (const f of failed) console.error(`  ${f.name}\n${f.error.stack}\n`);
  process.exit(1);
}
console.log(`preview session self-test: ${results.length}/${results.length} passed\n`);
