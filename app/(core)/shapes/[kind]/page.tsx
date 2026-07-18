// /shapes/[kind] — Preview: the shape's canonical examples rendered through
// the REAL production kind route (shared engine with the admin page).

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getShapeDetail } from "@/features/content-ir/studio/shape-detail-server";
import ShapeDetailHeader from "@/features/content-ir/studio/components/ShapeDetailHeader";
import ShapePreviewTab from "@/features/content-ir/studio/components/ShapePreviewTab";

interface PageProps {
  params: Promise<{ kind: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { kind } = await params;
  return { title: `${decodeURIComponent(kind)} — Shapes` };
}

export default async function ShapePreviewPage({ params }: PageProps) {
  const { kind } = await params;
  const detail = await getShapeDetail(decodeURIComponent(kind));
  if (!detail) notFound();

  return (
    <>
      <ShapeDetailHeader kind={detail.kind} label={detail.label} />
      <div className="px-4 pb-10 pt-[var(--shell-header-h)] sm:px-6">
        <div className="mt-3">
          <ShapePreviewTab kind={detail.kind} kindDefinitionId={detail.id} />
        </div>
      </div>
    </>
  );
}
