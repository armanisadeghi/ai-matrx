/**
 * ACCESS BELONGS TO THE PERSON (Arman, 2026-09-25). The agenda is the person's own
 * day across every organization they belong to. Its mirror READ never depends on
 * the selected organization — with none selected, still resolving, or a failed
 * organization read, the agenda still reads and shows the person's events, and
 * never stands behind a "choose an organization" gate. Only a Google REFRESH
 * (filed under an organization) is held: it calls no network door without one.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = {
  readCalls: 0,
  refreshCalls: 0,
  organizationRequired: false,
  /** THE FOURTH STATE (R37): the organization read itself failed. */
  organizationUnavailable: false,
  organizationId: null as string | null,
  /**
   * A CONNECTED account, which the boot-resolving case needs: with no account
   * the `noAccount` branch suppresses the empty-calendar sentence entirely, so a
   * test run with `accounts: []` cannot see the lie it is hunting.
   */
  accounts: [] as Record<string, unknown>[],
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
const organizationState = (): string => {
  if (state.organizationId != null) return "ready";
  if (state.organizationUnavailable) return "unavailable";
  if (state.organizationRequired) return "required";
  return "resolving";
};

jest.mock("@/features/organizations/useOrganizationRequired", () => ({
  useOrganizationRequired: () => ({
    organizationId: state.organizationId,
    canLoad: state.organizationId != null,
    organizationRequired: state.organizationRequired,
    // The legacy pair keeps the CHECKING posture through `unavailable` — see
    // the field's note in the hook.
    resolving: state.organizationId == null && !state.organizationRequired,
    organizationState: organizationState(),
    unavailableReason: state.organizationUnavailable
      ? "the organization read failed: Failed to fetch"
      : null,
    retry: () => {},
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
    accounts: state.accounts,
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
  accountHealth: () =>
    state.accounts.length > 0
      ? [
          {
            product: { key: "calendar", name: "Calendar" },
            state: "connected",
            label: "Connected",
            reason: "",
            remedy: null,
          },
        ]
      : [],
  preferredAccountId: () => (state.accounts[0]?.id as string | undefined) ?? null,
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
  // The state-driven notice the panel actually renders. The stand-in carries
  // the STATE it was handed, because which of the four it shows is the whole
  // point of the assertions below.
  OrganizationContextNotice: ({ state: which, what }: { state: string; what?: string }) =>
    which === "unavailable" ? (
      <div data-organization-unavailable-notice>
        We could not check your organization
      </div>
    ) : (
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
  state.organizationUnavailable = false;
  state.accounts = [];
});

describe("with no organization selected", () => {
  it("still READS the person's agenda — no organization gate stands in front of it", async () => {
    state.organizationRequired = true;
    state.accounts = [{ id: "acct-1" }];
    const m = await mount(<AgendaPanel />);
    try {
      expect(state.readCalls).toBeGreaterThan(0);
      expect(m.container.querySelector("[data-organization-required-notice]")).toBeNull();
      expect(m.container.querySelector("[data-organization-unavailable-notice]")).toBeNull();
    } finally {
      m.unmount();
    }
  });

  it("calls no Google refresh — a refresh is filed under an organization", async () => {
    state.organizationRequired = true;
    state.accounts = [{ id: "acct-1" }];
    const m = await mount(<AgendaPanel />);
    try {
      expect(state.refreshCalls).toBe(0);
    } finally {
      m.unmount();
    }
  });
});

describe("while the organization question is still being answered, or its read failed", () => {
  it("still reads the agenda (resolving)", async () => {
    state.organizationRequired = false;
    state.organizationId = null;
    state.accounts = [{ id: "acct-1" }];
    const m = await mount(<AgendaPanel />);
    try {
      expect(state.readCalls).toBeGreaterThan(0);
      expect(m.container.querySelector("[data-organization-required-notice]")).toBeNull();
      expect(state.refreshCalls).toBe(0);
    } finally {
      m.unmount();
    }
  });

  it("still reads the agenda (the organization read FAILED) and shows no notice or forever-skeleton", async () => {
    state.organizationRequired = false;
    state.organizationUnavailable = true;
    state.accounts = [{ id: "acct-1" }];
    const m = await mount(<AgendaPanel />);
    try {
      expect(state.readCalls).toBeGreaterThan(0);
      expect(m.container.querySelector("[data-organization-unavailable-notice]")).toBeNull();
      expect(m.container.querySelector('[aria-label="Reading your agenda"]')).toBeNull();
      expect(state.refreshCalls).toBe(0);
    } finally {
      m.unmount();
    }
  });
});

describe("once an organization is selected", () => {
  it("goes on reading the agenda normally", async () => {
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
