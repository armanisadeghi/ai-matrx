// app/(core)/search/layout.tsx
//
// /search — one URL, two audiences (module-landing-pages doctrine).
//
// A guest gets the public marketing landing for Matrx Search and is NEVER
// bounced to a login wall. A signed-in visitor gets the search engine itself
// at the same URL, so a shared `/search?q=…` link keeps working for both: the
// guest reads what it is, signs in, and lands back on the search they were
// sent.
//
// The auth branch is made server-side (`getServerAuth()` is request-scope
// cached — the parent layout already paid for it), so the workspace tree and
// the landing tree never leak into each other's bundle.

import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { MarketingPageShell } from "@/features/shell/components/MarketingPageShell";
import SearchLanding from "@/features/auth/components/module-landing/landings/SearchLanding";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/search", {
  title: "Matrx Search",
  description:
    "Search the web and get finished pieces back — direct answers, places with hours and ratings, news, video and discussions. Every search keeps its own link.",
  letter: "S",
  canonicalPath: "/search",
  keywords: ["search", "web search", "AI search", "Matrx Search"],
});

export default async function SearchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = await getServerAuth();

  if (!isAuthenticated) {
    return (
      <MarketingPageShell>
        <SearchLanding />
      </MarketingPageShell>
    );
  }

  return <>{children}</>;
}
