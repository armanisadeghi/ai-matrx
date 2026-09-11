/**
 * Best-effort opener for the per-sandbox session report.
 *
 * The matrx_agent daemon writes `~/.matrx/session-report.md` on every new
 * sandbox boot, summarizing the previous session — what was preserved
 * (everything in `/home/agent` thanks to the per-user volume), what was
 * NOT preserved (running processes, env vars, system-wide installs), and
 * whether the prior shutdown was graceful or a crash. See Phase 2 of the
 * persistence plan in matrx-sandbox.
 *
 * On `connect()`, the editor opens this file as a regular tab so users
 * see exactly what the new container inherited from the last one before
 * touching anything. On a brand-new user (no previous session), the file
 * doesn't exist — we silently swallow the 404 rather than spamming an
 * error toast.
 *
 * Intentionally a plain function (no React) so callers can fire it from
 * either a hook effect or an imperative click handler without ceremony.
 */

import type { AppDispatch } from "@/lib/redux/store";
import type { FilesystemAdapter } from "../adapters/FilesystemAdapter";
import { openTab } from "../redux/tabsSlice";

const REPORT_PATH = "/home/agent/.matrx/session-report.md";
const RETRY_DELAYS_MS = [400, 1500, 4000] as const;

export interface OpenSessionReportArgs {
  /** The just-mounted sandbox filesystem adapter. */
  adapter: FilesystemAdapter;
  /** Stable id used to dedupe the tab and produce a stable URL. */
  sandboxId: string;
  dispatch: AppDispatch;
  /** Refuse a delayed report when the user has already selected another sandbox. */
  canOpen?: () => boolean;
}

/**
 * Try to read the session report and open it as an editor tab. Retries a
 * handful of times — the daemon may take a beat to be ready right after
 * `setActiveSandboxId`. Resolves to `true` if the tab was opened.
 */
export async function openSessionReportTab({
  adapter,
  sandboxId,
  dispatch,
  canOpen = () => true,
}: OpenSessionReportArgs): Promise<boolean> {
  for (const delay of RETRY_DELAYS_MS) {
    await sleep(delay);
    try {
      const content = await adapter.readFile(REPORT_PATH);
      if (!content || !content.trim()) continue;
      if (!canOpen()) return false;
      dispatch(
        openTab({
          id: `session-report:${sandboxId}`,
          path: REPORT_PATH,
          name: "Session Report",
          language: "markdown",
          content,
          pristineContent: content,
          dirty: false,
        }),
      );
      return true;
    } catch (err) {
      // If we get a 404 we know the file doesn't exist (first-ever sandbox
      // for this user). No point retrying.
      if (isNotFound(err)) return false;
      // Anything else (daemon not ready, network blip): keep retrying.
    }
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNotFound(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /\b404\b|not found|No such file/i.test(err.message);
}
