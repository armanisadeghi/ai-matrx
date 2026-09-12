import { SlidersHorizontal } from "lucide-react";

import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/user-settings", {
  title: "Settings",
  description:
    "User preferences, appearance, AI, voice, profile, and integrations — all in one place.",
});

/**
 * The global AppShell supplies the settings route navigation and its shared
 * provider. This layout owns only access gating for the route family.
 */
export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    return (
      <ModuleSignInGate
        title="Settings"
        route="/user-settings"
        description="Your preferences, appearance, AI, voice, profile, and integrations — all tied to your account."
        icon={SlidersHorizontal}
      />
    );
  }

  return children;
}
