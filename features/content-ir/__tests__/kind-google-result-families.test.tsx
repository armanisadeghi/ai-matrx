/**
 * THE TWO GOOGLE TOOL-RESULT KINDS — `google_workspace_result` and
 * `google_marketing_result`, the two kinds every Google answer in chat is made
 * of, which reached the reader ONLY through the `generic_structured` floor until
 * they were each given ONE component.
 *
 * Live registry, 2026-09-18 (project brsgrqvjdzwihsvnfqkf): both rows existed
 * with a passing canonical example and `is_active = false`, and
 * `content_ir.evaluate_kind_activation` named exactly one missing leg for each —
 * "render: no active role='output' kind_component row". Structural, uniqueness
 * and recognition legs already passed. So this suite asserts the render leg the
 * way its 61 siblings do (`kind-runtime-result-families.test.tsx`): the resolver
 * answers with the kind's own component, the component renders the facts a
 * person came for, and nothing is swallowed.
 *
 * 🚨 FIXTURES ARE DERIVED FROM THE TOOLS' OWN OUTPUT BUILDERS, not invented:
 * every key below is written by `aidream/aidream/services/google_workspace/tools.py`
 * or `aidream/aidream/services/google_integrations/google_marketing.py` and
 * declared on the pydantic kind in
 * `packages/matrx-ai/matrx_ai/tools/kinds/google.py`. That is enough to prove
 * the ROUTE and the COMPONENT. It is NOT enough to award `verified` maturity,
 * and this suite does not claim it.
 *
 * A PREVIEW IS THE HIGH-STAKES CASE and it is asserted first: a `dry_run`
 * append and a `dry_run` sheet write must read as "nothing was written" with the
 * exact block and the cells on both sides — never as a receipt.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

import {
  applyIrKindRoute,
  GENERIC_STRUCTURED_COMPONENT_KEY,
  IR_ROUTE_KEY,
  type IrRouteMarker,
} from "../react/kind-route";
import { componentRegistry } from "../registry/component-registry";
import { resolveBlockDispatch } from "@/components/mardown-display/chat-markdown/block-registry/block-dispatch";
import { kindRegistry } from "../registry/kind-registry";
import { envelopeFromCompleteValue, IR_ENVELOPE_KEY } from "@ai-matrx/content-ir";
import type { KindComponentProjection } from "../registry/schema-source-kind-components";
import GoogleWorkspaceResultBlock from "@/components/mardown-display/blocks/google-kinds/GoogleWorkspaceResultBlock";
import GoogleMarketingResultBlock, {
  PROMOTED as MARKETING_PROMOTED,
} from "@/components/mardown-display/blocks/google-kinds/GoogleMarketingResultBlock";

jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  ...jest.requireActual("@/lib/diagnostics/errorCaptureStore"),
  captureError: jest.fn(),
}));

/**
 * The ONE opener, stood in for — not re-implemented.
 *
 * `useOpenItemPresentation` REFUSES to run outside `DetailHost` (mounted once,
 * app-wide, in `app/Providers.tsx`) and that refusal is correct: a door with no
 * host behind it would be a lie. What this suite owns is the contract on THIS
 * side of it — that a Record id becomes a control at all, and that a type with
 * no wired opener produces NO control. The opener's own behaviour is its own
 * tests' business.
 *
 * 🚨 The real module is SPREAD, never replaced wholesale (DD-239): a new export
 * added to it can then never take this suite down at import time.
 */
const openItem = jest.fn();
jest.mock("@/features/item-presentation/useOpenItemPresentation", () => ({
  ...jest.requireActual("@/features/item-presentation/useOpenItemPresentation"),
  useOpenItemPresentation: () => openItem,
}));

type BlockComponent = React.FC<{
  content: string;
  metadata?: Record<string, unknown>;
}>;

const WORKSPACE_KIND = "google_workspace_result";
const MARKETING_KIND = "google_marketing_result";

/**
 * A door is opened through `useOpenItemPresentation`, which dispatches — so the
 * fixtures that carry Record ids render inside a store. An empty store is
 * enough: nothing here reads state, and the assertion is that the door EXISTS.
 */
