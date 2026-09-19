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
    return configureStore({ reducer: { appContext: appContextReducer } });
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

    it("APPEARS when the organization arrives after mount — the defect, exactly", async () => {
        const store = makeStore();
        mount(store, gatesToEntry());
        await settle();
        expect(recordsEntry()).toBeNull();

        // Organization bootstrap finishes, which in a real browser is always
        // AFTER the sidebar has mounted. The old hook never looked again.
        await act(async () => {
            store.dispatch(setOrganization({ id: ORG_ON, name: "Duck Co" }));
        });
        await settle();

        expect(recordsEntry()).not.toBeNull();
        expect(recordsEntry()!.textContent).toBe("Records");
        expect(rpc).toHaveBeenCalledWith("unified_data_store_on", { p_organization_id: ORG_ON });
    });

    it("is ABSENT for an organization whose store is off, and comes back on a switch", async () => {
        const store = makeStore();
        mount(store, gatesToEntry());
        await act(async () => {
            store.dispatch(setOrganization({ id: ORG_OFF, name: "Other Co" }));
        });
        await settle();
        expect(recordsEntry()).toBeNull();

        // Switching organizations re-asks. A cached "off" from the last one
        // would leave a member of an organization that IS on with no entry.
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
});
