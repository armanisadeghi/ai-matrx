import { describeServerTarget } from "@/lib/api/server-identity";

describe("a server badge says where the calls land, not the slot's name", () => {
  it("the clone preview: slot 'production', URL localhost:8200, clone database → Clone", () => {
    expect(
      describeServerTarget({
        activeServer: "production",
        baseUrl: "http://localhost:8200",
        supabaseUrl: "https://ajrnyxwasqbmxdmzvfdy.supabase.co",
      }),
    ).toEqual({ kind: "clone", label: "Clone", host: "localhost:8200" });
  });

  it("real production: production slot, production server, production database", () => {
    expect(
      describeServerTarget({
        activeServer: "production",
        baseUrl: "https://server.app.matrxserver.com",
        supabaseUrl: "https://db.matrxserver.com",
      }),
    ).toEqual({ kind: "production", label: "Production", host: "server.app.matrxserver.com" });
  });

  it("a local server against production data is Local, never Production", () => {
    expect(
      describeServerTarget({
        activeServer: "production",
        baseUrl: "http://localhost:8000",
        supabaseUrl: "https://db.matrxserver.com",
      }).label,
    ).toBe("Local");
  });
});
