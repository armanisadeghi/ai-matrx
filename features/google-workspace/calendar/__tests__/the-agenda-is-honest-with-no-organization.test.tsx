/**
 * 🚨 F-76 — CI's `check-org-refusal-honesty` found `calendar/service.ts` resolving
 * an organization (`requireOrganizationContext` inside `readAgendaEvents` /
 * `refreshCalendarWindow`) and leaving the person with NOTHING when the answer is
 * "none selected": with `organizationId` null, `useAgenda`'s window-read effect
 * never ran (`if (!organizationId || !userId) return;`), `isLoading` read false
 * (its own guard requires an organization), and the panel fell through to
 * "Your Google Calendar is connected and there is nothing on it" — a confident,
 * wrong claim for a person who has not picked an organization at all (law 4: a
 * screen is absent or honest, never lying).
 *
 * This proves the fix: with no organization selected, the agenda shows the ONE
 * honest "choose an organization" notice, and calls no network door — never the
 * empty-calendar sentence, never a Google refresh, never a Supabase read.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = {
  readCalls: 0,
  refreshCalls: 0,
  organizationRequired: false,
  organizationId: null as string | null,
};

jest.mock("@/features/google-workspace/calendar/service", () => ({
  readAgendaEvents: async () => {
    state.readCalls += 1;
    return [];
  },
  readAttendeePeople: async () => new Map(),
  refreshCalendarWindow: async () => {
    state.refreshCalls += 1;
    return { windowStart: "", windowEnd: "", events: [], attendeesLinked: 0, unmatchedAttendeeEmails: [] };
  },
  createNoteAboutEvent: async () => ({
    noteId: "note-1",
    linkedToEvent: true,
    linkedPartyIds: [],
    failures: [],
  }),
  readPartyEmailKeys: async () => [],
  readCalendarEvent: async () => null,
}));

// The one honest gate `useAgenda` reads instead of `selectOrganizationId`
// directly — mocked here to drive the terminal "none selected" state without
// standing up the whole redux store.
jest.mock("@/features/organizations/useOrganizationRequired", () => ({
  useOrganizationRequired: () => ({
    organizationId: state.organizationId,
    canLoad: state.organizationId != null,
    organizationRequired: state.organizationRequired,
    resolving: state.organizationId == null && !state.organizationRequired,
  }),
}));

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (s: unknown) => unknown) => selector({}),
  useAppDispatch: () => () => {},
}));
jest.mock("@/lib/redux/slices/appContextSlice", () => ({
  selectOrganizationId: () => null,
}));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({
  selectUserId: () => "dddddddd-1111-2222-3333-444444444444",
}));

jest.mock("@/lib/scoped-config/effectiveKnobs", () => ({
  useEffectiveKnob: (
    _org: unknown,
    _user: unknown,
    ref: string | { feature: string; key: string },
  ) => {
    const address = typeof ref === "string" ? ref : `${ref.feature}.${ref.key}`;
    if (address === "google.calendar.agenda_days") return 7;
    if (address === "google.refresh.on_open_min_age_seconds") return 300;
    throw new Error(`the agenda asked for an unexpected knob: ${address}`);
  },
}));

jest.mock("@/features/connectors/google-adapter", () => ({
  GOOGLE_PROVIDER: { key: "google", products: [{ key: "calendar", name: "Calendar" }] },
  useGoogleConnectorState: () => ({
    accounts: [],
    rollout: [],
    resourceCountByAccount: {},
    isLoading: false,
    rolloutUnavailable: false,
    isError: false,
    errorMessage: null,
    refetch: async () => {},
  }),
}));

jest.mock("@/features/connectors/health", () => ({
  accountHealth: () => [],
  preferredAccountId: () => null,
}));

jest.mock("@/features/connectors/ConnectorPromptHost", () => ({
  ConnectorPromptHost: () => <div data-prompt-card="the one connector card" />,
}));

// The honest screen itself, stood in for the same way the connector prompt is
// stood in above — the real component's own tests (`useOrganizationRequired` /
// `OrganizationRequiredNotice`) cover its inner shape; this proves AgendaPanel
// reaches for it and nothing else.
jest.mock("@/features/organizations/components/OrganizationRequiredNotice", () => ({
  OrganizationRequiredNotice: ({ what }: { what?: string }) => (
    <div data-organization-required-notice>{`Choose an organization to see ${what}`}</div>
  ),
}));

jest.mock("@/lib/detail/useOpenDetail", () => ({
  useOpenDetail: () => async () => "window",
}));
jest.mock("@/components/official/entity-ref/EntityRef", () => ({
  EntityRef: ({ name }: { name?: string | null }) => <span data-entity-ref>{name}</span>,
}));
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

import { AgendaPanel } from "../AgendaPanel";

async function mount(node: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
  return {
    container,
    get text() {
      return container.textContent ?? "";
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

beforeEach(() => {
  state.readCalls = 0;
  state.refreshCalls = 0;
  state.organizationId = null;
});

describe("with no organization selected", () => {
  it("shows the ONE honest notice instead of the empty-calendar sentence", async () => {
    state.organizationRequired = true;
    const m = await mount(<AgendaPanel />);
    try {
      expect(m.container.querySelector("[data-organization-required-notice]")).not.toBeNull();
      expect(m.text).not.toContain("there is nothing on it");
      expect(m.text).not.toContain("Your Google Calendar is connected");
    } finally {
      m.unmount();
    }
  });

  it("calls no network door — no read, no refresh — while boot is unresolved", async () => {
    state.organizationRequired = true;
    const m = await mount(<AgendaPanel />);
    try {
      expect(state.readCalls).toBe(0);
      expect(state.refreshCalls).toBe(0);
    } finally {
      m.unmount();
    }
  });
});

describe("once an organization is selected", () => {
  it("goes back to reading the agenda normally", async () => {
    state.organizationRequired = false;
    state.organizationId = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";
    const m = await mount(<AgendaPanel refreshOnOpen={false} />);
    try {
      expect(m.container.querySelector("[data-organization-required-notice]")).toBeNull();
      expect(state.readCalls).toBeGreaterThan(0);
    } finally {
      m.unmount();
    }
  });
});
