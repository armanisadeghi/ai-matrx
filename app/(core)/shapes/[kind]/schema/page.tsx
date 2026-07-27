// /shapes/[kind]/schema — read-only pretty field view (raw emitted JSON
// schema behind the collapsible). Reuses the content-ir schema view component.

import { notFound } from "next/navigation";
import { getShapeDetail } from "@/features/content-ir/studio/shape-detail-server";
import ShapeDetailHeader from "@/features/content-ir/studio/components/ShapeDetailHeader";
import KindSchemaTab from "@/features/content-ir/admin/KindSchemaTab";
import ShapeSurfaceRuntime from "@/features/content-ir/studio/components/ShapeSurfaceRuntime";

interface PageProps {
  params: Promise<{ kind: string }>;
}

export default async function ShapeSchemaPage({ params }: PageProps) {
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
        <div className="mt-3">
          <ShapeSurfaceRuntime
            studioTab="schema"
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
            <KindSchemaTab
              kind={detail.kind}
              fieldData={detail.fieldData}
              emittedJsonSchema={detail.emittedJsonSchema}
            />
          </ShapeSurfaceRuntime>
        </div>
      </div>
    </>
  );
}
