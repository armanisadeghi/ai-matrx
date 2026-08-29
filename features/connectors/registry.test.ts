import { getComingSoon } from "@/lib/coming-soon/registry";
import { getConnector } from "./registry";

describe("connector availability registry", () => {
  it("keeps the Google strip label compact while describing its capabilities", () => {
    const google = getConnector("google-workspace");

    expect(google).toMatchObject({
      name: "Google",
      blurb: "Read and update docs and sheets you choose",
      surfaces: ["strip", "directory"],
    });
  });

  it("publishes Notion as a live per-user integration", () => {
    const notion = getConnector("notion");

    expect(notion).toMatchObject({
      id: "notion",
      manageHref: "/user-settings/integrations",
      surfaces: ["strip", "directory"],
    });
    expect(notion?.comingSoonId).toBeUndefined();
    expect(getComingSoon("connectors.notion")).toBeUndefined();
  });
});
