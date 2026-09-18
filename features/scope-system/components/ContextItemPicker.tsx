"use client";

/**
 * ContextItemPicker — the ONE reusable control for choosing a context item to
 * bind an agent variable or context policy to. Loads its own data and does NOT
 * assume the user has an active scope/org set (an agent author may have none).
 * Used by the variable-binding editor, the context-policy-binding editor, and
 * the batch binder, so they never drift.
 *
 * TWO SOURCES, because Context has two BINDABLE sources of supply:
 *
 *  - **System** — platform truths that resolve for every user with no scope
 *    selection (ambient date/time/user, curated globals, industry datasets).
 *    Flat list; no org, no scope type. Binding carries `scope_type_id: null`.
 *  - **Scope** — what the org is working on: organization → scope type → item.
 *
 * (The third source, Surface, is not bindable here — a surface supplies its
 * values per request, so an agent consumes them through a Context Policy key,
 * not through an item binding.)
 *
 * Both kinds resolve identically at run time: `resolve_full_context` emits both
 * into `cell_values` keyed by `context_item_id`, and a binding always stores
 * that id — which is why System items need no new binding machinery.
 *
 * P23 — EVERY PICKER TAKES NEW INPUT (Arman, 2026-08-23; re-ruled on THIS
 * control 2026-09-18: "you cannot lock a user in by offering them something
 * but then not letting them create a new one of it during selection… people
 * don't know what a 'Context Item' is when they're in the scopes screen but
 * when they're here, they see it in practice and so this is the time to allow
 * them to create one the right way"). Every level of the cascade creates in
 * place through that record's ONE existing write path, selects the new row
 * immediately, and never navigates away:
 *
 *   organization  → `CreateOrgModal` (the org editor's own form, name prefilled)
 *   scope type    → `createScopeType` from the typed name (same defaults the
 *                   Add Scope modal uses; everything else is editable on its page)
 *   context item  → `ContextItemAddForm` inline, name prefilled — the same form
 *                   the scope-type page and scope page use
 *
 * System items are the P11 case: platform vocabulary curated centrally. The
 * control SAYS so and offers the live alternative (a Scope item) instead of a
 * silent refusal.
 */

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CreatablePicker,
  type CreatableOption,
} from "@/components/ui/creatable-picker";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationsList } from "@/features/scopes/redux/selectors/tree";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import {
  createScopeType,
  fetchScopeTypes,
  selectScopeTypesByOrg,
  selectScopeTypesLoadedForOrg,
} from "@/features/agent-context/redux/scope/scopeTypesSlice";
import {
  listScopeTypeItems,
  listSystemContextItems,
  selectItemsByType,
  selectItemsLoadedForType,
  SYSTEM_ITEMS_KEY,
  type ContextItem,
} from "@/features/scope-system/redux/contextItemsSlice";
import { pluralize } from "@/features/scopes/utils/pluralize";
import {
  contextItemsHref,
  orgScopesHref,
} from "@/features/scopes/lib/scopeRoutes";
import { CreateOrgModal } from "@/features/organizations/components/CreateOrgModal";
import { ContextItemAddForm } from "./ContextItemAddForm";

export type ContextItemSource = "system" | "scope";

export interface ContextItemSelection {
  source: ContextItemSource;
  /** Empty for System items. */
  orgId: string;
  /** Empty for System items — a System item has no scope type. */
  scopeTypeId: string;
  contextItemId: string;
  itemKey: string;
  /** The full picked item — present only when `contextItemId` changed in this emit. */
  item?: ContextItem;
}

interface ContextItemPickerProps {
  value: {
    source?: ContextItemSource;
    orgId?: string;
    scopeTypeId?: string;
    contextItemId?: string;
  };
  onChange: (sel: ContextItemSelection) => void;
  readonly?: boolean;
}

const CLASS_LABEL: Record<string, string> = {
  ambient: "Ambient",
  curated: "Curated",
  dataset: "Dataset",
};

