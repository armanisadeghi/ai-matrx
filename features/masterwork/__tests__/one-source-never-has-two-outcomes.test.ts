/**
 * THE GUARD for the twelfth cold walk's D3: one source, one outcome, and a
 * contradictory pair impossible by construction.
 *
 * WHAT WAS ON SCREEN (cold-walk-12/screenshots/35_repro_single.png): a file
 * pile of six attached files rendered THIRTEEN rows, and among them
 *
 *   ⚠ 04_field_sheet_photo.png: Reading “04_field_sheet_photo.png” failed …
 *   ✓ 04_field_sheet_photo.png: 3 draft rule(s) added.
 *
 * at the same moment, over the headline "13 of 13 sources read".
 *
 * WHY. The dump payload is the union of the attached edges and every kept
 * Source — and those two sets OVERLAP the moment a file has been read once,
 * because `file_ingest.py` claims `file:<id>` as a kept Source before it
 * spends. So the same photo was launched twice, as `entity/file/<id>` and as
 * `kept_source`/`file:<id>`, the fan-out ran and charged for it twice, and the
 * two attempts disagreed.
 *
 * TWO LAYERS, BOTH GUARDED HERE:
 *   1. the payload never carries one source twice (`dumpResources`);
 *   2. and if one ever arrives twice anyway — a replayed resume event, a lane
 *      staging its own payload — the LAST report wins and exactly one row is
 *      rendered (`visibleResources`).
 *
 * PROVEN FAILING FIRST, 2026-09-20:
 *   * restoring `...input.keptRows.map(…)` in `dumpResources` reddens
 *     "the payload never sends one source twice" (2 assertions);
 *   * making `visibleResources` return `progress.resources` unchanged reddens
 *     "the later report is the only row" (3 assertions).
 */

import {
  dumpResources,
  serverSourceKeyForEntity,
} from "../components/detail/RulebookSourcesPanel";
import {
  EMPTY_INGEST_PROGRESS,
  progressHeadline,
  reduceIngestProgress,
  visibleResources,
} from "../durable-run/ingestProgress";

const PHOTO_ID = "6f0f1d2e-0000-4000-8000-000000000004";

describe("one source never has two outcomes", () => {
  it("the payload never sends one source twice", () => {
    const resources = dumpResources({
      sourceLinks: [
        { token: "file", resourceId: PHOTO_ID, label: "04_field_sheet_photo.png" },
      ],
      stagedUrls: [],
      keptRows: [
        // What the FIRST pass left behind — the same photo, as a kept Source.
        {
          source_key: serverSourceKeyForEntity("file", PHOTO_ID),
          label: "04_field_sheet_photo.png",
        },
        // A genuinely kept-only source: an interview's own turns. Untouched.
        { source_key: "conversation:abc", label: "Talk it through" },
      ],
      titleFor: (_t, _i, label) => label ?? "Source",
    });

    expect(resources).toHaveLength(2);
    expect(resources.filter((r) => r.kind === "kept_source")).toEqual([
      { kind: "kept_source", source_key: "conversation:abc", title: "Talk it through" },
    ]);
    // And the attached edge is the one that survives — it is the row the
    // person can see and remove.
    expect(resources[0]).toMatchObject({ kind: "entity", token: "file", id: PHOTO_ID });
  });

  it("mirrors the server's own file identity, so the match is exact", () => {
    // aidream `source_identity.entity_source_key`: a file is `file:<id>`
    // whether it arrives as an entity reference or as a file_id.
    expect(serverSourceKeyForEntity("file", PHOTO_ID)).toBe(`file:${PHOTO_ID}`);
    expect(serverSourceKeyForEntity("udt_document", "d1")).toBe(
      "entity:udt_document:d1",
    );
  });

  it("the later report is the only row when one source is reported twice", () => {
    const failed = {
      step: "resource_failed",
      resource_index: 0,
      resource_count: 2,
      kind: "entity",
      token: "file",
      id: PHOTO_ID,
      title: "04_field_sheet_photo.png",
      message:
        "Reading “04_field_sheet_photo.png” failed (AppError). Nothing was added to your Rulebook.",
      rules_added_total: 0,
    };
    const succeeded = {
      step: "resource_done",
      resource_index: 1,
      resource_count: 2,
      kind: "entity",
      token: "file",
      id: PHOTO_ID,
      title: "04_field_sheet_photo.png",
      message: "04_field_sheet_photo.png: 3 draft rule(s) added.",
      rules_added: 3,
      rules_added_total: 3,
    };

    let progress = reduceIngestProgress(
      EMPTY_INGEST_PROGRESS,
      "masterwork_dump_progress",
      failed,
    );
    progress = reduceIngestProgress(progress, "masterwork_dump_progress", succeeded);

    const rows = visibleResources(progress);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("completed");
    // And the headline counts the one row, not the two slots.
    expect(progressHeadline(progress)).not.toMatch(/2 of 2/);
  });

  it("never collapses two different sources", () => {
    const base = { resource_count: 2, kind: "entity", token: "file", rules_added_total: 0 };
    let progress = reduceIngestProgress(
      EMPTY_INGEST_PROGRESS,
      "masterwork_dump_progress",
      { ...base, step: "resource_done", resource_index: 0, id: "a", title: "a.md" },
    );
    progress = reduceIngestProgress(progress, "masterwork_dump_progress", {
      ...base,
      step: "resource_failed",
      resource_index: 1,
      id: "b",
      title: "b.md",
      message: "Reading “b.md” failed (AppError).",
    });
    expect(visibleResources(progress)).toHaveLength(2);
    expect(progressHeadline(progress)).toContain("1 of 2 read · 1 failed");
  });

  it("a failed row's raw class name never survives into the rendered detail", () => {
    const progress = reduceIngestProgress(
      EMPTY_INGEST_PROGRESS,
      "masterwork_dump_progress",
      {
        step: "resource_failed",
        resource_index: 0,
        resource_count: 1,
        kind: "entity",
        token: "file",
        id: PHOTO_ID,
        title: "04_field_sheet_photo.png",
        message:
          "Reading “04_field_sheet_photo.png” failed (AppError). Nothing was added to your Rulebook.",
      },
    );
    const detail = visibleResources(progress)[0]?.detail ?? "";
    expect(detail).not.toContain("AppError");
    expect(detail).toContain("did not say why");
  });
});
