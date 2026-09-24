/**
 * Lane S6 — the status line a client reads on her portal. The stages and the moments come from
 * two doors (portal_me's `stage`, record_history as her); these clauses pin what the line says.
 * Real use case: Rincon Plumbing Co's "Your service calls" portal — Requested → Scheduled →
 * On site → Done, stored as option KEYS (`on_site`), history shaped as the door returns it.
 */
import { buildTimeline, stageLabel } from "../timeline";
import type { PortalHistoryEntry, PortalStage } from "../service";

const stage: PortalStage = {
  field: "call_stage",
  label: "Status",
  stages: [
    { key: "requested", label: "Requested", retired: false },
    { key: "scheduled", label: "Scheduled", retired: false },
    { key: "on_site", label: "On site", retired: false },
    { key: "done", label: "Done", retired: false },
    { key: "waiting_on_parts", label: "Waiting on parts", retired: true },
  ],
};

// Newest first, as record_history pages it; one change is wrapped as `{ value }`.
const history: PortalHistoryEntry[] = [
  { version: 4, occurred_at: "2026-09-23T18:40:00Z", operation: "update", changes: [{ key: "call_stage", before: "scheduled", after: "on_site" }] },
  { version: 3, occurred_at: "2026-09-23T15:05:00Z", operation: "update", changes: [{ key: "internal_notes", withheld: true }] },
  { version: 2, occurred_at: "2026-09-22T21:10:00Z", operation: "update", changes: [{ key: "call_stage", before: "requested", after: { value: "scheduled" } }] },
  { version: 1, occurred_at: "2026-09-22T16:00:00Z", operation: "insert", changes: [{ key: "call_stage", after: "requested" }, { key: "problem", after: "Boiler room floor drain backing up" }] },
];

describe("the status line on a portal record", () => {
  it("draws the declared stages in order: passed ones done with their moment, the current one marked, the rest ahead", () => {
    const t = buildTimeline(stage, "on_site", history);
    expect(t).not.toBeNull();
    expect(t!.label).toBe("Status");
    expect(t!.steps.map((s) => `${s.label}:${s.state}`)).toEqual([
      "Requested:done",
      "Scheduled:done",
      "On site:current",
      "Done:ahead",
    ]);
    expect(t!.steps.map((s) => s.reachedAt)).toEqual([
      "2026-09-22T16:00:00Z",
      "2026-09-22T21:10:00Z",
      "2026-09-23T18:40:00Z",
      null,
    ]);
    expect(t!.offList).toBeNull();
  });

  it("never shows a retired stage as a step, and says so when the record sits on one", () => {
    const t = buildTimeline(stage, "waiting_on_parts", history);
    expect(t!.steps.some((s) => s.label === "Waiting on parts")).toBe(false);
    expect(t!.steps.every((s) => s.state === "ahead")).toBe(true);
    expect(t!.offList).toBe("Waiting on parts");
  });

  it("matches an older record that stored the stage's label instead of its key", () => {
    const t = buildTimeline(stage, "On site", []);
    expect(t!.steps.find((s) => s.state === "current")?.key).toBe("on_site");
  });

  it("reads only the stage Field's changes — a withheld office note moves nothing", () => {
    const t = buildTimeline(stage, "scheduled", history.filter((h) => h.version <= 3));
    expect(t!.steps.map((s) => s.state)).toEqual(["done", "current", "ahead", "ahead"]);
  });

  it("is absent when the portal shows no stage for the table", () => {
    expect(buildTimeline(null, "on_site", history)).toBeNull();
    expect(buildTimeline({ ...stage, stages: [] }, "on_site", history)).toBeNull();
  });

  it("names a stored stage by its label for the list rows", () => {
    expect(stageLabel(stage, "on_site")).toBe("On site");
    expect(stageLabel(stage, "something typed by hand")).toBe("something typed by hand");
    expect(stageLabel(null, null)).toBe("");
  });
});
