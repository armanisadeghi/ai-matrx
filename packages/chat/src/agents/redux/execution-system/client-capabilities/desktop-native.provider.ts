/**
 * desktop-native capability — declares the user's matrx-local desktop as an
 * active tool executor when (and ONLY when) a desktop engine is online.
 *
 * Presence gate: `desktop-presence.ts` (app_instances heartbeat, direct
 * Supabase read). When no desktop is live this returns null and the
 * capability stays out of the envelope entirely — declaring a dead executor
 * would let aidream's tool merge keep matrx-local-bound tools in-flight and
 * delegate calls into a void (only the 30-day ledger expiry recovers those).
 *
 * When live, the payload mirrors what the matrx-local delegation engine
 * sends on its own resumes (matrx-local/app/services/delegation/engine.py):
 * {platform, engine_version, instance_id} + tunnel_state. The server boots
 * the agent with `load_desktop_tools`; desktop mega-tools load per-category
 * on demand and delegate to the desktop via suspend/resume.
 *
 * Registered providers run on BOTH turn start and resume — buildToolInjection
 * is the single envelope builder for execute-instance, manual-execute, and
 * resume-instance — so a re-delegated desktop tool survives the merge on
 * continuations too (see docs/CLIENT_TOOL_SUSPEND_RESUME.md).
 */

import { getLiveDesktopInstance } from "./desktop-presence";
import { registerClientCapability } from "./registry";
import { isChatHostConfigured, onChatHostConfigured } from "../../../../host/configure";

/**
 * app_instances.platform holds `platform.system().lower()` ("windows"/
 * "linux"/"darwin") but aidream's discovery filter gates OS-specific
 * mega-tools on `sys.platform` values ("win32"/"linux"/"darwin") — the shape
 * matrx-local itself sends on its resumes. Normalize so a Windows desktop
 * doesn't lose `local_windows_ps` to a naming mismatch.
 */
function toSysPlatform(platform: string): string {
  return platform === "windows" ? "win32" : platform;
}

/** The longest a send waits on a desktop-presence check that has never answered. */
const PRESENCE_BUDGET_MS = 150;

// Warm the presence answer as soon as the chat code loads, so a page's first
// send reads a cached answer instead of waiting on the app_instances read
// (2026-10-02 latency regression: ~290ms on every first send after a load).
// The read needs the host's db, so the warm waits for the host: this module
// can load before <ChatProvider> renders, and an early warm announced
// "No chat host is configured" on every /p page (2026-10-07).
if (typeof window !== "undefined") {
  const warm = () => setTimeout(() => void getLiveDesktopInstance(), 0);
  if (isChatHostConfigured()) {
    warm();
  } else {
    const stop = onChatHostConfigured(() => {
      stop();
      warm();
    });
  }
}

registerClientCapability({
  name: "desktop-native",
  selectPayload: async () => {
    // A send waits at most PRESENCE_BUDGET_MS for a first-ever check; past
    // that it goes without the desktop capability this turn and the answer
    // lands in the cache for the next (2026-10-02 latency regression).
    const desktop = await Promise.race([
      getLiveDesktopInstance(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), PRESENCE_BUDGET_MS)),
    ]);
    if (!desktop) return null;
    return {
      platform: toSysPlatform(desktop.platform),
      engine_version: desktop.engineVersion,
      instance_id: desktop.instanceId,
      tunnel_state: desktop.tunnelActive ? ("active" as const) : ("none" as const),
    };
  },
});
