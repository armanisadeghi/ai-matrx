"use client";

/**
 * features/sources/api/sourcesApi.ts
 *
 * The client side of the landing door's WRITE routes (SOURCE-CONVERGENCE §3.1):
 * `POST /sources/land` and `POST /sources/{id}/keep`; `/sources/{id}/edit`
 * joins them when a surface edits a Source. Every page, transcript or file the platform
 * acquires is a Source — a `docproc.processed_documents` row — and keeping or
 * filing one is a server write, because Keep is the signal that starts its
 * (metered) AI processing. READS never come through here: Sources are read
 * directly from Supabase under RLS.
 *
 * Wire types are the generated contract (`types/python-generated/api-types.ts`),
 * never a hand-written mirror. `postJson` attaches the JWT and the
 * `X-Organization-Id` header and turns a refusal into a `BackendApiError`
 * carrying the server's own sentence.
 */

import { postJson } from "@/lib/python-client";
import type { components } from "@/types/python-generated/api-types";

export type LandedSource = components["schemas"]["LandedSource"];
export type LandingNotice = components["schemas"]["LandingNotice"];
export type SourceAttachTarget = components["schemas"]["AttachTarget"];
export type KeepSourceBody = components["schemas"]["KeepBody"];
export type SourceLandingBody = components["schemas"]["SourceLanding"];

export const SOURCE_LAND_PATH = "/sources/land";

/**
 * Land one acquisition as a Source through the door (`POST /sources/land`).
 * The body names its organization (`organization_id`) and so does the
 * request header — the same id, captured once by the caller.
 */
export async function landSource(body: SourceLandingBody): Promise<LandedSource> {
  const { data } = await postJson<LandedSource, SourceLandingBody>(
    SOURCE_LAND_PATH,
    body,
    { organizationId: body.organization_id },
  );
  return data;
}

export function sourceKeepPath(processedDocumentId: string): string {
  return `/sources/${encodeURIComponent(processedDocumentId)}/keep`;
}

/**
 * Keep a Source and/or file it against the given targets. The organization is
 * the one the caller already ensured (`ensureOrganizationContext`) — named on
 * the request, never picked here.
 */
export async function keepSource(
  processedDocumentId: string,
  options: { attachTo?: SourceAttachTarget[]; organizationId: string },
): Promise<LandedSource> {
  const body: KeepSourceBody = {
    keep: true,
    attach_to: options.attachTo ?? [],
  };
  const { data } = await postJson<LandedSource, KeepSourceBody>(
    sourceKeepPath(processedDocumentId),
    body,
    { organizationId: options.organizationId },
  );
  return data;
}

/**
 * Where a Source opens today. The one Source screen (`/knowledge/sources/[id]`)
 * arrives in SOURCE-CONVERGENCE Phase 2 and the viewer route then redirects to
 * it with its params; until then the live viewer is the honest door. One place
 * to change when it moves.
 */
export function sourceHref(processedDocumentId: string): string {
  return `/knowledge/viewer/${encodeURIComponent(processedDocumentId)}`;
}
