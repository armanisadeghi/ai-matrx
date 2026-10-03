/**
 * THE RECORDS ENTRY APPEARS FOR A MEMBER OF AN ORGANIZATION WHOSE STORE IS ON,
 * AND IS ABSENT OTHERWISE.
 *
 * WHAT THIS EXISTS FOR (independent verdict, fifth pass, 19 September): "The
 * Records sidebar entry: NOT THERE. With the store on and the code switch on,
 * in the right organization, after a full reload, the Data menu still shows
 * only Tables, Workbooks, Pick Lists and the two window entries." The entry was
 * in the nav file with a gate on it, and the gate never turned true, because
 * the sidebar read the active organization ONCE in a mount effect — before the
 * organization had resolved — and never looked again.
 *
 * So this is not a test that a boolean is passed along. It is a test that the
 * gate ANSWERS FOR THE ORGANIZATION THAT ARRIVES LATE, which is the only way it
 * ever arrives in a real browser.
 *
 * THE RED TWIN is `useShellNavGates.red.test.tsx`: the same three assertions
 * against a gate wired the way it was before — one mount-time snapshot of the
 * organization — which MUST fail. Without it, a hook that always answered
 * `true` would pass this file's first case and look like a fix.
 *
 * The repo has no @testing-library/react (see test-utils/renderHook.tsx);
 * React 19's own `act` + `createRoot` is the house harness.
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";

import appContextReducer, { setOrganization } from "@/lib/redux/slices/appContextSlice";
import scopesReducer, { scopesActions } from "@/features/scopes/redux/scopesSlice";
import type { OrgNode } from "@/features/scopes/types";
import { DATA_NAV_CHILDREN_FOR_TEST, gatesToEntry } from "./useShellNavGates.fixture";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ORG_ON = "11111111-1111-1111-1111-111111111111";
const ORG_OFF = "22222222-2222-2222-2222-222222222222";

/** The store's own door, stood in: one organization is on it, one is not. */
const rpc = jest.fn(async (_door: string, args: { p_organization_id: string }) => ({
    data: { on: args.p_organization_id === ORG_ON, organization_id: args.p_organization_id, why: "…" },
    error: null,
}));
jest.mock("@/utils/supabase/client", () => ({
    createClient: () => ({ schema: () => ({ rpc }) }),
}));

function makeStore() {
    return configureStore({
        reducer: { appContext: appContextReducer, scopesTree: scopesReducer },
        middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
    });
}

/** The person's memberships arriving (the scope tree finishing its fetch). */
function memberOf(store: ReturnType<typeof makeStore>, ...ids: string[]) {
    store.dispatch(
        scopesActions.treeFetchFulfilled({
            organizations: ids.map((id) => ({ id, name: id, abbreviation: "", slug: id }) as unknown as OrgNode),
            fetched_at: new Date().toISOString(),
        }),
    );
}

let host: HTMLDivElement;
let root: Root;

function mount(store: ReturnType<typeof makeStore>, node: React.ReactNode) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
        root.render(<Provider store={store}>{node}</Provider>);
    });
}

/** Let the door's promise and the re-render it causes settle. */
async function settle() {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });
}

const recordsEntry = () => host.querySelector('[data-testid="records-entry"]');

describe("the Records entry in the sidebar", () => {
    beforeEach(() => rpc.mockClear());
    afterEach(() => {
        act(() => root.unmount());
        host.remove();
    });

    it("is ABSENT while no organization is picked — and the door is not even asked", async () => {
        mount(makeStore(), gatesToEntry());
        await settle();
        expect(recordsEntry()).toBeNull();
        expect(rpc).not.toHaveBeenCalled();
        // The rest of the Data menu is untouched: this is a filter, not a fork.
        expect(host.textContent).toContain("Tables");
        expect(host.textContent).toContain("Workbooks");
    });

    it("APPEARS when the memberships arrive after mount — the defect, exactly", async () => {
        const store = makeStore();
        mount(store, gatesToEntry());
        await settle();
        expect(recordsEntry()).toBeNull();

        // Bootstrap finishes AFTER the sidebar has mounted, always. The old hook
        // never looked again.
        await act(async () => {
            memberOf(store, ORG_ON);
        });
        await settle();

        expect(recordsEntry()).not.toBeNull();
        expect(recordsEntry()!.textContent).toBe("Records");
        expect(rpc).toHaveBeenCalledWith("unified_data_store_on", { p_organization_id: ORG_ON });
    });

    it("is ABSENT when no organization the person belongs to has the store on", async () => {
        const store = makeStore();
        mount(store, gatesToEntry());
        await act(async () => {
            memberOf(store, ORG_OFF);
        });
        await settle();
        expect(recordsEntry()).toBeNull();
    });

    it("the ACTIVE organization decides nothing: any member organization with the store on opens the door", async () => {
        const store = makeStore();
        mount(store, gatesToEntry());
        await act(async () => {
            memberOf(store, ORG_OFF, ORG_ON);
            // The header has the OFF organization selected. The person still sees Records.
            store.dispatch(setOrganization({ id: ORG_OFF, name: "Other Co" }));
        });
        await settle();
        expect(recordsEntry()).not.toBeNull();

        // Switching the active organization changes nothing about what is shown.
        await act(async () => {
            store.dispatch(setOrganization({ id: ORG_ON, name: "Duck Co" }));
        });
        await settle();
        expect(recordsEntry()).not.toBeNull();
    });

    it("the gated child is the one in the real nav tree, not a fixture of its own", async () => {
        mount(makeStore(), gatesToEntry());
        await settle();
        const records = DATA_NAV_CHILDREN_FOR_TEST.find((c) => c.label === "Records");
        expect(records).toBeDefined();
        expect(records!.href).toBe("/data-v2");
        expect(records!.gate).toBe("unified-data-campaign");
    });

    // T5.3: ONE "YES" IS THE ANSWER. A person in a dozen organizations, the first of which keeps
    // its data in the store, asks a handful of switches, not all twelve. THE BREAK: asking every
    // membership on every page load (52 calls for admin@admin.com on one table open).
    it("stops asking once one organization has the store on", async () => {
        const store = makeStore();
        mount(store, gatesToEntry());
        const others = Array.from({ length: 11 }, (_, i) => `33333333-3333-3333-3333-${String(i).padStart(12, "0")}`);
        memberOf(store, ORG_ON, ...others);
        for (let i = 0; i < 6; i += 1) await settle();
        expect(recordsEntry()).not.toBeNull();
        expect(rpc.mock.calls.length).toBeGreaterThan(0);
        expect(rpc.mock.calls.length).toBeLessThanOrEqual(4);
    });

    it("asks every organization when none has the store on, and shows no entry", async () => {
        const store = makeStore();
        mount(store, gatesToEntry());
        const offs = Array.from({ length: 9 }, (_, i) => `44444444-4444-4444-4444-${String(i).padStart(12, "0")}`);
        memberOf(store, ...offs);
        for (let i = 0; i < 8; i += 1) await settle();
        expect(recordsEntry()).toBeNull();
        expect(rpc.mock.calls.length).toBe(9);
    });
});
