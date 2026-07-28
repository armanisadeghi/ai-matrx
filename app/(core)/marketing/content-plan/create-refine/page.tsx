// app/(core)/marketing/content-plan/create-refine/page.tsx
//
// Site Setup — the fourth view of the Content Planning workspace
// (features/marketing/content-plan). Turns a site archetype (concepts + counts)
// into a real plan tree, showing every route it will create before writing any
// of them, and stays useful afterwards as the readiness checklist for a
// half-built site.
//
// Server Component: auth branches here; route chrome injects into the shell
// PageHeader; the body is the client workbench, full-height per (core) doctrine.

import { redirect } from "next/navigation";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

import { SetupHeader } from "./_components/SetupHeader";
import { SetupWorkbench } from "./_components/SetupWorkbench";

export default async function ContentPlanSetupPage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    redirect("/login?next=/marketing/content-plan/create-refine");
  }

  return (
    <>
      <PageHeader>
        <SetupHeader />
      </PageHeader>
      <div className="h-full overflow-hidden">
        <SetupWorkbench />
      </div>
    </>
  );
}
