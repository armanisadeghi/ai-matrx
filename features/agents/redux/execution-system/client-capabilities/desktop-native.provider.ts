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

registerClientCapability({
  name: "desktop-native",
  selectPayload: async () => {
    const desktop = await getLiveDesktopInstance();
    if (!desktop) return null;
    return {
      platform: toSysPlatform(desktop.platform),
      engine_version: desktop.engineVersion,
      instance_id: desktop.instanceId,
      tunnel_state: desktop.tunnelActive ? ("active" as const) : ("none" as const),
    };
  },
});