function mount(node: React.ReactNode): string {
  const store = configureStore({
    reducer: { probe: (state: Record<string, never> = {}) => state },
  });
  return renderToStaticMarkup(<Provider store={store}>{node}</Provider>);
}

interface Fixture {
  name: string;
  kind: string;
  Component: BlockComponent;
  data: Record<string, unknown>;
  /** Strings a reader must actually see rendered. */
  visible: string[];
  /** Strings that must NOT appear — a preview read as a receipt, etc. */
  absent?: string[];
}

const FIXTURES: Fixture[] = [
  // ── the PREVIEW branches (the dangerous ones) ─────────────────────────────
  {
    name: "append_document dry run shows the exact block and where it lands",
    kind: WORKSPACE_KIND,
    Component: GoogleWorkspaceResultBlock,
    data: {
      action: "append_document",
      dry_run: true,
      file_id: "1AbC",
      title: "Q3 Plan",
      total_chars: 4211,
      open_in_google: "https://docs.google.com/document/d/1AbC",
      would_append: {
        position: "end_of_document",
        after_char: 4211,
        text: "\nThree risks remain open.",
        document_ends_with: "…and that is where we left it.",
        revision_id: "rev-9",
        insert_at_index: 4212,
      },
      note: "NOTHING WAS WRITTEN. Show the user this exact block.",
    },
    visible: [
      "Nothing was written",
      "This exact block will be appended",
      "Three risks remain open.",
      "after character 4,211",
      "pinned to the version shown",
      "The document ends like this today",
    ],
  },
  {
    name: "write_sheet dry run shows the cells before AND after",
    kind: WORKSPACE_KIND,
    Component: GoogleWorkspaceResultBlock,
    data: {
      action: "write_sheet",
      dry_run: true,
      file_id: "1Sheet",
      name: "Pipeline",
      tab: "Leads",
      range: "Leads!A2:B3",
      would_write: {
        range: "Leads!A2:B3",
        cells_before: [["Acme", "40"], ["Globex", "12"]],
        cells_after: [["Acme", "55"], ["Globex", "12"]],
        rows_before: 2,
        rows_after: 2,
        replaces_existing_values: true,
      },
      note: "NOTHING WAS WRITTEN. `cells_before` is what is in that range now.",
    },
    visible: [
      "Nothing was written",
      "These cells would change",
      "Before",
      "After",
      "replaces values that are there",
      "Acme",
    ],
    absent: ["cells written"],
  },
  {
    name: "an approval hold says a person is holding the change, and names the knob",
    kind: WORKSPACE_KIND,
    Component: GoogleWorkspaceResultBlock,
    data: {
      action: "append_document",
      dry_run: null,
      awaiting_approval: true,
      title: "Q3 Plan",
      would_append: { position: "end_of_document", text: "\nOne more line.", after_char: 10 },
      approval: {
        approval_id: "ap-1",
        mode: "ask",
        knob: "hitl.google.unattended_file_write",
        attended: false,
        waiting_with: "the person whose Google account this is",
      },
    },
    visible: [
      "waiting for a person to approve it",
      "hitl.google.unattended_file_write",
      "the person whose Google account this is",
      "unattended run",
    ],
  },
  // ── the READ branches ─────────────────────────────────────────────────────
  {
    name: "a document window states how much of it arrived",
    kind: WORKSPACE_KIND,
    Component: GoogleWorkspaceResultBlock,
    data: {
      action: "read_document",
      file_id: "1AbC",
      title: "Q3 Plan",
      text: "The plan opens with the three risks.",
      total_chars: 40000,
      showing_chars: "0–2,000",
      has_more: true,
      next_start_char: 2000,
      open_in_google: "https://docs.google.com/document/d/1AbC",
    },
    visible: [
      "Q3 Plan",
      "The plan opens with the three risks.",
      "characters 0–2,000 of 40,000",
      "continue at character 2,000",
      "Open in Google",
    ],
  },
  {
    name: "a calendar read opens the Record, not the Google id",
    kind: WORKSPACE_KIND,
    Component: GoogleWorkspaceResultBlock,
    data: {
      action: "read_calendar",
      google_account: "someone@example.com",
      window_start: "2026-09-18",
      window_end: "2026-09-25",
      count: 1,
      events: [
        {
          event_id: "g-1",
          title: "Quarterly review",
          starts_at: "2026-09-19T15:00:00Z",
          all_day: false,
          record_id: "11111111-1111-4111-8111-111111111111",
          record_table: "communication.calendar_event",
          record_sync_status: "synced",
        },
      ],
      truncated: false,
      limit_note: "The user's own primary calendar, at most 50 events.",
    },
    visible: [
      "Quarterly review",
      "Open Quarterly review in AI Matrx",
      "complete within the window asked for",
      "at most 50 events",
    ],
  },
  {
    name: "an import that only the app can finish says what to do instead",
    kind: WORKSPACE_KIND,
    Component: GoogleWorkspaceResultBlock,
    data: {
      action: "import_sheet_as_table",
      file_id: "1Sheet",
      name: "Pipeline",
      tab: "Leads",
      header_row: 1,
      row_count: 812,
      fields: [{ name: "Company", column: "A", example: "Acme" }],
      needs_client: {
        reason: "table_mint_is_client_side",
        do_this: "Ask the user to open the Sheet in AI Matrx and choose \"Keep it as its own table\".",
        fields_ready: 1,
        rows_ready: 812,
      },
      note: "NOTHING WAS IMPORTED, and this is not a failure you can retry.",
    },
    visible: [
      "One step happens in the app, not here",
      "Keep it as its own table",
      "fields ready",
      "table mint is client side",
    ],
  },
  {
    name: "a prepared email is shown whole and marked not sent",
    kind: WORKSPACE_KIND,
    Component: GoogleWorkspaceResultBlock,
    data: {
      action: "prepare_email",
      sent: false,
      draft: {
        to: "client@example.com",
        cc: [],
        subject: "Following up",
        body: "Here is the summary you asked for.",
      },
      from_email: "someone@example.com",
      next_step: "Nothing has been sent. Call google_email_send with exactly this draft.",
    },
    visible: [
      "not sent",
      "ready for the person to send",
      "client@example.com",
      "Following up",
      "Here is the summary you asked for.",
      "Nothing has been sent.",
    ],
  },
  {
    name: "imported tasks each open where they now live",
    kind: WORKSPACE_KIND,
    Component: GoogleWorkspaceResultBlock,
    data: {
      action: "import_tasks",
      google_account: "someone@example.com",
      count: 2,
      tasks: [{ task_id: "t1", title: "Call the vendor", already_imported: false }],
      imported_tasks: [
        {
          task_id: "t1",
          matrx_task_id: "22222222-2222-4222-8222-222222222222",
          title: "Call the vendor",
        },
      ],
      skipped: [{ task_id: "t2", title: "Already here", already_imported: true }],
      note: "1 tasks created, 1 skipped because they were already imported.",
    },
    visible: [
      "Imported",
      "Call the vendor",
      "Open Call the vendor in AI Matrx",
      "Skipped — already here",
    ],
  },
  {
    name: "an imported contact opens the Person it landed on",
    kind: WORKSPACE_KIND,
    Component: GoogleWorkspaceResultBlock,
    data: {
      action: "import_contact",
      imported: true,
      matched_by: "email",
      contacts: [{ contact_id: "c1", name: "Dana Reed", emails: ["dana@example.com"] }],
      field_map: [{ field: "job_title", value: "COO", from: "google.organizations[0].title" }],
      person: {
        person_id: "33333333-3333-4333-8333-333333333333",
        name: "Dana Reed",
        created: false,
        fields_written: 2,
        contact_points_added: 1,
      },
      note: "Dana Reed was updated from Google Contacts.",
    },
    visible: [
      "Dana Reed",
      "Open Dana Reed in AI Matrx",
      "existing Person",
      "matched by email",
      "Where each value lands",
    ],
  },
  // ── marketing ─────────────────────────────────────────────────────────────
  {
    name: "a persisted Search Console read carries its window, cap and lag",
    kind: MARKETING_KIND,
    Component: GoogleMarketingResultBlock,
    data: {
      action: "read_search_console",
      source: "persisted",
      site_id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      bounds: { start_date: "2026-08-01", end_date: "2026-08-28", limit: 1000 },
      returned_count: 412,
      count_unit: "rows",
      truncated: false,
      completeness: "complete_within_requested_bound",
      freshness: "Data through 2026-08-25. Search Console runs about three days behind.",
      limit_note: "Stored Search Console rows only — this read never calls Google.",
      data: { rows: [{ date: "2026-08-25", clicks: 12, impressions: 300 }] },
    },
    visible: [
      "412",
      "rows returned",
      "our stored facts — no call to Google",
      "complete within the window asked for",
      "start date 2026-08-01",
      "about three days behind",
      "The numbers",
      // THE F-86 FINDING: `site_id` sat in PROMOTED (so MetaStrip/LeftoverFields
      // skipped it) while no branch ever printed it — a Search Console answer
      // that never named WHICH site the numbers belonged to.
      "site 3fa85f64-5717-4562-b3fc-2c963f66afa6",
    ],
  },
  {
    name: "a marketing read names which site the numbers belong to, with every promoted scalar printed somewhere",
    kind: MARKETING_KIND,
    Component: GoogleMarketingResultBlock,
    data: {
      action: "read_google_analytics",
      source: "persisted",
      google_account: "owner@example.com",
      site_id: "7c6a1f5e-4b8e-4c2d-9a1c-9e0b2f5d8a41",
      channel_id: "UC456",
      returned_count: 88,
      count_unit: "rows",
      truncated: false,
      completeness: "complete_within_requested_bound",
      freshness: "Data through 2026-08-25.",
      limit_note: "Stored GA4 landing-page rows only — this read never calls Google.",
      note: "GA4 applies thresholding — say so when you quote these numbers.",
      verdict: "GA4 is installed and reporting.",
      data: { rows: [{ date: "2026-08-25", sessions: 40 }] },
    },
    visible: [
      // The site the numbers belong to, printed in the same ChipRow as the
      // channel chip — the reader's first question about any number here.
      "site 7c6a1f5e-4b8e-4c2d-9a1c-9e0b2f5d8a41",
      "channel UC456",
      "owner@example.com",
      "Stored GA4 landing-page rows only",
      "GA4 applies thresholding",
      "GA4 is installed and reporting.",
    ],
  },
  {
    name: "a capped live read says more exists than is shown",
    kind: MARKETING_KIND,
    Component: GoogleMarketingResultBlock,
    data: {
      action: "read_youtube_channel",
      source: "live_google",
      google_account: "someone@example.com",
      channel_id: "UC123",
      returned_count: 50,
      count_unit: "recent_videos",
      bounds: { channels: 1, recent_videos: 50 },
      truncated: true,
      completeness: "bounded_preview",
      limit_note: "The user's OWN channel only, read-only.",
      data: { recent_videos: [] },
    },
    visible: [
      "recent videos returned",
      "read live from Google",
      "capped — more exists than is shown",
      "read-only",
    ],
  },
  {
    name: "the tracking-health verdict carries every check's remedy and its blind spots",
    kind: MARKETING_KIND,
    Component: GoogleMarketingResultBlock,
    data: {
      action: "tracking_health",
      source: "live_google",
      verdict: "Main container: GA4 is installed · no conversion tag · consent unknown.",
      checks: [
        {
          id: "ga4_present",
          verdict: "pass",
          evidence: "One GA4 configuration tag found.",
          remedy: "Nothing to do.",
        },
        {
          id: "conversion_tag_present",
          verdict: "fail",
          evidence: "No conversion tag of any kind existed.",
          remedy: "Add a conversion tag for the action that matters to this business.",
        },
      ],
      has_ga4: true,
      has_conversion_tag: false,
      has_consent: null,
      caveats: ["Tags added outside Tag Manager are invisible to this read."],
      returned_count: 7,
      count_unit: "tags",
      truncated: false,
      completeness: "complete_within_requested_bound",
      limit_note: "At most 200 tags from one workspace, read-only.",
    },
    visible: [
      "The verdict",
      "no conversion tag",
      "Ga4 present",
      "Add a conversion tag",
      "What this read could not see",
      "invisible to this read",
      "GA4 tag",
    ],
  },
];

