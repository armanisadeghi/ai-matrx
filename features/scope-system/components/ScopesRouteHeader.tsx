"use client";

import { useEffect, useMemo } from "react";
import { useParams, usePathname } from "next/navigation";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import { selectOrgBySlugOrId } from "@/features/agent-context/redux/organizationsSlice";
import {
  fetchScopeTypes,
  selectScopeTypeBySlugOrId,
  selectScopeTypesByOrg,
} from "@/features/agent-context/redux/scope/scopeTypesSlice";
import {
  fetchScopes,
  selectScopeBySlugOrId,
  selectScopesByType,
} from "@/features/agent-context/redux/scope/scopesSlice";
import {
  listScopeTypeItems,
  selectItemBySlugOrId,
  selectItemsByType,
} from "@/features/scope-system/redux/contextItemsSlice";
import {
  ScopeBreadcrumb,
  type ScopeBreadcrumbTrailNode,
} from "@/features/scope-system/components/ScopeBreadcrumb";
import { useBreadcrumbOrgOptions } from "@/features/scope-system/hooks/useBreadcrumbOrgOptions";
import {
  scopeHref,
  scopeItemHref,
  scopeTypeHref,
} from "@/features/scope-system/utils/scopeRoutes";

/**
 * Layout-level header for the scope-detail route family
 * (`/organizations/[orgId]/scopes/[typeId]/[scopeId]/**`). Reads the route
 * params + pathname, resolves the org / scope type / scope / item from Redux,
 * and injects a full-path breadcrumb (with per-level sibling switchers) into the
 * shell header center slot — so it never consumes page body space.
 *
 * Self-sources its data: it triggers the same fetches the pages do, keeping the
 * header warm across in-route navigation regardless of which page is mounted.
 */
export function ScopesRouteHeader() {
  const params = useParams();
  const pathname = usePathname() ?? "";
  const dispatch = useAppDispatch();

  const orgSlugOrId = params.orgId as string;
  const typeParam = params.typeId as string | undefined;
  const scopeParam = params.scopeId as string | undefined;
  const itemParam = params.itemId as string | undefined;

  const selectOrg = useMemo(
    () => (state: RootState) => selectOrgBySlugOrId(state, orgSlugOrId),
    [orgSlugOrId],
  );
  const org = useAppSelector(selectOrg);
  const orgId = org?.id;
  const orgOptions = useBreadcrumbOrgOptions(orgSlugOrId);

  const selectScopeType = useMemo(
    () => (state: RootState) =>
      orgId && typeParam
        ? selectScopeTypeBySlugOrId(state, orgId, typeParam)
        : undefined,
    [orgId, typeParam],
  );
  const scopeType = useAppSelector(selectScopeType);
  const resolvedTypeId = scopeType?.id;

  const selectAllTypes = useMemo(
    () => (state: RootState) =>
      orgId
        ? selectScopeTypesByOrg(state, orgId)
        : selectScopeTypesByOrg(state, ""),
    [orgId],
  );
  const allTypes = useAppSelector(selectAllTypes);

  const selectScope = useMemo(
    () => (state: RootState) =>
      scopeParam && resolvedTypeId
        ? selectScopeBySlugOrId(state, resolvedTypeId, scopeParam)
        : undefined,
    [scopeParam, resolvedTypeId],
  );
  const scope = useAppSelector(selectScope);

  const selectSiblingScopes = useMemo(
    () => (state: RootState) =>
      resolvedTypeId
        ? selectScopesByType(state, resolvedTypeId)
        : selectScopesByType(state, ""),
    [resolvedTypeId],
  );
  const siblingScopes = useAppSelector(selectSiblingScopes);

  const selectItem = useMemo(
    () => (state: RootState) =>
      itemParam && resolvedTypeId
        ? selectItemBySlugOrId(state, resolvedTypeId, itemParam)
        : undefined,
    [itemParam, resolvedTypeId],
  );
  const item = useAppSelector(selectItem);

  const selectItems = useMemo(
    () => (state: RootState) =>
      resolvedTypeId
        ? selectItemsByType(state, resolvedTypeId)
        : selectItemsByType(state, ""),
    [resolvedTypeId],
  );
  const items = useAppSelector(selectItems);

  useEffect(() => {
    if (orgId) dispatch(fetchScopeTypes(orgId));
  }, [dispatch, orgId]);

  useEffect(() => {
    if (orgId && resolvedTypeId) {
      dispatch(fetchScopes({ org_id: orgId, type_id: resolvedTypeId }));
      dispatch(listScopeTypeItems(resolvedTypeId));
    }
  }, [dispatch, orgId, resolvedTypeId]);

  if (!org) return null;

  const isEdit = pathname.endsWith("/edit");
  const isContextItems = pathname.endsWith("/context-items");

  const trail: ScopeBreadcrumbTrailNode[] = [];

  if (scopeType) {
    trail.push({
      label: scopeType.label_plural,
      href: scopeTypeHref(orgSlugOrId, scopeType),
      options: allTypes.map((t) => ({
        label: t.label_plural,
        href: scopeTypeHref(orgSlugOrId, t),
        active: t.id === scopeType.id,
      })),
      optionsLabel: "Scope types",
    });

    if (scope) {
      trail.push({
        label: scope.name,
        href: scopeHref(orgSlugOrId, scopeType, scope),
        options: siblingScopes.map((sc) => ({
          label: sc.name,
          href: scopeHref(orgSlugOrId, scopeType, sc),
          active: sc.id === scope.id,
        })),
        optionsLabel: scopeType.label_plural,
        optionsAllHref: scopeTypeHref(orgSlugOrId, scopeType),
        optionsAllLabel: `All ${scopeType.label_plural.toLowerCase()}`,
      });

      if (itemParam && item) {
        trail.push({
          label: item.display_name,
          href: scopeItemHref(orgSlugOrId, scopeType, scope, item),
          options: items.map((it) => ({
            label: it.display_name,
            href: scopeItemHref(orgSlugOrId, scopeType, scope, it),
            active: it.id === item.id,
          })),
          optionsLabel: "Context items",
          optionsAllHref: scopeHref(orgSlugOrId, scopeType, scope),
          optionsAllLabel: `Back to ${scope.name}`,
        });
      } else if (isEdit) {
        trail.push({ label: "Edit" });
      } else if (isContextItems) {
        trail.push({ label: "Context items" });
      }
    }
  }

  // Back goes to the immediate parent level for deterministic behavior.
  let backHref: string | undefined;
  if (scopeType && scope) {
    const hasLeafAfterScope = Boolean(itemParam) || isEdit || isContextItems;
    backHref = hasLeafAfterScope
      ? scopeHref(orgSlugOrId, scopeType, scope)
      : scopeTypeHref(orgSlugOrId, scopeType);
  }

  return (
    <PageHeader>
      <ScopeBreadcrumb
        orgSlugOrId={orgSlugOrId}
        orgName={org.name}
        orgIsPersonal={org.is_personal}
        backHref={backHref}
        orgOptions={orgOptions}
        showScopesCrumb
        trail={trail}
        singleLine
        className="w-full"
      />
    </PageHeader>
  );
}
