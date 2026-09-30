// lib/list-scope/types.ts
//
// THE VIEW LAW (CLAUDE.md + common-docs/systems/platform/db-rules/FEATURE.md §6):
// RLS is the ceiling, never the view definition. Every list query MUST
// declare its own scope explicitly — a bare `.select("*")` relying on RLS
// alone to "just filter to mine" is a defect the moment a user belongs to
// more than one org (every user does: personal org + N companies).
//
// THE VOCABULARY IS FIXED AND LIVES HERE. A surface declares WHICH of these
// it supports and supplies the predicate. It may not invent one of its own —
// a scope the user learns on one page has to mean the same thing on every
// other page. See lib/list-scope/FEATURE.md.
//
//   all      → everything that is mine to see: Mine ∪ My team ∪ My Orgs ∪ Shared
//              (THE DEFAULT LANE; Public and System are discovery lanes, never folded in)
//   mine     → what did I make?
//   team     → what did my team make?       (people I share a team with)
//   orgs     → what does my organization have?
//   shared   → what did someone hand me?    (explicit iam.permissions grant)
//   industry → what does my field publish?  (see below)
//   public   → what has a tenant published platform-wide?
//   system   → what does the PLATFORM ITSELF ship?  (see below)
//
// SYSTEM (added 2026-08-26) is the platform's own corpus — builtin agents,
// global shortcuts, platform content blocks: records AI Matrx publishes, not
// records a tenant published. Which rows a viewer gets is the RPC's decision:
// on /agents/all every signed-in person reads the PUBLISHED built-ins and a
// platform admin reads the whole corpus (2026-09-27, agx_list_scoped).
//
// It is a SCOPE and not a separate admin page because that separation is what
// produced the drift it repairs: /administration/agents/system-agents/agents
// was a second, poorer list UI over the same table, and every feature added to
// /agents/all (facets, server sort, the one action menu, doors, Orchestras)
// silently skipped the system corpus. One list, one more question it answers.
//
// INDUSTRY is opt-in on BOTH ends, and is "orgs" with one more hop rather than
// a new kind of thing: curators publish into an industry
// (iam.industry_curators), and an org must ATTACH that industry
// (iam.org_industries) before its members can read the corpus. Records attach
// to an industry by GRANT ROW, following rag.data_store_grants.industry_id.
//
// A page renders one tab per scope the surface supports; switching scopes
// changes the declared query, never silently reinterprets RLS output.
//
// TWO AXES, NEVER MIXED (Arman 2026-09-30, common-docs
// /policies/active-org-is-never-a-list-filter.md). The LANE (this union) says HOW
// I can see a record. WHICH ORGANIZATION it is in is a separate axis — the
// page's organization filter, `EntityListQuery.orgId` (URL `?org_filter=`, null = All
// organizations) — and it narrows EVERY lane. A lane carries no organization id.
// The ACTIVE organization is neither: it never reaches a list read.

// THE ADMIN SEAT (Arman, 2026-09-26): "No one acts as themselves in admin."
// An admin page never shows mine / orgs / shared — those are PERSONAL-SEAT
// questions ("what did I make?", "what does MY team have?").
//
// AN ADMIN MANAGEMENT PAGE HAS NO SCOPE LANES AT ALL: it manages the
// platform's own records (the `system` scope, alone, with no tabs). Looking
// into a tenant's records is tech support, and lives only on a separate
// support route (…/support), which declares ADMIN_SUPPORT_LIST_SCOPES:
//
//   platform_orgs   → every organization's records   (narrowable to one org)
//   platform_users  → every person's own records     (narrowable to one person,
//                                                      by their personal org id)
//   platform_all    → the whole platform corpus
//
// Guarded by `pnpm check:admin-no-personal-seat`.

export type ListScopeKind =
  | "all"
  | "mine"
  | "team"
  | "orgs"
  | "shared"
  | "industry"
  | "public"
  | "system"
  | "platform_orgs"
  | "platform_users"
  | "platform_all";

