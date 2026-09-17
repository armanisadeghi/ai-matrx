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
    mine: "private",
    orgs: "internal",
    shared: "shared",
    public: "public",
};

export const LIBRARY_LIST_SCOPES: ListScopeKind[] = ["mine", "orgs", "shared", "public"];

function visibilityForQuery(query: EntityListQuery): LibraryVisibility[] {
    const lane = SCOPE_TO_VISIBILITY[query.scope.kind];
    return lane ? [lane] : [];
}

/**
 * A refusal the shell can classify. `retryable` decides whether the banner
 * offers Retry at all — a 404 from a server that has not shipped this surface
 * yet is not something a person can retry into existence.
 */
function rethrowForList(error: unknown): never {
    if (error instanceof MediaApiError) {
        throw Object.assign(new Error(error.message), {
            refused: !error.retryable,
            retryable: error.retryable,
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
