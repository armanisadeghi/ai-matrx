/** Route families that must stop guests before any product data is resolved. */
export function routeRequiresAuthentication(pathname: string): boolean {
  return (
    pathname.startsWith("/administration") ||
    pathname.startsWith("/api/admin") ||
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname === "/chat" ||
    pathname.startsWith("/chat/") ||
    pathname === "/hr" ||
    pathname.startsWith("/hr/") ||
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