export type ListScope =
  /** ALL: Mine ∪ My team ∪ My Orgs ∪ Shared, one row per record. The default lane. */
  | { kind: "all" }
  | { kind: "mine" }
  /**
   * MY TEAM (access ladder: "my team or department"). Rows in an organization I
   * belong to, made by someone who shares a live team with me THERE — me
   * included where I am on a team. A person on no team sees NOTHING here (and
   * the list says so) — never a copy of Mine (2026-09-28). A team is a
   * list filter, never an access boundary: every row here is one "orgs" would
   * also show. Server reach: `iam.my_team_reach(p_org_id)` (teams FEATURE.md).
   * Narrowing to one organization is the organization filter's job (`orgId`).
   */
  | { kind: "team" }
  /** Every organization I belong to; one organization = the organization filter. */
  | { kind: "orgs" }
  | { kind: "shared" }
  /** `industryId: null` = blended across every industry my orgs have attached. */
  | { kind: "industry"; industryId: string | null }
  | { kind: "public" }
  /** Platform-published records; the RPC decides what each viewer reads. */
  | { kind: "system" }
  /** ADMIN: every organization's records. `organizationId` narrows to one. */
  | { kind: "platform_orgs"; organizationId: string | null }
  /** ADMIN: every person's own records. `organizationId` = one person's personal org. */
  | { kind: "platform_users"; organizationId: string | null }
  /** ADMIN: the whole platform corpus. */
  | { kind: "platform_all" };

/**
 * The scopes an admin SUPPORT route declares (…/support, e.g. Mandate support
 * lookup) — never on a management page, never a personal-seat scope.
 */
export const ADMIN_SUPPORT_LIST_SCOPES: ListScopeKind[] = [
  "platform_orgs",
  "platform_users",
  "platform_all",
];

/** The personal-seat scopes: legal on user pages, banned on admin pages. */
export const PERSONAL_SEAT_SCOPES: readonly ListScopeKind[] = ["all", "mine", "team", "orgs", "shared"];

/** The lanes the All lane unions. */
export const ALL_LANE_MEMBERS: readonly ListScopeKind[] = ["mine", "team", "orgs", "shared"];

/** Every user list opens on All unless its page or knob says otherwise. */
export const DEFAULT_LIST_SCOPE: ListScope = { kind: "all" };

/**
 * The vocabulary as a runtime value — for validating a scope string that
 * arrives from outside TypeScript (a counts RPC row, a URL parameter).
 *
 * Every such check reads THIS. A hand-listed subset at a call site is how the
 * `system` scope came back from the server with a real total and was silently
 * dropped on the way to its tab.
 */
export const LIST_SCOPE_KINDS: readonly ListScopeKind[] = [
  "all",
  "mine",
  "team",
  "orgs",
  "shared",
  "industry",
  "public",
  "system",
  "platform_orgs",
  "platform_users",
  "platform_all",
];

// ── Narrowing helpers ───────────────────────────────────────────────────────

export function isMineScope(
  scope: ListScope,
): scope is Extract<ListScope, { kind: "mine" }> {
  return scope.kind === "mine";
}

export function isTeamScope(
  scope: ListScope,
): scope is Extract<ListScope, { kind: "team" }> {
  return scope.kind === "team";
}

/**
 * THE ONE PLACE "My team" joins a list (T-29, 2026-09-27). Every surface that
 * offers "My Orgs" offers "My team" beside it — never declared per page. Its
 * `*_list_scoped` RPC answers `p_scope = 'team'` through `iam.my_team_reach`,
 * and its counts RPC returns a `team` row; a surface whose RPC cannot is a
 * defect in that RPC, not a reason to hide the tab here.
 *
 * Inserted directly after "mine" (the ladder reads narrow → wide: only me, my
 * team, my organization). Idempotent; a list without "orgs" is untouched —
 * an admin page, or a Private type, has no team question to answer.
 */
export function withTeamScope(scopes: readonly ListScopeKind[]): ListScopeKind[] {
  if (!scopes.includes("orgs") || scopes.includes("team")) return [...scopes];
  const out = [...scopes];
  const at = out.indexOf("mine");
  out.splice(at >= 0 ? at + 1 : out.indexOf("orgs"), 0, "team");
  return out;
}

/**
 * THE ONE PLACE "All" joins a list (2026-09-30). A tab bar offering two or more
 * of the personal lanes (Mine / My team / My Orgs / Shared) gets All as its
 * FIRST tab — never declared per page. A list with one personal lane (a Private
 * type: Mine alone) or none (an admin page) is untouched: All would repeat it.
 * Idempotent; its `*_list_scoped` RPC answers `p_scope = 'all'`.
 */
