import { parseKitDeletes } from "../kitWrites";
import { kitMembershipFingerprint, requireFreshKitMembership } from "../kitService";
import type { StudyKit } from "../kitService";

const kit: StudyKit = {
  sourceType: "file", sources: [], sourceId: "source-1", title: "Lecture", createdAt: "2026-09-27T00:00:00Z",
  artifacts: [{ edgeId: "edge-1", artifactType: "study_media", artifactId: "aid-1", targetKind: "summary", title: "Summary", href: "/education/summaries/aid-1", detail: null, sourceTitle: "Lecture", createdAt: "2026-09-27T00:00:00Z" }],
};

describe("kit writes", () => {
  it("refuses a missing membership fingerprint before any mutation can run", () => {
    expect(() => parseKitDeletes([{ source_type: "file", source_id: "source-1" }], [kit]))
      .toThrow(/expected_membership_fingerprint needs text/);
  });

  it("refuses a stale membership before a writer can mutate an edge", () => {
    expect(() => requireFreshKitMembership(kit, `${kitMembershipFingerprint(kit)}:stale`))
      .toThrow(/changed since it was reviewed/);
  });

  it("refuses a token captured before a kit rename", () => {
    const token = kitMembershipFingerprint(kit);
    const renamed = { ...kit, artifacts: kit.artifacts.map((artifact) => ({ ...artifact, sourceTitle: "Renamed lecture" })) };
    expect(() => requireFreshKitMembership(renamed, token)).toThrow(/changed since it was reviewed/);
  });

  it("accepts a batch that deletes two distinct kits", () => {
    const other = { ...kit, sourceId: "source-2", title: "Second lecture" };
    const plans = parseKitDeletes([
      { source_type: "file", source_id: kit.sourceId, expected_membership_fingerprint: kitMembershipFingerprint(kit) },
      { source_type: "file", source_id: other.sourceId, expected_membership_fingerprint: kitMembershipFingerprint(other) },
    ], [kit, other]);
    expect(plans.map((plan) => plan.kit.sourceId)).toEqual(["source-1", "source-2"]);
  });
});
