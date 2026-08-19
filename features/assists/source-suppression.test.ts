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
          suppressed_until: "infinity",
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
          suppressed_until: "infinity",
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
          suppressed_until: "infinity",
        },
      ]),
    ).toEqual([
      {
        sourceKey: "seo.finding_rollup.title_presence",
        label: "SEO Finding Rollup Title Presence",
        reason: "This is the current reason.",
        affectedRows: 2,
        until: "infinity",
      },
      {
        sourceKey: "workflow.run_recovery",
        label: "Workflow Run Recovery",
        reason: "Handled elsewhere.",
        affectedRows: 1,
        until: "infinity",
      },
    ]);
  });

  it("carries the chosen window so a timed quiet can say when it ends", () => {
    expect(
      groupAssistSourceSuppressions([
        {
          source_key: "hindsight_finding",
          metadata: {
            source_suppression: {
              reason: "Quiet for a while",
              suppressed_at: "2026-08-19T14:30:00.000Z",
              until: "2026-08-19T18:30:00.000Z",
            },
          },
          updated_at: "2026-08-19T14:30:00.000Z",
          suppressed_until: "2026-08-19T18:30:00.000Z",
        },
      ]),
    ).toEqual([
      {
        sourceKey: "hindsight_finding",
        label: "Hindsight Finding",
        reason: "Quiet for a while",
        affectedRows: 1,
        until: "2026-08-19T18:30:00.000Z",
      },
    ]);
  });

  it("falls back to the row's own timestamp for a pre-window record", () => {
    // Records written before timed source quiet existed carry no `until`;
    // reading the row is the honest answer, guessing "infinity" is not.
    expect(
      groupAssistSourceSuppressions([
        {
          source_key: "notes.unorganized",
          metadata: {
            source_suppression: {
              reason: "Not useful",
              suppressed_at: "2026-08-13T01:00:00.000Z",
            },
          },
          updated_at: "2026-08-13T01:00:00.000Z",
          suppressed_until: "infinity",
        },
      ])[0]?.until,
    ).toBe("infinity");
  });
});
