"use client";

/**
 * The review's server calls — a thin door onto THE one client
 * (`../sourceSetApi.ts`), kept so the review's call shape `(sourceSet, signal)`
 * stays stable for its hosts and the dev harness. Never a second transport:
 * both doors are reads the server admits without a selected organization
 * (aidream `read_by_access.py` `BODY_CARRIED_READS`), so nothing here asks for
 * one.
 */

import type {
  ResolvedSourceSet,
  SourceManifest,
  SourceSet,
} from "@ai-matrx/agents/sources";
import {
  fetchSourceManifest as fetchManifest,
  resolveSourceSet as resolveSet,
} from "../sourceSetApi";

export { SOURCES_MANIFEST_PATH, SOURCES_RESOLVE_PATH } from "../sourceSetApi";

export function fetchSourceManifest(
  sourceSet: SourceSet,
  signal?: AbortSignal,
): Promise<SourceManifest> {
  return fetchManifest(sourceSet, { signal });
}

export function resolveSourceSet(
  sourceSet: SourceSet,
  signal?: AbortSignal,
): Promise<ResolvedSourceSet> {
  return resolveSet(sourceSet, { signal });
}
