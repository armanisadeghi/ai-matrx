/**
 * Resolves which matrx reference to copy from the org scope/context route header.
 */

export type ScopeRouteRecordReference = {
  kind: "record";
  referenceType: "organization" | "scope_type" | "scope" | "context_item";
  id: string;
  label: string;
};

export type ScopeRouteContextValueReference = {
  kind: "context_value";
  scopeId: string;
  contextItemId: string;
  label: string;
};

export type ScopeRouteReference =
  | ScopeRouteRecordReference
  | ScopeRouteContextValueReference;

export function resolveScopeRouteReference(args: {
  pathname: string;
  org: { id: string; name: string };
  isOrgHome: boolean;
  isOrgContextItems: boolean;
  scopeType?: { id: string; label_singular: string; label_plural: string };
  scope?: { id: string; name: string };
  item?: { id: string; display_name: string };
  hasScope: boolean;
  itemParam?: string;
  isEdit: boolean;
  isTypeContextItems: boolean;
}): ScopeRouteReference | null {
  const {
    pathname,
    org,
    isOrgHome,
    scopeType,
    scope,
    item,
    hasScope,
    itemParam,
    isEdit,
    isTypeContextItems,
  } = args;

  if (isOrgHome || args.isOrgContextItems) {
    return {
      kind: "record",
      referenceType: "organization",
      id: org.id,
      label: org.name,
    };
  }

  if (!scopeType) return null;

  const scopeIsContextItems = pathname.endsWith("/context-items");

  // Scope × context item value page (the cell).
  if (hasScope && scope && itemParam && item) {
    return {
      kind: "context_value",
      scopeId: scope.id,
      contextItemId: item.id,
      label: `${scope.name} · ${item.display_name}`,
    };
  }

  // Scope hub (detail) — whole scope.
  if (hasScope && scope && !itemParam && !isEdit && !scopeIsContextItems) {
    return {
      kind: "record",
      referenceType: "scope",
      id: scope.id,
      label: scope.name,
    };
  }

  // Type-scoped context item hub / edit — the item definition (column).
  if (isTypeContextItems && item && !hasScope) {
    return {
      kind: "record",
      referenceType: "context_item",
      id: item.id,
      label: item.display_name,
    };
  }

  // Scope type list / type edit — the dimension.
  if (!hasScope && !isTypeContextItems) {
    return {
      kind: "record",
      referenceType: "scope_type",
      id: scopeType.id,
      label: scopeType.label_singular,
    };
  }

  return null;
}