/** The registered row, as the warm loader projects it. */
function registeredRow(kind: string): KindComponentProjection {
  return {
    kind,
    platform: "web",
    role: "output",
    componentKey: kind,
    source: "bundled",
    isActive: true,
    config: {},
    componentSource: null,
    propsTransform: null,
    pinnedKindVersion: null,
    updatedAt: "2026-09-18T00:00:00Z",
    createdAt: "2026-09-18T00:00:00Z",
    createdBy: null,
    id: "00000000-0000-0000-0000-000000000000",
  };
}

function kindBlock(kind: string, value: Record<string, unknown>) {
  const complete = { __kind: kind, ...value };
  return {
    type: "code",
    content: JSON.stringify(complete),
    // The raw region's annotation — never kind data; must not survive routing.
    serverData: { language: "json" },
    metadata: { [IR_ENVELOPE_KEY]: envelopeFromCompleteValue(complete, kind) },
  };
}

function markerOf(block: { metadata?: Record<string, unknown> }) {
  return block.metadata?.[IR_ROUTE_KEY] as IrRouteMarker | undefined;
}

describe("the two Google tool-result kinds route to their own component", () => {
  // ORDER-SENSITIVE, like the sibling suites: both registries are module
  // singletons, so the pre-registration assertion runs before any ingest.
  it("[before] a Google result with no component row reaches the reader only by silent fallback", () => {
    for (const kind of [WORKSPACE_KIND, MARKETING_KIND]) {
      kindRegistry.upsertDefinition({
        kind,
        schema: null,
        schemaSource: "content_ir",
        tier: "warm",
      });
      const routed = applyIrKindRoute(kindBlock(kind, { action: "probe" }));
      expect(markerOf(routed)).toEqual({
        by: "generic",
        key: GENERIC_STRUCTURED_COMPONENT_KEY,
        unverified: true,
        reason: "no-component",
      });
    }
  });

  /**
   * THE RENDER LEG, in this repo. A `kind_component` row whose `component_key`
   * nothing renders changes NOTHING at runtime while the registry claims
   * coverage — the exact hole `check:shapes:components` guards at release time,
   * asserted here so it fails in seconds instead of in front of a reader.
   */
  it("each kind's component key resolves in the renderer's dispatch table", () => {
    for (const kind of [WORKSPACE_KIND, MARKETING_KIND]) {
      expect(resolveBlockDispatch(kind)).not.toBeNull();
    }
  });

  it.each(FIXTURES.map((f) => [f.name, f] as const))(
    "%s",
    (_name, fixture) => {
      kindRegistry.upsertDefinition({
        kind: fixture.kind,
        schema: null,
        schemaSource: "content_ir",
        tier: "warm",
      });
      componentRegistry.ingestDbRows([registeredRow(fixture.kind)]);

      const routed = applyIrKindRoute(kindBlock(fixture.kind, fixture.data));

      // The resolver answered — no silent fallback, no `unverified` flag.
      expect(routed.type).toBe(fixture.kind);
      expect(markerOf(routed)?.key).toBe(fixture.kind);
      expect(markerOf(routed)?.unverified).toBeUndefined();
      // The raw region annotation is poison, not data.
      expect(routed.serverData).toBeUndefined();

      const { Component } = fixture;
      const markup = mount(
        <Component content={routed.content} metadata={routed.metadata} />,
      );

      for (const text of fixture.visible) {
        expect(markup).toContain(text);
      }
      for (const text of fixture.absent ?? []) {
        expect(markup).not.toContain(text);
      }
      // A real renderer IS registered, so the floor's honesty line must NOT
      // appear — that line belongs to kinds that only got the basic route.
      expect(markup).not.toContain("no custom view yet");
      expect(markup).not.toContain("Unverified shape");
    },
  );

  it.each([
    [WORKSPACE_KIND, GoogleWorkspaceResultBlock],
    [MARKETING_KIND, GoogleMarketingResultBlock],
  ] as const)("%s never swallows a payload it cannot read", (_kind, Component) => {
    const markup = mount(<Component content="not json at all" metadata={undefined} />);
    expect(markup).toContain("not json at all");
  });

  it("carries a field neither component promoted through to the reader", () => {
    // HIDE NOTHING: an unmodelled scalar lands in the meta strip rather than
    // disappearing between the headline and the payload.
    const markup = mount(
      <GoogleWorkspaceResultBlock
        content={JSON.stringify({
          __kind: WORKSPACE_KIND,
          action: "read_sheet",
          rows: [["a"]],
          some_future_key: "kept anyway",
        })}
        metadata={undefined}
      />,
    );
    expect(markup).toContain("kept anyway");
  });

  /**
   * A CONTROL THAT CANNOT OPEN IS WORSE THAN NO CONTROL. The door is gated on
   * the item registry's own `open` discriminant, so an id of a type nobody
   * wired renders as text and nothing else.
   */
  it("a Record id of a type with no wired opener renders no control at all", () => {
    const markup = mount(
      <GoogleWorkspaceResultBlock
        content={JSON.stringify({
          __kind: WORKSPACE_KIND,
          action: "read_calendar",
          events: [
            {
              event_id: "g-9",
              title: "No record yet",
              // Not an item type the registry knows — no opener exists.
              record_id: null,
            },
          ],
        })}
        metadata={undefined}
      />,
    );
    expect(markup).toContain("No record yet");
    expect(markup).not.toContain("in AI Matrx");
  });

  /**
   * THE CENSUS: a promoted-but-unprinted key is the defect class F-86 found on
   * `site_id`. For every scalar key `GoogleMarketingResultBlock.PROMOTED`
   * carries and this fixture actually sets, that value must appear somewhere
   * in the rendered output — never silently absorbed by `MetaStrip`/
   * `LeftoverFields` skipping it with nothing printing it in its place.
   * Structural keys (`bounds`, `data`, `checks`, `containers`) render their
   * CONTENTS rather than their own raw value and are asserted by the fixtures
   * above; boolean/enum keys (`truncated`, `completeness`, `has_ga4`, …) render
   * as a translated phrase rather than their raw token, also asserted above.
   * This test owns the plain-string promoted keys.
   */
  it("no promoted scalar key in google_marketing_result ever vanishes from what a reader sees", () => {
    const fixture = FIXTURES.find(
      (f) =>
        f.name ===
        "a marketing read names which site the numbers belong to, with every promoted scalar printed somewhere",
    )!;
    kindRegistry.upsertDefinition({
      kind: fixture.kind,
      schema: null,
      schemaSource: "content_ir",
      tier: "warm",
    });
    componentRegistry.ingestDbRows([registeredRow(fixture.kind)]);
    const routed = applyIrKindRoute(kindBlock(fixture.kind, fixture.data));
    const markup = mount(
      <GoogleMarketingResultBlock content={routed.content} metadata={routed.metadata} />,
    );

    const STRUCTURAL_OR_TRANSLATED = new Set([
      "action",
      "source",
      "bounds",
      "data",
      "checks",
      "containers",
      "truncated",
      "completeness",
      "has_ga4",
      "has_conversion_tag",
      "has_consent",
      "caveats",
      "returned_count",
      "count_unit",
    ]);
    const censusedKeys: string[] = [];
    for (const key of MARKETING_PROMOTED) {
      if (STRUCTURAL_OR_TRANSLATED.has(key)) continue;
      const value = fixture.data[key];
      if (typeof value !== "string" || value.length === 0) continue;
      censusedKeys.push(key);
      expect(markup).toContain(value);
    }
    // The census itself must have exercised something — an empty loop would
    // pass vacuously and prove nothing.
    expect(censusedKeys).toEqual(
      expect.arrayContaining(["google_account", "site_id", "channel_id", "limit_note", "note", "verdict", "freshness"]),
    );
  });

  it("an unknowable completeness never reads as complete", () => {
    // `truncated: null` is a DECLARED state on the marketing kind (the provider
    // cannot say). Reading it as "complete" is the failure this asserts away.
    const markup = mount(
      <GoogleMarketingResultBlock
        content={JSON.stringify({
          __kind: MARKETING_KIND,
          action: "read_tasks_probe",
          source: "persisted",
          returned_count: 3,
          count_unit: "rows",
          truncated: null,
        })}
        metadata={undefined}
      />,
    );
    expect(markup).toContain("completeness unknown");
    expect(markup).not.toContain("complete within the window asked for");
  });
});
