#!/usr/bin/env node
// scripts/check-session-handover.mjs — EVERY SESSION REPLACEMENT GOES THROUGH THE ONE HANDOVER (G2 guest data).
//
// Owner ruling (2026-10-09): guests may have data, and "we BETTER NOT lose their data in the signup process".
// A browser holding a guest that is signed in to another account by a call that bypasses
// `lib/guest/session-handover.ts` (handOverSession) orphans the guest's records — the G1 attack's C4 found
// four such doors (/auth/confirm verifyOtp = password recovery, dev-login, …). This fails on any
// session-replacing auth call in shipped code that is not written inside `handOverSession(`.
//
//   pnpm check:session-handover              scan the repo (exit 1 on a finding)
//   pnpm check:session-handover --self-test  prove it fails on a bypass and passes on the handover
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const CALL = /\.auth\s*\.\s*(exchangeCodeForSession|verifyOtp|signInWithPassword|signInWithIdToken|signInWithOtp|signUp|signInAnonymously|setSession)\s*\(/g;
const SHIPPED = /^(app|actions|utils|lib|components|features|hooks|providers)\//;
const NOT_SHIPPED = /(\.test\.|\.spec\.|__tests__\/|test-utils\/|\.live\.|-live-proof\.|\/sandbox\/|parity\.ts$|(^|\/)live-proof\.ts$)/;
/** Calls that never replace the browser's main session, each with its reason. */
const ALLOW = new Map([
  ["lib/guest/ensure-guest-session.ts", "installs the GUEST session in the guest client's own cookie; the main session is untouched"],
  ["features/secrets/vault-service.ts", "re-confirms the signed-in person's own password before a vault export (same account; a signed-in browser holds no guest)"],
]);

export function findings(file, text) {
  if (ALLOW.has(file)) return [];
  const out = [];
  for (const m of text.matchAll(CALL)) {
    const before = text.slice(Math.max(0, m.index - 400), m.index);
    // Inside `handOverSession(<via>, () => <call>)`: the nearest opener before the call is the handover.
    const handover = before.lastIndexOf("handOverSession(");
    const statementBreak = Math.max(before.lastIndexOf(";"), before.lastIndexOf("{\n"));
    if (handover !== -1 && handover > statementBreak) continue;
    const line = text.slice(0, m.index).split("\n").length;
    out.push(`${file}:${line} ${m[1]}() replaces the session outside handOverSession — a guest's records would be orphaned. Wrap it: handOverSession("<via>", () => ….auth.${m[1]}(…)).`);
  }
  return out;
}

function selfTest() {
  const bypass = `const { error } = await supabase.auth.signInWithPassword({ email, password });`;
  const wrapped = `const { error } = await handOverSession("password_login", () => supabase.auth.signInWithPassword(data), { visitorId });`;
  const wrappedMultiLine = `const verified = await retryTransport(\n  "verifyOtp",\n  () => handOverSession("dev_login", () => supabase.auth.verifyOtp({ email })),\n  attempts,\n);`;
  const red = findings("app/x/route.ts", bypass);
  const green = [...findings("app/x/route.ts", wrapped), ...findings("app/x/route.ts", wrappedMultiLine)];
  const testFile = findings("app/x/route.test.ts".replace(/^/, ""), bypass);
  if (red.length !== 1 || green.length !== 0) {
    console.error(`self-test FAILED: bypass findings=${red.length} (want 1), wrapped findings=${green.length} (want 0)`);
    process.exit(1);
  }
  void testFile;
  console.log("check:session-handover self-test: a bypass is RED, the handover is GREEN.");
}

if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  const files = execFileSync("git", ["ls-files", "*.ts", "*.tsx"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\n")
    .filter((f) => SHIPPED.test(f) && !NOT_SHIPPED.test(f));
  const all = [];
  for (const f of files) {
    let text;
    try {
      text = readFileSync(f, "utf8");
    } catch {
      continue;
    }
    if (!CALL.test(text)) continue;
    CALL.lastIndex = 0;
    all.push(...findings(f, text));
  }
  if (all.length) {
    console.error(`check:session-handover: ${all.length} session replacement(s) bypass the one handover:\n${all.join("\n")}`);
    process.exit(1);
  }
  console.log(`check:session-handover: every session replacement in ${files.length} shipped files goes through handOverSession.`);
}
