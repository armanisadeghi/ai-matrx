"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import PageHeader from "@/features/shell/components/header/PageHeader";
import PageHeaderRightPortal from "@/features/shell/components/header/PageHeaderRightPortal";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import { selectOrgBySlugOrId } from "@/features/agent-context/redux/organizationsSlice";
import {
  fetchScopeTypes,
  selectScopeTypeBySlugOrId,
  selectScopeTypesByOrg,
} from "@/features/agent-context/redux/scope/scopeTypesSlice";
import {
  deleteScope,
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
import {
  HeaderActionGroup,
  type HeaderAction,
} from "@/features/scope-system/components/HeaderActionGroup";
import { useBreadcrumbOrgOptions } from "@/features/scope-system/hooks/useBreadcrumbOrgOptions";
import {
  canManageSettings,
  type OrgRole,
} from "@/features/organizations/types";
import { deleteOrganization } from "@/features/organizations/service";
import {
  orgHref,
  orgScopesHref,
  scopeHref,
  scopeItemHref,
  scopeTypeHref,
  scopeEditHref,
  scopeTypeEditHref,
  contextItemsHref,
  contextItemHref,
  contextItemEditHref,
} from "@/features/scope-system/utils/scopeRoutes";

/**
 * The single layout-level header for the org Scope & Context system. Mounted once
 * at `app/(core)/organizations/[orgId]/layout.tsx`, it self-gates by pathname so it
 * only renders on the scope/context subtree:
 *
 *   /organizations/[orgId]/scopes                                  (hub)
 *   /organizations/[orgId]/scopes/[typeId]                         (type)
 *   /organizations/[orgId]/scopes/[typeId]/edit                    (type edit)
 *   /organizations/[orgId]/scopes/[typeId]/context-items[/...]     (type context items)
 *   /organizations/[orgId]/scopes/[typeId]/[scopeId][/...]         (scope family)
 *   /organizations/[orgId]/context-items                           (org context items)
 *
 * Everything else under [orgId] (projects, tasks, notes, files, …) renders nothing.
 * Reads the route params + pathname, resolves org / type / scope / item from Redux,
 * and injects a full-path breadcrumb (with per-level sibling switchers) into the
 * shell header center slot plus the unified Hub/Edit/Add/Delete action group into
 * the right slot — so neither consumes page body space.
 */
export function ScopesRouteHeader() {
  const params = useParams();
  const pathname = usePathname() ?? "";
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const orgSlugOrId = params.orgId as string;
  const typeParam = params.typeId as string | undefined;
  const scopeParam = params.scopeId as string | undefined;
  const itemParam = params.itemId as string | undefined;

  // Path shape after `/organizations/<org>`: ["scopes", type, …] etc.
  const base = `/organizations/${orgSlugOrId}`;
  const segs = (pathname.startsWith(base) ? pathname.slice(base.length) : "")
    .split("/")
    .filter(Boolean);
  const top = segs[0];
  const isOrgHome = segs.length === 0;
  const active = isOrgHome || top === "scopes" || top === "context-items";

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
    () => (state: RootState) => selectScopeTypesByOrg(state, orgId ?? ""),
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
    () => (state: RootState) => selectScopesByType(state, resolvedTypeId ?? ""),
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
    () => (state: RootState) => selectItemsByType(state, resolvedTypeId ?? ""),
    [resolvedTypeId],
  );
  const items = useAppSelector(selectItems);

  useEffect(() => {
    if (active && orgId) dispatch(fetchScopeTypes(orgId));
  }, [active, dispatch, orgId]);

  useEffect(() => {
    if (active && orgId && resolvedTypeId) {
      dispatch(fetchScopes({ org_id: orgId, type_id: resolvedTypeId }));
      dispatch(listScopeTypeItems(resolvedTypeId));
    }
  }, [active, dispatch, orgId, resolvedTypeId]);

  if (!active || !org) return null;

  const isEdit = pathname.endsWith("/edit");
  const hasScope = Boolean(scopeParam);
  const isOrgContextItems = top === "context-items";
  const isTypeContextItems =
    top === "scopes" && segs[2] === "context-items" && !hasScope;

  const canManage = org.role ? canManageSettings(org.role as OrgRole) : false;

  const trail: ScopeBreadcrumbTrailNode[] = [];
  const actions: (HeaderAction | false)[] = [];
  let backHref: string | undefined;

  const typeNode: ScopeBreadcrumbTrailNode | null = scopeType
    ? {
        label: scopeType.label_plural,
        href: scopeTypeHref(orgSlugOrId, scopeType),
        options: allTypes.map((t) => ({
          label: t.label_plural,
          href: scopeTypeHref(orgSlugOrId, t),
          active: t.id === scopeType.id,
        })),
        optionsLabel: "Scope types",
      }
    : null;

  async function handleDeleteOrg() {
    if (!org || org.is_personal) return;
    const ok = await confirm({
      title: `Delete ${org.name}?`,
      description: `This permanently deletes “${org.name}” and all of its data — members lose access, shared resources become private, and pending invitations are cancelled. This cannot be undone.`,
      confirmLabel: "Delete organization",
      variant: "destructive",
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const result = await deleteOrganization(org.id);
      if (result.success) {
        toast.success(`Deleted “${org.name}”`);
        router.push("/organizations");
      } else {
        toast.error(result.error || "Failed to delete organization");
        setDeleting(false);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
      setDeleting(false);
    }
  }

  async function handleDeleteScope() {
    if (!scope || !scopeType) return;
    const ok = await confirm({
      title: `Delete ${scope.name}?`,
      description: `This permanently deletes “${scope.name}” and all its values. This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await dispatch(deleteScope(scope.id)).unwrap();
      toast.success(`Deleted “${scope.name}”`);
      router.push(scopeTypeHref(orgSlugOrId, scopeType));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
      setDeleting(false);
    }
  }

  if (isOrgHome) {
    // /organizations/[orgId] — the org home. Just ← · Organizations · Company,
    // with the same Edit / Delete tap-targets as every other level.
    backHref = "/organizations";
    if (canManage) {
      actions.push({
        key: "edit",
        icon: "edit",
        label: "Manage settings",
        href: `/organizations/${orgSlugOrId}/settings`,
      });
    }
    if (org.role === "owner" && !org.is_personal) {
      actions.push({
        key: "delete",
        icon: "delete",
        label: "Delete organization",
        danger: true,
        busy: deleting,
        onClick: handleDeleteOrg,
      });
    }
  } else if (isOrgContextItems) {
    // /organizations/[orgId]/context-items — every type's items, grouped.
    trail.push({ label: "Context items" });
    backHref = orgHref(orgSlugOrId);
  } else if (top === "scopes" && scopeType && typeNode) {
    const tNode = typeNode;

    if (hasScope && scope) {
      // ── Scope family: type › scope › (edit | context-items | item) ──────
      trail.push(tNode);
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

      const scopeIsContextItems = pathname.endsWith("/context-items");
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
      } else if (scopeIsContextItems) {
        trail.push({ label: "Context items" });
      }

      const isDetail = !itemParam && !isEdit && !scopeIsContextItems;
      if (isDetail) {
        actions.push({
          key: "edit",
          icon: "edit",
          label: "Edit settings",
          href: scopeEditHref(orgSlugOrId, scopeType, scope),
        });
        actions.push(
          canManage && {
            key: "delete",
            icon: "delete",
            label: "Delete",
            danger: true,
            busy: deleting,
            onClick: handleDeleteScope,
          },
        );
        backHref = scopeTypeHref(orgSlugOrId, scopeType);
      } else {
        actions.push({
          key: "hub",
          icon: "hub",
          label: `${scope.name} hub`,
          href: scopeHref(orgSlugOrId, scopeType, scope),
        });
        if (scopeIsContextItems) {
          actions.push({
            key: "edit",
            icon: "edit",
            label: "Edit settings",
            href: scopeEditHref(orgSlugOrId, scopeType, scope),
          });
        }
        if (isEdit) {
          actions.push(
            canManage && {
              key: "delete",
              icon: "delete",
              label: "Delete",
              danger: true,
              busy: deleting,
              onClick: handleDeleteScope,
            },
          );
        }
        backHref = scopeHref(orgSlugOrId, scopeType, scope);
      }
    } else if (isTypeContextItems) {
      // ── Type context items: type › context-items › (item › edit) ────────
      trail.push(tNode);
      const ciHref = contextItemsHref(orgSlugOrId, scopeType);
      if (itemParam && item) {
        trail.push({ label: "Context items", href: ciHref });
        trail.push({
          label: item.display_name,
          href: contextItemHref(orgSlugOrId, scopeType, item),
          options: items.map((it) => ({
            label: it.display_name,
            href: contextItemHref(orgSlugOrId, scopeType, it),
            active: it.id === item.id,
          })),
          optionsLabel: "Context items",
          optionsAllHref: ciHref,
          optionsAllLabel: "All context items",
        });
        if (isEdit) trail.push({ label: "Edit" });

        if (isEdit) {
          actions.push({
            key: "hub",
            icon: "hub",
            label: "Item hub",
            href: contextItemHref(orgSlugOrId, scopeType, item),
          });
          backHref = contextItemHref(orgSlugOrId, scopeType, item);
        } else {
          actions.push({
            key: "hub",
            icon: "hub",
            label: "Context items",
            href: ciHref,
          });
          actions.push({
            key: "edit",
            icon: "edit",
            label: "Edit item",
            href: contextItemEditHref(orgSlugOrId, scopeType, item),
          });
          backHref = ciHref;
        }
      } else {
        trail.push({ label: "Context items" });
        actions.push({
          key: "hub",
          icon: "hub",
          label: `${scopeType.label_singular} hub`,
          href: scopeTypeHref(orgSlugOrId, scopeType),
        });
        backHref = scopeTypeHref(orgSlugOrId, scopeType);
      }
    } else if (isEdit) {
      // ── Type edit ───────────────────────────────────────────────────────
      trail.push(tNode);
      trail.push({ label: "Edit" });
      actions.push({
        key: "hub",
        icon: "hub",
        label: `${scopeType.label_singular} hub`,
        href: scopeTypeHref(orgSlugOrId, scopeType),
      });
      backHref = scopeTypeHref(orgSlugOrId, scopeType);
    } else {
      // ── Type page (list of scopes) ──────────────────────────────────────
      trail.push(tNode);
      actions.push({
        key: "edit",
        icon: "edit",
        label: `Edit ${scopeType.label_singular} settings`,
        href: scopeTypeEditHref(orgSlugOrId, scopeType),
      });
      backHref = orgScopesHref(orgSlugOrId);
    }
  } else if (top === "scopes") {
    // Scopes hub (no type) — or type still resolving.
    backHref = orgHref(orgSlugOrId);
  }

  return (
    <>
      <PageHeader>
        <ScopeBreadcrumb
          orgSlugOrId={orgSlugOrId}
          orgName={org.name}
          orgIsPersonal={org.is_personal}
          backHref={backHref}
          orgOptions={orgOptions}
          showScopesCrumb={top === "scopes"}
          trail={trail}
          singleLine
          className="w-full"
        />
      </PageHeader>
      {actions.filter(Boolean).length > 0 && (
        <PageHeaderRightPortal>
          <HeaderActionGroup actions={actions} />
        </PageHeaderRightPortal>
      )}
    </>
  );
}
