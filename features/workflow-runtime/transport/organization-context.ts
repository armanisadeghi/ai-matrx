/**
 * Organization admission for the workflow-runtime transports.
 *
 * The server's AuthMiddleware (matrx-connect, 2026-08-30) refuses any
 * authenticated request that names no organization via `X-Organization-Id` —
 * org-in-body-only is no longer an admitted wire. Every workflow-runtime
 * fetch/SSE (`/runs/{id}`, `/runs/{id}/events`, `/runs/stream`) stamps the
 * app-selected organization through this ONE helper.
 *
 * Non-throwing by design — same posture as `resolveBackendForConversation`
 * (features/agents/redux/execution-system/thunks/resolve-base-url.ts): these
 * are stream/observation lanes that connect at page load, so when no
 * organization is selected yet the header is omitted and the server's
 * `organization_required` refusal owns the error message. Request/transport
 * choke points that act on user clicks stay fail-closed via
 * `requireOrganizationContext` instead.
 *
 * ── W39, the run-permalink instance (2026-09-12) ───────────────────────────
 * "The server's refusal owns the error message" is right ONLY when the refusal
 * is real. On a cold load of `/workflows/runs/{id}` the very first read went
 * out before the organization bootstrap had landed, came back 400
 * `organization_required`, and the run page — which starts at `status:
 * "pending"` — sat on "GETTING READY · Starting" for ~20 seconds on a run that
 * had finished hours earlier. The person saw fake progress, not a refusal.
 *
 * So the ATTACH read waits, bounded, for the workspace before it stamps
 * ({@link awaitRunStreamOrganizationContext}). It is the same seam as the
 * guided start's Start button: a surface must not act before the context it
 * needs has resolved. When the wait settles with no organization the header is
 * still omitted and the server's refusal is still the message — but it is then
 * a TRUE refusal, and the caller must show it rather than keep pretending.
 */

import type { RootState } from "@/lib/redux/store";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { applyOrganizationContextHeader } from "@/lib/api/organization-context";
import { waitForOrganizationAdmission } from "@/lib/api/organization-admission";

export function stampRunStreamOrganizationContext(
  state: RootState,
  headers: Record<string, string>,
): Record<string, string> {
  const organizationId = selectOrganizationId(state);
  if (!organizationId) return headers;
  return applyOrganizationContextHeader(headers, organizationId);
}

/**
 * The same stamp, after a BOUNDED wait for the organization bootstrap.
 *
 * Use this on any run read that can fire at page load. `getState` is re-read
 * after the wait, so an organization that lands during the bootstrap is used
 * rather than missed by one tick.
 */
export async function awaitRunStreamOrganizationContext(
  getState: () => RootState,
  headers: Record<string, string>,
): Promise<Record<string, string>> {
  if (selectOrganizationId(getState())) {
    return stampRunStreamOrganizationContext(getState(), headers);
  }
  await waitForOrganizationAdmission();
  return stampRunStreamOrganizationContext(getState(), headers);
}
