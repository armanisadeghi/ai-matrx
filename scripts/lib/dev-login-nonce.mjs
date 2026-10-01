/**
 * Single-use dev-login nonces live OUTSIDE the checkout.
 *
 * `pnpm dev-login` used to drop `.dev-login-nonce.<host>.<nonce>` in the repo
 * root. A mint whose URL was never opened stayed there forever, and a busy
 * machine grew hundreds of them. The Next server, this helper, and
 * scripts/agent-harness/preview-session.sh all use the same per-user directory
 * under /tmp. `pnpm check:preview-session` pins that they agree.
 *
 * /tmp (not $TMPDIR) on purpose: a terminal and a launchd-started server do
 * not share TMPDIR, and a mismatch 401s every sign-in.
 */
import { chmodSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const NONCE_TTL_MS = 15 * 60 * 1000;

export function devLoginNonceDir() {
  const override = process.env.MATRX_DEV_LOGIN_NONCE_DIR?.trim();
  if (override) return override;
  const uid = typeof process.getuid === "function" ? process.getuid() : 0;
  return join("/tmp", `matrx-dev-login-${uid}`);
}

export function sweepStaleDevLoginNonces(dir = devLoginNonceDir()) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  const cutoff = Date.now() - NONCE_TTL_MS;
  for (const name of names) {
    if (!name.startsWith(".dev-login-nonce.")) continue;
    const file = join(dir, name);
    try {
      if (statSync(file).mtimeMs < cutoff) rmSync(file);
    } catch {
      /* a consumer already removed it */
    }
  }
}

export function writeDevLoginNonce(hostname, nonce) {
  const dir = devLoginNonceDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    chmodSync(dir, 0o700);
  } catch {
    /* already correct, or we don't own a pre-existing dir */
  }
  sweepStaleDevLoginNonces(dir);
  const safeHost =
    /^[a-z0-9.-]{1,253}$/.test(hostname) && !String(hostname).includes("..")
      ? hostname
      : "invalid-host";
  const file = join(dir, `.dev-login-nonce.${safeHost}.${nonce}`);
  writeFileSync(file, `${nonce}\n`, { mode: 0o600 });
  return file;
}
