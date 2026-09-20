// features/unified-data/test-bench/__tests__/no-stale-notes.test.tsx
//
// A NOTE ON THE TRY-EVERYTHING PAGE IS A READING OF THE LIVE SYSTEM, OR IT IS
// NOT WRITTEN.
//
// On 2026-09-20 an independent verifier walked this page on a deployment whose
// own status line read `records 0.17.0 · screens 0.30.0` and found three
// warnings that were simply false: the form builder "cannot finish making that
// table… you will see a red box" (there was no red box at all), the same
// sentence for the dashboard canvas (same result), and "there is no portal
// address to give anybody" on a build that serves `/portal/c/<slug>` with all
// seven portal doors open. His verdict is the reason this file exists:
//
//     "A person who believes the page will not press the buttons that work."
//
// The two clauses below are the class, not the three sentences. (a) none of the
// three survives anywhere in the rendered page — they were deleted, not
// softened. (b) a section whose door ANSWERS renders the door's own live answer
// and wears "Working", rather than a warning somebody typed; the same section
// against a refusing door says so instead. The store's answers come from a
// client stub here, so the switch between those two renderings is the fix's own
// mechanism and nothing else.

// This repo has no @testing-library; its suites mount with React's own root
// and `act`, which is what `features/print/order/__tests__/order-gate.test.tsx`
// and every other component suite here do.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";

import TryEverythingScreen from "../TryEverythingScreen";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The status strip asks the deployed AI server how it is. jsdom has no fetch;
// this one refuses, which is a state the strip already has a sentence for and
// which nothing below asserts on.
globalThis.fetch = (async () => {
    throw new Error("no network in this suite");
}) as unknown as typeof fetch;

// ── the three sentences, verbatim as they stood ───────────────────────────
const DELETED = [
    "cannot finish making that table",
    "red box saying the value was not accepted",
    "there is no portal address to give anybody",
    "Nothing an outsider can reach",
    "the same screens fix as the form builder",
    "bind `savedViews`",
    "from 0.30.0 onwards",
];

const TABLE = { id: "t-1", name: "Intake", slug: "intake" };

/** What the stubbed record store answers. A suite decides it per test. */
let doorsAnswer = true;

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));

jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => "Test Org" }));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({ selectUserId: () => "u-1" }));
jest.mock("@/features/scopes/redux/selectors/active-context", () => ({
    selectActiveOrganizationName: () => "Test Org",
}));
jest.mock("@/features/organizations/useOrganizationRequired", () => ({
    useOrganizationRequired: () => ({ organizationId: "org-1", organizationState: "ready" }),
}));
jest.mock("@/features/organizations/service", () => ({ getOrganizationMembers: async () => [] }));
jest.mock("@/features/organizations/components/OrganizationRequiredNotice", () => ({
    OrganizationContextNotice: () => null,
}));
jest.mock("@/features/crm/service", () => ({ searchPartiesByName: async () => [] }));
jest.mock("@/features/rich-document/RichDocument", () => ({ RichDocument: () => null }));
jest.mock("@/features/sharing/components/RecordStoreShareSurface", () => ({ recordStoreShare: undefined }));
// Opening every section sets several of the page's own reads going (the agent
// list, the knob's write door, the documents). None of them is what this suite
// is about, so the client answers "no rows" to every one rather than throwing
// and taking the render with it.
jest.mock("@/utils/supabase/client", () => {
    const query: Record<string, unknown> = {};
    for (const verb of ["select", "eq", "in", "is", "order", "limit", "neq", "not", "or", "gte", "lte"]) {
        query[verb] = () => query;
    }
    query["then"] = (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve);
    query["single"] = async () => ({ data: null, error: null });
    query["maybeSingle"] = async () => ({ data: null, error: null });
    const client = {
        schema: () => client,
        from: () => query,
        rpc: async () => ({ data: null, error: null }),
    };
    return { createClient: () => client };
});
jest.mock("@/lib/scoped-config/service", () => ({
    fetchKnobWriteDoor: async () => null,
    writeKnobOverrideThroughDoor: async () => undefined,
}));
jest.mock("@/lib/scoped-config/effectiveKnobs", () => ({ useEffectiveKnob: () => "organization" }));
jest.mock("@/lib/knobs/unifiedDataCampaign", () => ({ UNIFIED_DATA_CAMPAIGN: { enabled: () => true } }));
jest.mock("@/lib/knobs/useUnifiedDataCampaignGate", () => ({
    useUnifiedDataCampaign: () => ({ on: true, because: "" }),
}));
jest.mock("../savedViewsPort", () => ({ organizationSavedViews: async () => [] }));

