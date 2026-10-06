/**
 * THE REMOUNT LAW FOR A RECORD'S CUSTOM-FIELDS SECTION — the section's own reads (the row's
 * organization, whether the row reads, the organization's store switch) are asked ONCE per record
 * per tab and kept in the store, so a board tile that wakes from sleep, a Remove + Undo, or a second
 * view of the same record renders the kept answer and asks nothing.
 *
 * SUT: `EntityCustomFields` (its `useRecordHome` / `useRecordReadable` on `useStoreRead`) and the
 * campaign gate (`useUnifiedDataCampaign`, kept for the session) over a REAL Redux store.
 * Breaks it catches: either read moved back into component state (a wake re-asks
 * `entity_record_home` / `entity_record_read`); the switch re-asked on a wake past its freshness
 * (`unified_data_store_on` on every wake after 30 s); a failed read kept as the answer, so Retry
 * and the next view never ask again.
 *
 * Use case: a meeting with Cedar Ridge Physical Therapy on a person's board, asleep for a minute
 * while she works on another tile, then woken.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import storeReadsReducer from "@/lib/redux/slices/storeReadsSlice";

const CEDAR_RIDGE = "0a54df90-eab8-4d07-ab29-81a45fb41e04";
const MEETING = "7f75a779-b63c-4c0b-b342-ceeea2670ae4";
const SECOND_MEETING = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";

const doors = {
  home: jest.fn(async () => ({ ok: true, data: { organization_id: CEDAR_RIDGE } }) as unknown),
  readable: jest.fn(async () => ({ ok: true, data: null }) as unknown),
};

jest.mock("@ai-matrx/records-ui", () => ({
  CustomFieldsSection: () => <div data-test-section="" />,
  RecordsMount: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  personActor: () => ({ actor: "user" }),
  recordsDataSource: () => ({}),
}));
// Linked records have their own test (entity-back-links.test.tsx); this one is about the fields.
jest.mock("@/features/unified-data/components/EntityBackLinks", () => ({ EntityBackLinks: () => null }));
jest.mock("@/features/unified-data/hub/doors", () => ({
  entityRecordHome: (...args: unknown[]) => (doors.home as (...a: unknown[]) => unknown)(...args),
  entityRecordReadable: (...args: unknown[]) => (doors.readable as (...a: unknown[]) => unknown)(...args),
}));
jest.mock("@/features/organizations/organizationsIAmIn", () => ({ mayReadAsMember: async () => true }));
jest.mock("@/lib/redux/slices/appContextSlice", () => ({ selectOrganizationId: () => CEDAR_RIDGE }));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({ selectUserId: () => "user" }));
jest.mock("@/lib/redux/thunks/activeOrgBootstrap", () => ({ chooseActiveOrganization: () => ({ type: "noop" }) }));
jest.mock("@/features/scopes/hooks/useScopeTree", () => ({ useScopeTree: () => ({ organizations: [] }) }));
jest.mock("@/features/scopes/registry/entityRegistry", () => ({ tryGetEntityInfo: () => null }));
// The host module also exports the share surface (ShareModal -> scopes -> associations store), none of which
// this test is about; EntityCustomFields takes only `useAppRecordsConfig` from it.
jest.mock("@/features/data-tables/records-ui-host/recordsUiHost", () => ({
  useAppRecordsConfig: (organizationId: string | null) => ({ dataSource: {}, actor: { actor: "user" }, organizationId }),
}));
jest.mock("@/features/make/MakeMount", () => ({ NewTableDialog: () => null }));
jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));
jest.mock("@ai-matrx/chat/surfaces/runtime/custom-field-targets", () => ({
  CUSTOM_FIELDS_VALUE_NAME: "custom_fields",
  customFieldsScopeValue: () => null,
  registerCustomFieldsDoor: () => () => undefined,
}));
jest.mock("@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext", () => ({
  useSurfaceDormant: () => false,
  useSurfaceRuntime: () => null,
  useSurfaceScopeContribution: () => undefined,
}));
jest.mock("@/features/surfaces/manifests/registry", () => ({ getManifest: () => undefined }));
jest.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

import { EntityCustomFields } from "../EntityCustomFields";
import { forgetAllKeptAnswers } from "@/lib/kept-answer/keptAnswer";

const makeStore = () => configureStore({ reducer: { storeReads: storeReadsReducer } });

describe("a record's custom-fields section reads once per record per tab", () => {
  let host: HTMLDivElement;
  let root: Root;
  let store: ReturnType<typeof makeStore>;
  let now = Date.parse("2026-10-03T10:00:00Z");
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });
  beforeEach(() => {
    forgetAllKeptAnswers();
    jest.clearAllMocks();
    jest.spyOn(Date, "now").mockImplementation(() => now);
    store = makeStore();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    jest.restoreAllMocks();
  });

  async function show(ui: React.ReactNode) {
    await act(async () => {
      root.render(<Provider store={store}>{ui}</Provider>);
    });
    for (let i = 0; i < 10; i += 1) await act(async () => void (await Promise.resolve()));
  }
  const counts = () => [doors.home.mock.calls.length, doors.readable.mock.calls.length];

  it("a wake a minute later, and a second view, ask nothing", async () => {
    await show(<EntityCustomFields entityToken="meet_meeting" recordId={MEETING} />);
    expect(host.querySelector("[data-test-section]")).not.toBeNull();
    expect(counts()).toEqual([1, 1]);

    // Asleep for a minute (past the switch's old 30 s freshness), then woken: a remount.
    now += 60_000;
    act(() => root.unmount());
    root = createRoot(host);
    await show(
      <>
        <EntityCustomFields entityToken="meet_meeting" recordId={MEETING} />
        <EntityCustomFields entityToken="meet_meeting" recordId={MEETING} />
      </>,
    );
    expect(host.querySelectorAll("[data-test-section]")).toHaveLength(2);
    expect(counts()).toEqual([1, 1]);

    // A DIFFERENT record is its own question.
    await show(<EntityCustomFields entityToken="meet_meeting" recordId={SECOND_MEETING} />);
    expect(counts()).toEqual([2, 2]);
  });

  it("a failed home read is never kept: Retry asks again", async () => {
    doors.home.mockResolvedValueOnce({ ok: false, error: { message: "statement timeout", sqlstate: "57014" } });
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    await show(<EntityCustomFields entityToken="meet_meeting" recordId={MEETING} />);
    expect(host.textContent).toContain("Couldn't read this record");
    expect(error).toHaveBeenCalled();
    const retry = [...host.querySelectorAll("button")].find((b) => b.textContent === "Retry")!;
    await act(async () => retry.click());
    for (let i = 0; i < 10; i += 1) await act(async () => void (await Promise.resolve()));
    expect(doors.home).toHaveBeenCalledTimes(2);
    expect(host.querySelector("[data-test-section]")).not.toBeNull();
  });
});
