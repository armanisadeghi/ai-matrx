"use client";

// Preview tab body — the shape's canonical examples rendered through the REAL
// production kind route (shared engine, same one the admin page uses).

import { FlaskConical } from "lucide-react";
import Link from "next/link";
import KindExamplePreview from "@/features/content-ir/studio/components/KindExamplePreview";
import { useKindExamples } from "@/features/content-ir/studio/kind-examples";
import { shapeTestHref } from "@/features/content-ir/studio/constants";

interface ShapePreviewTabProps {
  kind: string;
  kindDefinitionId: string;
}

export default function ShapePreviewTab({
  kind,
  kindDefinitionId,
}: ShapePreviewTabProps) {
  const examples = useKindExamples(kindDefinitionId);
  return (
    <KindExamplePreview
      kind={kind}
      examples={examples}
      emptyState={
        <div className="rounded-md border border-dashed border-border bg-card/50 px-4 py-8 text-center">
          <p className="text-sm font-medium text-foreground">
            No saved examples for this shape yet.
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            Try it live instead — fill the form and watch your component render
            the result.
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
  );
}
