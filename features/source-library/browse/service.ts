"use client";

/**
 * The Libraries list, as an entity-list service triple.
 *
 * The four visibility lanes of the contract (§3) ARE the four list scopes this
 * platform already speaks — mine · my orgs · community · world — so the scope
 * tab is translated into the endpoint's `visibility` filter rather than being a
 * second vocabulary. `lane_counts` supplies the true per-tab totals, so a tab
 * never shows a number derived from the page it happens to be holding.
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
            try {
                const response = await listLibraries(dispatch, { limit: 1, offset: 0 });
                const lanes = response.lane_counts;
                if (!lanes) {
                    return {
                        byKind: {},
                        narrow: {},
                        narrowUnavailable: {
                            orgs: "This server did not report a per-lane count, so the tab totals are unknown rather than zero.",
                        },
                    };
                }
                return {
                    byKind: {
                        mine: lanes.mine,
                        orgs: lanes.org,
                        shared: lanes.community,
                        public: lanes.world,
                    },
                    narrow: {},
                };
            } catch {
                // A counts failure is not a rows failure: the shell renders the
                // list and says the tab totals are unknown, never zero.
                return {
                    byKind: {},
                    narrow: {},
                    narrowUnavailable: {
                        orgs: "The per-lane totals could not be read from the server just now.",
                    },
                };
            }
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
