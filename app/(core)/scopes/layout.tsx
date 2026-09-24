// Server Component layout. Guests never see the scopes workspace (or its
// sub-routes /scopes/settings, /scopes/templates) — they get the full
// <ScopesLanding /> marketing page, server-rendered, per the notes/layout.tsx
// exemplar. Authed users render the workspace tree unchanged.

import ScopesLanding from "@/features/auth/components/module-landing/landings/ScopesLanding";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/scopes", {
  title: "Scopes",
  description:
    "Define the dimensions your team works in — clients, products, teams, repos, and more.",
  letter: "S",
});

export default async function ScopesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) {
    return <ScopesLanding />;
  }
  return children;
}
