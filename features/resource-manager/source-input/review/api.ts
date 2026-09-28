"use client";

/**
 * The review's two server calls — the ONE server handler's doors
 * (aidream `api/routers/source_sets.py`):
 * - `POST /sources/manifest` — sizes, states, forms and parts; never a body.
 * - `POST /sources/resolve`  — the grounded text; used only to prove the
 *   review's numbers (the dev harness), never to render bodies here.
 *
 * Both are reads, but the server's doors still demand an organization (they
 * are not yet in aidream `read_by_access.py` BODY_CARRIED_READS), so the call
 * is HELD by the one organization gate: the selected organization is used,
 * and when none is selected the person is asked — never guessed, never a
 * silent failure. When the server admits these reads org-less, drop the gate
 * and pass `bodyCarriedRead: true`.
 *
 * Wire shapes are the frozen v1 contract in `@ai-matrx/agents/sources`.
 * `postJson` attaches the person's JWT and turns a refusal into a
 * `BackendApiError` carrying the server's own sentence.
 */

import type {
  ResolvedSourceSet,
  SourceManifest,
  SourceSet,
} from "@ai-matrx/agents/sources";
import { postJson } from "@/lib/python-client";
import { ensureOrganizationContext } from "@/lib/organization/organization-gate";

export const SOURCES_MANIFEST_PATH = "/sources/manifest";
export const SOURCES_RESOLVE_PATH = "/sources/resolve";

export async function fetchSourceManifest(
  sourceSet: SourceSet,
  signal?: AbortSignal,
): Promise<SourceManifest> {
  const { data } = await postJson<SourceManifest, { source_set: SourceSet }>(
    SOURCES_MANIFEST_PATH,
    { source_set: sourceSet },
    { signal, organizationId: await ensureOrganizationContext() },
  );
  return data;
}

export async function resolveSourceSet(
  sourceSet: SourceSet,
  signal?: AbortSignal,
): Promise<ResolvedSourceSet> {
  const { data } = await postJson<ResolvedSourceSet, { source_set: SourceSet }>(
    SOURCES_RESOLVE_PATH,
    { source_set: sourceSet },
    { signal, organizationId: await ensureOrganizationContext() },
  );
  return data;
}
