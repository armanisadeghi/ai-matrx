/**
 * D10 (jobs-bar cold-walk-12, 2026-09-19): "Mine 0 / My Orgs 0 / Shared 0 /
 * Public 0" above "1-11 of 11" rows.
 *
 * ROOT CAUSE. `browse/service.ts`'s `fetchCounts()` used to trust
 * `response.lane_counts` from a `listLibraries(dispatch, { limit: 1, offset: 0 })`
 * call that carried NO `visibility` filter at all — an empty array is falsy,
 * so `listLibraries` never even sent the parameter (`api.ts`:
 * `if (query.visibility?.length) params.visibility = …`). `lane_counts` is one
 * of this contract's three OPEN "Frontend requests" (`FEATURE.md` § "The
 * contract is the truth") — no server build has ever sent it — so every real
 * load fell into the "no lanes" branch and returned an EMPTY `byKind`.
 * `lib/entity-list/types.ts` documents "absent kinds are unsupported", but the
 * shared tab bar (`EntityScopeTabs.tsx`) renders an absent-but-answered count
 * as a literal 0 once loading settles — which is how real rows and an all-zero
 * badge row ended up on the same screen.
 *
 * THE FIX. `fetchCounts` now derives every lane's count the SAME way the rows
 * themselves are counted: one `listLibraries({ visibility: [lane], limit: 1 })`
 * call per lane (exactly what `fetchPage` already does for whichever lane is
 * active), reading `.total`. One derivation, two callers.
 *
 * RED PROOF: revert `fetchCounts` to read `response.lane_counts` from a single
 * no-visibility call (the previous shape) and this test fails — the real
 * server response used below (and every real response today) carries no
 * `lane_counts` key at all, so `byKind` comes back `{}` for all four lanes
 * instead of the real per-lane totals asserted here.
 */

import { createLibraryListService } from "../browse/service";
import { DEFAULT_ENTITY_LIST_QUERY } from "@/lib/entity-list/types";

const listLibraries = jest.fn();

jest.mock("../api", () => ({
    __esModule: true,
    MediaApiError: class extends Error {
        status: number | undefined;
        code: string | undefined;
        remedy: string | null = null;
        retryable = false;
        hasServerSentence = true;
    },
    listLibraries: (...args: unknown[]) => listLibraries(...args),
}));

describe("D10 — the Libraries lane counters never read a different source than the list", () => {
    beforeEach(() => {
        listLibraries.mockReset();
    });

    it("derives every lane's count from the same call fetchPage trusts, on a real (no lane_counts) response", async () => {
        // The REAL wire shape today: no `lane_counts` key at all, ever, on any
        // server build — this is exactly what production sends.
        const byVisibility: Record<string, number> = {
            personal: 4,
            internal: 3,
            link: 2,
            public: 2,
        };
        listLibraries.mockImplementation(async (_dispatch: unknown, query: { visibility?: string[] }) => {
            const visibility = query.visibility?.[0];
            const total = visibility ? (byVisibility[visibility] ?? 0) : 0;
            return { libraries: [], row_problems: [], total, limit: 1, offset: 0 };
        });

        const service = createLibraryListService({} as never);
        const counts = await service.fetchCounts(DEFAULT_ENTITY_LIST_QUERY);

        // The exact bug: these four used to all be `undefined` (absent from
        // `byKind`), which the shared tab bar renders as a literal 0 once the
        // request has answered — the "Mine 0 / My Orgs 0 / Shared 0 / Public 0"
        // on screen. They must now be the REAL per-lane totals, matching what
        // the visible "1-11 of 11" row count would add up to (4+3+2+2 = 11).
        expect(counts.byKind.mine).toBe(4);
        expect(counts.byKind.orgs).toBe(3);
        expect(counts.byKind.shared).toBe(2);
        expect(counts.byKind.public).toBe(2);
        expect(Object.values(counts.byKind).reduce((a, b) => a + (b ?? 0), 0)).toBe(11);

        // Never a silent narrowing: each lane asked for exactly its own
        // visibility value, the same one `fetchPage` uses for that scope tab.
        const askedVisibilities = listLibraries.mock.calls
            .map((call) => (call[1] as { visibility?: string[] }).visibility?.[0])
            .sort();
        expect(askedVisibilities).toEqual(["internal", "link", "personal", "public"]);
    });

    it("names the lane, never guesses zero, when one lane's count genuinely fails", async () => {
        listLibraries.mockImplementation(async (_dispatch: unknown, query: { visibility?: string[] }) => {
            if (query.visibility?.[0] === "internal") {
                throw new Error("network dropped mid-request");
            }
            return { libraries: [], row_problems: [], total: 5, limit: 1, offset: 0 };
        });

        const service = createLibraryListService({} as never);
        const counts = await service.fetchCounts(DEFAULT_ENTITY_LIST_QUERY);

        expect(counts.byKind.mine).toBe(5);
        expect(counts.byKind.shared).toBe(5);
        expect(counts.byKind.public).toBe(5);
        // The one lane that failed is ABSENT (unknown), not defaulted to 0 —
        // and the reason is recorded, not swallowed.
        expect(counts.byKind.orgs).toBeUndefined();
        expect(counts.narrowUnavailable?.orgs).toMatch(/orgs total could not be read/);
    });
});
