/**
 * Where the harness points: the ONE shared dev server (port 3001) under this
 * checkout's own session hostname, the live database, real LiveKit Cloud.
 *
 * Nothing here starts a server. The hostname comes from the same shell helpers
 * `pnpm dev-login` uses, so the harness and a human agent share one cookie host
 * (each Playwright context still has its own jar, which is what separates the
 * host, the guest and the second member).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

export const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
export const CATALOG_PATH =
  process.env.MEET_CATALOG_PATH ??
  path.resolve(
    REPO_ROOT,
    "..",
    "common-docs/systems/communications/meet/duplicates/states-catalog.json",
  );

let cachedBase: string | null = null;

/** `http://<session>.localhost:3001` — never bare localhost (shared cookie jar). */
export function baseURL(): string {
  if (process.env.MEET_BASE_URL) return process.env.MEET_BASE_URL.replace(/\/$/, "");
  if (cachedBase !== null) return cachedBase;
  const script = [
    'source "$1/scripts/agent-harness/preview-session.sh"',
    'source "$1/scripts/agent-harness/shared-servers.sh"',
    'printf "%s:%s" "$(shared_server_host "$(preview_session_label "$1")")" "$SHARED_SERVER_PORT"',
  ].join("; ");
  const hostPort = execFileSync("bash", ["-c", script, "_", REPO_ROOT], {
    encoding: "utf8",
  }).trim();
  if (!/^[a-z0-9.-]+:\d+$/i.test(hostPort)) {
    throw new Error(`could not resolve the preview hostname (got "${hostPort}")`);
  }
  cachedBase = `http://${hostPort}`;
  return cachedBase;
}

export type SignedInAs = "admin" | "member";

/**
 * One-shot sign-in URL from `scripts/dev-login.sh`. `member` is the designated
 * non-admin test account test@test.com (`--member`). The nonce dies on first use,
 * so every context mints its own.
 */
export function devLoginURL(as: SignedInAs, next: string): string {
  const args = ["scripts/dev-login.sh", ...(as === "member" ? ["--member"] : []), next];
  const out = execFileSync("bash", args, { cwd: REPO_ROOT, encoding: "utf8" });
  const match = out.match(/OPEN\s*:\s*(\S+)/);
  if (!match) throw new Error("dev-login printed no OPEN url");
  return match[1];
}

/** Public (publishable) Supabase settings, read from the checkout's env files. Never printed. */
export function supabasePublic(): { url: string; key: string } {
  const vars: Record<string, string> = {};
  for (const file of [".env", ".env.local"]) {
    const full = path.join(REPO_ROOT, file);
    if (!existsSync(full)) continue;
    for (const line of readFileSync(full, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? vars.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? vars.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY not found");
  return { url, key };
}

/** Real timeouts the scenarios wait on. Each is a knob, defaulted to the catalog's figure. */
export const TIMEOUTS = {
  /** How long a knock may go unanswered before it must expire (Meet: a few minutes). */
  knockExpiryMs: Number(process.env.MEET_KNOCK_EXPIRY_S ?? 300) * 1000,
  /** Host-absent grace before a headless meeting must promote someone (catalog: N seconds). */
  hostTransferMs: Number(process.env.MEET_HOST_TRANSFER_S ?? 120) * 1000,
  /** Empty-room auto-end window the server sweep must honour. */
  emptyRoomEndMs: Number(process.env.MEET_EMPTY_END_S ?? 360) * 1000,
  /** How long a reconnecting client may take before it must give up or recover. */
  reconnectGiveUpMs: Number(process.env.MEET_GIVE_UP_S ?? 90) * 1000,
  /** Generic "a person would have noticed by now" wait for a visible change. */
  noticeMs: Number(process.env.MEET_NOTICE_S ?? 15) * 1000,
};

/**
 * This run's own output directory. Every run writes its report, artifacts and teardown logs here,
 * so two runs at once (other lanes run the harness too) never overwrite each other. The id is set
 * once in the main process (playwright.config.ts) and inherited by every worker.
 */
export function runId(): string {
  if (!process.env.MEET_RUN_ID) {
    process.env.MEET_RUN_ID = `${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}-${process.pid}`;
  }
  return process.env.MEET_RUN_ID;
}

export function runDir(): string {
  return path.join(REPO_ROOT, ".cache", "meet-scenarios", "runs", runId());
}

/** aidream checkout whose environment runs lib/fixtures.py (persona factory, server truth). */
export const AIDREAM_ROOT = process.env.MEET_AIDREAM_ROOT ?? path.resolve(REPO_ROOT, "..", "aidream");
