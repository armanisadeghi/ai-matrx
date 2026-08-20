import {
  deriveReviewArea,
  metadataWithReviewTriage,
  parseReviewMetadata,
  suggestReviewTriage,
} from "@/features/admin/agent-review/triage";

describe("agent review triage", () => {
  it("keeps legacy metadata loud and unclassified", () => {
    expect(
      parseReviewMetadata({ repos: ["aidream", "matrx-frontend"] }),
    ).toEqual({
      state: "missing",
    });
  });

  it("routes unreleased work to deployment while retaining browser verification", () => {
    const triage = suggestReviewTriage({
      title: "Marketing workspace",
      url: "/marketing/workspace",
      instructions: "Review the responsive layout after release.",
      feedback:
        "The branch is uncommitted. Deploy it and retest desktop, tablet, and mobile.",
    });

    expect(triage.lane).toBe("deployment");
    expect(triage.required_tools).toContain("deployment");
    expect(triage.required_tools).toContain("browser");
    expect(triage.workstreams).toContain("responsive_ui");
    expect(triage.assignment).toEqual({ mode: "coordinator", state: "ready" });
  });

  it("routes missing fixtures to database and preserves existing metadata", () => {
    const triage = suggestReviewTriage({
      title: "Shared Knowledge detail",
      url: "/knowledge/library-catalog",
      instructions: "Open the entitled fixture.",
      feedback:
        "The reviewer entitlement is missing and production has stale data.",
    });
    const metadata = metadataWithReviewTriage(
      { feature: "shared-knowledge", repos: ["ai-matrx"] },
      triage,
    );
    const parsed = parseReviewMetadata(metadata);

    expect(triage.lane).toBe("database_data");
    expect(triage.required_tools).toContain("database");
    expect(metadata.feature).toBe("shared-knowledge");
    expect(parsed.state).toBe("ready");
  });

  it("rejects malformed stored triage instead of casting it", () => {
    const parsed = parseReviewMetadata({
      triage: {
        version: 1,
        lane: "looks_good_to_me",
      },
    });

    expect(parsed.state).toBe("invalid");
  });
});

describe("deriveReviewArea", () => {
  it("keeps the feature under its container", () => {
    expect(deriveReviewArea("/marketing/content-plan/abc")).toBe(
      "Marketing › Content Plan",
    );
    expect(deriveReviewArea("/administration/users/agent-review")).toBe(
      "Administration › Users",
    );
  });

  it("handles absolute and protocol-relative urls", () => {
    expect(deriveReviewArea("https://aimatrx.com/marketing/content-plan")).toBe(
      "Marketing › Content Plan",
    );
    expect(deriveReviewArea("//manage.aimatrx.com/education/flashcards")).toBe(
      "Education › Flashcards",
    );
  });

  it("does not turn an id into a feature name", () => {
    expect(
      deriveReviewArea("/marketing/1f0c6379-9c85-4cd9-9174-d23599b80026"),
    ).toBe("Marketing");
    expect(deriveReviewArea("/marketing/42")).toBe("Marketing");
  });

  it("falls back to the first segment outside a container", () => {
    expect(deriveReviewArea("/chat")).toBe("Chat");
    expect(deriveReviewArea("/crm/parties?tab=x")).toBe("Crm");
  });

  it("answers null when there is no usable path", () => {
    expect(deriveReviewArea("")).toBeNull();
    expect(deriveReviewArea(null)).toBeNull();
    expect(deriveReviewArea("https://aimatrx.com")).toBeNull();
  });
});
