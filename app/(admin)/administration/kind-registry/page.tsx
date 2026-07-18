// Kind Registry — ONE tabbed admin surface for the Shape System:
//  - Catalog (default): canonical MatrxDataTable of every kind (sort / filter
//    / sticky header / facets); row click → /administration/kind-registry/<kind>.
//  - Board: the live shape-doctor matrix diffed against the committed snapshot.
//  - Schema Export: browse compiled + DB kinds, reference graph, provider-ready
//    JSON Schema export with $defs.
// The shape doctor runs ONCE server-side (buildKindStatusBoard) and feeds both
// the Catalog and the Board. Super-admin gated by the (admin) layout.

import { Suspense } from "react";
import type { Metadata } from "next";
import { Skeleton } from "@/components/ui/skeleton";
import { buildKindStatusBoard } from "@/features/content-ir/admin/shape-doctor-server";
import type { KindStatusBoardModel } from "@/features/content-ir/admin/kind-detail-types";
import KindRegistryPageClient from "@/features/content-ir/admin/KindRegistryPageClient";

export const metadata: Metadata = {
  title: "Kind Registry",
  description:
    "Shape System catalog, live status board, and provider-ready JSON Schema export for every content-ir kind.",
};

function PageSkeleton() {
  return (
    <div className="h-[calc(100dvh-2.5rem)] space-y-3 bg-textured p-4">
      <Skeleton className="h-8 w-96" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-[60dvh] w-full" />
    </div>
  );
}

async function KindRegistryContent({
  initialTab,
}: {
  initialTab: string | undefined;
}) {
  let board: KindStatusBoardModel | null = null;
  let boardError: string | null = null;
  try {
    board = await buildKindStatusBoard();
  } catch (error) {
    // Loud failure — the page shows the error, never a fabricated matrix.
    boardError = error instanceof Error ? error.message : String(error);
  }
  return (
    <KindRegistryPageClient
      board={board}
      boardError={boardError}
      initialTab={initialTab}
    />
  );
}

export default async function KindRegistryPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  return (
    <Suspense fallback={<PageSkeleton />}>
      <KindRegistryContent initialTab={tab} />
    </Suspense>
  );
}
