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

import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import {
  makeSelectOrgIdForScopeType,
  selectOrganizationsList,
  selectTreeStatus,
} from "@/features/scopes/redux/selectors/tree";
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
  /**
   * A THIRD source, offered only where a variable may be bound to the author's
   * own custom data (the agent variable editor). When `active`, the Source
   * control reads "From my data" and `children` replaces the System/Scope
   * cascade; choosing System or Scope again emits a normal selection.
   * Callers that bind context POLICIES never pass it — a policy cannot read a
   * custom table.
   */
  customData?: {
    active: boolean;
    onSelect: () => void;
    children: ReactNode;
  };
}

/** The Source value for the optional custom-data choice — never a `ContextItemSource`. */
const CUSTOM_DATA_SOURCE = "custom_data";

const CLASS_LABEL: Record<string, string> = {
  ambient: "Ambient",
  curated: "Curated",
  dataset: "Dataset",
};

export function ContextItemPicker({
  value,
  onChange,
  readonly,
  customData,
}: ContextItemPickerProps) {
  const dispatch = useAppDispatch();
  const activeOrgId = useAppSelector(selectActiveOrganizationId);
  const orgs = useAppSelector(selectOrganizationsList);
  const treeStatus = useAppSelector(selectTreeStatus);
  const selectOrgIdForScopeType = useMemo(
    () => makeSelectOrgIdForScopeType(),
    [],
  );
  /**
   * THE ORGANIZATION COMES FROM THE SCOPE TYPE, never from whichever org
   * happens to be active. A stored binding keeps only the item and its scope
   * type (`ContextItemBinding` has no org), and a scope type belongs to exactly
   * one organization — so the tree answers the question. Guessing with the
   * active org is what made reopening a binding show the wrong organization, an
   * unresolvable scope type and a frozen item picker (PNI-000 re-verify 1). The
   * active org is the fallback for ONE case only: a binding with no scope type,
   * where nothing has been chosen yet.
   */
  const ownerOrgId = useAppSelector((s) =>
    selectOrgIdForScopeType(s, value.scopeTypeId),
  );

  // A stored binding with a scope type is a Scope binding; otherwise System is
  // the default offer (it always has something to pick, for every user).
  const source: ContextItemSource =
    value.source ?? (value.scopeTypeId ? "scope" : "system");
  const isSystem = source === "system";

  // Default the displayed org to the value, else the active org (never assumed/required).
  const orgId = value.orgId || ownerOrgId || activeOrgId || "";
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

  // The owner lookup reads the scope tree, so a binding opened on a surface
  // that never booted the tree must boot it (the thunk is the one sanctioned
  // entry point and no-ops when it is already loaded).
  useEffect(() => {
    if (!isSystem && value.scopeTypeId && treeStatus === "idle") {
      void dispatch(ensureScopeTree());
    }
  }, [isSystem, value.scopeTypeId, treeStatus, dispatch]);

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
  // Only ever called with an organization: the picker below passes it as
  // `onCreate` only when one is resolved, and is disabled and says
  // "Pick an organization first" until then. A runtime guard here would be a
  // sentence no one can reach (PNI-000 re-verify 1, F5 residual).
  const createScopeTypeFromName = async (typed: string) => {
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
   * A scope type is only really chosen when the picker can RESOLVE it — the id
   * is in the tree and in the org's loaded types. Three honest states, never a
   * dead control wearing a value (PNI-000 F1 + re-verify 1):
   *   pending      — the tree or the org's types are still arriving: "Loading…"
   *   unresolvable — stored, but gone or no longer visible: a sentence says so
   *   missing      — nothing chosen: "Pick a scope type first"
   */
  const treeSettled = treeStatus === "ready" || treeStatus === "error";
  const scopeTypePending =
    !isSystem &&
    Boolean(scopeTypeId) &&
    !scopeType &&
    (!typesLoaded || (Boolean(value.scopeTypeId) && !treeSettled));
  /** Stored, the tree has spoken, and it still resolves to nothing. */
  const scopeTypeUnresolvable =
    !isSystem && Boolean(scopeTypeId) && !scopeType && !scopeTypePending;
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
          value={customData?.active ? CUSTOM_DATA_SOURCE : source}
          onValueChange={(v) => {
            setItemDraft(null);
            if (v === CUSTOM_DATA_SOURCE) {
              customData?.onSelect();
              return;
            }
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
            {customData && (
              <SelectItem value={CUSTOM_DATA_SOURCE}>
                <span>From my data</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  a table you keep in Data
                </span>
              </SelectItem>
            )}
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

      {customData?.active ? customData.children : null}

      {!customData?.active && !isSystem && (
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
              onCreate={orgId ? createScopeTypeFromName : undefined}
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
            {scopeTypeUnresolvable && (
              <p className="text-[11px] text-amber-700 dark:text-amber-300">
                The scope type this variable was bound to is no longer visible
                here — it may have been deleted, or it belongs to an
                organization you are no longer in. Pick a scope type to rebind
                it; the binding is unchanged until you do.
              </p>
            )}
          </div>
        </>
      )}

      {!customData?.active && (
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
      )}

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
