/**
 * `platform_record` — the ONE shape "Read a Record" (`data.read_record`,
 * matrx-graph) answers with, and the render leg it was missing.
 *
 * Live registry, 2026-09-18 (project brsgrqvjdzwihsvnfqkf): the row EXISTS
 * (`content_ir.kind_definition`, created 05:35:23Z, `authoring_owner: python`,
 * schema + `emitted_fingerprint` present) but is held `is_active = false` with
 * NO `content_ir.kind_component` row, and `content_ir.evaluate_kind_activation`
 * names exactly one missing leg:
 *
 *     render: no active role='output' kind_component row
 *
 * `structural_ok`, `unique_ok` and `recognition_ok` are already true. And
 * `matrx_graph/kinds.py` states in capitals that the engine IGNORES `is_active`
 * (Arman, 2026-08-25), so a run containing the node is admitted and executes
 * TODAY — into `generic_structured`, the can-never-fail floor that is not a
 * component (conversion-campaigns § Law 4b). This suite asserts the render leg
 * the way its siblings do (`kind-google-result-families.test.tsx`): the
 * resolver answers with the kind's own component, that component renders the
 * facts a reader came for, and nothing is swallowed.
 *
 * 🚨 FIXTURES ARE DERIVED FROM THE NODE'S OWN OUTPUT BUILDER, not invented.
 * Every key below is declared on `PlatformRecord` in
 * `packages/matrx-graph/matrx_graph/nodes/data/read_record.py` and written by
 * `ReadRecordExecutor.execute` (`entity_type`, `record_id`, `table`,
 * `entity_label`, `record_label`, `organization_id`, `fields`,
 * `hidden_fields`), with the canonical example from
 * `aidream/aidream/kinds/platform_records.py`. That proves the ROUTE and the
 * COMPONENT. It does NOT award `verified` maturity (no screen was seen) and
 * this suite does not claim it.
 *
 * THE THREE HIGH-STAKES CASES, asserted first: the withheld columns are NAMED
 * (the node withholds them on purpose — a silent absence undoes that), an
 * entity token with no wired opener renders NO door (a control that cannot open
 * is worse than none), and a degraded read is a SENTENCE WITH ITS REMEDY rather
 * than an empty card.
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
import { kindRegistry } from "../registry/kind-registry";
import { resolveBlockDispatch } from "@/components/mardown-display/chat-markdown/block-registry/block-dispatch";
import { envelopeFromCompleteValue, IR_ENVELOPE_KEY } from "@ai-matrx/content-ir";
import type { KindComponentProjection } from "../registry/schema-source-kind-components";
import PlatformRecordBlock, {
  PROMOTED,
} from "@/components/mardown-display/blocks/result-kinds/PlatformRecordBlock";
// The real registry — the door's own gate.
import { getItemConfig } from "@/features/item-presentation/registry";
import { ENTITY_TYPE_METADATA, type EntityTypeToken } from "@ai-matrx/associations";
// The F-93 census of listed entity tokens with no door — the ONE place a
// "doorless" fixture token is allowed to come from, so this suite never
// re-hardcodes which token is doorless (doors get added; F-91 hardcoded
// `web_youtube_video` and F-93 gave it a door nine hours later, DD-shaped
// failure this derivation exists to make impossible).
import { DOORLESS_LISTED_ENTITIES } from "@/features/scopes/registry/listed-entity-doors";

jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  ...jest.requireActual("@/lib/diagnostics/errorCaptureStore"),
  captureError: jest.fn(),
}));

/**
 * The ONE opener, stood in for — not re-implemented.
 * `useOpenItemPresentation` refuses to run outside `DetailHost` (mounted once,
 * app-wide) and that refusal is correct. What this suite owns is the contract on
 * THIS side of it: a Record id becomes a control at all, and an entity token
 * with no wired opener produces NO control.
 *
 * 🚨 The real module is SPREAD, never replaced wholesale (DD-239).
 */
const openItem = jest.fn();
jest.mock("@/features/item-presentation/useOpenItemPresentation", () => ({
  ...jest.requireActual("@/features/item-presentation/useOpenItemPresentation"),
  useOpenItemPresentation: () => openItem,
}));

