import { requestOrigin } from "@/utils/auth/request-origin";

describe("requestOrigin", () => {
  it.each([3000, 3001, 3002])(
    "keeps OAuth on the localhost port where it began (%i)",
    (port) => {
      const headers = new Headers({
        host: `localhost:${port}`,
        origin: `http://localhost:${port}`,
      });

      expect(requestOrigin(headers)).toBe(`http://localhost:${port}`);
    },
  );

  it("uses the externally visible forwarded authority behind a proxy", () => {
    const headers = new Headers({
      host: "internal:3000",
      "x-forwarded-host": "preview.example.com",
      "x-forwarded-proto": "https",
    });

    expect(requestOrigin(headers)).toBe("https://preview.example.com");
  });

  it("rejects malformed origins and authorities", () => {
    const headers = new Headers({
      host: "good.example.com@evil.example",
      origin: "https://good.example.com/callback",
    });

    expect(requestOrigin(headers)).toBeNull();
  });
});
