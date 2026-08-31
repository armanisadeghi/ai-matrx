import { routeRequiresAuthentication } from "@/utils/auth/protected-routes";

describe("protected workspace routes", () => {
  it.each([
    "/chat",
    "/chat/new",
    "/chat/conversation-1?view=focus",
    "/agents/5f1dd21f-b77a-4693-8493-6756fa56f80e/build",
    "/agents/new/builder",
    "/agents/new/customizer",
    "/hr",
    "/hr/tasks",
    "/hr/tasks/instance-1?step=step-1",
    "/projects",
    "/projects/042f5378-e46e-4d59-be7b-54664e3016bb",
    "/projects/042f5378-e46e-4d59-be7b-54664e3016bb/settings",
    "/tasks",
    "/tasks/f750e2e5-889b-4250-a7d1-c47bb89655c5",
  ])("stops a guest before rendering %s", (pathname) => {
    expect(routeRequiresAuthentication(pathname.split("?")[0])).toBe(true);
  });

  it.each(["/project", "/task", "/taskboard", "/projects-public"])(
    "does not overmatch neighboring route %s",
    (pathname) => {
      expect(routeRequiresAuthentication(pathname)).toBe(false);
    },
  );

  it.each([
    "/",
    "/features",
    "/education",
    "/agents",
    "/agents/all",
    "/p/public-app",
  ])("keeps public acquisition route %s public", (pathname) => {
    expect(routeRequiresAuthentication(pathname)).toBe(false);
  });
});
