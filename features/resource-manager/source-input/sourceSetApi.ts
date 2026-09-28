"use client";

/**
 * The client half of the one server step (aidream
 * `api/routers/source_sets.py`): `POST /sources/manifest` (sizes, states,
 * forms and parts — never bodies) and `POST /sources/resolve` (the full
 * grounded text a generator reads). Both answer for the signed-in person only;
 * a Source they cannot read comes back as unavailable / dropped, never as its
 * content.
 *
 * Wire types are the frozen v1 contract from `@ai-matrx/agents/sources` —
 * the same package the server's Pydantic twins mirror.
 */

import type {
  ResolvedSourceSet,
  SourceManifest,
  SourceSet,
} from "@ai-matrx/agents/sources";
import { postJson } from "@/lib/python-client";

export const SOURCES_MANIFEST_PATH = "/sources/manifest";
export const SOURCES_RESOLVE_PATH = "/sources/resolve";

interface SourceSetRequest {
  source_set: SourceSet;
}

export async function fetchSourceManifest(
  sourceSet: SourceSet,
  options: { organizationId?: string; signal?: AbortSignal } = {},
): Promise<SourceManifest> {
  const { data } = await postJson<SourceManifest, SourceSetRequest>(
    SOURCES_MANIFEST_PATH,
    { source_set: sourceSet },
    { organizationId: options.organizationId, signal: options.signal },
  );
  return data;
}

export async function resolveSourceSet(
  sourceSet: SourceSet,
  options: { organizationId?: string; signal?: AbortSignal } = {},
): Promise<ResolvedSourceSet> {
  const { data } = await postJson<ResolvedSourceSet, SourceSetRequest>(
    SOURCES_RESOLVE_PATH,
    { source_set: sourceSet },
    { organizationId: options.organizationId, signal: options.signal },
  );
  return data;
}
