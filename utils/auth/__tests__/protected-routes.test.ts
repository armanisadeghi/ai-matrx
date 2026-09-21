import { routeRequiresAuthentication } from "@/utils/auth/protected-routes";

describe("protected workspace routes", () => {
  it.each([
    "/chat",
    "/chat/new",
    "/chat/conversation-1?view=focus",
    "/education/flashcards",
    "/education/flashcards/set-123",
    "/education/flashcards/set-123/study?mode=classic",
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
    "/education/study-aids/flashcards",
    "/p/e/fc_set/public-set",
    "/agents",
    "/agents/all",
    "/p/public-app",
  ])("keeps public acquisition route %s public", (pathname) => {
    expect(routeRequiresAuthentication(pathname)).toBe(false);
  });

  // `/q/<token>` is an action request: an agent asked the person it works for
  // for ONE thing and texted them a one-tap link. The link IS the capability,
  // and the person tapping it usually has no session — bouncing them to /login
  // would hand somebody a door they cannot open and strand a parked agent turn.
  // aidream decides everything about identity from the bearer token it is
  // forwarded (or is not); this route must never be gated here.
  it.each([
    "/q/8f2b1c4d5e6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2",
    "/q/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  ])("never stops a guest on the action-request link %s", (pathname) => {
    expect(routeRequiresAuthentication(pathname)).toBe(false);
  });
});
