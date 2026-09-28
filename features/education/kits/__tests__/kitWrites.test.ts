import { parseKitDeletes } from "../kitWrites";
import { kitMembershipFingerprint, requireFreshKitMembership } from "../kitService";
import type { StudyKit } from "../kitService";

const kit: StudyKit = {
  sourceType: "file", sourceId: "source-1", title: "Lecture", createdAt: "2026-09-27T00:00:00Z",
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
});
