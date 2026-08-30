// /shapes/[kind]/gate — run the dual gate (structural + render) against a
// real sample. Was admin-only.

import { notFound } from "next/navigation";
import { getShapeDetail } from "@/features/content-ir/studio/shape-detail-server";
import ShapeDetailHeader from "@/features/content-ir/studio/components/ShapeDetailHeader";
import ShapeSurfaceRuntime from "@/features/content-ir/studio/components/ShapeSurfaceRuntime";
import ShapeGateTab from "@/features/content-ir/studio/components/ShapeGateTab";

interface PageProps {
  params: Promise<{ kind: string }>;
}

export default async function ShapeGatePage({ params }: PageProps) {
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
            studioTab="gate"
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
            <ShapeGateTab
              kind={detail.kind}
              kindDefinitionId={detail.id}
              emittedJsonSchema={detail.emittedJsonSchema}
              family={detail.family ?? null}
            />
          </ShapeSurfaceRuntime>
        </div>
      </div>
    </>
  );
}
