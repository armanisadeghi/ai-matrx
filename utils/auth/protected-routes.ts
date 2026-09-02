/** Route families that must stop guests before any product data is resolved. */
export function routeRequiresAuthentication(pathname: string): boolean {
  return (
    pathname.startsWith("/administration") ||
    pathname.startsWith("/api/admin") ||
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname === "/chat" ||
    pathname.startsWith("/chat/") ||
    // The authenticated Flashcards tool mounts owned-deck, category, and
    // study-data clients. Anonymous decks have their own `/p/e/fc_set/*`
    // surface, so guests must stop here before any of those clients mount.
    pathname === "/education/flashcards" ||
    pathname.startsWith("/education/flashcards/") ||
    // Agent authoring is an account workspace. The public acquisition page is
    // `/agents`, but builders must never mount their data clients as `anon`.
    /^\/agents\/(?:new\/(?:builder|customizer|instant|tabs)|[^/]+\/build)(?:\/|$)/.test(
      pathname,
    ) ||
    pathname === "/hr" ||
    pathname.startsWith("/hr/") ||
    // The departed-member portal needs a signed-in person: consent to disclose your own income
    // is the subject's and nobody else's, so there is no anonymous lane into it.
    pathname === "/portal" ||
    pathname.startsWith("/portal/") ||
    pathname === "/launchpad" ||
    pathname.startsWith("/launchpad/") ||
    pathname === "/projects" ||
    pathname.startsWith("/projects/") ||
    pathname === "/scraper" ||
    pathname.startsWith("/scraper/") ||
    pathname === "/tasks" ||
    pathname.startsWith("/tasks/")
  );
}
