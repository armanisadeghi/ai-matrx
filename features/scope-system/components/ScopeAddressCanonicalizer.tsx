"use client";

/**
 * ONE canonical address per scope screen.
 *
 * Every dynamic segment under `/organizations/[orgId]/**` — the org, the scope
 * type, the scope, the context item — resolves from a UUID **or** a slug, so the
 * same screen has historically answered at two addresses. This component makes
 * the slug address the only one that survives: it watches the resolved rows in
 * Redux and, the moment a UUID segment's row is known to have a slug, rewrites
 * that segment in place with `router.replace` — Back still goes where the user
 * came from, the deep path below the rewritten segment is untouched, and the
 * query string rides along (a `?tab=` or `?item=` handoff must survive).
 *
 * Back-port of the marketing key system's `<CanonicalBrandSegment>` /
 * `<CanonicalSiteSegment>`; the ordered multi-segment rewrite lives in
 * `canonicalizeScopePath` (features/scopes/lib/scopeRoutes.ts).
 *
 * Mounted ONCE, beside `<ScopesRouteHeader>` in the `[orgId]` layout, because
 * that is the only level that sees every route in the tree at once. It reads
 * Redux and dispatches NOTHING — the header and the pages below already fetch
 * org / types / scopes / items, and an address rewrite must never be the reason
 * a read happens. Until a row is in the store this renders nothing and changes
 * nothing, so RLS and not-found semantics are exactly as they were.
 */

import { useEffect, useMemo } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";

import { useAppSelector } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import { selectOrgBySlugOrId } from "@/features/agent-context/redux/organizationsSlice";
import { selectScopeTypeBySlugOrId } from "@/features/agent-context/redux/scope/scopeTypesSlice";
import { selectScopeBySlugOrId } from "@/features/agent-context/redux/scope/scopesSlice";
import { selectItemBySlugOrId } from "@/features/scope-system/redux/contextItemsSlice";
import {
  canonicalizeScopePath,
  scopeSeg,
  type ScopeSegmentSubstitution,
} from "@/features/scopes/lib/scopeRoutes";

export function ScopeAddressCanonicalizer() {
  const params = useParams();
  const pathname = usePathname() ?? "";
  const router = useRouter();

  const orgSlugOrId = (params.orgId as string | undefined) ?? "";
  const typeParam = params.typeId as string | undefined;
  const scopeParam = params.scopeId as string | undefined;
  const itemParam = params.itemId as string | undefined;

  const selectOrg = useMemo(
    () => (state: RootState) => selectOrgBySlugOrId(state, orgSlugOrId),
    [orgSlugOrId],
  );
  const org = useAppSelector(selectOrg);
  const orgId = org?.id;

  const selectType = useMemo(
    () => (state: RootState) =>
      orgId && typeParam
        ? selectScopeTypeBySlugOrId(state, orgId, typeParam)
        : undefined,
    [orgId, typeParam],
  );
  const scopeType = useAppSelector(selectType);
  const resolvedTypeId = scopeType?.id;

  const selectScope = useMemo(
    () => (state: RootState) =>
      scopeParam && resolvedTypeId
        ? selectScopeBySlugOrId(state, resolvedTypeId, scopeParam)
        : undefined,
    [scopeParam, resolvedTypeId],
  );
  const scope = useAppSelector(selectScope);

  const selectItem = useMemo(
    () => (state: RootState) =>
      itemParam && resolvedTypeId
        ? selectItemBySlugOrId(state, resolvedTypeId, itemParam)
        : undefined,
    [itemParam, resolvedTypeId],
  );
  const item = useAppSelector(selectItem);

  // Substitutions in ROUTE ORDER — the cursor walk in `canonicalizeScopePath`
  // depends on it, and it is what keeps a slug that repeats at two levels from
  // capturing the wrong segment.
  const target = useMemo(() => {
    const subs: ScopeSegmentSubstitution[] = [];
    if (org) subs.push({ param: orgSlugOrId, expected: scopeSeg(org) });
    if (typeParam && scopeType)
      subs.push({ param: typeParam, expected: scopeSeg(scopeType) });
    if (scopeParam && scope)
      subs.push({ param: scopeParam, expected: scopeSeg(scope) });
    if (itemParam && item)
      subs.push({ param: itemParam, expected: scopeSeg(item) });
    return canonicalizeScopePath(pathname, subs);
  }, [
    pathname,
    org,
    orgSlugOrId,
    scopeType,
    typeParam,
    scope,
    scopeParam,
    item,
    itemParam,
  ]);

  useEffect(() => {
    if (!target) return;
    // Read the query from the document rather than `useSearchParams()`: this
    // component mounts in a layout, and the hook would opt the whole subtree
    // into a Suspense requirement for a value only an effect ever reads.
    router.replace(`${target}${window.location.search}`, { scroll: false });
  }, [router, target]);

  return null;
}
