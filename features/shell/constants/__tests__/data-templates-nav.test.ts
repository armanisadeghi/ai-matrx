import { DATA_NAV_CHILDREN } from "../nav-data";
import { TEMPLATE_GALLERY_HREF } from "@/features/make/gallery/galleryHref";

describe("Data > Templates opens the one template gallery", () => {
  it("points at the canonical gallery route, never back at /data", () => {
    const t = DATA_NAV_CHILDREN.find((c) => c.label === "Templates");
    expect(t).toBeDefined();
    expect(t!.href).toBe(TEMPLATE_GALLERY_HREF);
    expect(t!.href).not.toBe("/data");
  });
});
