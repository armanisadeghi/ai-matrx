import { ShieldCheck } from "lucide-react";

import { DataLifecyclePage } from "@/features/settings/pages/DataLifecyclePage";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/settings/data", {
  titlePrefix: "Your data",
  title: "Settings",
  description:
    "What's scheduled to be deleted, when it goes, and how to keep it.",
  letter: "YD",
});

/**
 * /settings/data — the page the weekly data-lifecycle digest links to.
 *
 * Kept separate from /education/data (the learner's export/import back door):
 * that page is about taking your study material with you; this one is about the
 * platform-wide retention clock, for every kind of data, learner or not.
 */
export default async function DataLifecycleRoute() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    return (
      <ModuleSignInGate
        title="Your data"
        route="/settings/data"
        description="See what's scheduled to be deleted and keep anything you want to hold on to."
        icon={ShieldCheck}
      />
    );
  }

  return (
    <div className="h-full overflow-hidden">
      <DataLifecyclePage />
    </div>
  );
}
