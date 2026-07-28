// app/(core)/marketing/content-plan/create-dense/page.tsx
//
// The archetype console — the fourth view of the Content Planning workspace,
// alongside Tree / Map / Entities. Its one job: take a site from nothing (or
// half-built) to a structured plan in a couple of minutes, showing the exact
// routes that will be created before anything is written.
//
// Server Component: auth branches server-side, route chrome goes into the
// shell header, and the body is the client console, full-height per (core)
// doctrine.

import { redirect } from "next/navigation";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

import { ArchetypeConsole } from "./_components/ArchetypeConsole";

export const metadata = {
  title: "Plan from an archetype",
};

export default async function ContentPlanCreateDensePage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    redirect("/login?next=/marketing/content-plan/create-dense");
  }

  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center gap-2 pr-14">
          <span className="truncate text-sm font-medium text-foreground">
            Plan from an archetype
          </span>
          <span className="hidden truncate text-xs text-muted-foreground sm:inline">
            declare the shape and the counts — see every route before it is created
          </span>
        </div>
      </PageHeader>
      <div className="h-full overflow-hidden">
        <ArchetypeConsole />
      </div>
    </>
  );
}
