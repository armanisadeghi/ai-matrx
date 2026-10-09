import { buildKitDetailScope, orderKitArtifacts } from "../kitSurfaceScope";
import type { GeneratedArtifact } from "@/features/education/convert/lineage";
import type { StudyKit } from "../kitService";

function artifact(
  targetKind: GeneratedArtifact["targetKind"],
  artifactType: string,
  n: number,
): GeneratedArtifact {
  return {
    edgeId: `edge-${n}`,
    targetKind,
    artifactType,
    artifactId: `00000000-0000-4000-8000-00000000000${n}`,
    title: `Aid ${n}`,
    href: `/education/x/${n}`,
    detail: null,
    sourceTitle: "Cell Biology",
    createdAt: "2026-09-20T00:00:00Z",
  };
}

const kit: StudyKit = {
  sourceType: "file", sources: [],
  sourceId: "11111111-1111-4111-8111-111111111111",
  title: "Cell Biology",
  createdAt: "2026-09-20T00:00:00Z",
  artifacts: [
    artifact("quiz", "assessment", 1),
    artifact("deck", "fc_set", 2),
    artifact("summary", "study_media", 3),
  ],
};

describe("kit surface scope", () => {
  it("orders aids along the study path (understand → stick → prove)", () => {
    expect(orderKitArtifacts(kit).map((a) => a.targetKind)).toEqual([
      "summary",
      "deck",
      "quiz",
    ]);
  });

  it("builds the ready detail scope, recommending a due aid first", () => {
    const deckKey = `fc_set:${kit.artifacts[1].artifactId}`;
    const scope = buildKitDetailScope({
      sourceId: kit.sourceId,
      sourceType: "file",
      kit,
      loading: false,
      loadError: false,
      stats: {
        [deckKey]: {
          itemCount: 20,
          studiedCount: 8,
          accuracy: 0.75,
          dueCount: 3,
          lastStudiedAt: null,
          topic: null,
          difficulty: null,
          durationSeconds: null,
          sourceTitle: "Cell Biology",
          hasProgress: true,
        },
      },
      statsLoading: false,
      statsFailed: false,
    }) as Record<string, unknown>;
    expect(scope.view).toBe("detail");
    expect(scope.kit_status).toBe("ready");
    expect(scope.kit_title).toBe("Cell Biology");
    expect((scope.study_aids as unknown[]).length).toBe(3);
    expect(scope.kit_totals).toEqual({
      study_aids: 3,
      practice_items: 20,
      practiced: 8,
      due_now: 3,
    });
    expect(scope.next_challenge).toMatchObject({ kind: "deck", reason: "due" });
  });

  it("carries only status + identity while loading or empty", () => {
    const loading = buildKitDetailScope({
      sourceId: kit.sourceId,
      sourceType: "file",
      kit: null,
      loading: true,
      loadError: false,
      stats: {},
      statsLoading: true,
      statsFailed: false,
    }) as Record<string, unknown>;
    expect(loading).toEqual({
      view: "detail",
      kit_status: "loading",
      kit_source_id: kit.sourceId,
      kit_source_type: "file",
    });
  });
});
