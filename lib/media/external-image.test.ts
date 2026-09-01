import { proxiedExternalImageUrl } from "@/lib/media/external-image";

describe("proxiedExternalImageUrl", () => {
  it("routes the complete external identity through the guarded same-origin proxy", () => {
    const source = "https://cdn.example.com/logo wide.png?v=2&kind=logo";

    expect(proxiedExternalImageUrl(source)).toBe(
      `/api/image-proxy?url=${encodeURIComponent(source)}`,
    );
  });
});