const KIND = "platform_record";

function mount(node: React.ReactNode): string {
  const store = configureStore({
    reducer: { probe: (state: Record<string, never> = {}) => state },
  });
  return renderToStaticMarkup(<Provider store={store}>{node}</Provider>);
}

/**
 * The first token the F-93 census still names as doorless, verified live
 * against the item registry rather than trusted from the census text (a
 * stale census entry, like `web_youtube_video`'s, hides the very door it
 * claims is missing). Never hard-code a specific token here: doors get
 * added, and the next one to gain a door must not turn this suite red.
 */
function firstDoorlessToken(): EntityTypeToken {
  for (const token of Object.keys(DOORLESS_LISTED_ENTITIES) as EntityTypeToken[]) {
    if (!getItemConfig(token).recognized) {
      return token;
    }
  }
  throw new Error(
    "THE F-93 CENSUS NO LONGER NAMES A DOORLESS TOKEN: every listed entity " +
      "token it records now has a wired opener in the item-presentation " +
      "registry. The 'no wired opener renders no control' case this test " +
      "proves still needs a fixture — add a synthetic, never-registered " +
      "entity token for it instead of deleting or skipping this test.",
  );
}

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

function kindBlock(value: Record<string, unknown>) {
  const complete = { __kind: KIND, ...value };
  return {
    type: "code",
    content: JSON.stringify(complete),
    // The raw region's annotation — never kind data; must not survive routing.
    serverData: { language: "json" },
    metadata: { [IR_ENVELOPE_KEY]: envelopeFromCompleteValue(complete, KIND) },
  };
}

function markerOf(block: { metadata?: Record<string, unknown> }) {
  return block.metadata?.[IR_ROUTE_KEY] as IrRouteMarker | undefined;
}

interface Fixture {
  name: string;
  data: Record<string, unknown>;
  /** Strings a reader must actually see rendered. */
  visible: string[];
  /** Strings that must NOT appear. */
  absent?: string[];
}

/** The node's canonical answer — the example on the published kind row. */
const CANONICAL: Record<string, unknown> = {
  entity_type: "google_document",
  record_id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  table: "workbench.google_document",
  entity_label: "Google Document",
  record_label: "Q3 Plan",
  organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
  fields: {
    id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    title: "Q3 Plan",
    organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
  },
  hidden_fields: [],
};

const FIXTURES: Fixture[] = [
  {
    name: "the canonical record leads with its own name, its type and its table",
    data: CANONICAL,
    visible: [
      "Q3 Plan",
      "Google Document",
      "workbench.google_document",
      "The record",
      // The row's own columns, through the platform's value viewer.
      "Title",
      // Tenancy is reported, never the access answer.
      "Organization stamp",
      "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
    ],
    absent: [
      "no readable columns",
      "carries no organization stamp",
      "carries no name",
    ],
  },
  {
    name: "withheld columns are NAMED, never silently absent",
    data: {
      ...CANONICAL,
      // `entity.excluded_columns` ∩ the row, sorted — what the executor builds.
      hidden_fields: ["cached_body", "raw_provider_payload"],
      fields: { id: CANONICAL.record_id, title: "Q3 Plan" },
    },
    visible: [
      "Not shown",
      "cached_body, raw_provider_payload",
      "withholds",
      "these columns",
    ],
  },
  {
    name: "a single withheld column reads as one column, not as a plural",
    data: { ...CANONICAL, hidden_fields: ["cached_body"] },
    visible: ["Not shown", "cached_body", "this column"],
    absent: ["these columns"],
  },
  {
    name: "a row whose table carries no name column says so instead of showing a blank",
    data: { ...CANONICAL, record_label: "" },
    visible: ["Google Document", "carries no name"],
  },
  {
    name: "a type the registry has no label for is humanized, never printed as a token",
    data: {
      entity_type: "chart_of_account",
      record_id: "11111111-1111-1111-1111-111111111111",
      table: "finance.chart_of_account",
      entity_label: "",
      record_label: "4000 · Revenue",
      organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
      fields: { code: "4000", name: "Revenue" },
      hidden_fields: [],
    },
    visible: ["4000 · Revenue", "Chart of account", "finance.chart_of_account"],
  },
  {
    name: "a row with no organization stamp says so, with the remedy",
    data: { ...CANONICAL, organization_id: null },
    visible: ["carries no organization stamp", "Remedy", "needs an organization_id"],
    absent: ["Organization stamp:"],
  },
  {
    name: "a read that came back with no columns is a sentence with its remedy, not an empty card",
    data: { ...CANONICAL, fields: {} },
    visible: [
      "no readable columns",
      "Remedy",
      "excluded columns",
      // Identity still leads: the reader knows WHICH row failed to show.
      "Q3 Plan",
    ],
    absent: ["The record"],
  },
  {
    name: "a refusal sentence the payload carries is printed with its remedy",
    data: {
      entity_type: "google_document",
      record_id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      table: "workbench.google_document",
      entity_label: "Google Document",
      record_label: "",
      organization_id: null,
      fields: {},
      hidden_fields: [],
      // The executor's `access_denied` sentence, verbatim.
      error:
        "You do not have access to this Google Document (google_document " +
        "3fa85f64-5717-4562-b3fc-2c963f66afa6), so the workflow cannot read it.",
    },
    visible: [
      "You do not have access to this Google Document",
      "Nothing below was read from the row",
      "Remedy",
    ],
    // The row is not claimed as empty on top of the refusal.
    absent: ["no readable columns"],
  },
  {
    name: "an unmodelled scalar the component did not promote still reaches the reader",
    data: { ...CANONICAL, read_at: "2026-09-18T09:00:00Z", row_version: 7 },
    visible: ["Read at", "2026-09-18T09:00:00Z", "Row version", "7"],
  },
];

