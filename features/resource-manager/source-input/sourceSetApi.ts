"use client";

/**
 * THE one client for the one source input's server doors (aidream
 * `api/routers/source_sets.py`):
 *
 *   - `POST /sources/manifest` — sizes, states, forms and parts (never bodies);
 *   - `POST /sources/resolve` — the full grounded text a generator reads;
 *   - `POST /sources/parts/search` — the ids of one Source's parts that hold
 *     every word of a query (the manifest's own part ids; never a body).
 *
 * Every call goes through the contract-bound `apiPost`, so the path, body and
 * response are checked against the generated `types/python-generated/api-types.ts`.
 * All three answer for the signed-in person only; a Source they cannot read
 * comes back as unavailable / dropped, never as its content.
 *
 * They are READS decided by access, never by the selected organization: the
 * server names them in `BODY_CARRIED_READS` (aidream `api/read_by_access.py`),
 * so they go as `bodyCarriedRead` — with an organization selected it is still
 * named, with none they are sent naming none instead of being refused in the
 * browser. V1-A: a person with no organization selected picked a file and saw
 * "Sizes and parts could not be read: Select an organization before sending
 * this request" — a dead end the server no longer asks for.
 *
 * The second argument is either the options or (the review's call shape) an
 * AbortSignal.
 */

import type {
  ResolvedSourceSet,
  SourceManifest,
  SourceRef,
  SourceSet,
} from "@ai-matrx/agents/sources";
import { apiPost } from "@/lib/api/typed-client";
import type { components } from "@/types/python-generated/api-types";

export interface SourceCallOptions {
  organizationId?: string;
  signal?: AbortSignal;
}

type Wire = components["schemas"];

/** The server's answer to a part search. */
export type SourcePartsSearch = Wire["SourcePartsSearch"];

function optionsOf(options: SourceCallOptions | AbortSignal | undefined): SourceCallOptions {
  if (!options) return {};
  if (typeof AbortSignal !== "undefined" && options instanceof AbortSignal) return { signal: options };
  return options as SourceCallOptions;
}

function request(options: SourceCallOptions | AbortSignal | undefined) {
  const { organizationId, signal } = optionsOf(options);
  return { organizationId, signal, bodyCarriedRead: true };
}

export async function fetchSourceManifest(
  sourceSet: SourceSet,
  options?: SourceCallOptions | AbortSignal,
): Promise<SourceManifest> {
  const { data } = await apiPost(
    "/sources/manifest",
    { source_set: sourceSet },
    request(options),
  );
  // Narrowed to the frozen v1 contract type from `@ai-matrx/agents/sources`: the
  // generated type is the same shape, only looser (Pydantic defaults read as optional).
  return data as SourceManifest;
}

export async function resolveSourceSet(
  sourceSet: SourceSet,
  options?: SourceCallOptions | AbortSignal,
): Promise<ResolvedSourceSet> {
  const { data } = await apiPost(
    "/sources/resolve",
    { source_set: sourceSet },
    request(options),
  );
  return data as ResolvedSourceSet;
}

/** The ids of `ref`'s parts whose label or text holds every word of `query`. */
export async function searchSourceParts(
  ref: SourceRef,
  query: string,
  options?: SourceCallOptions | AbortSignal,
): Promise<SourcePartsSearch> {
  const { data } = await apiPost(
    "/sources/parts/search",
    { source_ref: ref, query },
    request(options),
  );
  return data;
}
