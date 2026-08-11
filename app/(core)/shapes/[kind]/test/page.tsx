// /shapes/[kind]/test — the magic moment: fill the canonical KindInputForm
// and watch YOUR component render the instance live through the real route.

import { notFound } from "next/navigation";
import { getShapeDetail } from "@/features/content-ir/studio/shape-detail-server";
import ShapeDetailHeader from "@/features/content-ir/studio/components/ShapeDetailHeader";
import ShapeSurfaceRuntime from "@/features/content-ir/studio/components/ShapeSurfaceRuntime";
import ShapeTestTabLoader from "@/features/content-ir/studio/components/ShapeTestTabLoader";

interface PageProps {
  params: Promise<{ kind: string }>;
}

export default async function ShapeTestPage({ params }: PageProps) {
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
            studioTab="test"
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
            <ShapeTestTabLoader
              kind={detail.kind}
              label={detail.label}
              kindDefinitionId={detail.id}
              kindVersion={detail.version}
              titleKey={detail.titleKey}
              emittedJsonSchema={detail.emittedJsonSchema}
            />
          </ShapeSurfaceRuntime>
        </div>
      </div>
    </>
  );
}
