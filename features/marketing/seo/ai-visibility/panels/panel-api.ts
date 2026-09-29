// features/marketing/seo/ai-visibility/panels/panel-api.ts
//
// The server doors for the panel family: named metrics and the design
// workflow. Reads of the panel ROWS stay direct to Supabase (`service.ts`);
// these are server-computed views (T12 estimates, workflow run state) and
// server-owned writes (starting a paid design run, recording a gate decision),
// so they go through `callApi` like the rest of this feature.
//
// The paths are not in the generated OpenAPI yet (backend lanes land them
// concurrently), so they are cast to `keyof paths` the same way other features
// reach just-landed routes. When `pnpm sync-types` has them, drop the casts.

import { callApi } from "@/lib/api/call-api";
import { describeBackendFailure, parseCallApiError } from "@/lib/api/errors";
import type { AppDispatch } from "@/lib/redux/store";
import type { paths } from "@/types/python-generated/api-types";

import type {
  DesignArtifactContent,
  DesignRunView,
  GateDecisionBody,
  GateNumber,
  PanelMetrics,
  StartDesignBody,
} from "./types";

/** A refused call, with its HTTP status kept so a 404 can read as "none yet". */
export class PanelApiError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null) {
    super(message);
    this.name = "PanelApiError";
    this.status = status;
  }
}

function untypedPath(path: string): keyof paths {
  return path as keyof paths;
}

async function request<T>(
  dispatch: AppDispatch,
  {
    path,
    method,
    body,
    organizationId,
    what,
  }: {
    path: string;
    method: "GET" | "POST";
    body?: unknown;
    organizationId: string;
    what: string;
  },
): Promise<T> {
  const result = await dispatch(
    callApi({
      path: untypedPath(path),
      method,
      ...(body === undefined ? {} : { body: body as never }),
      scopeOverrides: { organization_id: organizationId },
      // Reads and polls never open the workspace picker.
      interactiveOrganization: method === "POST",
    }),
  );
  if (result.error) {
    const explanation = describeBackendFailure(parseCallApiError(result.error));
    // The headline alone: every caller already says what failed ("Could not
    // load …"), so the door's own verb would be said twice.
    throw new PanelApiError(explanation.headline, result.error.status ?? null);
  }
  if (result.data === undefined || result.data === null) {
    throw new PanelApiError(`Could not ${what}: the server sent an empty reply.`, null);
  }
  return result.data as T;
}

const enc = encodeURIComponent;

export function fetchPanelMetrics(
  dispatch: AppDispatch,
  panelId: string,
  organizationId: string,
): Promise<PanelMetrics> {
  return request<PanelMetrics>(dispatch, {
    path: `/ai-visibility/panels/${enc(panelId)}/metrics`,
    method: "GET",
    organizationId,
    what: "load this panel's measurements",
  });
}

export function fetchDesignRun(
  dispatch: AppDispatch,
  panelId: string,
  organizationId: string,
): Promise<DesignRunView | null> {
  return request<DesignRunView | null>(dispatch, {
    path: `/ai-visibility/panels/${enc(panelId)}/design`,
    method: "GET",
    organizationId,
    what: "load this panel's design run",
  });
}

export function startPanelDesign(
  dispatch: AppDispatch,
  body: StartDesignBody,
  organizationId: string,
): Promise<DesignRunView> {
  return request<DesignRunView>(dispatch, {
    path: "/ai-visibility/panels/design",
    method: "POST",
    body,
    organizationId,
    what: "start designing a panel",
  });
}

export function decideGate(
  dispatch: AppDispatch,
  panelId: string,
  gate: GateNumber,
  body: GateDecisionBody,
  organizationId: string,
): Promise<DesignRunView> {
  return request<DesignRunView>(dispatch, {
    path: `/ai-visibility/panels/${enc(panelId)}/design/gates/${gate}`,
    method: "POST",
    body,
    organizationId,
    what: "record your review",
  });
}

export function fetchDesignArtifact(
  dispatch: AppDispatch,
  panelId: string,
  name: string,
  organizationId: string,
): Promise<DesignArtifactContent> {
  return request<DesignArtifactContent>(dispatch, {
    path: `/ai-visibility/panels/${enc(panelId)}/design/artifacts/${enc(name)}`,
    method: "GET",
    organizationId,
    what: "open this design file",
  });
}

export const panelQueryKeys = {
  metrics: (panelId: string) => ["marketing", "ai-visibility", "panel", panelId, "metrics"] as const,
  design: (panelId: string) => ["marketing", "ai-visibility", "panel", panelId, "design"] as const,
  artifact: (panelId: string, name: string) =>
    ["marketing", "ai-visibility", "panel", panelId, "artifact", name] as const,
};
