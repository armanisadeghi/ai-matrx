// /shapes/[kind]/table — the kind's RECORDS, org-wide.
//
// The sibling `instances/` tab answers "what have I saved?"; THIS one answers
// "what does my team have, and which of it has a person standing behind it?"
// (DD-131 slice 1). Same layout and header pattern as `instances/`.

import { notFound } from "next/navigation";
import { getShapeDetail } from "@/features/content-ir/studio/shape-detail-server";
import ShapeDetailHeader from "@/features/content-ir/studio/components/ShapeDetailHeader";
import ShapeSurfaceRuntime from "@/features/content-ir/studio/components/ShapeSurfaceRuntime";
import KindRecordsTable from "@/features/content-ir/studio/records/KindRecordsTable";

interface PageProps {
  params: Promise<{ kind: string }>;
}

export default async function ShapeRecordsTablePage({ params }: PageProps) {
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
        <div className="mx-auto mt-3 max-w-[100rem]">
          <ShapeSurfaceRuntime
            studioTab="table"
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
            <KindRecordsTable
              kind={detail.kind}
              label={detail.label}
              kindDefinitionId={detail.id}
              emittedJsonSchema={detail.emittedJsonSchema}
            />
          </ShapeSurfaceRuntime>
        </div>
      </div>
    </>
  );
}
