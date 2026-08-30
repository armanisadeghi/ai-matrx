"use client";

/**
 * Gate tab — run this shape's dual gate (structural + render) against a real
 * sample. Was admin-only; the component is unchanged.
 */

import KindGateTab from "@/features/content-ir/admin/KindGateTab";
import { useKindExamples } from "@/features/content-ir/studio/kind-examples";
import type { Json } from "@/types/database.types";

interface ShapeGateTabProps {
  kind: string;
  kindDefinitionId: string;
  emittedJsonSchema: Json | null;
  family: string | null;
}

export default function ShapeGateTab({
  kind,
  kindDefinitionId,
  emittedJsonSchema,
  family,
}: ShapeGateTabProps) {
  const examples = useKindExamples(kindDefinitionId, 0);
  return (
    <div className="mx-auto max-w-4xl">
      <KindGateTab
        kind={kind}
        emittedJsonSchema={emittedJsonSchema}
        examples={examples}
        family={family}
      />
    </div>
  );
}
