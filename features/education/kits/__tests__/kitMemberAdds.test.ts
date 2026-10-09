import { parseKitMemberAdds } from "../kitWrites";
import { buildKitDetailScope } from "../kitSurfaceScope";
import { kitMembershipFingerprint } from "../kitService";
import type { StudyKit } from "../kitService";
import type { EducationLibraryRow } from "@/features/education/library/types";

const kit: StudyKit = {
  sourceType: "file", sources: [], sourceId: "source-1", title: "Lecture", createdAt: "2026-09-27T00:00:00Z",
  artifacts: [{ edgeId: "edge-1", artifactType: "study_media", artifactId: "aid-1", targetKind: "summary", title: "Summary", href: "/education/summaries/aid-1", detail: null, sourceTitle: "Lecture", createdAt: "2026-09-27T00:00:00Z" }],
};
const row = (id: string, kind = "fc_set"): EducationLibraryRow => ({ id, kind, title: `Aid ${id}`, subtype: "deck" } as unknown as EducationLibraryRow);
const candidates = [row("deck-1"), row("deck-2"), row("aid-1", "study_media")];
const entry = (over: Record<string, unknown> = {}) => ({
  source_id: "source-1", source_type: "file", expected_membership_fingerprint: kitMembershipFingerprint(kit),
  artifact_refs: [{ kind: "fc_set", id: "deck-1" }], ...over,
});

describe("add_kit_members on the open kit", () => {
  it("plans the named candidates against the open kit", () => {
    const plan = parseKitMemberAdds([entry({ artifact_refs: [{ kind: "fc_set", id: "deck-1" }, { kind: "fc_set", id: "deck-2" }] })], kit, candidates);
    expect(plan.artifacts.map((a) => a.id)).toEqual(["deck-1", "deck-2"]);
    expect(plan.title).toBe("Lecture");
    expect(plan.expectedFingerprint).toBe(kitMembershipFingerprint(kit));
  });
  it("refuses a stale fingerprint, another kit, an unknown aid, an aid already in the kit and a repeat", () => {
    expect(() => parseKitMemberAdds([entry({ expected_membership_fingerprint: "old" })], kit, candidates)).toThrow(/stale/);
    expect(() => parseKitMemberAdds([entry({ source_id: "other" })], kit, candidates)).toThrow(/kit_source_id/);
    expect(() => parseKitMemberAdds([entry({ artifact_refs: [{ kind: "fc_set", id: "nope" }] })], kit, candidates)).toThrow(/kit_member_candidates/);
    expect(() => parseKitMemberAdds([entry({ artifact_refs: [{ kind: "study_media", id: "aid-1" }] })], kit, candidates)).toThrow(/already in this kit/);
    expect(() => parseKitMemberAdds([entry({ artifact_refs: [{ kind: "fc_set", id: "deck-1" }, { kind: "fc_set", id: "deck-1" }] })], kit, candidates)).toThrow(/distinct/);
    expect(() => parseKitMemberAdds([entry(), entry()], kit, candidates)).toThrow(/exactly one/);
  });
});

describe("kit_member_candidates on the open kit", () => {
  const base = { sourceId: "source-1", sourceType: "file", kit, loading: false, loadError: false, stats: {}, statsLoading: false, statsFailed: false };
  it("is published with ids, names and kinds, leaving out aids already in the kit", () => {
    const scope = buildKitDetailScope({ ...base, memberCandidates: candidates }) as unknown as Record<string, unknown>;
    expect(scope.kit_member_candidates).toEqual([
      { id: "deck-1", title: "Aid deck-1", kind: "fc_set", subtype: "deck" },
      { id: "deck-2", title: "Aid deck-2", kind: "fc_set", subtype: "deck" },
    ]);
  });
  it("is absent while the candidates have not loaded", () => {
    const scope = buildKitDetailScope(base) as unknown as Record<string, unknown>;
    expect(scope.kit_member_candidates).toBeUndefined();
  });
});