describe("platform_record routes to its own component", () => {
  // ORDER-SENSITIVE, like the sibling suites: both registries are module
  // singletons, so the pre-registration assertion runs before any ingest.
  it("[before] a Record read with no component row reaches the reader only by silent fallback", () => {
    kindRegistry.upsertDefinition({
      kind: KIND,
      schema: null,
      schemaSource: "content_ir",
      tier: "warm",
    });
    const routed = applyIrKindRoute(kindBlock(CANONICAL));
    expect(markerOf(routed)).toEqual({
      by: "generic",
      key: GENERIC_STRUCTURED_COMPONENT_KEY,
      unverified: true,
      reason: "no-component",
    });
  });

  /**
   * THE RENDER LEG, in this repo. A `kind_component` row whose `component_key`
   * nothing renders changes NOTHING at runtime while the registry claims
   * coverage — the exact hole `check:shapes:components` guards at release time,
   * asserted here so it fails in seconds instead of in front of a reader.
   */
  it("the kind's component key resolves in the renderer's dispatch table", () => {
    expect(resolveBlockDispatch(KIND)).not.toBeNull();
  });

  it.each(FIXTURES.map((f) => [f.name, f] as const))("%s", (_name, fixture) => {
    kindRegistry.upsertDefinition({
      kind: KIND,
      schema: null,
      schemaSource: "content_ir",
      tier: "warm",
    });
    componentRegistry.ingestDbRows([registeredRow(KIND)]);

    const routed = applyIrKindRoute(kindBlock(fixture.data));

    // The resolver answered — no silent fallback, no `unverified` flag.
    expect(routed.type).toBe(KIND);
    expect(markerOf(routed)?.key).toBe(KIND);
    expect(markerOf(routed)?.unverified).toBeUndefined();
    // The raw region annotation is poison, not data.
    expect(routed.serverData).toBeUndefined();

    const markup = mount(
      <PlatformRecordBlock content={routed.content} metadata={routed.metadata} />,
    );
    for (const text of fixture.visible) {
      expect(markup).toContain(text);
    }
    for (const text of fixture.absent ?? []) {
      expect(markup).not.toContain(text);
    }
    // A real renderer IS registered, so the floor's honesty lines must NOT appear.
    expect(markup).not.toContain("no custom view yet");
    expect(markup).not.toContain("Unverified shape");
  });

  /**
   * 🚨 THE DOOR IS THE ENTITY TOKEN'S, and the registry decides whether it
   * exists. `google_document` is the platform's registered name for
   * `workbench.google_document` and opens; a token nothing resolves must render
   * NO control at all, rather than a button that opens the wrong record (the
   * V-21 `document → udt_document` defect, and NEW-9's hardcoded `calendar_event`).
   */
  it("a Record of a registered type is a door through the one open path", () => {
    expect(getItemConfig("google_document").config.open).toBeTruthy();
    const markup = mount(
      <PlatformRecordBlock content={JSON.stringify({ __kind: KIND, ...CANONICAL })} />,
    );
    expect(markup).toContain("Open Q3 Plan in AI Matrx");
  });

  it("a Record whose entity token has no wired opener renders no control at all", () => {
    // Derived from the F-93 census, never hard-coded: a token this suite
    // names as doorless today can gain a door tomorrow (it happened to
    // `web_youtube_video` nine hours after F-91 wrote this fixture), so the
    // token is picked live and its doorless premise is asserted, not assumed.
    const doorlessToken = firstDoorlessToken();
    expect(getItemConfig(doorlessToken).recognized).toBe(false);
    const meta = ENTITY_TYPE_METADATA[doorlessToken];
    const table = meta ? `${meta.schema}.${meta.table}` : `unknown.${doorlessToken}`;
    const markup = mount(
      <PlatformRecordBlock
        content={JSON.stringify({
          __kind: KIND,
          entity_type: doorlessToken,
          record_id: "22222222-2222-2222-2222-222222222222",
          table,
          entity_label: "Doorless Entity",
          record_label: "Launch walkthrough",
          organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
          fields: { id: "22222222-2222-2222-2222-222222222222", title: "Launch walkthrough" },
          hidden_fields: [],
        })}
      />,
    );
    expect(markup).toContain("Launch walkthrough");
    expect(markup).not.toContain("in AI Matrx");
    // The id is not printed as dead text in place of the door either.
    expect(markup).not.toContain("22222222-2222-2222-2222-222222222222<");
  });

  it("never swallows a payload it cannot read", () => {
    const markup = mount(
      <PlatformRecordBlock content="not json at all" metadata={undefined} />,
    );
    expect(markup).toContain("not json at all");
  });

  it("says the value is still arriving while the region streams", () => {
    const complete = { __kind: KIND, ...CANONICAL };
    const envelope = envelopeFromCompleteValue(complete, KIND);
    const streaming = {
      ...envelope,
      root: { ...envelope.root, status: "streaming" as const },
    };
    const markup = mount(
      <PlatformRecordBlock
        content={JSON.stringify(complete)}
        metadata={{ [IR_ENVELOPE_KEY]: streaming }}
      />,
    );
    expect(markup).toContain("Still arriving");
  });

  /**
   * THE CENSUS: a promoted-but-unprinted key is the F-86 defect class — a key in
   * `PROMOTED` is skipped by `MetaStrip`/`LeftoverFields`, so if nothing prints
   * it in its place it vanishes. Every plain-string promoted key the canonical
   * fixture sets must appear in what a reader sees.
   */
  it("no promoted key ever vanishes from what a reader sees", () => {
    const markup = mount(
      <PlatformRecordBlock content={JSON.stringify({ __kind: KIND, ...CANONICAL })} />,
    );
    // `record_id` is deliberately NOT printed: it is the door's payload, and a
    // uuid as text beside a working door is the dead end the door replaces.
    // `fields` / `hidden_fields` render their CONTENTS, asserted by the fixtures.
    const STRUCTURAL: ReadonlySet<string> = new Set([
      "record_id",
      "fields",
      "hidden_fields",
      // The label is the fallback source for the headline when the registry
      // gives none; the canonical fixture prints it as the type name.
      "entity_type",
    ]);
    const censused: string[] = [];
    for (const key of PROMOTED) {
      if (STRUCTURAL.has(key)) continue;
      const value = CANONICAL[key];
      if (typeof value !== "string" || value.length === 0) continue;
      censused.push(key);
      expect(markup).toContain(value);
    }
    // An empty loop would pass vacuously and prove nothing.
    expect(censused).toEqual(
      expect.arrayContaining(["table", "entity_label", "record_label", "organization_id"]),
    );
  });
});
