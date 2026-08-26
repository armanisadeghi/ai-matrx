import { findImagesRoute, IMAGES_ROUTES } from "./imagesRoutes";

describe("Images route authentication boundary", () => {
  it("gates only the private cloud routes in the reviewed guest-access scope", () => {
    expect(
      IMAGES_ROUTES.filter((route) => route.requiresAuthentication).map(
        (route) => route.path,
      ),
    ).toEqual(["/images/my-cloud", "/images/all-files", "/images/upload"]);
  });

  it.each(["/images/public-search", "/images/studio"])(
    "keeps %s public",
    (pathname) => {
      expect(findImagesRoute(pathname)?.requiresAuthentication).not.toBe(true);
    },
  );
});
