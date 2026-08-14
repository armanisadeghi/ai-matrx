import {
  formatAssistSourceLabel,
  groupAssistSourceSuppressions,
  isSourceSuppressedUntil,
} from "./source-suppression";

describe("assist source suppression", () => {
  it("distinguishes permanent source suppression from a finite snooze", () => {
    expect(isSourceSuppressedUntil("infinity")).toBe(true);
    expect(isSourceSuppressedUntil("2026-09-01T00:00:00.000Z")).toBe(false);
    expect(isSourceSuppressedUntil(null)).toBe(false);
  });

  it("turns a producer key into user-facing copy", () => {
    expect(formatAssistSourceLabel("seo.finding_rollup.title_presence")).toBe(
      "SEO Finding Rollup Title Presence",
    );
  });

  it("groups every affected row into one reversible source record", () => {
    expect(
      groupAssistSourceSuppressions([
        {
          source_key: "seo.finding_rollup.title_presence",
          metadata: {
            source_suppression: {
              reason: "This check is intentional for this site.",
              suppressed_at: "2026-08-13T01:00:00.000Z",
            },
          },
          updated_at: "2026-08-13T01:00:00.000Z",
        },
        {
          source_key: "seo.finding_rollup.title_presence",
          metadata: {
            source_suppression: {
              reason: "This is the current reason.",
              suppressed_at: "2026-08-13T02:00:00.000Z",
            },
          },
          updated_at: "2026-08-13T02:00:00.000Z",
        },
        {
          source_key: "workflow.run_recovery",
          metadata: {
            source_suppression: {
              reason: "Handled elsewhere.",
              suppressed_at: "2026-08-13T03:00:00.000Z",
            },
          },
          updated_at: "2026-08-13T03:00:00.000Z",
        },
      ]),
    ).toEqual([
      {
        sourceKey: "seo.finding_rollup.title_presence",
        label: "SEO Finding Rollup Title Presence",
        reason: "This is the current reason.",
        affectedRows: 2,
      },
      {
        sourceKey: "workflow.run_recovery",
        label: "Workflow Run Recovery",
        reason: "Handled elsewhere.",
        affectedRows: 1,
      },
    ]);
  });
});
