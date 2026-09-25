// app/(admin)/administration/knowledge/search-lab/page.tsx
//
// The Knowledge Search Lab in the ADMIN section. The same component as
// /rag/search, but here it rides the admin lane: its inventory and diagnose
// calls use the super-admin `/admin/rag/search-lab/*` twins
// (lib/api/adminDoor.ts) and the "bypass ACL" control appears. On the user
// page an admin sees exactly what anyone else sees (Arman, 2026-09-25).

import { Suspense } from "react";
import { RagSearchExperience } from "@/features/rag/components/search/RagSearchExperience";

export const metadata = {
  title: "Search Lab · Knowledge · Administration",
  description:
    "Knowledge search lab with admin reach: every store's inventory, pipeline diagnosis, and ACL bypass.",
};

export default function Page() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-md bg-muted/50" />}>
      <RagSearchExperience />
    </Suspense>
  );
}
