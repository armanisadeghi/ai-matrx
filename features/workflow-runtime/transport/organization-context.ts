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
 */

import type { RootState } from "@/lib/redux/store";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { applyOrganizationContextHeader } from "@/lib/api/organization-context";

export function stampRunStreamOrganizationContext(
  state: RootState,
  headers: Record<string, string>,
): Record<string, string> {
  const organizationId = selectOrganizationId(state);
  if (!organizationId) return headers;
  return applyOrganizationContextHeader(headers, organizationId);
}
