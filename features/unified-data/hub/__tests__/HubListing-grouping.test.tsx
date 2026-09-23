// features/unified-data/hub/__tests__/HubListing-grouping.test.tsx
//
// "KEPT BY THE APP" NAMES THE SAME OPTION LIST ONCE, WITH A COUNT — NOT ONCE
// PER TABLE.
//
// Every table with a "Crew" choice field gets its own kernel table to hold
// that field's options, and every one of those kernel tables is named "Crew
// choices". Rincon Plumbing Co alone has thirteen tables with a Crew field
// and sixteen with a Status field, so the un-grouped hub listing repeated
// "Crew choices" thirteen times and "Status choices" sixteen times — the
// try-everything guide's step 2/5 finding, 2026-09-23. This suite fails
// against the un-grouped `Row`-per-item rendering and passes once
// `HubListing` collapses same-titled rows in a `groupDuplicateTitles`
// capability into one row each, carrying the count.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { HubListing, type HubListingState } from "../HubListing";
import type { HubCapability, HubItem } from "../capabilities";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/link", () => ({
    __esModule: true,
    default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
        <a href={href} {...rest}>
            {children}
        </a>
    ),
}));

function makeItem(id: string, title: string, tableId: string): HubItem {
    return {
        id,
        title,
        tableId,
        tableName: title,
        lane: null,
        facts: [],
        href: `/data-v2/${tableId}`,
        changedAt: null,
        changedBy: null,
    };
}

const CAPABILITY: HubCapability = {
    id: "kept-by-the-app",
    title: "Kept by the app",
    what: "Tables the store made for itself.",
    empty: "The store keeps nothing of its own here yet.",
    door: "custom.read_records over the Table kernel",
    changedByKind: "structure",
    groupDuplicateTitles: true,
    async read() {
        return { ok: true, items: [] };
    },
};

// Thirteen "Crew choices" kernel tables and one "Saved views" — the shape
// this capability actually returns, per the guide's counts.
const ITEMS: HubItem[] = [
    ...Array.from({ length: 13 }, (_, i) => makeItem(`crew-${i}`, "Crew choices", `t-crew-${i}`)),
    makeItem("saved-views", "Saved views", "t-saved-views"),
];

async function render(state: HubListingState): Promise<{ host: HTMLDivElement; root: Root }> {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
        root.render(
            <HubListing
                capability={CAPABILITY}
                state={state}
                laneLabel={null}
                open
                onOpenChange={() => {}}
            />,
        );
    });
    return { host, root };
}

describe("HubListing groups same-titled 'kept by the app' rows", () => {
    const mounts: Array<{ root: Root; host: HTMLDivElement }> = [];

    afterEach(async () => {
        for (const { root, host } of mounts.splice(0)) {
            await act(async () => root.unmount());
            host.remove();
        }
    });

    it("shows 'Crew choices' once, with the count of thirteen, not thirteen separate rows", async () => {
        const { host, root } = await render({ phase: "read", items: ITEMS });
        mounts.push({ root, host });

        const crewMatches = Array.from(host.querySelectorAll("span")).filter(
            (el) => el.textContent === "Crew choices",
        );
        expect(crewMatches).toHaveLength(1);
        expect(host.textContent).toContain("13 tables");

        // A group has no single door to open, so it is not rendered as a link.
        const crewLinks = Array.from(host.querySelectorAll("a")).filter(
            (el) => el.textContent === "Crew choices",
        );
        expect(crewLinks).toHaveLength(0);
    });

    it("still opens the door for a title that is not duplicated", async () => {
        const { host, root } = await render({ phase: "read", items: ITEMS });
        mounts.push({ root, host });

        const savedViewsLink = Array.from(host.querySelectorAll("a")).find(
            (el) => el.textContent === "Saved views",
        );
        expect(savedViewsLink).toBeDefined();
        expect(savedViewsLink?.getAttribute("href")).toBe("/data-v2/t-saved-views");
    });

    it("the header count reflects distinct names, not raw row count", async () => {
        const { host, root } = await render({ phase: "read", items: ITEMS });
        mounts.push({ root, host });
        // 14 items collapse to 2 distinct titles: "Crew choices" and "Saved views".
        const toggle = host.querySelector('[data-hub-listing-toggle="kept-by-the-app"]');
        expect(toggle?.textContent).toContain("2");
    });
});
