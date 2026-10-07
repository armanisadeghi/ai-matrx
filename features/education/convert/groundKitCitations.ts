// features/education/convert/groundKitCitations.ts
//
// A multi-source kit's text is every Source's chunks joined, so an agent's
// citation names a chunk but not the Source it came from. Each citation is
// pointed at ITS OWN Source here (the file / document / title behind that
// chunk), so clicking a chip opens that Source and never the merged copy.
// A citation whose chunk no Source owns is left as the agent wrote it.

import { attachRefsToCitation } from "@/features/education/trust/grounding";
import type { TrustEnvelope } from "@/features/education/trust/types";
import type { KitSourceRef } from "./types";

export function groundKitTrust<T extends TrustEnvelope | null | undefined>(
  trust: T,
  kitSources: readonly KitSourceRef[] | undefined,
): T {
  if (!trust || !kitSources || kitSources.length === 0 || trust.citations.length === 0) return trust;
  const owner = new Map<string, KitSourceRef>();
  for (const source of kitSources) for (const id of source.chunkIds ?? []) owner.set(id, source);
  return {
    ...trust,
    citations: trust.citations.map((c) => {
      const source = owner.get(c.sourceId);
      if (!source) return c;
      return attachRefsToCitation(c, {
        fileId: source.fileId ?? null,
        documentId: source.processedDocumentId ?? null,
        title: source.title,
      });
    }),
  };
}
