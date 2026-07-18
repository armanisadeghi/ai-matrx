// /shapes/[kind]/schema — read-only pretty field view (raw emitted JSON
// schema behind the collapsible). Reuses the content-ir schema view component.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getShapeDetail } from "@/features/content-ir/studio/shape-detail-server";
import ShapeDetailHeader from "@/features/content-ir/studio/components/ShapeDetailHeader";
import KindSchemaTab from "@/features/content-ir/admin/KindSchemaTab";

interface PageProps {
  params: Promise<{ kind: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { kind } = await params;
  return { title: `${decodeURIComponent(kind)} schema — Shapes` };
}

export default async function ShapeSchemaPage({ params }: PageProps) {
  const { kind } = await params;
  const detail = await getShapeDetail(decodeURIComponent(kind));
  if (!detail) notFound();

  return (
    <>
      <ShapeDetailHeader kind={detail.kind} label={detail.label} />
      <div className="px-4 pb-10 pt-[var(--shell-header-h)] sm:px-6">
        <div className="mt-3">
          <KindSchemaTab
            kind={detail.kind}
            fieldData={detail.fieldData}
            emittedJsonSchema={detail.emittedJsonSchema}
          />
        </div>
      </div>
    </>
  );
}
