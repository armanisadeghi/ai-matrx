// app/(core)/marketing/content-plan/create-reimagine/page.tsx
//
// The Blueprint Bench — go from nothing (or a half-built site) to a structured
// plan in a couple of minutes, with the exact routes on screen before anything
// is written. A peer view of the content-plan workspace; it never touches the
// tree or the pillar map, it only feeds them.
//
// Server Component: auth branches server-side, route chrome goes into the shell
// header, the body is the client bench at full height per (core) doctrine.

import { redirect } from "next/navigation";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

import { BenchHeader } from "./_components/BenchHeader";
import { BlueprintBench } from "./_components/BlueprintBench";

export default async function ContentPlanBlueprintPage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    redirect("/login?next=/marketing/content-plan/create-reimagine");
  }

  return (
    <>
      <PageHeader>
        <BenchHeader />
      </PageHeader>
      <div className="h-full overflow-hidden">
        <BlueprintBench />
      </div>
    </>
  );
}
