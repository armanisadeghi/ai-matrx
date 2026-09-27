import { routeMenuRegistry } from "../../constants/route-menu-registry";

/**
 * 🚨 A LARGE ROUTE'S SIDEBAR IS RESOLVED ON THE SERVER (page-pass shared
 * defects, 2026-09-27). The view used to start as "main" and flip to the route
 * menu after hydration + a dynamic import, so /chat/* painted the whole main
 * menu for ~1s and then swapped. The request's pathname already names the
 * route family: the first paint shows the route view and a skeleton shaped
 * like its menu, and `RouteMenuSlot` fills it in place.
 */
export function initialSidebarView(pathname: string): "main" | "route" {
  return routeMenuRegistry.some((entry) => entry.pathPattern.test(pathname)) ? "route" : "main";
}
