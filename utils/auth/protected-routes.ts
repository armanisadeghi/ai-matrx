/** Route families that must stop guests before any product data is resolved. */
export function routeRequiresAuthentication(pathname: string): boolean {
  return (
    pathname.startsWith("/administration") ||
    pathname.startsWith("/api/admin") ||
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname === "/chat" ||
    pathname.startsWith("/chat/") ||
    pathname === "/launchpad" ||
    pathname.startsWith("/launchpad/") ||
    pathname === "/scraper" ||
    pathname.startsWith("/scraper/")
  );
}
