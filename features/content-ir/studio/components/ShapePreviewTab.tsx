"use client";

// Preview tab body — the shape's canonical examples rendered through the REAL
// production kind route (shared engine, same one the admin page uses).

import { useState } from "react";
import { FlaskConical } from "lucide-react";
import Link from "next/link";
import KindExamplePreview from "@/features/content-ir/studio/components/KindExamplePreview";
import ShapeOwnerEditor from "@/features/content-ir/studio/components/ShapeOwnerEditor";
import { useKindExamples } from "@/features/content-ir/studio/kind-examples";
import { shapeTestHref } from "@/features/content-ir/studio/constants";
import type { Json } from "@/types/database.types";

interface ShapePreviewTabProps {
  kind: string;
  kindDefinitionId: string;
  label: string;
  visibility: string;
  titleKey: string | null;
  loadingComponent: string | null;
  emittedJsonSchema: Json | null;
  isOwnedByViewer: boolean;
}

export default function ShapePreviewTab({
  kind,
  kindDefinitionId,
  label,
  visibility,
  titleKey,
  loadingComponent,
  emittedJsonSchema,
  isOwnedByViewer,
}: ShapePreviewTabProps) {
  const [examplesRevision, setExamplesRevision] = useState(0);
  const examples = useKindExamples(kindDefinitionId, examplesRevision);
  return (
    <>
      {isOwnedByViewer && (
        <ShapeOwnerEditor
          kind={kind}
          kindDefinitionId={kindDefinitionId}
          label={label}
          visibility={visibility}
          titleKey={titleKey}
          loadingComponent={loadingComponent}
          emittedJsonSchema={emittedJsonSchema}
          examples={examples}
          onExamplesChanged={() =>
            setExamplesRevision((revision) => revision + 1)
          }
        />
      )}
      <KindExamplePreview
        kind={kind}
        examples={examples}
        emptyState={
          <div className="rounded-md border border-dashed border-border bg-card/50 px-4 py-8 text-center">
            <p className="text-sm font-medium text-foreground">
              No saved examples for this shape yet.
            </p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              {isOwnedByViewer
                ? "Add the first canonical sample above, or try the Shape live."
                : "Try it live instead — fill the form and watch its component render the result."}
            </p>
            <Link
              href={shapeTestHref(kind)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <FlaskConical className="h-3.5 w-3.5" />
              Open the Test tab
            </Link>
          </div>
        }
      />
    </>
  );
}
