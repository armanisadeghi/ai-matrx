/**
 * 🚨 ONE REGISTRATION, THREE PRESENTATIONS — and they render the REAL row.
 *
 * `calendar_event` had no entry in THE item-presentation registry at all, so
 * `resolveItemDetailType("calendar_event")` resolved the neutral fallback:
 * `load === null`, label "Item", and every presentation showed the honest
 * "nothing more is stored here" state for a record fully stored in
 * `communication.calendar_event`. Every door an agenda row, an approval card or a
 * pasted `/detail/calendar_event/<id>` URL could offer led there.
 *
 * This suite mounts the window, the docked panel and the page through the REAL
 * type map and the REAL refinement, and asserts what PLAN §4.6 promises on each:
 * the title, the curated fields (never a jsonb dump), the attendees with their
 * RSVP words, the Person door, and the four things a read-only grant cannot do,
 * stated as sentences with no control to press.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

import {
  DetailDockedPresentation,
  DetailPagePresentation,
  DetailWindowPresentation,
} from "@/lib/detail/presentations";
import { DetailHostProvider, type DetailHostPorts } from "@/lib/detail/host";
import type {
  DetailDockedShellProps,
  DetailPageShellProps,
  DetailWindowShellProps,
} from "@/lib/detail/host";

import { resolveItemDetailType } from "@/features/item-presentation/detail";
import { getItemConfig } from "@/features/item-presentation/registry";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

const EVENT_ID = "aaaaaaaa-1111-2222-3333-444444444444";
const PARTY_ID = "bbbbbbbb-1111-2222-3333-444444444444";

/**
 * The row is shaped exactly as the live table holds it — `sync_status`,
 * `synced_at`, `synced_via_connection_id`, and an `attendees` payload carrying
 * the `__kind` marker the server writes.
 */
const ROW = {
  id: EVENT_ID,
  provider: "google",
  external_id: "google-event-1",
  calendar_id: "primary",
  title: "Consult — Dr Chen",
  starts_at: "2026-09-18T13:00:00Z",
  ends_at: "2026-09-18T13:30:00Z",
  all_day: false,
  location: "Suite 300",
  meeting_url: "https://meet.google.com/abc-defg-hij",
  attendees: {
    __kind: "calendar_event_attendees",
    attendees: [
      {
        email: "dr.chen@clinic.com",
        display_name: "Dr Chen",
        rsvp: "accepted",
        optional: false,
        organizer: false,
        self: false,
      },
      {
        email: "front.desk@clinic.com",
        display_name: null,
        rsvp: "needsAction",
        optional: true,
        organizer: false,
        self: false,
      },
    ],
  },
  organizer_email: "me@clinic.com",
  external_updated_at: "2026-09-17T09:00:00Z",
  synced_at: "2026-09-18T12:00:00Z",
  synced_via_connection_id: "cccccccc-1111-2222-3333-444444444444",
  sync_status: "available",
  sync_status_reason: null,
  organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
  created_by: "dddddddd-1111-2222-3333-444444444444",
  updated_by: null,
  created_at: "2026-09-18T12:00:00Z",
  updated_at: "2026-09-18T12:00:00Z",
  deleted_at: null,
  version: 1,
  metadata: {},
  visibility: "personal",
};

jest.mock("@/utils/supabase/client", () => {
  const make = (table: string) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    Object.assign(chain, {
      select: self,
      eq: self,
      in: self,
      is: self,
      order: self,
      range: self,
      abortSignal: self,
      maybeSingle: async () => ({
        data: table === "calendar_event" ? ROW : null,
        error: null,
      }),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({
          data:
            table === "party"
              ? [{ id: PARTY_ID, display_name: "Dr Chen" }]
              : table === "party_contact_point"
                ? [{ party_id: PARTY_ID, medium: { channel: "email", value_key: "dr.chen@clinic.com" } }]
                : [],
          error: null,
        }).then(resolve),
    });
    return chain;
  };
  return {
    supabase: {
      schema: () => ({ from: (table: string) => make(table) }),
      from: (table: string) => make(table),
    },
  };
});

jest.mock("@/features/scopes/service/associationsService", () => ({
  associationsService: {
    // The SERVER's own attendee edge: this is what makes Dr Chen a door.
    listForSources: async () => ({
      ok: true,
      data: { edges: [{ sourceId: EVENT_ID, targetId: PARTY_ID, role: "attendee" }] },
    }),
  },
}));

jest.mock("@/features/crm/deals/service", () => ({
  fetchDealsForParty: async () => [
    { id: "deal-1", status: "open", updated_at: "2026-09-17T00:00:00Z" },
    { id: "deal-2", status: "won", updated_at: "2026-09-16T00:00:00Z" },
  ],
}));

