import { CalendarClock } from "lucide-react";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/schedules", {
  title: "Schedules",
  description: "Create and manage scheduled agent and automation tasks.",
  letter: "Sh",
});

export default async function SchedulesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = await getServerAuth();

  if (!isAuthenticated) {
    // Guests never mount the schedules workspace (its roster fetch fails
    // without a session and renders an error panel). Server-side gate per the
    // module-landing-pages doctrine; replace with a real landing later.
    return (
      <ModuleSignInGate
        title="Schedules"
        route="/schedules"
        description="Run agents and automations on a schedule — create, monitor, and manage recurring tasks."
        icon={CalendarClock}
      />
    );
  }

  return children;
}
