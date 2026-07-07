// Kind Registry — the Shape System status board (live shape-doctor matrix,
// diffed against the committed snapshot) + browse/search every registered
// kind (compiled system kinds + content_ir rows), inspect the reference
// graph, and export a provider-ready JSON Schema with referenced kinds
// resolved into $defs. Each kind links to its per-kind page
// (/administration/kind-registry/<kind>: Preview / Gate / Schema / Assets).
// Super-admin gated by the (admin) layout.

import { Suspense } from "react";
import type { Metadata } from "next";
import { Skeleton } from "@/components/ui/skeleton";
import KindRegistryAdminClient from "@/features/content-ir/admin/KindRegistryAdminClient";
import KindStatusBoard from "@/features/content-ir/admin/KindStatusBoard";

export const metadata: Metadata = {
  title: "Kind Registry",
  description:
    "Shape System status board + browse every content-ir kind and export provider-ready JSON Schemas.",
};

function BoardSkeleton() {
  return (
    <section className="space-y-2 border-b border-border bg-card px-4 py-3">
      <Skeleton className="h-5 w-72" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </section>
  );
}

export default function KindRegistryPage() {
  return (
    <div className="h-[calc(100dvh-2.5rem)] overflow-y-auto bg-textured">
      <Suspense fallback={<BoardSkeleton />}>
        <KindStatusBoard />
      </Suspense>
      <KindRegistryAdminClient />
    </div>
  );
}
