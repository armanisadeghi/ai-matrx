/** Fresh chat surfaces where incognito mode is offered. */
export function isNewChatRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  if (pathname === "/chat/new") return true;
  return /^\/chat\/a\/[^/]+$/.test(pathname);
}
