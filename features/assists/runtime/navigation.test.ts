import { resolveAssistNavigation } from "./navigation";

const origins = {
  currentOrigin: "https://www.aimatrx.com",
  mainOrigin: "https://www.aimatrx.com",
  adminOrigin: "https://manage.aimatrx.com",
  demosOrigin: "https://demos.aimatrx.com",
};

describe("resolveAssistNavigation", () => {
  it("sends an admin deep link straight to the admin document from the slim app", () => {
    expect(
      resolveAssistNavigation(
        "/administration/agents/hindsight?enrollment=e-1&finding=f-1",
        { ...origins, profile: "slim" },
      ),
    ).toEqual({
      kind: "document",
      href: "https://manage.aimatrx.com/administration/agents/hindsight?enrollment=e-1&finding=f-1",
    });
  });

  it("keeps the same admin deep link in Next when the build contains admin routes", () => {
    expect(
      resolveAssistNavigation("/administration/agents/hindsight", {
        ...origins,
        profile: "full",
      }),
    ).toEqual({ kind: "router", href: "/administration/agents/hindsight" });
  });

  it("sends a main-app assist directly home from the admin satellite", () => {
    expect(
      resolveAssistNavigation("/assists", {
        ...origins,
        profile: "admin",
        currentOrigin: "https://manage.aimatrx.com",
      }),
    ).toEqual({
      kind: "document",
      href: "https://www.aimatrx.com/assists",
    });
  });

  it("preserves query strings and fragments across the demos boundary", () => {
    expect(
      resolveAssistNavigation("/demos/tool?case=42#result", {
        ...origins,
        profile: "core",
      }),
    ).toEqual({
      kind: "document",
      href: "https://demos.aimatrx.com/demos/tool?case=42#result",
    });
  });

  it("uses document navigation for an explicitly external URL", () => {
    expect(
      resolveAssistNavigation("https://example.com/fix", {
        ...origins,
        profile: "slim",
      }),
    ).toEqual({ kind: "document", href: "https://example.com/fix" });
  });
});
