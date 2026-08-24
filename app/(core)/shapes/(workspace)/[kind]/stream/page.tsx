// /shapes/[kind]/stream — the stream simulator: replay the shape's canonical
// example through the REAL chat streaming pipeline (StreamBlockAccumulator →
// SafeBlockRenderer) and verify loading state, progressive fill, final swap.

import { notFound } from "next/navigation";
import { getShapeDetail } from "@/features/content-ir/studio/shape-detail-server";
import ShapeDetailHeader from "@/features/content-ir/studio/components/ShapeDetailHeader";
import ShapeSurfaceRuntime from "@/features/content-ir/studio/components/ShapeSurfaceRuntime";
import ShapeStreamTabLoader from "@/features/content-ir/studio/components/ShapeStreamTabLoader";

interface PageProps {
  params: Promise<{ kind: string }>;
}

export default async function ShapeStreamPage({ params }: PageProps) {
  const { kind } = await params;
  const detail = await getShapeDetail(decodeURIComponent(kind));
  if (!detail) notFound();

  return (
    <>
      <ShapeDetailHeader
        kind={detail.kind}
        label={detail.label}
        isOwnedByViewer={detail.isOwnedByViewer}
      />
      <div className="px-4 pb-10 pt-[var(--shell-header-h)] sm:px-6">
        <div className="mx-auto mt-3 max-w-6xl">
          <ShapeSurfaceRuntime
            studioTab="stream"
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
            <ShapeStreamTabLoader
              kind={detail.kind}
              label={detail.label}
              kindDefinitionId={detail.id}
              loadingComponent={detail.loadingComponent}
            />
          </ShapeSurfaceRuntime>
        </div>
      </div>
    </>
  );
}
