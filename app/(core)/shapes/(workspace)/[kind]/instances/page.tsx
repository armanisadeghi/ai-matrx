// /shapes/[kind]/instances — the user's saved kind_instance rows for this
// shape: list (validation dot, pinned-version chip), render through the real
// component, edit (prefilled KindInputForm), soft delete, honest repin, and
// the read-only "View as table" Convert Pattern bridge for flat kinds.

import { notFound } from "next/navigation";
import { getShapeDetail } from "@/features/content-ir/studio/shape-detail-server";
import ShapeDetailHeader from "@/features/content-ir/studio/components/ShapeDetailHeader";
import ShapeSurfaceRuntime from "@/features/content-ir/studio/components/ShapeSurfaceRuntime";
import ShapeInstancesTabLoader from "@/features/content-ir/studio/components/ShapeInstancesTabLoader";

interface PageProps {
  params: Promise<{ kind: string }>;
}

export default async function ShapeInstancesPage({ params }: PageProps) {
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
            studioTab="instances"
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
            <ShapeInstancesTabLoader
              kind={detail.kind}
              label={detail.label}
              kindDefinitionId={detail.id}
              currentVersion={detail.version}
              titleKey={detail.titleKey}
            />
          </ShapeSurfaceRuntime>
        </div>
      </div>
    </>
  );
}
