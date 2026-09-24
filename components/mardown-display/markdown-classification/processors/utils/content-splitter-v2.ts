/**
 * Content Splitter V2 — the CLIENT entry of the production block splitter.
 *
 * The splitter itself lives in content-splitter-core.ts (environment-neutral,
 * no registry imports). This entry binds the registry-backed kind-envelope
 * hooks, so every client caller gets exactly the behavior it always had:
 * complete JSON / fence / XML regions carry the canonical content-IR envelope
 * on `metadata.__ir`. Import from here in client code; the server
 * rich-content level imports the core with NO_SPLITTER_ENVELOPES.
 */

import { withIrEnvelope } from "@/features/content-ir/registry/region-envelope-memo";
import {
  envelopeForCompletedFenceRegion,
  envelopeForCompletedXmlRegion,
} from "@/features/content-ir/surfaces/xml-finalize";
import {
  recoverEmbeddedKindJsonBlocksWith,
  splitContentIntoBlocksWith,
  type SplitterBlock,
  type SplitterEnvelopes,
} from "./content-splitter-core";

export * from "./content-splitter-core";

/** The registry-backed envelope hooks every client split uses. */
export const CLIENT_SPLITTER_ENVELOPES: SplitterEnvelopes = {
  withIrEnvelope: (source, metadata) => withIrEnvelope(source, metadata),
  fenceRegion: envelopeForCompletedFenceRegion,
  xmlRegion: envelopeForCompletedXmlRegion,
};

export const splitContentIntoBlocksV2 = (mdContent: string): SplitterBlock[] =>
  splitContentIntoBlocksWith(mdContent, CLIENT_SPLITTER_ENVELOPES);

export function recoverEmbeddedKindJsonBlocks(
  input: SplitterBlock[],
): SplitterBlock[] {
  return recoverEmbeddedKindJsonBlocksWith(input, CLIENT_SPLITTER_ENVELOPES);
}
