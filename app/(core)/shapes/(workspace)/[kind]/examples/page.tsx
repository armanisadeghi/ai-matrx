// /shapes/[kind]/examples — author and curate this shape's saved samples.
// Was admin-only; one set of tabs for everyone (2026-08-29).

import { notFound } from "next/navigation";
import { getShapeDetail } from "@/features/content-ir/studio/shape-detail-server";
import ShapeDetailHeader from "@/features/content-ir/studio/components/ShapeDetailHeader";
import ShapeSurfaceRuntime from "@/features/content-ir/studio/components/ShapeSurfaceRuntime";
import ShapeExamplesTab from "@/features/content-ir/studio/components/ShapeExamplesTab";

interface PageProps {
  params: Promise<{ kind: string }>;
}

export default async function ShapeExamplesPage({ params }: PageProps) {
  const { kind } = await params;
  const detail = await getShapeDetail(decodeURIComponent(kind));
  if (!detail) notFound();

  return (
    <>
      <ShapeDetailHeader
        kind={detail.kind}
        label={detail.label}
        isOwnedByViewer={detail.isOwnedByViewer}
        emittedJsonSchema={detail.emittedJsonSchema}
      />
      <div className="px-4 pb-10 pt-[var(--shell-header-h)] sm:px-6">
        <div className="mt-3">
          <ShapeSurfaceRuntime
            studioTab="examples"
            kind={detail.kind}
            label={detail.label}
            kindDefinitionId={detail.id}
            kindVersion={detail.version}
            visibility={detail.visibility}
            isActive={detail.isActive}
            titleKey={detail.titleKey}
            loadingComponent={detail.loadingComponent}
            isOwnedByViewer={detail.isOwnedByViewer}
            updatedAt={detail.updatedAt}
            fieldData={detail.fieldData}
            emittedJsonSchema={detail.emittedJsonSchema}
          >
            <ShapeExamplesTab
              kind={detail.kind}
              kindDefinitionId={detail.id}
              emittedJsonSchema={detail.emittedJsonSchema}
              isOwnedByViewer={detail.isOwnedByViewer}
            />
          </ShapeSurfaceRuntime>
        </div>
      </div>
    </>
  );
}
