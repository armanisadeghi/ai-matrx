import { routeRequiresAuthentication } from "@/utils/auth/protected-routes";

describe("protected workspace routes", () => {
  it.each([
    "/chat",
    "/chat/new",
    "/chat/conversation-1?view=focus",
    "/hr",
    "/hr/tasks",
    "/hr/tasks/instance-1?step=step-1",
  ])(
    "stops a guest before rendering %s",
    (pathname) => {
      expect(routeRequiresAuthentication(pathname.split("?")[0])).toBe(true);
    },
  );

  it.each(["/", "/features", "/education", "/p/public-app"])(
    "keeps public acquisition route %s public",
    (pathname) => {
      expect(routeRequiresAuthentication(pathname)).toBe(false);
    },
  );
});
