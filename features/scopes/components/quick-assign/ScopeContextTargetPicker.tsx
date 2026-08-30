"use client";

/**
 * ScopeContextTargetPicker — the ONE cascading control for choosing WHERE a
 * blob of free text should be written as a context item's value:
 * organization -> scope type -> scope (a specific instance, e.g. "Doe, John
 * v. CSV Pharmacy") -> context item.
 *
 * This is one level deeper than `features/scope-system/components/
 * ContextItemPicker.tsx`, which stops at the item *definition* (org -> scope
 * type -> item) for binding agent variables. Writing an actual cell value
 * needs the specific scope instance too, so this picker adds that missing
 * level rather than duplicating the org/type/item cascade.
 *
 * Only items whose `value_type` is text-shaped (string/object/array/document)
 * are selectable — "append to the bottom" / "overwrite" has no sensible
 * meaning for a reference, boolean, number, or date cell. Those items still
 * render (so the user isn't confused about where they went) but disabled.
 */

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  EntityDoorControls,
  ENTITY_DOOR_CONTROL_CLASS,
} from "@/components/official/entity-ref/EntityDoorControls";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import {
  selectOrganizationsList,
  makeSelectScopeTypesForOrg,
  makeSelectScopesForType,
} from "@/features/scopes/redux/selectors/tree";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { ensureScopeTypeItems } from "@/features/scopes/redux/thunks/ensureScopeTypeItems";
import {
  makeSelectItemsForType,
  makeSelectItemsStatusForType,
} from "@/features/scopes/redux/selectors/context-items";
import type {
  ContextItemRow,
  ContextItemValueType,
} from "@/features/scopes/types";
import {
  contextItemHref,
  contextItemsHref,
  orgHref,
  orgScopesHref,
  scopeHref,
  scopeSeg,
  scopeTypeHref,
} from "@/features/scopes/lib/scopeRoutes";

/** Append/overwrite only makes sense for a cell that IS text. */
const TEXT_COMPATIBLE_VALUE_TYPES: ReadonlySet<ContextItemValueType> = new Set([
  "string",
  "object",
  "array",
  "document",
]);

export function isTextCompatibleContextItem(item: ContextItemRow): boolean {
  return TEXT_COMPATIBLE_VALUE_TYPES.has(item.value_type);
}

export interface ScopeContextTarget {
  orgId: string;
  scopeTypeId: string;
  scopeId: string;
  contextItemId: string;
  /** The full picked item — present only when `contextItemId` changed in this emit. */
  item?: ContextItemRow;
}

interface ScopeContextTargetPickerProps {
  value: Partial<ScopeContextTarget>;
  onChange: (next: ScopeContextTarget) => void;
  disabled?: boolean;
}

