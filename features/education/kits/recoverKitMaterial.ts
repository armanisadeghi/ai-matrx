// features/education/kits/recoverKitMaterial.ts
//
// A kit's own material, re-read for another generation. THE one recovery both
// doors use — the "Make more from it" dialog and the kit chat's generate_in_kit —
// so a run started from either reads the same grounded text and files its
// artifact against the same anchor (no re-upload, no second kit).

import { createSourceRef, createSourceSet } from "@ai-matrx/agents/sources";
import { sourcesClient } from "@/features/resource-manager/source-input/sourceSetApi";
import { reopenAnchor } from "@/features/education/convert/reopenAnchor";
import type { ConvertOrigin } from "@/features/education/convert/ConvertContentDialog";
import type { SourceRef } from "@/features/education/convert/types";
import type { useIngest } from "@/features/education/onboard/useIngest";
import type { usePdfClient } from "@/features/pdf/api/client";
import { KIT_TOKEN, type KitSource } from "./kitScope";

/** The recovered material, held so a second target costs no second re-read. */
export interface RecoveredKitMaterial {
  text: string;
  ref: SourceRef;
  origin: ConvertOrigin;
}

export async function recoverKitMaterial(input: {
  sourceType: string;
  sourceId: string;
  kitTitle: string;
  sources?: readonly KitSource[];
  organizationId?: string;
  normalizeSources: ReturnType<typeof useIngest>["normalizeSources"];
  pdf: ReturnType<typeof usePdfClient>;
}): Promise<RecoveredKitMaterial> {
  const { sourceType, sourceId, kitTitle, sources, organizationId, normalizeSources, pdf } = input;
  if (sourceType === KIT_TOKEN) {
    // EVERY Source of the kit, read through THE one server step — the same
    // grounded text (and citation chunks) the kit was first built from.
    if (!sources?.length) throw new Error("Add a source to this kit first.");
    if (!organizationId) throw new Error("This kit is still loading. Try again.");
    const set = createSourceSet(sources.map((s) => createSourceRef(s.type, s.id)));
    const read = await normalizeSources(
      () => sourcesClient.resolve(set, { organizationId }),
      undefined,
      undefined,
      { copyAnchor: false },
    );
    return {
      text: read.text,
      ref: { ...read.ref, kitId: sourceId },
      origin: { kind: read.ref.kind, entityType: KIT_TOKEN, entityId: sourceId, title: kitTitle || read.title },
    };
  }
  const source = await reopenAnchor(sourceType, sourceId, { pdf });
  return {
    text: source.text,
    ref: source.ref ?? { kind: "file", fileId: sourceId },
    origin: {
      kind: source.ref?.kind ?? "file",
      entityType: source.ref?.entityType ?? sourceType,
      entityId: source.ref?.entityId ?? sourceId,
      // The KIT's name, not the artifact's: every generator reads
      // `source.title`, and this is what keeps a new sibling named like the
      // rest of the family (`recordSourceLineage` carries it on the edge).
      title: kitTitle || source.title || "Your material",
    },
  };
}
