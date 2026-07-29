import { Globe } from "lucide-react";
import { createRouteMetadata } from "@/utils/route-metadata";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

export const metadata = createRouteMetadata("/cms", {
  title: "Content",
  description: "Manage websites, pages, and CMS content.",
  letter: "Cm",
});

/**
 * Server-side auth branch (module-landing-pages doctrine): guests must never
 * see the CMS workspace's client-side load errors. No CmsLanding exists yet,
 * so the shared sign-in gate covers /cms and every sub-route.
 */
export default async function CmsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    return (
      <ModuleSignInGate
        title="Content"
        route="/cms"
        description="Manage websites, pages, and CMS content for your client sites."
        icon={Globe}
      />
    );
  }
  return children;
}
