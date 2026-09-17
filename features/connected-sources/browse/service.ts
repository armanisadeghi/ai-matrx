"use client";

/**
 * The connected-account Source list, as an entity-list service triple.
 *
 * TWO THINGS THIS SURFACE REFUSES TO FAKE.
 *
 * 1. **The total.** These rows are not in our database; the server walks the
 *    provider page by page, and until that walk runs out there is no such
 *    number as "how many are in this mailbox". The server says so — `total` is
 *    null while `has_more` is true — and this service passes that through as
 *    "at least this many" rather than handing the shell a page count dressed
 *    up as a corpus size.
 * 2. **Scopes and facets.** A connected account has no visibility lanes and the
 *    server publishes no facet counts over someone else's drive. Declaring
 *    none is the honest answer; a chip with a count derived from the page in
 *    hand would be a number about nothing.
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
import { ConnectedSourcesError, browseConnectedSources } from "../api";
import type { ConnectedSourceRow } from "../types";

/** A connected account is one place, not four lanes. One scope, named plainly. */
export const CONNECTED_SOURCE_SCOPES: ListScopeKind[] = ["mine"];

export interface ConnectedBrowseTarget {
  adapter: string;
  connectionId: string;
  /** A drive id, a mail folder, a chat id, or an ISO date range. */
  containerId?: string | null;
}

/** The last page's honest sentence, so the screen can show it above the rows. */
export interface ConnectedBrowseReport {
  summary: string;
  scanned: number;
  matched: number;
  elapsedSeconds: number;
  sourcesPerSecond: number;
  hasMore: boolean;
  totalKnown: boolean;
}

function rethrowForList(error: unknown): never {
  if (error instanceof ConnectedSourcesError) {
    throw Object.assign(new Error(error.message), {
      // Only a real refusal is a refusal. A 404 here means this server build
      // does not carry the endpoint yet, and telling someone to "ask an
      // administrator for access" would be a confident wrong answer.
      refused: error.status === 401 || error.status === 403,
      retryable: error.retryable,
      code: error.code,
    });
  }
  throw error;
}

export function createConnectedSourceListService(
  dispatch: AppDispatch,
  target: ConnectedBrowseTarget,
  onReport?: (report: ConnectedBrowseReport) => void,
  pageSizeFallback = 50,
): EntityListService<ConnectedSourceRow> {
  return {
    async fetchPage(
      query: EntityListQuery,
      sort,
    ): Promise<EntityListPage<ConnectedSourceRow>> {
      try {
        const limit = sort.pageSize || pageSizeFallback;
        const offset = (query.page - 1) * limit;
        const response = await browseConnectedSources(dispatch, {
          adapter: target.adapter,
          connection_id: target.connectionId,
          container_id: target.containerId ?? null,
          filter: query.search ? { query: query.search } : {},
          limit,
          offset,
        });
        onReport?.({
          summary: response.summary,
          scanned: response.scanned,
          matched: response.matched,
          elapsedSeconds: response.elapsed_seconds,
          sourcesPerSecond: response.sources_per_second,
          hasMore: response.has_more,
          totalKnown: response.total !== null,
        });
        return {
          rows: response.sources,
          // When the walk did not finish, the only true statement is "at least
          // this many", which is what offset + what we hold + one more page
          // means to the pager. The notice above the list says so in words.
          total:
            response.total ??
            offset + response.sources.length + (response.has_more ? 1 : 0),
        };
      } catch (error) {
        return rethrowForList(error);
      }
    },

    async fetchCounts(): Promise<EntityScopeCounts> {
      return {
        byKind: {},
        narrow: {},
        narrowUnavailable: {
          mine: "A connected account is walked live, so a tab total would mean counting the whole account before showing anything.",
        },
      };
    },

    async fetchFacets(): Promise<EntityFacets> {
      return { byKind: {} };
    },
  };
}
