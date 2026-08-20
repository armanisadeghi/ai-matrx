import {
  createAutomaticFaviconConfig,
  deriveRouteFaviconLetter,
  getFaviconConfigByPath,
} from "./favicon-utils";
import { createRouteMetadata } from "./route-metadata";

describe("route metadata", () => {
  it("leaves branding to the root title template", () => {
    const metadata = createRouteMetadata("/agents", {
      titlePrefix: "Build",
      title: "Agents",
      description: "Build an agent.",
    });

    expect(metadata.title).toBe("Build | Agents");
    expect(metadata.openGraph).toMatchObject({
      title: "Build | Agents | AI Matrx",
    });
    expect(metadata.openGraph).toMatchObject({
      images: [
        expect.objectContaining({
          url: expect.stringContaining("/social-card?"),
        }),
      ],
    });
  });

  it("creates a purpose-specific, private-safe social card", () => {
    const metadata = createRouteMetadata("/chat", {
      title: "Approval needed",
      description: "A secure action is waiting.",
      socialCard: {
        eyebrow: "Text assistant",
        intent: "Action waiting",
        seed: "non-sensitive-seed",
      },
    });

    const images = metadata.openGraph && "images" in metadata.openGraph
      ? metadata.openGraph.images
      : undefined;
    expect(JSON.stringify(images)).toContain("Action+waiting");
    expect(JSON.stringify(images)).not.toContain("tool_arguments");
  });

  it("creates a stable fallback favicon for an unregistered route", () => {
    const first = createAutomaticFaviconConfig("/future-workspace/review");
    const second = getFaviconConfigByPath("/future-workspace/review");

    expect(first).toEqual(second);
    expect(first.letter).toBe("Re");
    expect(
      createRouteMetadata("/future-workspace/review", {
        title: "Review",
      }).icons,
    ).toBeTruthy();
  });

  it("ignores UUID identity segments when deriving a badge", () => {
    expect(
      deriveRouteFaviconLetter(
        "/vision-interview/9f6b9e02-4d66-4d61-a6c2-c08cf34c76f9",
      ),
    ).toBe("Vi");
  });

  it("matches registry prefixes on path boundaries only", () => {
    expect(getFaviconConfigByPath("/tasks/active")).toEqual(
      getFaviconConfigByPath("/tasks"),
    );
    expect(getFaviconConfigByPath("/tasks-extra")).not.toEqual(
      getFaviconConfigByPath("/tasks"),
    );
  });
});
