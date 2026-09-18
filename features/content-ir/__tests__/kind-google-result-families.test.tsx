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
import GoogleWorkspaceResultBlock, {
  PROMOTED as WORKSPACE_PROMOTED,
} from "@/components/mardown-display/blocks/google-kinds/GoogleWorkspaceResultBlock";
import GoogleMarketingResultBlock, {
  PROMOTED as MARKETING_PROMOTED,
} from "@/components/mardown-display/blocks/google-kinds/GoogleMarketingResultBlock";
import {
  RecordDoor,
  WRITE_CLAIM_KEYS,
  readWriteClaim,
  type WriteClaimState,
} from "@/components/mardown-display/blocks/google-kinds/google-result-shared";
// The platform's ONE timestamp formatter — the same function the Detail
// primitive prints every stored instant with. Never a second one here.
import { formatWhen } from "@/lib/detail/format";
// The real registry — the door's own gate (F-87 asserts the token it opens on).
import { getItemConfig } from "@/features/item-presentation/registry";

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
      // 🚨 F-87 — AND NAMING IT IS NOT REACHING IT. The chip alone is a uuid a
      // reader cannot open. RED before F-87: the door was written against the
      // token `site`, which the item registry does not know, so `RecordDoor`
      // rendered nothing at all and the reader was left with the bare id.
      "Open site in AI Matrx",
    ],
    // NEW-10's other half: this payload DOES state its window, so the unknown-
    // window phrase must not appear. A warning that fires on a stated window
    // would train a reader to ignore it.
    absent: ["window not stated by the provider"],
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
      // The door beside it (F-87) — see the Search Console fixture above.
      "Open site in AI Matrx",
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
  // BUGBOT MEDIUM (f881c9f6): the marketing block has NO dedicated preview
  // section at all (its six actions are read-only), so EVERY `would_*` on it
  // is unmodelled. RED against f881c9f6: "UNIQUE-UPDATE-MARKER-7c3d" is
  // absent, because `would_update` sat in `omit` with nothing printing it.
  //
  // BUGBOT MEDIUM ON eb641aee (the follow-up): `substantiveRead` only ever
  // looked at `verdict` / health flags / `checks` / `containers` / `data` —
  // never at the write claim `UnmodelledPreviews` above it now renders. A
  // payload that is ONLY a write preview (no marketing-read fields at all,
  // exactly this fixture) fell through that predicate, so the card showed the
  // preview AND ended with "This read returned no rows for the window above"
  // in the same breath — claiming nothing came back while showing a change.
  // RED on eb641aee: that sentence is present here; GREEN once
  // `hasSubstantiveContent` (`google-result-shared.tsx`) also asks the claim.
  {
    name: "BUGBOT MEDIUM (f881c9f6): the marketing block shows an unmodelled would_update preview, not swallowed",
    kind: MARKETING_KIND,
    Component: GoogleMarketingResultBlock,
    data: {
      action: "update_tag_manager_container",
      would_update: {
        container_id: "GTM-123",
        note: "UNIQUE-UPDATE-MARKER-7c3d",
      },
    },
    visible: [
      "Nothing was written",
      "The change it would make",
      "Would update",
      "UNIQUE-UPDATE-MARKER-7c3d",
    ],
    absent: ["This read returned no rows"],
  },
  // ── V-22's HOSTILE SHAPES (VERIFY-R7-FIX-WAVE, findings NEW-8/10/14) ──────
  //
  // Every fixture below is a payload the declared kinds ALLOW and the first
  // shipped components read wrongly. They are asserted the same way as the
  // honest ones — through `applyIrKindRoute` → `resolveBlockDispatch`, never the
  // component imported directly — because a preview that reads as a receipt is
  // only a defect on the path a reader actually travels.
  {
    name: "NEW-8: a would_append with NO dry_run and NO approval flag still leads with nothing was written",
    kind: WORKSPACE_KIND,
    Component: GoogleWorkspaceResultBlock,
    data: {
      action: "append_document",
      title: "Q3 Plan",
      file_id: "1AbC",
      // No `dry_run`. No `awaiting_approval`. No `note`. This is the shape a new
      // action, a serializer or an approval path that forgets one flag produces,
      // and RED it rendered the whole preview of the person's own document with
      // nothing saying it had not happened.
      would_append: {
        position: "end_of_document",
        after_char: 4211,
        text: "\nThree risks remain open.",
        revision_id: "rev-9",
      },
    },
    visible: [
      "Nothing was written. This is a preview of the exact change.",
      "This exact block will be appended",
      "Three risks remain open.",
    ],
  },
  {
    name: "NEW-8: would_append beside appended names the contradiction and shows no receipt chip",
    kind: WORKSPACE_KIND,
    Component: GoogleWorkspaceResultBlock,
    data: {
      action: "append_document",
      title: "Q3 Plan",
      // BOTH AT ONCE, plus the flag as a string — V-22's probes 10 and 11.
      dry_run: "true",
      appended: true,
      would_append: { position: "end_of_document", text: "One more paragraph." },
    },
    visible: [
      "this answer contradicts itself",
      "would append",
      "treating it as a preview; nothing is shown as written",
      "This exact block will be appended",
    ],
    // The green receipt chip itself. RED it sat beside the preview.
    absent: [">appended</span>"],
  },
  {
    name: "NEW-8: written beside would_write shows both halves of the range and no cells-written chip",
    kind: WORKSPACE_KIND,
    Component: GoogleWorkspaceResultBlock,
    data: {
      action: "write_sheet",
      name: "Pipeline",
      written: true,
      would_write: {
        range: "Leads!A2:C3",
        cells_before: [["old"]],
        cells_after: [["new"]],
        rows_before: 1,
        rows_after: 1,
        replaces_existing_values: true,
      },
    },
    visible: [
      "this answer contradicts itself",
      "would write",
      "These cells would change",
    ],
    absent: [">cells written</span>"],
  },
  {
    name: "NEW-8: a dry_run that arrived as a string is a hold nobody can read, never an absent hold",
    kind: WORKSPACE_KIND,
    Component: GoogleWorkspaceResultBlock,
    data: {
      action: "create_document",
      title: "Untitled plan",
      dry_run: "true",
    },
    visible: ["Nothing is shown as written", "rather than true or false"],
  },
  {
    name: "NEW-8: an approval hold carrying no preview says the change is not shown",
    kind: WORKSPACE_KIND,
    Component: GoogleWorkspaceResultBlock,
    data: {
      action: "create_document",
      title: "Board update",
      awaiting_approval: true,
      approval: {
        approval_id: "ap-77",
        knob: "google.workspace.write_approval",
        mode: "always",
        waiting_with: "Dana Reed",
        attended: false,
      },
    },
    visible: [
      "waiting for a person to approve it",
      "does not show the change it is holding",
      "waiting with Dana Reed",
      "queue id ap-77",
    ],
  },
  {
    name: "NEW-8: a would_write whose cells arrived as garbage still leads with nothing written and prints the garbage",
    kind: WORKSPACE_KIND,
    Component: GoogleWorkspaceResultBlock,
    data: {
      action: "write_sheet",
      name: "Pipeline",
      would_write: {
        range: "Leads!A2:C3",
        cells_before: "OOPS-NOT-AN-ARRAY",
        cells_after: 7,
      },
    },
    visible: ["Nothing was written", "OOPS-NOT-AN-ARRAY"],
  },
  {
    name: "a read carries keys neither the kind nor the component modelled through to the reader",
    kind: WORKSPACE_KIND,
    Component: GoogleWorkspaceResultBlock,
    data: {
      action: "read_sheet",
      rows: [["a", "b"]],
      unexpected_total_pages: 99,
      weird_nested: { deep: "matters" },
    },
    visible: ["99", "matters"],
  },
  // ── BUGBOT MEDIUM on F-95's f881c9f6 — an unmodelled would_* still shows ──
  //
  // F-95 merged `claim.previewKeys` into the omit list on the reasoning that
  // `NothingWasWritten` already covers the write-claim family. It only
  // ANNOUNCES a preview exists; it never prints the change. A `would_*` shape
  // with no dedicated section (`would_delete` here — this block hand-lists
  // only `would_append`/`would_write`/`would_create`) vanished entirely: a
  // preview whose content the reader cannot see is a lie about what would
  // happen. RED against f881c9f6: "UNIQUE-DELETE-MARKER-9f2a" is absent.
  {
    name: "BUGBOT MEDIUM (f881c9f6): an unmodelled would_delete preview is shown, not swallowed",
    kind: WORKSPACE_KIND,
    Component: GoogleWorkspaceResultBlock,
    data: {
      action: "delete_document",
      dry_run: true,
      title: "Old Draft",
      would_delete: {
        document_ref: "1Trash",
        reason: "UNIQUE-DELETE-MARKER-9f2a",
      },
    },
    visible: [
      "Nothing was written",
      "The change it would make",
      "Would delete",
      "UNIQUE-DELETE-MARKER-9f2a",
    ],
  },
  {
    name: "NEW-10: a marketing count with no bounds says the window was never stated",
    kind: MARKETING_KIND,
    Component: GoogleMarketingResultBlock,
    data: {
      action: "read_google_analytics",
      source: "persisted",
      // No `bounds`. `bounds` is OPTIONAL on the declared kind, so this is a
      // legal payload — and RED it printed "412 rows returned" as if the window
      // were a fact, while the unknown completeness beside it was announced.
      returned_count: 412,
      count_unit: "rows",
      truncated: null,
      completeness: null,
      data: { rows: [{ sessions: 3 }] },
    },
    visible: [
      "412",
      "rows returned",
      "window not stated by the provider",
      "completeness unknown",
    ],
    absent: ["complete within the window asked for"],
  },
  {
    name: "a capped read whose completeness the provider cannot state never reads as complete",
    kind: MARKETING_KIND,
    Component: GoogleMarketingResultBlock,
    data: {
      action: "read_search_console",
      source: "live_google",
      bounds: { start_date: "2026-09-01", limit: 50 },
      returned_count: 50,
      count_unit: "rows",
      truncated: true,
      completeness: null,
    },
    visible: ["capped — more exists than is shown"],
    absent: ["complete within the window asked for", "window not stated by the provider"],
  },
  {
    name: "NEW-14: a freshness this build does not know names the word AND what to do about it",
    kind: WORKSPACE_KIND,
    Component: GoogleWorkspaceResultBlock,
    data: {
      action: "read_calendar",
      window_start: "2026-09-18",
      window_end: "2026-09-25",
      events: [
        {
          event_id: "g-7",
          title: "Budget review",
          starts_at: "2026-09-18T15:00:00Z",
          record_id: "22222222-2222-4222-8222-222222222222",
          record_table: "communication.calendar_event",
          // No live mirror produces this word (the CHECK constraint gives
          // available / unavailable / detached), which is exactly why it must
          // not print as a bare chip with nothing to do.
          record_sync_status: "stale",
        },
      ],
    },
    visible: [
      "Budget review",
      "stale",
      "does not recognise",
      "Open it here and refresh it, or open it in Google.",
    ],
    // NEW-14's other half: the raw instant never reaches a person.
    absent: ["2026-09-18T15:00:00Z"],
  },
  {
    name: "NEW-14: the terminal kept-as-AI-Matrx-data state offers no refresh, because a refresh is refused",
    kind: WORKSPACE_KIND,
    Component: GoogleWorkspaceResultBlock,
    data: {
      action: "read_calendar",
      events: [
        {
          event_id: "g-8",
          title: "Old offsite",
          starts_at: "2026-09-10T18:30:00Z",
          record_id: "33333333-3333-4333-8333-333333333333",
          record_sync_status: "detached",
        },
      ],
    },
    visible: [
      "kept as AI Matrx data",
      "no longer refreshes from Google Calendar",
    ],
    absent: ["Open it here and refresh it"],
  },
  {
    name: "NEW-14: an unreadable freshness prefers the server's own sentence over ours",
    kind: WORKSPACE_KIND,
    Component: GoogleWorkspaceResultBlock,
    data: {
      action: "read_calendar",
      events: [
        {
          event_id: "g-9",
          title: "Sales sync",
          record_id: "44444444-4444-4444-8444-444444444444",
          record_sync_status: "unavailable",
          record_sync_status_reason:
            "Google Calendar answered 404 for this event the last time we asked.",
        },
      ],
    },
    visible: [
      "not answered by Google",
      "Google Calendar answered 404 for this event",
      "Open it here and refresh it, or open it in Google.",
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

/**
 * 🚨 THE WRITE-CLAIM TRUTH TABLE (V-22, NEW-8).
 *
 * The honesty of a Google write answer used to be carried by a FLAG: "Nothing
 * was written" was gated on `dry_run === true || awaiting_approval === true`
 * while the preview blocks rendered unconditionally on `would_*`. One missing,
 * mistyped or forgotten flag therefore turned a preview of the person's own
 * document into something indistinguishable from a receipt.
 *
 * `readWriteClaim` is now the ONE reading both components consult, and it is a
 * pure function precisely so the table can be asserted directly, row by row,
 * rather than inferred from markup. The two invariants the table exists for:
 *
 *  - a `would_*` key that ARRIVED always yields `nothingWasWritten`, whatever
 *    the flags say — including a `would_delete` nobody has written yet;
 *  - a completed-write chip is allowed ONLY in `receipt` and `none`, so a green
 *    "appended" can never sit beside a preview.
 */
describe("readWriteClaim — the one truth table both Google blocks read", () => {
  const CASES: Array<{
    said: string;
    value: Record<string, unknown>;
    state: WriteClaimState;
    nothingWasWritten: boolean;
    showsReceiptChips: boolean;
  }> = [
    { said: "an ordinary read", value: { action: "read_sheet" }, state: "none", nothingWasWritten: false, showsReceiptChips: true },
    { said: "appended", value: { appended: true }, state: "receipt", nothingWasWritten: false, showsReceiptChips: true },
    { said: "written", value: { written: true }, state: "receipt", nothingWasWritten: false, showsReceiptChips: true },
    { said: "created", value: { created: true }, state: "receipt", nothingWasWritten: false, showsReceiptChips: true },
    { said: "imported", value: { imported: true }, state: "receipt", nothingWasWritten: false, showsReceiptChips: true },
    { said: "sent", value: { sent: true }, state: "receipt", nothingWasWritten: false, showsReceiptChips: true },
    { said: "not sent", value: { sent: false }, state: "none", nothingWasWritten: false, showsReceiptChips: true },
    // THE FINDING: a preview with NO flag at all.
    { said: "would_append alone", value: { would_append: { text: "x" } }, state: "preview", nothingWasWritten: true, showsReceiptChips: false },
    { said: "would_write alone", value: { would_write: { range: "A1" } }, state: "preview", nothingWasWritten: true, showsReceiptChips: false },
    { said: "would_create alone", value: { would_create: { name: "x" } }, state: "preview", nothingWasWritten: true, showsReceiptChips: false },
    // THE CLASS, not the instance: a `would_*` nobody has written yet.
    { said: "a would_ key this build has never seen", value: { would_delete: { id: "x" } }, state: "preview", nothingWasWritten: true, showsReceiptChips: false },
    { said: "a would_ key that arrived null", value: { would_append: null }, state: "none", nothingWasWritten: false, showsReceiptChips: true },
    { said: "would_append with dry_run", value: { would_append: {}, dry_run: true }, state: "preview", nothingWasWritten: true, showsReceiptChips: false },
    { said: "dry_run with no preview body", value: { dry_run: true }, state: "preview", nothingWasWritten: true, showsReceiptChips: false },
    { said: "awaiting_approval with a preview", value: { would_write: {}, awaiting_approval: true }, state: "awaiting_approval", nothingWasWritten: true, showsReceiptChips: false },
    { said: "awaiting_approval with no preview body", value: { awaiting_approval: true }, state: "awaiting_approval", nothingWasWritten: true, showsReceiptChips: false },
    // BOTH AT ONCE — every combination is the same verdict: claim nothing.
    { said: "would_append AND appended", value: { would_append: {}, appended: true }, state: "contradictory", nothingWasWritten: true, showsReceiptChips: false },
    { said: "would_write AND written", value: { would_write: {}, written: true }, state: "contradictory", nothingWasWritten: true, showsReceiptChips: false },
    { said: "would_create AND created", value: { would_create: {}, created: true }, state: "contradictory", nothingWasWritten: true, showsReceiptChips: false },
    { said: "would_create AND sent", value: { would_create: {}, sent: true }, state: "contradictory", nothingWasWritten: true, showsReceiptChips: false },
    { said: "would_write AND imported", value: { would_write: {}, imported: true }, state: "contradictory", nothingWasWritten: true, showsReceiptChips: false },
    { said: "dry_run AND appended", value: { dry_run: true, appended: true }, state: "contradictory", nothingWasWritten: true, showsReceiptChips: false },
    { said: "awaiting_approval AND written", value: { awaiting_approval: true, written: true }, state: "contradictory", nothingWasWritten: true, showsReceiptChips: false },
    // A FLAG WE CANNOT READ is not an absent flag.
    { said: "dry_run as the string true", value: { dry_run: "true" }, state: "unreadable_claim", nothingWasWritten: true, showsReceiptChips: false },
    // 🚨 V-23 NEW-4: THE SAME RULE FOR A COMPLETION FLAG. RED on `82d6127e`,
    // where only the HOLD keys had an unreadable reading: this payload —
    // verbatim from the verifier — came back `state: "none"`, so the card said
    // nothing at all about whether the append happened, and `appended` (a
    // `WRITE_CLAIM_KEYS` member both blocks omit) vanished from the screen too.
    { said: "appended as the string yes (V-23 NEW-4)", value: { action: "append_document", title: "Q3 Plan", appended: "yes" }, state: "unreadable_claim", nothingWasWritten: true, showsReceiptChips: false },
    { said: "written as a number", value: { written: 1 }, state: "unreadable_claim", nothingWasWritten: true, showsReceiptChips: false },
    { said: "created as an object", value: { created: {} }, state: "unreadable_claim", nothingWasWritten: true, showsReceiptChips: false },
    { said: "imported as the string false", value: { imported: "false" }, state: "unreadable_claim", nothingWasWritten: true, showsReceiptChips: false },
    { said: "sent as the string true", value: { sent: "true" }, state: "unreadable_claim", nothingWasWritten: true, showsReceiptChips: false },
    { said: "dry_run as the string true beside appended", value: { dry_run: "true", appended: true }, state: "unreadable_claim", nothingWasWritten: true, showsReceiptChips: false },
    { said: "awaiting_approval as a number", value: { awaiting_approval: 1, would_append: {} }, state: "unreadable_claim", nothingWasWritten: true, showsReceiptChips: false },
  ];

  it.each(CASES.map((row) => [row.said, row] as const))(
    "%s",
    (_said, row) => {
      const claim = readWriteClaim(row.value);
      expect(claim.state).toBe(row.state);
      expect(claim.nothingWasWritten).toBe(row.nothingWasWritten);
      expect(claim.showsReceiptChips).toBe(row.showsReceiptChips);
      // The two are one invariant, stated from both sides: anything that must
      // say "nothing was written" must never also allow a receipt chip.
      expect(claim.nothingWasWritten && claim.showsReceiptChips).toBe(false);
      // A state that leads the block always HAS a line to lead with.
      expect(Boolean(claim.headline)).toBe(row.nothingWasWritten);
    },
  );

  it("a contradiction names BOTH words the answer said, in the answer's own spelling", () => {
    const claim = readWriteClaim({ would_append: {}, appended: true });
    expect(claim.previewKeys).toEqual(["would_append"]);
    expect(claim.completedKeys).toEqual(["appended"]);
    expect(claim.detail).toContain('"would append"');
    expect(claim.detail).toContain('"appended"');
  });

  it("an unreadable hold flag names the value it could not read", () => {
    const claim = readWriteClaim({ dry_run: "true" });
    expect(claim.unreadableClaimKeys).toEqual(["dry_run"]);
    expect(claim.detail).toContain('"dry_run"');
    expect(claim.detail).toContain('"true"');
  });

  /**
   * V-23 NEW-4, the other half of the same class: an unreadable COMPLETION flag
   * is read exactly like an unreadable hold flag, names the key AND the value,
   * and never falls to `none`. The two are one rule now, so the truth table
   * cannot grow a silent side again.
   */
  it("an unreadable completion flag names the key and the value too", () => {
    const claim = readWriteClaim({ action: "append_document", title: "Q3 Plan", appended: "yes" });
    expect(claim.unreadableClaimKeys).toEqual(["appended"]);
    expect(claim.detail).toContain('"appended"');
    expect(claim.detail).toContain('"yes"');
    expect(claim.completedKeys).toEqual([]);
  });

  it("every boolean claim key is read by the SAME rule — no key has a silent side", () => {
    for (const key of WRITE_CLAIM_KEYS) {
      if (key === "approval") continue; // a block, not a flag.
      const claim = readWriteClaim({ [key]: "yes" });
      expect(claim.state).toBe("unreadable_claim");
      expect(claim.unreadableClaimKeys).toContain(key);
      expect(claim.detail).toContain(`"${key}"`);
    }
  });
});

/**
 * NEW-14, the other half: a machine instant never reaches a person raw, and it
 * is formatted by the platform's ONE formatter rather than a second one written
 * here. Asserted against `formatWhen` itself so the expectation cannot drift
 * from the function every other record field prints its timestamps with.
 */
describe("a Google answer's timestamps are formatted for a person", () => {
  it("an event's starts_at prints through formatWhen, never as the raw ISO string", () => {
    const iso = "2026-09-19T15:00:00Z";
    const markup = mount(
      <GoogleWorkspaceResultBlock
        content={JSON.stringify({
          __kind: WORKSPACE_KIND,
          action: "read_calendar",
          events: [{ event_id: "g-1", title: "Quarterly review", starts_at: iso }],
        })}
        metadata={undefined}
      />,
    );
    expect(markup).toContain(formatWhen(iso));
    expect(markup).not.toContain(iso);
  });

  it("a window the tool stated as a plain date is printed as the tool stated it", () => {
    // A date-only bound is already readable; reformatting it would invent a
    // time nobody sent.
    const markup = mount(
      <GoogleWorkspaceResultBlock
        content={JSON.stringify({
          __kind: WORKSPACE_KIND,
          action: "read_calendar",
          window_start: "2026-09-18",
          window_end: "2026-09-25",
          events: [{ event_id: "g-1", title: "Quarterly review" }],
        })}
        metadata={undefined}
      />,
    );
    expect(markup).toContain("2026-09-18");
    expect(markup).toContain("2026-09-25");
  });
});

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

  /**
   * 🚨 F-87 — THE SITE DOOR OPENS THE PLATFORM'S OWN SITE RECORD.
   *
   * The door is gated on the item registry's `open` discriminant, so the token
   * it is written against decides whether it exists at all. `web_site` is the
   * platform's registered name for `web.site`; `site` is not a token anything
   * resolves, and a door spelled that way renders absent forever — which is how
   * F-86's new door shipped. This asserts BOTH halves: the canonical token
   * produces a control, and the twin spelling produces none.
   */
  it("the site door is written against web_site, the token the platform knows", () => {
    expect(getItemConfig("web_site").config.open).toEqual({ kind: "web_site" });
    expect(getItemConfig("site").recognized).toBe(false);
    const markup = mount(
      <GoogleMarketingResultBlock
        content={JSON.stringify({
          __kind: MARKETING_KIND,
          action: "read_search_console",
          source: "persisted",
          site_id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
          returned_count: 5,
          count_unit: "rows",
          truncated: false,
        })}
        metadata={undefined}
      />,
    );
    expect(markup).toContain("Open site in AI Matrx");
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

  /**
   * 🚨 F-99 (BUGBOT MEDIUM) — AN EXPLICIT `null` IS A VERDICT; AN ABSENT KEY IS
   * NOT. `TruncationChip` was mounted unconditionally on every marketing card
   * and, with `truncated` ABSENT, `readBool` returned `null` and the card
   * printed "completeness unknown — the provider does not say". That is an
   * invented verdict: the declared kind says `truncated: bool | None` —
   * "True/False when the provider or our own cap says so; null when
   * unknowable" — so only a key that ARRIVED says anything. The wrong chip fired
   * on every read with no window to cap at all (the tracking-health verdict, a
   * Tag Manager container list, a YouTube channel) and on any payload that
   * simply omitted the key. The distinction now lives in ONE place —
   * `statesCompleteness` beside the chip — so the marketing card and the
   * workspace card cannot drift apart again.
   */
  describe("completeness: absent is not a verdict, null is (F-99)", () => {
    const COMPLETENESS_CHIPS = [
      "completeness unknown",
      "complete within the window asked for",
      "capped — more exists than is shown",
    ];
    const marketing = (extra: Record<string, unknown>) =>
      mount(
        <GoogleMarketingResultBlock
          content={JSON.stringify({
            __kind: MARKETING_KIND,
            // The tracking-health read: a verdict about a site's tags. There is
            // no window here to cap, so there is nothing for a completeness
            // chip to be about.
            action: "tracking_health",
            source: "live_google",
            verdict: "GA4 is installed and firing.",
            has_ga4: true,
            ...extra,
          })}
          metadata={undefined}
        />,
      );

    it("an absent truncated key renders NO completeness chip", () => {
      const markup = marketing({});
      // The card itself still rendered — this is not a vacuous pass.
      expect(markup).toContain("GA4 is installed and firing.");
      for (const chip of COMPLETENESS_CHIPS) expect(markup).not.toContain(chip);
    });

    it("an explicit null renders the provider-does-not-say chip", () => {
      const markup = marketing({ truncated: null });
      expect(markup).toContain("completeness unknown — the provider does not say");
      expect(markup).not.toContain("complete within the window asked for");
    });

    it("an explicit false renders complete within the window", () => {
      const markup = marketing({ truncated: false });
      expect(markup).toContain("complete within the window asked for");
      expect(markup).not.toContain("completeness unknown");
    });

    it("an explicit completeness verdict speaks even with truncated absent", () => {
      const markup = marketing({ completeness: "bounded_preview" });
      expect(markup).toContain("a bounded preview, not the whole set");
    });

    it("the workspace card frames the chip through the same ONE predicate", () => {
      const workspace = (extra: Record<string, unknown>) =>
        mount(
          <GoogleWorkspaceResultBlock
            content={JSON.stringify({
              __kind: WORKSPACE_KIND,
              action: "list_files",
              count: 3,
              ...extra,
            })}
            metadata={undefined}
          />,
        );
      for (const chip of COMPLETENESS_CHIPS)
        expect(workspace({})).not.toContain(chip);
      expect(workspace({ truncated: null })).toContain(
        "completeness unknown — the provider does not say",
      );
      expect(workspace({ truncated: true })).toContain(
        "capped — more exists than is shown",
      );
    });

    /**
     * `bounds` is deliberately NOT the same class, and this holds that line: it
     * is the WINDOW ITSELF, not a verdict about the read, so a number whose
     * window nobody stated must say so whether the key was omitted or arrived
     * null (V-22, NEW-10). Symmetry with `truncated` here would delete the
     * guard for the commonest payload of all.
     */
    it("a count with bounds absent — or null — still announces the unstated window", () => {
      for (const bounds of [undefined, null]) {
        const markup = mount(
          <GoogleMarketingResultBlock
            content={JSON.stringify({
              __kind: MARKETING_KIND,
              action: "read_search_console",
              source: "persisted",
              returned_count: 412,
              count_unit: "rows",
              ...(bounds === undefined ? {} : { bounds }),
            })}
            metadata={undefined}
          />,
        );
        expect(markup).toContain("412");
        expect(markup).toContain("window not stated by the provider");
      }
    });
  });

  /**
   * 🚨 THE WRITE-CLAIM CENSUS (F-95, BUGBOT MEDIUM). `NothingWasWritten`
   * consumes `approval` plus the whole `WRITE_CLAIM_KEYS` family through
   * `readWriteClaim` — but until this fix neither block's `PROMOTED` list
   * omitted them, so `MetaStrip`/`LeftoverFields` printed the very same
   * `dry_run: true` / `approval: {...}` a reader had just been told about,
   * as an unlabeled raw leftover: the same fact shown twice.
   *
   * This fixture carries a `would_append` preview (asserted separately, since
   * `would_*` names are open-ended and are omitted dynamically via
   * `claim.previewKeys` rather than a static list — see `WRITE_CLAIM_KEYS`'s
   * own comment), `dry_run: true` and an `approval` block, on BOTH blocks.
   * Each write-claim fact must render EXACTLY ONCE: summarized by
   * `NothingWasWritten`, never repeated as a raw leftover key/value pair.
   */
  describe("the write-claim key family renders once, never twice (F-95)", () => {
    const CASES = [
      {
        name: "google_workspace_result",
        kind: WORKSPACE_KIND,
        Component: GoogleWorkspaceResultBlock,
        promoted: WORKSPACE_PROMOTED,
      },
      {
        name: "google_marketing_result",
        kind: MARKETING_KIND,
        Component: GoogleMarketingResultBlock,
        promoted: MARKETING_PROMOTED,
      },
    ] as const;

    it.each(CASES)("$name's PROMOTED list carries every write-claim key", ({ promoted }) => {
      for (const key of WRITE_CLAIM_KEYS) {
        expect(promoted).toContain(key);
      }
    });

    it.each(CASES)(
      "$name renders a would_append + awaiting_approval + approval payload's facts exactly once",
      ({ kind, Component }) => {
        const data = {
          action: "probe_action",
          awaiting_approval: true,
          would_append: { position: "end_of_document", text: "New paragraph body." },
          approval: {
            approval_id: "ap-95",
            mode: "ask",
            knob: "hitl.google.unattended_file_write",
            waiting_with: "the person whose Google account this is",
          },
        };
        kindRegistry.upsertDefinition({ kind, schema: null, schemaSource: "content_ir", tier: "warm" });
        componentRegistry.ingestDbRows([registeredRow(kind)]);
        const routed = applyIrKindRoute(kindBlock(kind, data));
        const markup = mount(<Component content={routed.content} metadata={routed.metadata} />);

        // The claim IS summarized — `NothingWasWritten`'s structured chip row
        // (`queue id ap-95`, the knob, `waiting_with`) is where these facts
        // belong, exactly once each.
        expect(markup).toContain("waiting for a person to approve it");
        expect(markup).toContain("queue id ap-95");
        expect(markup).toContain("hitl.google.unattended_file_write");

        // RED before F-95: `approval` and `awaiting_approval` were absent from
        // `PROMOTED`, so `MetaStrip`/`LeftoverFields` printed the SAME facts a
        // second time — `awaiting_approval` as a raw "Awaiting approval: true"
        // scalar, and the whole `approval` object dumped again through
        // `LeftoverFields`' value viewer, repeating "ap-95" and the knob.
        expect(markup).not.toContain("Awaiting approval:");
        const occurrencesOf = (needle: string) =>
          markup.split(needle).length - 1;
        expect(occurrencesOf("ap-95")).toBe(1);
        expect(occurrencesOf("hitl.google.unattended_file_write")).toBe(1);
      },
    );
  });

  /**
   * 🚨 BUGBOT MEDIUM ON F-95's `f881c9f6`. `NothingWasWritten` only ANNOUNCES
   * that a preview exists; it never prints the change. F-95 merged
   * `claim.previewKeys` into both blocks' `omit` lists on the mistaken belief
   * that the announcement was the whole story, so an unmodelled `would_*` —
   * `would_delete` on the workspace block (which hand-lists only
   * `would_append`/`would_write`/`would_create`), and EVERY `would_*` on the
   * marketing block (which is read-only and has no dedicated preview section
   * at all) — vanished between the headline and the leftovers. RED against
   * `f881c9f6`: the distinctive marker string is absent entirely; GREEN once
   * `UnmodelledPreviews` (`google-result-shared.tsx`) renders it, exactly
   * once, under a preview heading.
   */
  describe("an unmodelled would_* preview is shown exactly once, never swallowed (BUGBOT MEDIUM on f881c9f6)", () => {
    const occurrencesOf = (markup: string, needle: string) =>
      markup.split(needle).length - 1;

    it("google_workspace_result: an unhandled would_delete renders its content once, under a preview heading", () => {
      const data = {
        action: "delete_document",
        dry_run: true,
        title: "Old Draft",
        would_delete: { document_ref: "1Trash", reason: "UNIQUE-DELETE-MARKER-9f2a" },
      };
      kindRegistry.upsertDefinition({
        kind: WORKSPACE_KIND,
        schema: null,
        schemaSource: "content_ir",
        tier: "warm",
      });
      componentRegistry.ingestDbRows([registeredRow(WORKSPACE_KIND)]);
      const routed = applyIrKindRoute(kindBlock(WORKSPACE_KIND, data));
      const markup = mount(
        <GoogleWorkspaceResultBlock content={routed.content} metadata={routed.metadata} />,
      );

      // The content is there — RED before the fix, this string never appeared.
      expect(occurrencesOf(markup, "UNIQUE-DELETE-MARKER-9f2a")).toBe(1);
      // Under a preview heading, not a bare leftover dump.
      expect(markup).toContain("The change it would make");
      // The lead-in line is still present, exactly as before.
      expect(markup).toContain("Nothing was written");
      // Never ALSO as a raw leftover: `LeftoverFields`' own heading must not
      // have picked it up a second time.
      expect(occurrencesOf(markup, "would_delete")).toBe(0);
    });

    it("google_marketing_result: an unhandled would_update renders its content once, even though this block has no dedicated preview section", () => {
      const data = {
        action: "update_tag_manager_container",
        would_update: { container_id: "GTM-123", note: "UNIQUE-UPDATE-MARKER-7c3d" },
      };
      kindRegistry.upsertDefinition({
        kind: MARKETING_KIND,
        schema: null,
        schemaSource: "content_ir",
        tier: "warm",
      });
      componentRegistry.ingestDbRows([registeredRow(MARKETING_KIND)]);
      const routed = applyIrKindRoute(kindBlock(MARKETING_KIND, data));
      const markup = mount(
        <GoogleMarketingResultBlock content={routed.content} metadata={routed.metadata} />,
      );

      expect(occurrencesOf(markup, "UNIQUE-UPDATE-MARKER-7c3d")).toBe(1);
      expect(markup).toContain("The change it would make");
      expect(markup).toContain("Nothing was written");
      expect(occurrencesOf(markup, "would_update")).toBe(0);
    });
  });

  /**
   * 🚨 THE FOOTER PREDICATE (F-95, BUGBOT LOW). "This read returned no rows"
   * ignored a tracking-health answer: a payload carrying `verdict` and/or
   * `has_ga4` / `has_conversion_tag` / `has_consent` with an empty or absent
   * `checks` still printed "no rows" under a real verdict.
   */
  describe("the marketing footer's no-rows sentence fires only on a truly empty read (F-95)", () => {
    it("a verdict with an empty checks array and a real has_ga4 flag is NOT called an empty read", () => {
      const markup = mount(
        <GoogleMarketingResultBlock
          content={JSON.stringify({
            __kind: MARKETING_KIND,
            action: "tracking_health",
            source: "live_google",
            verdict: "GA4 is installed and reporting.",
            checks: [],
            has_ga4: false,
          })}
          metadata={undefined}
        />,
      );
      expect(markup).toContain("GA4 is installed and reporting.");
      expect(markup).not.toContain("This read returned no rows");
    });

    it("no verdict, no checks, no containers, no data and no has_* flags IS an empty read", () => {
      const markup = mount(
        <GoogleMarketingResultBlock
          content={JSON.stringify({
            __kind: MARKETING_KIND,
            action: "read_search_console",
            source: "persisted",
            bounds: { start_date: "2026-09-01", limit: 50 },
          })}
          metadata={undefined}
        />,
      );
      expect(markup).toContain("This read returned no rows");
    });
  });
});

/**
 * 🚨 THE CALENDAR DOOR READS THE SERVER'S `record_table` (F-93, V-22 NEW-9).
 *
 * The event door used to say `type="calendar_event"` beside `event.record_id`
 * while the server stamps `record_id`, **`record_table`** and
 * `record_sync_status` on every event it names
 * (`aidream/services/google_workspace/tools.py`). V-22 fed an event carrying
 * `record_table: "media.source_library"` and got an Open control that opens a
 * `calendar_event` with a foreign id — the V-21 `document → udt_document` defect
 * in a new place, and exactly the protection a token-driven reader has and a
 * hardcoded type throws away.
 *
 * `RecordDoor` now resolves the stamp through the ONE resolution
 * (`itemTypeForRecordTable`, derived from the item-presentation type map) and
 * renders NOTHING when the stamp names a table no item type reads: a door to the
 * wrong record reads as a fact and is a lie.
 */
describe("a calendar event's door obeys the server's record_table (NEW-9)", () => {
  const event = (extra: Record<string, unknown>) => ({
    __kind: WORKSPACE_KIND,
    action: "read_calendar",
    events: [
      {
        event_id: "g-evt-1",
        title: "Weekly sync",
        starts_at: "2026-09-18T15:00:00Z",
        record_id: "812e1df9-e3ff-4a60-b90c-ccfaabe2b88e",
        ...extra,
      },
    ],
  });

  const render = (value: Record<string, unknown>) => {
    kindRegistry.upsertDefinition({
      kind: WORKSPACE_KIND,
      schema: null,
      schemaSource: "content_ir",
      tier: "warm",
    });
    componentRegistry.ingestDbRows([registeredRow(WORKSPACE_KIND)]);
    const routed = applyIrKindRoute(kindBlock(WORKSPACE_KIND, value));
    expect(markerOf(routed)?.key).toBe(WORKSPACE_KIND);
    return mount(
      <GoogleWorkspaceResultBlock
        content={routed.content}
        metadata={routed.metadata}
      />,
    );
  };

  it("opens the event when the stamp says it IS a calendar event", () => {
    const markup = render(event({ record_table: "communication.calendar_event" }));
    expect(markup).toContain("Open Weekly sync in AI Matrx");
  });

  it("renders NO door when the stamp names a table no item type reads", () => {
    // V-22's exact probe. The old door offered "Open" and opened a
    // `calendar_event` with a `media.source_library` id.
    const markup = render(event({ record_table: "media.source_library" }));
    expect(markup).not.toContain("in AI Matrx");
    // The event itself is still shown — the record is what has no door, not the
    // answer.
    expect(markup).toContain("Weekly sync");
  });

  it("still opens an older payload that carries no stamp at all", () => {
    const markup = render(event({}));
    expect(markup).toContain("Open Weekly sync in AI Matrx");
  });
  /**
   * 🚨 V-23 NEW-4 — AN UNREADABLE COMPLETION MARKER IS NEVER SWALLOWED.
   *
   * The verifier's payload, verbatim. RED on `82d6127e` this card rendered, in
   * full: "Q3 Plan Append document" — nothing about whether the append
   * happened. `readWriteClaim` only counted `COMPLETED_KEYS` when
   * `readBool(...) === true`, so a non-boolean fell to `none`; and `appended`
   * is a `WRITE_CLAIM_KEYS` member both blocks omit from the meta strip and the
   * leftovers, so the key left the screen entirely. An unreadable HOLD flag
   * already had its own honest state — same class, opposite treatment.
   */
  describe("V-23 NEW-4: an unreadable completion flag gets the same honest state as an unreadable hold flag", () => {
    const payload = {
      __kind: WORKSPACE_KIND,
      action: "append_document",
      title: "Q3 Plan",
      appended: "yes",
    };

    it("says nothing is shown as written, and names the key AND the value", () => {
      const markup = mount(
        <GoogleWorkspaceResultBlock content={JSON.stringify(payload)} metadata={undefined} />,
      );
      expect(markup).toContain("Nothing is shown as written.");
      expect(markup).toContain("appended");
      expect(markup).toContain("yes");
      expect(markup).toContain("cannot be read");
    });

    it("shows no green receipt chip for a marker it could not read", () => {
      const markup = mount(
        <GoogleWorkspaceResultBlock content={JSON.stringify(payload)} metadata={undefined} />,
      );
      expect(markup).not.toContain(">appended</span>");
    });

    it("the marketing block reads the identical payload the identical way", () => {
      const markup = mount(
        <GoogleMarketingResultBlock
          content={JSON.stringify({ ...payload, __kind: MARKETING_KIND })}
          metadata={undefined}
        />,
      );
      expect(markup).toContain("Nothing is shown as written.");
      expect(markup).toContain("appended");
    });
  });

  /**
   * 🚨 V-23 NEW-5 — THE CARD MAY NOT SAY "NO ROWS" UNDER THE ROWS IT PRINTED,
   * AND MAY NOT NAME A WINDOW NOBODY STATED.
   *
   * The verifier's payload, verbatim: RED on `82d6127e` this card printed
   * "This read returned no rows for the window above… widen the window"
   * directly above "Site: example.com Sessions: 1,234 Users: 900". F-95/F-98
   * taught the predicate the verdict and the `has_*` flags; the promoted-scalar
   * residue — the very facts the card prints last — was still outside that
   * reading. Emptiness now comes from the SAME pass that prints them.
   */
  describe("V-23 NEW-5: the empty-read footer is derived from what the card printed", () => {
    const traffic = {
      __kind: MARKETING_KIND,
      action: "traffic_summary",
      site: "example.com",
      sessions: 1234,
      users: 900,
    };

    it("prints the scalar facts and does NOT call the read empty", () => {
      const markup = mount(
        <GoogleMarketingResultBlock content={JSON.stringify(traffic)} metadata={undefined} />,
      );
      expect(markup).toContain("1,234");
      expect(markup).toContain("example.com");
      expect(markup).not.toContain("This read returned no rows");
    });

    it("a leftover OBJECT counts too — any shape of printed fact is a fact", () => {
      const markup = mount(
        <GoogleMarketingResultBlock
          content={JSON.stringify({
            __kind: MARKETING_KIND,
            action: "traffic_summary",
            by_channel: { organic: 700, paid: 534 },
          })}
          metadata={undefined}
        />,
      );
      expect(markup).not.toContain("This read returned no rows");
    });

    it("a truly empty read with NO stated window never says 'the window above'", () => {
      const markup = mount(
        <GoogleMarketingResultBlock
          content={JSON.stringify({
            __kind: MARKETING_KIND,
            action: "read_search_console",
            source: "persisted",
          })}
          metadata={undefined}
        />,
      );
      expect(markup).toContain("This read returned no rows");
      expect(markup).toContain("no window was stated");
      expect(markup).not.toContain("the window above");
    });

    it("a truly empty read WITH a stated window still points at that window", () => {
      const markup = mount(
        <GoogleMarketingResultBlock
          content={JSON.stringify({
            __kind: MARKETING_KIND,
            action: "read_search_console",
            source: "persisted",
            bounds: { start_date: "2026-09-01", limit: 50 },
          })}
          metadata={undefined}
        />,
      );
      expect(markup).toContain("no rows for the window above");
    });
  });

  /**
   * 🚨 V-23 ADDENDUM — THE LEAD STATES THE CLAIM; THE NOTE CARRIES THE REMEDY.
   *
   * On `/shapes/google_workspace_result` the canonical example printed "Nothing
   * was written." twice: once as the lead and once inside the server's own
   * `note`, whose remedy ("Show the user this exact block.") is the only part
   * the reader still needs. Round 8 claimed no fact prints twice (the F-98
   * class); this is that claim, asserted on the canonical example itself.
   */
  describe("V-23 addendum: the write claim is stated exactly once", () => {
    const canonical = {
      __kind: WORKSPACE_KIND,
      action: "append_document",
      dry_run: true,
      title: "Q3 Plan",
      would_append: { position: "end_of_document", text: "\nThree risks remain open." },
      note: "NOTHING WAS WRITTEN. Show the user this exact block.",
    };

    it("prints the claim once and keeps the note's remedy", () => {
      const markup = mount(
        <GoogleWorkspaceResultBlock content={JSON.stringify(canonical)} metadata={undefined} />,
      );
      const claims = markup.toLowerCase().split("nothing was written").length - 1;
      expect(claims).toBe(1);
      expect(markup).toContain("Show the user this exact block.");
    });

    it("a note that is ONLY the claim disappears rather than echoing", () => {
      const markup = mount(
        <GoogleWorkspaceResultBlock
          content={JSON.stringify({ ...canonical, note: "Nothing was written." })}
          metadata={undefined}
        />,
      );
      expect(markup.toLowerCase().split("nothing was written").length - 1).toBe(1);
    });

    it("a note whose words are NOT the claim keeps every word", () => {
      const markup = mount(
        <GoogleWorkspaceResultBlock
          content={JSON.stringify({
            __kind: WORKSPACE_KIND,
            action: "import_contact",
            needs_client: { do_this: "Finish this in the app." },
            note: "NOTHING WAS IMPORTED, and this is not a failure you can retry.",
          })}
          metadata={undefined}
        />,
      );
      expect(markup).toContain("NOTHING WAS IMPORTED, and this is not a failure you can retry.");
    });
  });
  /**
   * 🚨 V-23 NEW-6 — A RECORD THE CARD NAMES, WHOSE TOKEN HAS A DOOR, GETS A
   * DOOR (ruling R35).
   *
   * RED on `82d6127e`: a row stamped `record_table: "media.source_library"`
   * rendered NO control. `itemTypeForRecordTable` correctly returned null (no
   * item type opens that table in place) and `RecordDoor` correctly refused the
   * wrong door — but `media_source_library` is a registered entity whose
   * `hrefFor` is `/libraries/<id>`, a working screen. R35: `hrefFor` is the
   * durable address and `useOpenItemPresentation` is the door, and BOTH are
   * required, so the refusal needed a second leg. A table no entity claims
   * still renders nothing — a door to the wrong record reads as a fact.
   */
  describe("V-23 NEW-6: the door falls back to the durable address before rendering nothing", () => {
    const ID = "812e1df9-e3ff-4a60-b90c-ccfaabe2b88e";

    it("media.source_library — no opener, so the entity's own address IS the door", () => {
      const markup = mount(
        <RecordDoor
          type="calendar_event"
          recordTable="media.source_library"
          id={ID}
          name="Weekly sync"
        />,
      );
      expect(markup).toContain(`/libraries/${ID}`);
      // And never the wrong door: the caller's `calendar_event` guess is dead.
      expect(markup).not.toContain("Open Weekly sync in AI Matrx");
    });

    it("web.youtube_video — an in-place opener, not a link", () => {
      const markup = mount(
        <RecordDoor
          type="calendar_event"
          recordTable="web.youtube_video"
          id={ID}
          name="Launch video"
        />,
      );
      expect(markup).toContain("Open Launch video in AI Matrx");
    });

    it("totally.not_a_table — no entity claims it, so NOTHING renders", () => {
      const markup = mount(
        <RecordDoor
          type="calendar_event"
          recordTable="totally.not_a_table"
          id={ID}
          name="Weekly sync"
        />,
      );
      expect(markup).toBe("");
    });

    it("an unstamped row still opens through the caller's own type", () => {
      const markup = mount(<RecordDoor type="calendar_event" id={ID} name="Weekly sync" />);
      expect(markup).toContain("Open Weekly sync in AI Matrx");
    });

    it("no id is still no door", () => {
      expect(
        mount(<RecordDoor type="calendar_event" recordTable="media.source_library" id={null} />),
      ).toBe("");
    });
  });
});
