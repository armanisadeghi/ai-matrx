"use client";

/**
 * The web app's transport for the Source doors (aidream
 * `api/routers/source_sets.py`): the package's ONE client
 * (`@ai-matrx/agents/sources/runtime` `createSourcesClient`) over the
 * contract-bound `apiPost`, so path, body and answer are checked against the
 * generated `types/python-generated/api-types.ts`, and auth + base URL are the
 * app's own. The client marks every call `bodyCarriedRead` (the server admits
 * these reads without a selected organization — V1-A).
 */

import { useSourcePartsSearch as useSourcePartsSearchCore } from "@ai-matrx/agents/sources/react";
import {
  createSourcesClient,
  type SourceDoorCalls,
  type SourcesTransport,
} from "@ai-matrx/agents/sources/runtime";
import type { SourceRef } from "@ai-matrx/agents/sources";
import { apiPost } from "@/lib/api/typed-client";

const transport: SourcesTransport = {
  async post(path, body, options) {
    // The three door bodies are the frozen contract (`@ai-matrx/agents/sources`);
    // the generated wire types are the same shapes, only looser (Pydantic
    // defaults read as optional), so the answer is narrowed back to the contract.
    const { data } = await apiPost(path, body as never, options);
    return data as SourceDoorCalls[typeof path]["answer"];
  },
};

/** THE Source doors client for the web app. */
export const sourcesClient = createSourcesClient(transport);

/** Which of one Source's parts hold every word typed (server-answered, ids only). */
export function useSourcePartsSearch(ref: SourceRef | null, query: string) {
  return useSourcePartsSearchCore(sourcesClient, ref, query);
}