export function ContextItemPicker({
  value,
  onChange,
  readonly,
}: ContextItemPickerProps) {
  const dispatch = useAppDispatch();
  const activeOrgId = useAppSelector(selectActiveOrganizationId);
  const orgs = useAppSelector(selectOrganizationsList);

  // A stored binding with a scope type is a Scope binding; otherwise System is
  // the default offer (it always has something to pick, for every user).
  const source: ContextItemSource =
    value.source ?? (value.scopeTypeId ? "scope" : "system");
  const isSystem = source === "system";

  // Default the displayed org to the value, else the active org (never assumed/required).
  const orgId = value.orgId || activeOrgId || "";
  const scopeTypeId = value.scopeTypeId || "";
  // System items are cached under a sentinel so the same selectors serve both.
  const itemsKey = isSystem ? SYSTEM_ITEMS_KEY : scopeTypeId;

  const typesLoaded = useAppSelector((s) =>
    orgId ? selectScopeTypesLoadedForOrg(s, orgId) : false,
  );
  const scopeTypes = useAppSelector((s) =>
    orgId ? selectScopeTypesByOrg(s, orgId) : [],
  );
  const itemsLoaded = useAppSelector((s) =>
    itemsKey ? selectItemsLoadedForType(s, itemsKey) : false,
  );
  const items = useAppSelector((s) =>
    itemsKey ? selectItemsByType(s, itemsKey) : [],
  );

  const org = orgs.find((o) => o.id === orgId);
  const scopeType = scopeTypes.find((t) => t.id === scopeTypeId);
  // Manage doors use the slug when the row has one — the canonical address.
  const orgSegment = org?.slug || orgId;

  // In-place creation drafts: the text the person typed before "Create …".
  const [orgDraft, setOrgDraft] = useState<string | null>(null);
  const [itemDraft, setItemDraft] = useState<string | null>(null);

  useEffect(() => {
    if (!isSystem && orgId && !typesLoaded) dispatch(fetchScopeTypes(orgId));
  }, [isSystem, orgId, typesLoaded, dispatch]);

  useEffect(() => {
    if (isSystem) {
      if (!itemsLoaded) dispatch(listSystemContextItems());
    } else if (scopeTypeId && !itemsLoaded) {
      dispatch(listScopeTypeItems(scopeTypeId));
    }
  }, [isSystem, scopeTypeId, itemsLoaded, dispatch]);

  const emit = (next: Partial<ContextItemSelection>) => {
    const nextSource = next.source ?? source;
    const systemNext = nextSource === "system";
    onChange({
      source: nextSource,
      orgId: systemNext ? "" : (next.orgId ?? orgId),
      scopeTypeId: systemNext ? "" : (next.scopeTypeId ?? scopeTypeId),
      contextItemId: next.contextItemId ?? value.contextItemId ?? "",
      itemKey: next.itemKey ?? "",
      item: next.item,
    });
  };

  const selectItem = (itemId: string) => {
    const item = items.find((i) => i.id === itemId);
    if (item) emit({ contextItemId: item.id, itemKey: item.key, item });
  };

  /** Scope type from a typed name — the Add Scope modal's own defaults. */
  const createScopeTypeFromName = async (typed: string) => {
    if (!orgId) {
      // Nothing fails silently: a scope type belongs to an organization, so
      // say why nothing happened instead of returning null into the void.
      toast.error("Pick an organization first — a scope type belongs to one.");
      return null;
    }
    try {
      const created = await dispatch(
        createScopeType({
          org_id: orgId,
          label_singular: typed,
          label_plural: pluralize(typed),
          icon: "Folder",
        }),
      ).unwrap();
      toast.success(
        `Added scope type "${created.label_singular}" — fine-tune it any time from Scopes`,
      );
      return created.id;
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to add scope type",
      );
      return null;
    }
  };

  const orgOptions: CreatableOption[] = orgs.map((o) => ({
    value: o.id,
    label: o.name,
    // CONVERGE: C-3 — is_personal is dropped; the default organization becomes users default_organization_id preference — declared 2026-09-10, Data Doctrine R9–R12. Register: /projects/data-doctrine-adoption/REGISTER.md#DD-045
    hint: o.is_personal ? "personal" : undefined,
  }));

  const scopeTypeOptions: CreatableOption[] = scopeTypes.map((t) => ({
    value: t.id,
    label: t.label_singular,
    hint: t.label_plural,
  }));

  const itemOptions: CreatableOption[] = items.map((i) => ({
    value: i.id,
    label: i.display_name,
    hint: i.system_item_class
      ? `${i.key} · ${CLASS_LABEL[i.system_item_class] ?? i.system_item_class}`
      : i.key,
    keywords: i.key,
  }));

  /**
   * A scope type is only really chosen when the picker can RESOLVE it in the
   * org it is showing. A stored binding can carry a scope type from another
   * organization (the picker falls back to the active org when the value has
   * none), and then the scope-type trigger renders its placeholder while the
   * item level speaks about a type the person never picked — the screen said
   * "No items yet — type a name to create one" when no scope type was selected
   * at all (PNI-000 F1). So: not resolvable = not picked, and while the org's
   * types are still arriving the item level says it is loading, never that a
   * scope type is empty.
   */
  const scopeTypePending =
    !isSystem && Boolean(scopeTypeId) && !typesLoaded && !scopeType;
  const scopeTypeMissing = !isSystem && !scopeTypePending && !scopeType;

  const itemPlaceholder = scopeTypeMissing
    ? "Pick a scope type first"
    : scopeTypePending
      ? "Loading…"
      : items.length === 0
        ? itemsLoaded
          ? isSystem
            ? "No system context items"
            : "No items yet — type a name to create one"
          : "Loading…"
        : "Choose a context item…";

  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Source</Label>
        <Select
          value={source}
          onValueChange={(v) => {
            setItemDraft(null);
            emit({
              source: v as ContextItemSource,
              scopeTypeId: "",
              contextItemId: "",
              itemKey: "",
            });
          }}
          disabled={readonly}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="system">
              <span>System</span>
              <span className="ml-2 text-xs text-muted-foreground">
                platform truths — every user, no scope needed
              </span>
            </SelectItem>
            <SelectItem value="scope">
              <span>Scope</span>
              <span className="ml-2 text-xs text-muted-foreground">
                what this organization is working on
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!isSystem && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Organization
            </Label>
            <CreatablePicker
              value={orgId || null}
              options={orgOptions}
              onSelect={(v) => {
                setItemDraft(null);
                emit({
                  orgId: v,
                  scopeTypeId: "",
                  contextItemId: "",
                  itemKey: "",
                });
              }}
              placeholder="Choose an organization…"
              searchPlaceholder="Search or type a new organization…"
              noun="organization"
              onCreateRequiresMore={(typed) => setOrgDraft(typed)}
              manageAction={{
                label: "Manage organizations",
                href: "/organizations",
              }}
              disabled={readonly}
              ariaLabel="Organization"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Scope type</Label>
            <CreatablePicker
              value={scopeTypeId || null}
              options={scopeTypeOptions}
              onSelect={(v) => {
                setItemDraft(null);
                emit({ scopeTypeId: v, contextItemId: "", itemKey: "" });
              }}
              placeholder={
                !orgId ? "Pick an organization first" : "Choose a scope type…"
              }
              searchPlaceholder="Search or type a new scope type…"
              noun="scope type"
              onCreate={createScopeTypeFromName}
              manageAction={
                orgId
                  ? {
                      label: "Manage scope types",
                      href: orgScopesHref(orgSegment),
                    }
                  : undefined
              }
              disabled={readonly || !orgId}
              loading={Boolean(orgId) && !typesLoaded}
              ariaLabel="Scope type"
            />
          </div>
        </>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">
          {isSystem ? "System context item" : "Context item"}
        </Label>
        <CreatablePicker
          value={value.contextItemId || null}
          options={itemOptions}
          onSelect={selectItem}
          placeholder={itemPlaceholder}
          searchPlaceholder={
            isSystem
              ? "Search system items…"
              : "Search or type a new context item…"
          }
          noun="context item"
          onCreateRequiresMore={
            isSystem ? undefined : (typed) => setItemDraft(typed)
          }
          lockedNote={
            isSystem
              ? "System items are platform truths curated centrally — every user gets the same set."
              : undefined
          }
          lockedAction={
            isSystem && !readonly
              ? {
                  label: "Need your own? Bind a Scope item instead",
                  onSelect: () =>
                    emit({
                      source: "scope",
                      scopeTypeId: "",
                      contextItemId: "",
                      itemKey: "",
                    }),
                }
              : undefined
          }
          manageAction={
            !isSystem && scopeType && orgId
              ? {
                  label: `Manage ${scopeType.label_plural} context items`,
                  href: contextItemsHref(orgSegment, scopeType),
                }
              : undefined
          }
          disabled={readonly || scopeTypeMissing || scopeTypePending}
          loading={
            scopeTypePending ||
            (Boolean(itemsKey) && !scopeTypeMissing && !itemsLoaded)
          }
          ariaLabel={isSystem ? "System context item" : "Context item"}
        />
        {isSystem && (
          <p className="text-[11px] text-muted-foreground">
            Resolves for every user with no scope selection. Ambient items are
            recomputed on every request.
          </p>
        )}
        {itemDraft !== null && !isSystem && scopeType && (
          <ContextItemAddForm
            scopeTypeId={scopeTypeId}
            labelPlural={scopeType.label_plural}
            initialName={itemDraft}
            onAdded={(item) => {
              emit({ contextItemId: item.id, itemKey: item.key, item });
            }}
            onClose={() => setItemDraft(null)}
          />
        )}
      </div>

      {orgDraft !== null && (
        <CreateOrgModal
          isOpen
          initialName={orgDraft}
          onClose={() => setOrgDraft(null)}
          onCreated={(created) => {
            // The tree selectors feed this picker; refresh so the new org is
            // an option, then select it in place.
            void dispatch(ensureScopeTree({ refresh: true }));
            setItemDraft(null);
            emit({
              orgId: created.id,
              scopeTypeId: "",
              contextItemId: "",
              itemKey: "",
            });
          }}
        />
      )}
    </div>
  );
}
