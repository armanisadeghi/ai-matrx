/**
 * Dev-only render-path tracing for /war-room/[id] → Stage → Agent tab →
 * AgentAssistantMessage. Open DevTools, switch to Stage, open the Agent tab,
 * and watch `[war-room/render-path]` logs in order.
 *
 * Gated to development — zero overhead in production builds.
 */

const PREFIX = "[war-room/render-path]";

export function traceWarRoomRenderPath(
  step: number,
  label: string,
  detail?: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV === "production") return;
  if (detail) {
    console.log(`${PREFIX} ${step}. ${label}`, detail);
  } else {
    console.log(`${PREFIX} ${step}. ${label}`);
  }
}

/** Surface keys used by the tile Agent tab (ExperimentalAgentScreen). */
export function isWarRoomTileAgentSurface(surfaceKey?: string): boolean {
  return !!surfaceKey?.startsWith("studio-assistant-experimental:");
}