export function ScopeContextTargetPicker({
  value,
  onChange,
  disabled,
}: ScopeContextTargetPickerProps) {
  const dispatch = useAppDispatch();
  const activeOrgId = useAppSelector(selectActiveOrganizationId);
  const orgs = useAppSelector(selectOrganizationsList);

  const orgId = value.orgId || activeOrgId || "";
  const scopeTypeId = value.scopeTypeId || "";
  const scopeId = value.scopeId || "";
  const contextItemId = value.contextItemId || "";

  useEffect(() => {
    void dispatch(ensureScopeTree());
  }, [dispatch]);

  const selectScopeTypesForOrg = useMemo(
    () => makeSelectScopeTypesForOrg(),
    [],
  );
  const scopeTypes = useAppSelector((s) =>
    selectScopeTypesForOrg(s, orgId || null),
  );

  const selectScopesForType = useMemo(() => makeSelectScopesForType(), []);
  const scopes = useAppSelector((s) =>
    selectScopesForType(s, scopeTypeId || null),
  );

  const selectItemsForType = useMemo(() => makeSelectItemsForType(), []);
  const items = useAppSelector((s) =>
    selectItemsForType(s, scopeTypeId || null),
  );
  const selectItemsStatusForType = useMemo(
    () => makeSelectItemsStatusForType(),
    [],
  );
  const itemsStatus = useAppSelector((s) =>
    selectItemsStatusForType(s, scopeTypeId || null),
  );
  const itemsLoaded = itemsStatus === "ready" || itemsStatus === "error";
  const organization = orgs.find((org) => org.id === orgId) ?? null;
  const scopeType =
    scopeTypes.find((candidate) => candidate.id === scopeTypeId) ?? null;
  const scope = scopes.find((candidate) => candidate.id === scopeId) ?? null;
  const item =
    items.find((candidate) => candidate.id === contextItemId) ?? null;
  const orgSegment = organization ? scopeSeg(organization) : null;

  useEffect(() => {
    if (scopeTypeId) void dispatch(ensureScopeTypeItems(scopeTypeId));
  }, [scopeTypeId, dispatch]);

  const emit = (next: Partial<ScopeContextTarget>) =>
    onChange({
      orgId: next.orgId ?? orgId,
      scopeTypeId: next.scopeTypeId ?? scopeTypeId,
      scopeId: next.scopeId ?? scopeId,
      contextItemId: next.contextItemId ?? value.contextItemId ?? "",
      item: next.item,
    });

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label className="text-xs">Organization</Label>
        <div className="flex items-center gap-1">
          <Select
            value={orgId}
            onValueChange={(v) =>
              emit({
                orgId: v,
                scopeTypeId: "",
                scopeId: "",
                contextItemId: "",
              })
            }
            disabled={disabled}
          >
            <SelectTrigger className="h-8 min-w-0 flex-1 text-xs">
              <SelectValue placeholder="Choose an organization…" />
            </SelectTrigger>
            <SelectContent>
              {orgs.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                  {o.is_personal ? " (personal)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {organization && orgSegment ? (
            <EntityDoorControls
              token="organization"
              id={organization.id}
              name={organization.name}
              href={orgHref(orgSegment)}
              alwaysShowActions
            />
          ) : null}
          <Link
            href="/organizations"
            target="_blank"
            rel="noopener noreferrer"
            title="Create or manage organizations"
            aria-label="Create or manage organizations"
            className={ENTITY_DOOR_CONTROL_CLASS}
          >
            <Plus className="size-3" />
          </Link>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Scope type</Label>
        <div className="flex items-center gap-1">
          <Select
            value={scopeTypeId}
            onValueChange={(v) =>
              emit({ scopeTypeId: v, scopeId: "", contextItemId: "" })
            }
            disabled={disabled || !orgId}
          >
            <SelectTrigger className="h-8 min-w-0 flex-1 text-xs">
              <SelectValue
                placeholder={
                  !orgId ? "Pick an organization first" : "Choose a type…"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {scopeTypes.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label_singular}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {scopeType && orgSegment ? (
            <EntityDoorControls
              token="scope_type"
              id={scopeType.id}
              name={scopeType.label_singular}
              href={scopeTypeHref(orgSegment, scopeType)}
              alwaysShowActions
            />
          ) : null}
          {organization && orgSegment ? (
            <Link
              href={orgScopesHref(orgSegment)}
              target="_blank"
              rel="noopener noreferrer"
              title={`Create or manage scope types in ${organization.name}`}
              aria-label={`Create or manage scope types in ${organization.name}`}
              className={ENTITY_DOOR_CONTROL_CLASS}
            >
              <Plus className="size-3" />
            </Link>
          ) : null}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">
          {scopeTypes.find((t) => t.id === scopeTypeId)?.label_singular ??
            "Scope"}
        </Label>
        <div className="flex items-center gap-1">
          <Select
            value={scopeId}
            onValueChange={(v) => emit({ scopeId: v, contextItemId: "" })}
            disabled={disabled || !scopeTypeId}
          >
            <SelectTrigger className="h-8 min-w-0 flex-1 text-xs">
              <SelectValue
                placeholder={
                  !scopeTypeId
                    ? "Pick a scope type first"
                    : scopes.length === 0
                      ? "No scopes of this type"
                      : "Choose a scope…"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {scopes.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {scope && scopeType && orgSegment ? (
            <EntityDoorControls
              token="scope"
              id={scope.id}
              name={scope.name}
              href={scopeHref(orgSegment, scopeType, scope)}
              alwaysShowActions
            />
          ) : null}
          {scopeType && orgSegment ? (
            <Link
              href={scopeTypeHref(orgSegment, scopeType)}
              target="_blank"
              rel="noopener noreferrer"
              title={`Create or manage ${scopeType.label_plural.toLowerCase()}`}
              aria-label={`Create or manage ${scopeType.label_plural.toLowerCase()}`}
              className={ENTITY_DOOR_CONTROL_CLASS}
            >
              <Plus className="size-3" />
            </Link>
          ) : null}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Context item</Label>
        <div className="flex items-center gap-1">
          <Select
            value={contextItemId}
            onValueChange={(itemId) => {
              const nextItem = items.find(
                (candidate) => candidate.id === itemId,
              );
              if (nextItem) {
                emit({ contextItemId: nextItem.id, item: nextItem });
              }
            }}
            disabled={disabled || !scopeId}
          >
            <SelectTrigger className="h-8 min-w-0 flex-1 text-xs">
              <SelectValue
                placeholder={
                  !scopeId
                    ? "Pick a scope first"
                    : items.length === 0
                      ? itemsLoaded
                        ? "No items on this scope type"
                        : "Loading…"
                      : "Choose a context item…"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {items.map((i) => {
                const compatible = isTextCompatibleContextItem(i);
                return (
                  <SelectItem key={i.id} value={i.id} disabled={!compatible}>
                    <span>{i.display_name}</span>
                    {!compatible && (
                      <span className="ml-2 text-[10px] text-muted-foreground">
                        ({i.value_type} — text only, for now)
                      </span>
                    )}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {item && scopeType && orgSegment ? (
            <EntityDoorControls
              token="context_item"
              id={item.id}
              name={item.display_name}
              href={contextItemHref(orgSegment, scopeType, item)}
              alwaysShowActions
            />
          ) : null}
          {scopeType && orgSegment ? (
            <Link
              href={contextItemsHref(orgSegment, scopeType)}
              target="_blank"
              rel="noopener noreferrer"
              title={`Create or manage context items for ${scopeType.label_plural}`}
              aria-label={`Create or manage context items for ${scopeType.label_plural}`}
              className={ENTITY_DOOR_CONTROL_CLASS}
            >
              <Plus className="size-3" />
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default ScopeContextTargetPicker;
