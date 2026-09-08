/**
 * router.push to a surface this build cannot serve makes the same failed RSC
 * fetch a <Link> prefetch does. The door turns it into a document navigation.
 */
let assign: jest.Mock;
let replace: jest.Mock;

const load = async (profile: string) => {
  jest.resetModules();
  process.env.NEXT_PUBLIC_MATRX_PROFILE = profile;
  const mod = await import("@/lib/deployment/navigate");
  assign = jest.fn();
  replace = jest.fn();
  mod.documentNavigation.assign = assign;
  mod.documentNavigation.replace = replace;
  return mod;
};

const originalProfile = process.env.NEXT_PUBLIC_MATRX_PROFILE;

afterAll(() => {
  process.env.NEXT_PUBLIC_MATRX_PROFILE = originalProfile;
});

it("leaves the origin instead of asking the router for a foreign route", async () => {
  const { pushAppHref } = await load("slim");
  const router = { push: jest.fn(), replace: jest.fn() };
  pushAppHref(router, "/administration/mandates");
  expect(router.push).not.toHaveBeenCalled();
  expect(assign).toHaveBeenCalledWith(
    "https://manage.aimatrx.com/administration/mandates",
  );
});

it("replace leaves the origin the same way", async () => {
  const { replaceAppHref } = await load("slim");
  const router = { push: jest.fn(), replace: jest.fn() };
  replaceAppHref(router, "/demos/chat", { scroll: false });
  expect(router.replace).not.toHaveBeenCalled();
  expect(replace).toHaveBeenCalledWith(
    "https://demos.aimatrx.com/demos/chat",
  );
});

it("stays on the router — options and all — for a route this build serves", async () => {
  const { pushAppHref, replaceAppHref } = await load("admin");
  const router = { push: jest.fn(), replace: jest.fn() };
  pushAppHref(router, "/administration/mandates");
  replaceAppHref(router, "/administration/users", { scroll: false });
  expect(router.push).toHaveBeenCalledWith("/administration/mandates", undefined);
  expect(router.replace).toHaveBeenCalledWith("/administration/users", {
    scroll: false,
  });
  expect(assign).not.toHaveBeenCalled();
});

export {};
