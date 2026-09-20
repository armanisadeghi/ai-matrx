"use client";

/**
 * The Libraries list, as an entity-list service triple.
 *
 * The four visibility lanes of the contract (§3) ARE the four list scopes this
 * platform already speaks — mine · my orgs · community · world — so the scope
 * tab is translated into the endpoint's `visibility` filter rather than being a
 * second vocabulary. The contract's `lane_counts` field, meant to supply the
 * true per-tab totals in one call, is still one of the three OPEN "Frontend
 * requests" — no server build has ever sent it (D10, jobs-bar cold-walk-12,
 * 2026-09-19) — so `fetchCounts` below asks the SAME endpoint `fetchPage`
 * already trusts, once per lane, and reads its `total`.
 *
 * Sorting is deliberately declared UNSUPPORTED on this surface's columns
 * (`sortable: false`) rather than faked client-side: `GET /media/libraries`
 * publishes no `order` parameter, and sorting the 50 rows a page happens to
 * hold while claiming to sort a corpus is the lie the column policy forbids.
 * The request for an `order` parameter is filed in the contract's Frontend
 * requests section; the day it lands, this file is where it is honoured.
 */

import type { AppDispatch } from "@/lib/redux/store";
import type { EntityListService } from "@/lib/entity-list/config";
import type {
    EntityFacets,
    EntityListPage,
    EntityListQuery,
    EntityScopeCounts,
} from "@/lib/entity-list/types";
import type { ListScopeKind } from "@/lib/list-scope/types";
import { MediaApiError, listLibraries } from "../api";
import type { LibraryRow, LibraryVisibility } from "../types";

const SCOPE_TO_VISIBILITY: Record<string, LibraryVisibility> = {
    mine: "personal",
    orgs: "internal",
    shared: "link",
    public: "public",
};

export const LIBRARY_LIST_SCOPES: ListScopeKind[] = ["mine", "orgs", "shared", "public"];

function visibilityForQuery(query: EntityListQuery): LibraryVisibility[] {
    const lane = SCOPE_TO_VISIBILITY[query.scope.kind];
    return lane ? [lane] : [];
}

/**
 * A refusal the shell can classify.
 *
 * 🚨 A 404 HERE IS NOT A PERMISSION REFUSAL. The shell prints one of two empty
 * states, and the "refused" one says "choose a tab you have access to, or ask an
 * administrator" — which is a confident wrong answer when the truth is that this
 * server build does not carry the Media Source Catalog endpoints yet. Measured
 * live on 2026-09-17 against a server without them. So a 404 is classified as a
 * BREAKAGE with its own sentence and a working Retry, and only a real refusal
 * (401/403) is classified as one.
 */
function rethrowForList(error: unknown): never {
    if (error instanceof MediaApiError) {
        // 🚨 A NOT-YET NEVER REACHES A PERSON AS A SENTENCE. The transport
        // refuses every authenticated call until the active organization
        // resolves, one beat after first render, and its refusal is written for
        // a developer: "Select an organization before sending this request."
        // The shell re-asks the moment the organization lands (it is part of
        // the service key), so this is a retryable, still-starting condition
        // wearing copy that belongs to nobody on this screen. It gets copy of
        // its own, and it is always retryable.
        if (
            error.code === "organization_context_required" ||
            error.code === "organization_context_invalid"
        ) {
            throw Object.assign(
                new Error("Still opening your workspace — one moment."),
                { refused: false, retryable: true, code: error.code },
            );
        }
        const missingEndpoint = error.status === 404 && !error.hasServerSentence;
        const message = missingEndpoint
            ? "This server does not answer at the Libraries address yet, so no Library can be listed or created. It arrives with the Media Source Catalog server release; nothing you did caused this."
            : error.message;
        throw Object.assign(new Error(message), {
            refused: error.status === 401 || error.status === 403,
            retryable: missingEndpoint || error.retryable,
            code: error.code,
        });
    }
    throw error;
}

export function createLibraryListService(
    dispatch: AppDispatch,
    pageSizeFallback = 25,
): EntityListService<LibraryRow> {
    return {
        async fetchPage(query, sort): Promise<EntityListPage<LibraryRow>> {
            try {
                const limit = sort.pageSize || pageSizeFallback;
                const response = await listLibraries(dispatch, {
                    visibility: visibilityForQuery(query),
                    ...(query.search ? { q: query.search } : {}),
                    limit,
                    offset: (query.page - 1) * limit,
                });
                return { rows: response.libraries, total: response.total };
            } catch (error) {
                return rethrowForList(error);
            }
        },

        async fetchCounts(): Promise<EntityScopeCounts> {
            // D10 (jobs-bar cold-walk-12, 2026-09-19): this used to trust
            // `response.lane_counts` from a call that carried NO `visibility`
            // filter at all (`listLibraries(dispatch, { limit: 1, offset: 0 })`
            // — an empty array is falsy, so `listLibraries` never even sent the
            // parameter). `lane_counts` is one of this contract's three OPEN
            // "Frontend requests" (`FEATURE.md` § "The contract is the truth")
            // — no server build has ever sent it — so every load fell into the
            // "no lanes" branch and returned an EMPTY `byKind`. `byKind` is
            // documented as "absent kinds are unsupported"
            // (`lib/entity-list/types.ts`), but the shared tab bar renders an
            // absent-but-answered count as a literal 0 (`EntityScopeTabs.tsx`:
            // `typeof measured === "number" ? measured : countsLoading ? null : 0`)
            // — which is how "1-11 of 11" rows ended up sitting under
            // "Mine 0 / My Orgs 0 / Shared 0 / Public 0".
            //
            // The fix: count the SAME way the rows are counted. `fetchPage`
            // already proves `listLibraries({ visibility, limit }).total` is
            // real and reliable for one lane at a time — this is that identical
            // call, once per lane, run in parallel. One derivation, two callers.
            const lanes = Object.keys(SCOPE_TO_VISIBILITY) as (keyof typeof SCOPE_TO_VISIBILITY)[];
            const results = await Promise.allSettled(
                lanes.map((kind) =>
                    listLibraries(dispatch, {
                        visibility: [SCOPE_TO_VISIBILITY[kind]],
                        limit: 1,
                        offset: 0,
                    }),
                ),
            );

            const byKind: Partial<Record<string, number>> = {};
            const narrowUnavailable: Partial<Record<string, string>> = {};
            results.forEach((result, index) => {
                const kind = lanes[index];
                if (result.status === "fulfilled") {
                    byKind[kind] = result.value.total;
                } else {
                    // Left OUT of `byKind`, never defaulted to 0 — this lane's
                    // count is genuinely unknown, not genuinely empty, and the
                    // sentence names which one so a person can tell the two
                    // apart if this surface ever exposes it (`EntityScopeTabs`
                    // does not read this per-kind message today; recording it
                    // here is the honest half regardless).
                    const error = result.reason;
                    narrowUnavailable[kind] =
                        error instanceof MediaApiError
                            ? `The ${kind} total could not be read: ${error.message}`
                            : `The ${kind} total could not be read from the server just now.`;
                }
            });

            return { byKind, narrow: {}, narrowUnavailable };
        },

        async fetchFacets(): Promise<EntityFacets> {
            // The contract publishes no facet endpoint for Libraries, and a
            // facet derived from the page in hand would put wrong counts on
            // chips. Declaring none is the honest answer; the config declares
            // no facet sections either, so nothing renders empty.
            return { byKind: {} };
        },
    };
}