jest.mock("@ai-matrx/records/react", () => {
    /** Every door carries the same answer, so one switch decides the whole deployment. */
    const answer = () =>
        doorsAnswer ? { ok: true, data: [] } : { ok: false, error: { message: "the store said no" } };
    // ONE object for the life of the suite — the real `useRecordsClient` hands
    // back the same client for the life of the provider, and a hook that depends
    // on its identity would otherwise re-ask for ever.
    const client = {
        forms: async () => answer(),
        formDeclare: async () => ({ ok: true, data: "f-1" }),
        anonPublish: async () => ({ ok: true, data: null }),
        dashboards: async () => answer(),
        dashboardDeclare: async () => ({ ok: true, data: "d-1" }),
        dashboardRun: async () => ({ ok: true, data: { blocks: [] } }),
        portals: async () => answer(),
        portalCard: async () => ({ ok: true, data: null }),
        portalInvite: async () => ({ ok: true, data: null }),
        portalRevoke: async () => ({ ok: true, data: null }),
    };
    return {
        useTables: () => ({ data: [TABLE], loading: false, error: null }),
        useRecords: () => ({ rows: [], loading: false, error: null }),
        useRecordsClient: () => client,
    };
});

jest.mock("@ai-matrx/records-ui", () => {
    const panel = (name: string) => () => <div data-testid={name} />;
    return {
        ActionInbox: panel("action-inbox"),
        CustomFieldsSection: panel("custom-fields"),
        DashboardCanvas: panel("dashboard-canvas"),
        FieldEditor: panel("field-editor"),
        FormBuilder: panel("form-builder"),
        FormsPanel: panel("forms-panel"),
        HistoryPanel: panel("history-panel"),
        NotifyRuleEditor: panel("notify-rule-editor"),
        PortalsPanel: panel("portals-panel"),
        ShareControl: panel("share-control"),
        TablesHome: panel("tables-home"),
        RecordsMount: ({ children }: { children: ReactNode }) => <>{children}</>,
        laneFor: () => "custom",
        personActor: () => ({ kind: "person", id: "u-1" }),
        recordsDataSource: () => ({ rpc: async () => ({ data: [], error: null }) }),
        refusalLineForAPerson: (error: { message?: string }) => error?.message ?? "refused",
        rowName: () => "row",
        tableName: (table: { name: string }) => table.name,
    };
});

/** The route tree the server component read. Both addresses are served here. */
const ROUTES = {
    portal: { path: "/portal/c/<the client's own address>", there: true },
    publicForm: { path: "/f/<the form's own id>", there: true },
};

describe("the try-everything page never states a capability it did not check", () => {
    const mounts: Array<{ root: Root; host: HTMLDivElement }> = [];

    afterEach(async () => {
        for (const { root, host } of mounts.splice(0)) {
            await act(async () => root.unmount());
            host.remove();
        }
        doorsAnswer = true;
    });

    /**
     * Mount the page, OPEN EVERY SECTION, and let every live check come back.
     *
     * The opening matters: a section's body is collapsed until somebody presses
     * its heading, and all three stale warnings lived in those bodies — which
     * is exactly where the verifier found them. A clause that only read the
     * closed page would pass on a page still full of them.
     */
    async function walk(): Promise<string> {
        const host = document.createElement("div");
        document.body.append(host);
        const root = createRoot(host);
        mounts.push({ root, host });
        await act(async () => {
            root.render(<TryEverythingScreen routes={ROUTES} />);
        });
        await act(async () => {
            for (const heading of Array.from(
                host.querySelectorAll<HTMLButtonElement>('button[aria-expanded="false"]'),
            )) {
                heading.click();
            }
        });
        // The door answers are promises; one more turn lets every one land.
        await act(async () => {
            await Promise.resolve();
        });
        return host.textContent ?? "";
    }

    /** How many times a badge word is worn, counted off the rendered page. */
    function badges(host: HTMLDivElement, word: string): number {
        return Array.from(host.querySelectorAll("span")).filter((el) => el.textContent === word).length;
    }

    it("carries none of the three stale warnings — they were deleted, not softened", async () => {
        const page = await walk();
        // The deleted sentences FIRST, so this clause's red is about them.
        for (const sentence of DELETED) {
            expect(page).not.toContain(sentence);
        }
        // And what stands in their place is a reading of the live doors.
        expect(page).toContain("The form builder works on this deployment");
    });

    it("renders the door's own live answer, and wears Working, when the door answers", async () => {
        const page = await walk();
        expect(page).toContain("The form builder works on this deployment");
        expect(page).toContain("The dashboard canvas works on this deployment");
        expect(page).toContain("The portal doors answer this browser");
        // The address comes from the build's own route tree, never a sentence.
        expect(page).toContain("/portal/c/<the client's own address>");
        // The badge is EARNED by the answer, never typed beside the section.
        const host = mounts[mounts.length - 1]!.host;
        expect(badges(host, "Working")).toBeGreaterThanOrEqual(3);
        expect(badges(host, "Not built yet")).toBe(0);
    });

    it("says the door refused, in the door's own words, when it refuses", async () => {
        doorsAnswer = false;
        const page = await walk();
        expect(page).toContain("The door is here but it refused just now — the store said no");
        // Still no invented warning about a version.
        expect(page).not.toContain("cannot finish making that table");
        const host = mounts[mounts.length - 1]!.host;
        expect(badges(host, "Not built yet")).toBeGreaterThanOrEqual(3);
    });
});
