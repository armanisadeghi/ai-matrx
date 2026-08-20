// app/(core)/masterwork/new/page.tsx
//
// New Rulebook — the guided Distillation intake, a full page in the house
// guided-intake pattern (like /research/topics/new): big default-filled
// option buttons, then the Approach picker. Every "New Rulebook" entry point
// routes here.

import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { NewRulebookFlow } from "@/features/masterwork/intake/NewRulebookFlow";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/masterwork", {
  titlePrefix: "New Rulebook",
  title: "Masterwork",
  description: "Start a new Rulebook — a guided intake, then your Approach.",
  letter: "M",
});

export default async function NewRulebookRoute() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect("/masterwork");
  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center">
          <Link
            href="/masterwork"
            className="-ml-2 inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Back to Masterwork"
          >
            <ChevronLeft className="h-4 w-4 shrink-0" />
            <span className="font-medium">Masterwork</span>
          </Link>
        </div>
      </PageHeader>
      <div className="h-full w-full overflow-y-auto bg-textured pt-[var(--shell-header-h,2.75rem)]">
        <Suspense fallback={null}>
          <NewRulebookFlow />
        </Suspense>
      </div>
    </>
  );
}