export function withAllScope(scopes: readonly ListScopeKind[]): ListScopeKind[] {
  if (scopes.includes("all")) return [...scopes];
  const personal = scopes.filter((k) => ALL_LANE_MEMBERS.includes(k)).length;
  return personal >= 2 ? ["all", ...scopes] : [...scopes];
}

/** The lanes a tab bar renders: the surface's own, plus All and My team where they belong. */
export function withStandardLanes(scopes: readonly ListScopeKind[]): ListScopeKind[] {
  return withAllScope(withTeamScope(scopes));
}

export function isAllScope(
  scope: ListScope,
): scope is Extract<ListScope, { kind: "all" }> {
  return scope.kind === "all";
}

export function isOrgsScope(
  scope: ListScope,
): scope is Extract<ListScope, { kind: "orgs" }> {
  return scope.kind === "orgs";
}

export function isSharedScope(
  scope: ListScope,
): scope is Extract<ListScope, { kind: "shared" }> {
  return scope.kind === "shared";
}

export function isIndustryScope(
  scope: ListScope,
): scope is Extract<ListScope, { kind: "industry" }> {
  return scope.kind === "industry";
}

export function isSystemScope(
  scope: ListScope,
): scope is Extract<ListScope, { kind: "system" }> {
  return scope.kind === "system";
}

export function isPublicScope(
  scope: ListScope,
): scope is Extract<ListScope, { kind: "public" }> {
  return scope.kind === "public";
}

/** The industry this scope narrows to, or null. */
export function scopeIndustryId(scope: ListScope): string | null {
  return scope.kind === "industry" ? scope.industryId : null;
}

/**
 * The id a LANE itself is narrowed to — an industry, or an admin support lane's
 * one organization / person. Personal lanes never carry one: which organization
 * a list shows is the organization filter (`EntityListQuery.orgId`).
 */
export function scopeNarrowId(scope: ListScope): string | null {
  if (scope.kind === "platform_orgs" || scope.kind === "platform_users")
    return scope.organizationId;
  if (scope.kind === "industry") return scope.industryId;
  return null;
}

/**
 * THE `p_org_id` EVERY `*_list_scoped` / `*_scope_counts` / facets RPC receives:
 * the page's organization filter (null = All organizations → undefined), or —
 * on an admin support lane — that lane's own one-organization narrowing. Never
 * the active organization.
 */
export function listOrgParam(query: {
  scope: ListScope;
  orgId: string | null;
}): string | undefined {
  if (query.orgId) return query.orgId;
  if (query.scope.kind === "platform_orgs" || query.scope.kind === "platform_users")
    return query.scope.organizationId ?? undefined;
  return undefined;
}

/** Stable identity for tab selection / React keys. */
export function scopeKey(scope: ListScope): string {
  if (scope.kind === "industry")
    return scope.industryId ? `industry:${scope.industryId}` : "industry";
  if (scope.kind === "platform_orgs" || scope.kind === "platform_users")
    return scope.organizationId ? `${scope.kind}:${scope.organizationId}` : scope.kind;
  return scope.kind;
}

/** Build a scope from a kind + optional narrowing id (tab click handlers). */
export function makeScope(
  kind: ListScopeKind,
  narrowToId: string | null = null,
): ListScope {
  switch (kind) {
    case "all":
      return { kind: "all" };
    case "orgs":
      return { kind: "orgs" };
    case "team":
      return { kind: "team" };
    case "industry":
      return { kind: "industry", industryId: narrowToId };
    case "mine":
      return { kind: "mine" };
    case "shared":
      return { kind: "shared" };
    case "public":
      return { kind: "public" };
    case "system":
      return { kind: "system" };
    case "platform_orgs":
      return { kind: "platform_orgs", organizationId: narrowToId };
    case "platform_users":
      return { kind: "platform_users", organizationId: narrowToId };
    case "platform_all":
      return { kind: "platform_all" };
    default: {
      const _exhaustive: never = kind;
      throw new Error(
        `[list-scope] unknown scope kind: ${String(_exhaustive)}`,
      );
    }
  }
}