// The health strip's real producer reads the connectors' own state; with nothing
// connected it answers honestly rather than throwing, which is what we want here.
jest.mock("@/features/marketing/google/service", () => ({
  listGoogleCapabilities: async () => [],
  listGoogleConnectionInventory: async () => ({ connections: [], resources: [] }),
  postGoogleBackend: async () => ({ json: async () => ({}) }),
}));

function ports(shells: DetailHostPorts["shells"]): DetailHostPorts {
  return {
    // 🚨 THE REAL TYPE MAP.
    resolveType: resolveItemDetailType,
    usePresentationSetting: () => ({ value: "window", error: null }),
    resolvePresentation: async () => "window",
    warmPresentation: () => {},
    open: jest.fn(),
    close: jest.fn(),
    navigate: {
      pageHref: () => `/detail/calendar_event/${EVENT_ID}`,
      toPage: jest.fn(),
      back: jest.fn(),
      canGoBack: () => false,
      toRecordHome: jest.fn(),
    },
    shells,
    doors: {
      RecordDoors: ({ id }: { id: string }) => <span data-doors={id} />,
      RefCell: ({ value }: { value: string }) => <span>{value}</span>,
      tokenFromColumnName: () => null,
      isUuidValue: (v: unknown): v is string => typeof v === "string",
      hasDoor: () => true,
    },
    associations: { defaultTokens: [], canAnchor: () => false },
    history: { list: async () => [] },
    notify: { error: jest.fn(), success: jest.fn() },
    copyText: async () => true,
  } as unknown as DetailHostPorts;
}

const Shell =
  (mark: string) =>
  ({ titleNode, actions, children }: DetailWindowShellProps | DetailDockedShellProps) => (
    <div data-shell={mark}>
      {titleNode}
      {actions}
      {children}
    </div>
  );

function PageShell({ titleNode, actions, onBack, children }: DetailPageShellProps) {
  return (
    <div data-shell="page">
      <button type="button" aria-label="Back" onClick={onBack}>
        back
      </button>
      {titleNode}
      {actions}
      {children}
    </div>
  );
}

const DATA = { type: "calendar_event", id: EVENT_ID, seed: null, list: null };

const PRESENTATIONS = [
  {
    name: "window",
    shells: { Window: Shell("window") },
    node: <DetailWindowPresentation data={DATA} onClose={() => {}} />,
  },
  {
    name: "docked",
    shells: { Docked: Shell("docked") },
    node: <DetailDockedPresentation data={DATA} onClose={() => {}} />,
  },
  {
    name: "page",
    shells: { Page: PageShell },
    node: <DetailPagePresentation data={DATA} />,
  },
] as const;

async function mount(which: (typeof PRESENTATIONS)[number]) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <DetailHostProvider ports={ports(which.shells)}>{which.node}</DetailHostProvider>,
    );
  });
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
  return {
    text: container.textContent ?? "",
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("the registration itself", () => {
  it("is recognized, and is not the neutral fallback", () => {
    const { config, recognized } = getItemConfig("calendar_event");
    expect(recognized).toBe(true);
    expect(config.label).toBe("Calendar event");
    expect(config.detailSource).toEqual({
      table: "calendar_event",
      schemaName: "communication",
      titleField: "title",
    });
    const type = resolveItemDetailType("calendar_event");
    expect(type).not.toBeNull();
    // The entity token is what gives the record its route, peek, associations
    // and history — a null here is the silent "no door" defect.
    expect(type!.entityToken).toBe("calendar_event");
    expect(type!.load).not.toBeNull();
    expect(type!.health).toBeTruthy();
  });
});

describe("one real event, in all three presentations", () => {
  for (const which of PRESENTATIONS) {
    it(`renders the ${which.name} presentation from the real type map`, async () => {
      const m = await mount(which);
      try {
        expect(m.container.querySelector(`[data-shell="${which.name}"]`)).not.toBeNull();
        // The record names itself.
        expect(m.text).toContain("Consult — Dr Chen");
        // The curated fields, not a column dump.
        expect(m.text).toContain("Suite 300");
        expect(m.text).toContain("me@clinic.com");
        expect(m.text).toContain("Refreshed");
        // 🚨 NEVER the raw jsonb: the marker must not reach a person's screen as
        // content, and the whole attendee payload must not be printed as a field.
        expect(m.text).not.toContain("__kind");
        expect(m.text).not.toContain("calendar_event_attendees");
        // The attendees section: the RSVP words, and the Person as a door.
        expect(m.text).toContain("Dr Chen");
        expect(m.text).toContain("Accepted");
        expect(m.text).toContain("No reply yet");
        expect(m.text).toContain("1 open deal");
        // What a read-only grant cannot do — stated, with no control to press.
        expect(m.text).toContain("Change the time");
        expect(m.text).toContain("Reply to the invitation");
      } finally {
        m.unmount();
      }
    });
  }
});
