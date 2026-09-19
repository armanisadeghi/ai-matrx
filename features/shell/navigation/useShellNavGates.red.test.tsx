/**
 * THE RED TWIN of `useShellNavGates.test.tsx`. It MUST FAIL, which is why
 * `jest.config.ts` keeps `*.red.test.tsx` out of the default run. Run it by name:
 *
 *   npx jest features/shell/navigation/useShellNavGates.red.test.tsx
 *
 * It renders the SAME menu, against the SAME door, asserting the SAME things —
 * and wires the gate the way the sidebar wired it until 19 September: the
 * active organization read ONCE, synchronously, in a mount effect, before
 * organization bootstrap has finished. That is the whole defect the verdict's
 * fifth pass named ("the sidebar reads the active organization once when it
 * mounts — before the organization has loaded — and never looks again"), and
 * with it in place the second and third cases below cannot pass.
 *
 * Without this file, a gate that answered `true` for everybody would pass the
 * green suite's first case and look like a fix.
 */
import * as React from "react";
import { act, useEffect, useMemo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";

import appContextReducer, { setOrganization } from "@/lib/redux/slices/appContextSlice";
import { getActiveOrgId } from "@/lib/organizations/activeOrg";
import type { ShellNavGates } from "@/features/shell/constants/nav-data";
import { UNIFIED_DATA_CAMPAIGN, useUnifiedDataCampaign } from "@/lib/knobs/unifiedDataCampaign";
import { GatedDataMenu } from "./useShellNavGates.fixture";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ORG_ON = "11111111-1111-1111-1111-111111111111";
const ORG_OFF = "22222222-2222-2222-2222-222222222222";

const rpc = jest.fn(async (_door: string, args: { p_organization_id: string }) => ({
    data: { on: args.p_organization_id === ORG_ON, organization_id: args.p_organization_id, why: "…" },
    error: null,
}));
jest.mock("@/utils/supabase/client", () => ({
    createClient: () => ({ schema: () => ({ rpc }) }),
}));

/** THE OLD HOOK, in shape: one snapshot, taken on mount, never re-asked. */
function useShellNavGatesAsItWas(): ShellNavGates {
    const [organizationId, setOrganizationId] = useState<string | null>(null);
    useEffect(() => {
        setOrganizationId(getActiveOrgId());
    }, []);
    const campaign = useUnifiedDataCampaign({
        organizationId,
        storeSwitch: (organization) => UNIFIED_DATA_CAMPAIGN.enabled(organization),
    });
    return useMemo<ShellNavGates>(() => ({ "unified-data-campaign": campaign.on === true }), [campaign.on]);
}

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

async function settle() {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });
}

const recordsEntry = () => host.querySelector('[data-testid="records-entry"]');

describe("RED TWIN — the sidebar as it was: one mount-time read of the organization", () => {
    beforeEach(() => rpc.mockClear());
    afterEach(() => {
        act(() => root.unmount());
        host.remove();
    });

    it("is ABSENT while no organization is picked", async () => {
        mount(makeStore(), <GatedDataMenu useGates={useShellNavGatesAsItWas} />);
        await settle();
        expect(recordsEntry()).toBeNull();
    });

    it("APPEARS when the organization arrives after mount — THIS IS THE ONE THAT MUST FAIL", async () => {
        const store = makeStore();
        mount(store, <GatedDataMenu useGates={useShellNavGatesAsItWas} />);
        await settle();
        await act(async () => {
            store.dispatch(setOrganization({ id: ORG_ON, name: "Duck Co" }));
        });
        await settle();
        expect(recordsEntry()).not.toBeNull();
    });

    it("comes back on a switch between organizations — MUST ALSO FAIL", async () => {
        const store = makeStore();
        mount(store, <GatedDataMenu useGates={useShellNavGatesAsItWas} />);
        await act(async () => {
            store.dispatch(setOrganization({ id: ORG_OFF, name: "Other Co" }));
        });
        await settle();
        expect(recordsEntry()).toBeNull();
        await act(async () => {
            store.dispatch(setOrganization({ id: ORG_ON, name: "Duck Co" }));
        });
        await settle();
        expect(recordsEntry()).not.toBeNull();
    });
});
