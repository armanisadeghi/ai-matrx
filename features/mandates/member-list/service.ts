// features/mandates/member-list/service.ts
//
// The entity-list service triple for the NON-ADMIN mandate lists, served
// entirely by the database (`public.mnd_member_list`). Unlike the admin list
// there is no aidream report to fold in: every cell is on the database answer.
//
//   level person        scopes mine · orgs · system; the page's organization
//                       filter (`query.orgId`, null = All organizations) narrows
//                       the rows AND names the organization whose ladder answers
//                       "what runs for me". NEVER the active organization: it
//                       only decides where new things are saved (active-org law).
//   level organization  scopes orgs (this org's own) · system; resolution =
//                       what runs for every member of `organizationId`

import type { Json } from "@/types/database.types";
import type { EntityListService } from "@/lib/entity-list/config";
import type {
  EntityListQuery,
  EntityScopeCounts,
  ScopeNarrowOption,
} from "@/lib/entity-list/types";
import {
  callMandateMemberList,
  memberRowFromWire,
  type MandateMemberCountsAnswer,
  type MandateMemberFacetsAnswer,
  type MandateMemberListArgs,
  type MandateMemberPageAnswer,
} from "./rpc";
import type { MandateListLevel, MandateMemberRow } from "./types";

export interface MandateMemberServiceOptions {
  level: MandateListLevel;
  /** Organization level: the route's organization. */
  organizationId?: string | null;
}

/** The scope half of every call. Pure — exported for tests. */
export function memberScopeArgs(
  query: Pick<EntityListQuery, "scope" | "orgId" | "search" | "filters">,
  options: MandateMemberServiceOptions,
): Pick<
  MandateMemberListArgs,
  "p_level" | "p_scope" | "p_org_id" | "p_resolve_org_id" | "p_search" | "p_filters"
> {
  const scope = query.scope;
  const orgLevel = options.level === "organization";
  return {
    p_level: options.level,
    // The shell asks counts under a normalized scope (it may say "mine"); the
    // organization seat has its own (homed, shared with or adopted by it), the
    // viewer's "Shared with me" (given to them by name, not yet the
    // organization's — an owner or admin adopts it from here), the published
    // lane and the system's, so anything else is this organization's own.
    p_scope: orgLevel
      ? scope.kind === "system" || scope.kind === "public" || scope.kind === "shared"
        ? scope.kind
        : "orgs"
      : scope.kind,
    p_org_id: orgLevel
      ? (options.organizationId ?? undefined)
      : (query.orgId ?? undefined),
    // Resolution follows the page's organization filter, never the active org.
    // With All organizations there is no single org to resolve in, so the
    // database answers without an organization rung (a per-row home-org
    // resolution needs the door to take one — register AO-002).
    p_resolve_org_id: orgLevel ? undefined : (query.orgId ?? undefined),
    p_search: query.search.trim() || undefined,
    p_filters: query.filters as unknown as Json,
  };
}

export function memberCountsFromAnswer(
  answer: MandateMemberCountsAnswer,
  level: MandateListLevel,
): EntityScopeCounts {
  const options: ScopeNarrowOption[] = answer.orgs_narrow.map((option) => ({
    id: option.id,
    label: option.label,
    count: option.count,
  }));
  return {
    byKind: level === "organization"
      ? { orgs: answer.orgs, shared: answer.shared, public: answer.public, system: answer.system }
      : {
          mine: answer.mine,
          shared: answer.shared,
          orgs: answer.orgs,
          public: answer.public,
          system: answer.system,
        },
    narrow: options.length > 0 ? { orgs: options } : {},
    ...(options.length === 0 && level === "person"
      ? { narrowUnavailable: { orgs: "No organization mandates." } }
      : {}),
  };
}

export function createMandateMemberService(
  options: MandateMemberServiceOptions,
): EntityListService<MandateMemberRow> {
  return {
    fetchPage: async (query, sort) => {
      const answer = await callMandateMemberList<MandateMemberPageAnswer>({
        p_mode: "page",
        ...memberScopeArgs(query, options),
        p_sort: sort.sort,
        p_dir: sort.direction,
        p_limit: sort.pageSize,
        p_offset: (query.page - 1) * sort.pageSize,
      });
      return { rows: answer.rows.map(memberRowFromWire), total: answer.total };
    },
    fetchCounts: async (query) => {
      const answer = await callMandateMemberList<MandateMemberCountsAnswer>({
        p_mode: "counts",
        ...memberScopeArgs(query, options),
      });
      return memberCountsFromAnswer(answer, options.level);
    },
    fetchFacets: async (query) => {
      const answer = await callMandateMemberList<MandateMemberFacetsAnswer>({
        p_mode: "facets",
        ...memberScopeArgs(query, options),
      });
      return { byKind: answer };
    },
  };
}
