// /shapes — the user-facing Shapes studio LIST page (feature-entry doctrine:
// list-first, the /agents pattern). RLS-scoped browser reads populate the
// list; the header carries the ONE primary action (New Shape).

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { ShapesListHeader } from "@/features/content-ir/studio/components/ShapesListHeader";
import ShapesListClient from "@/features/content-ir/studio/components/ShapesListClient";

export const metadata: Metadata = {
  title: "Shapes",
  description:
    "Design custom structured-content shapes with an agent and see them render live.",
};

export default async function ShapesPage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    redirect("/login?next=/shapes");
  }

  return (
    <>
      <PageHeader>
        <ShapesListHeader />
      </PageHeader>
      <ShapesListClient />
    </>
  );
}
