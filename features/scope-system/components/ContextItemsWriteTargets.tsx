"use client";

/**
 * ContextItemsWriteTargets — the live handlers for the write half of
 * `matrx-user/context-items` (the targets its manifest declares).
 *
 * The receiving end of the 360 loop on the all-organizations field catalog: an
 * agent bound to this page calls `apply_surface_write` and the value lands
 * here, through the SAME `updateContextItem` / `createContextItem` Redux
 * thunks the user's own edit sheet (`ContextItemSettingsForm`) and add form
 * (`ContextItemAddForm`) dispatch — never a parallel write, never raw
 * supabase.
 *
 * Three ways in which this page can be asked to write into nothing, and all
 * three throw rather than pretend:
 *  - the item (or scope-type section) is not loaded — sections load LAZILY per
 *    scope type, so "not in the store" means unknown, not absent;
 *  - the viewer's role in the owning organization cannot manage settings
 *    (`canManageSettings` — the same predicate that hides the pencil);
 *  - the value the agent supplied does not match the declared shape.
 *
 * Every write is verified against the row the server returned before it is
 * reported as success: the thunks are not optimistic and `.unwrap()` rethrows
 * a rejection, but a column silently ignored by the server would otherwise
 * read as a clean apply.
 *
 * Renders nothing. Mount once inside the surface's `SurfaceRuntimeProvider`.
 */

import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/rootReducer";
import { useSurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  AGENT_WRITABLE_VALUE_TYPES,
  CONTEXT_ITEMS_SURFACE_NAME,
} from "@/features/surfaces/manifests/context-items.manifest";
import {
  createContextItem,
  listScopeTypeItems,
  selectContextItemById,
  selectItemsByType,
  selectItemsLoadedForType,
  updateContextItem,
  type ContextItem,
  type ContextValueType,
} from "@/features/scope-system/redux/contextItemsSlice";
import { selectScopeTypeById } from "@/features/agent-context/redux/scope/scopeTypesSlice";
import { selectFullContextOrganizations } from "@/features/agent-context/redux/hierarchySlice";
import { canManageSettings, type OrgRole } from "@/features/organizations/types";
import { slugifyKey } from "@/features/scope-system/utils/slugify";

/** Wire value for `context_item_copy`. At least one text key is required. */
export interface ContextItemCopyWrite {
  item_id: string;
  display_name?: string;
  description?: string;
}

/** Wire value for `context_item_category`. `null` clears the category. */
export interface ContextItemCategoryWrite {
  item_id: string;
  category: string | null;
}

/** Wire value for `context_item_tags`. The array REPLACES the whole set. */
export interface ContextItemTagsWrite {
  item_id: string;
  tags: string[];
}

/** Wire value for `context_item_status_note`. `null` clears the note. */
export interface ContextItemStatusNoteWrite {
  item_id: string;
  status_note: string | null;
}

/** Wire value for `add_context_items`. */
export interface AddContextItemsWrite {
  scope_type_id: string;
  items: {
    display_name: string;
    description?: string;
    category?: string;
    value_type?: string;
  }[];
}

// ── Input validation — every failure is a throw the agent reads back ────────

function asRecord(value: unknown, target: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${target} expects an object value.`);
  }
  return value as Record<string, unknown>;
}

function requiredId(
  obj: Record<string, unknown>,
  key: string,
  target: string,
): string {
  const raw = obj[key];
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error(`${target}: ${key} must be a non-empty string.`);
  }
  return raw.trim();
}

/**
 * A text field the caller may omit entirely (keep as is), or provide as a
 * string — including `""`, which is a deliberate clear, not a missing value.
 */
function optionalText(
  obj: Record<string, unknown>,
  key: string,
  target: string,
): string | undefined {
  const raw = obj[key];
  if (raw === undefined) return undefined;
  if (typeof raw !== "string") {
    throw new Error(`${target}: ${key} must be a string when provided.`);
  }
  return raw.trim();
}

/** A text field where `null` is the explicit "clear it" value. */
function nullableText(
  obj: Record<string, unknown>,
  key: string,
  target: string,
): string | null {
  const raw = obj[key];
  if (raw === null) return null;
  if (typeof raw !== "string") {
    throw new Error(`${target}: ${key} must be a string or null.`);
  }
  return raw.trim() || null;
}

/**
 * Normalise one tag exactly as the tag inputs in `ContextItemSettingsForm` /
 * `ContextItemAddForm` normalise what the user types.
 */
function normaliseTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "_");
}

export function ContextItemsWriteTargets() {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  /**
   * Resolve `item_id` to a loaded item the viewer may actually edit. Reads the
   * LIVE store (not a render snapshot) — a section that finished loading while
   * the agent was thinking must count as loaded.
   */
  function resolveItem(itemId: string, target: string): ContextItem {
    const state = store.getState() as RootState;
    const item = selectContextItemById(state, itemId);
    if (!item) {
      throw new Error(
        `${target}: no context item with id "${itemId}" is loaded on this page. Item sections load lazily per scope type — read context_item_authoring for the items actually loaded, and loaded_scope_type_ids for which sections are known.`,
      );
    }
    assertCanManageScopeType(state, item.scope_type_id, target);
    return item;
  }

  /** Throw unless the viewer's role in the scope type's org can manage settings. */
  function assertCanManageScopeType(
    state: RootState,
    scopeTypeId: string,
    target: string,
  ): void {
    const scopeType = selectScopeTypeById(state, scopeTypeId);
    if (!scopeType) {
      throw new Error(
        `${target}: scope type "${scopeTypeId}" is not loaded on this page — read scope_types_summary for the types this catalog covers.`,
      );
    }
    const orgId = scopeType.organization_id;
    const org = selectFullContextOrganizations(state)?.find(
      (candidate) => candidate.id === orgId,
    );
    if (!org) {
      throw new Error(
        `${target}: organization "${orgId}" is not among the viewer's organizations.`,
      );
    }
    if (!canManageSettings(org.role as OrgRole)) {
      throw new Error(
        `${target}: the viewer's role in "${org.name}" cannot edit context items (manageable_organization_ids does not include ${orgId}). Propose the change to the user instead.`,
      );
    }
  }

  /**
   * Persist a patch through the canonical thunk, then CHECK the row the server
   * returned actually carries what we asked for — a rejection throws out of
   * `.unwrap()`, but a silently-dropped column would not.
   */
  async function saveItemPatch(
    item: ContextItem,
    patch: Parameters<typeof updateContextItem>[0],
    expected: Partial<Record<keyof ContextItem, unknown>>,
    target: string,
  ): Promise<void> {
    const updated = await dispatch(updateContextItem(patch)).unwrap();
    for (const [field, want] of Object.entries(expected)) {
      const got = (updated as unknown as Record<string, unknown>)[field];
      const same = Array.isArray(want)
        ? Array.isArray(got) &&
          got.length === want.length &&
          want.every((entry, index) => entry === got[index])
        : got === want;
      if (!same) {
        throw new Error(
          `${target}: the server did not store ${field} — it still reads ${JSON.stringify(
            got,
          )}. Nothing was changed on screen.`,
        );
      }
    }
    // Same refresh the edit sheet does after its own save, so the catalog (and
    // the read twin the agent reads back) reflects the write.
    void dispatch(listScopeTypeItems(item.scope_type_id));
  }

  useSurfaceWriteHandlers(CONTEXT_ITEMS_SURFACE_NAME, {
    context_item_copy: async (value: unknown) => {
      const target = "context_item_copy";
      const obj = asRecord(value, target);
      const itemId = requiredId(obj, "item_id", target);
      const displayName = optionalText(obj, "display_name", target);
      const description = optionalText(obj, "description", target);
      if (displayName === undefined && description === undefined) {
        throw new Error(
          `${target}: provide display_name and/or description.`,
        );
      }
      if (displayName !== undefined && !displayName) {
        throw new Error(
          `${target}: display_name must be a non-empty string — the editor refuses to save a field with no name. Omit the key to leave it unchanged.`,
        );
      }
      const item = resolveItem(itemId, target);
      await saveItemPatch(
        item,
        {
          id: item.id,
          ...(displayName !== undefined ? { display_name: displayName } : {}),
          ...(description !== undefined ? { description } : {}),
        },
        {
          ...(displayName !== undefined ? { display_name: displayName } : {}),
          ...(description !== undefined ? { description } : {}),
        },
        target,
      );
    },

    context_item_category: async (value: unknown) => {
      const target = "context_item_category";
      const obj = asRecord(value, target);
      const itemId = requiredId(obj, "item_id", target);
      if (!("category" in obj)) {
        throw new Error(
          `${target}: category is required — pass null (or "") to clear it.`,
        );
      }
      const category = nullableText(obj, "category", target);
      const item = resolveItem(itemId, target);
      await saveItemPatch(
        item,
        { id: item.id, category },
        { category },
        target,
      );
    },

    context_item_tags: async (value: unknown) => {
      const target = "context_item_tags";
      const obj = asRecord(value, target);
      const itemId = requiredId(obj, "item_id", target);
      const raw = obj.tags;
      if (!Array.isArray(raw)) {
        throw new Error(
          `${target}: tags must be an array of strings (an empty array clears every tag).`,
        );
      }
      const tags: string[] = [];
      for (const [index, entry] of raw.entries()) {
        if (typeof entry !== "string") {
          throw new Error(`${target}: tags[${index}] must be a string.`);
        }
        const tag = normaliseTag(entry);
        if (tag && !tags.includes(tag)) tags.push(tag);
      }
      const item = resolveItem(itemId, target);
      await saveItemPatch(item, { id: item.id, tags }, { tags }, target);
    },

    context_item_status_note: async (value: unknown) => {
      const target = "context_item_status_note";
      const obj = asRecord(value, target);
      const itemId = requiredId(obj, "item_id", target);
      if (!("status_note" in obj)) {
        throw new Error(
          `${target}: status_note is required — pass null (or "") to clear it.`,
        );
      }
      const statusNote = nullableText(obj, "status_note", target);
      const item = resolveItem(itemId, target);
      await saveItemPatch(
        item,
        { id: item.id, status_note: statusNote },
        { status_note: statusNote },
        target,
      );
    },

    add_context_items: async (value: unknown) => {
      const target = "add_context_items";
      const obj = asRecord(value, target);
      const scopeTypeId = requiredId(obj, "scope_type_id", target);
      const rawItems = obj.items;
      if (!Array.isArray(rawItems) || rawItems.length === 0) {
        throw new Error(
          `${target}: items must be a non-empty array of { display_name, description?, category?, value_type? }.`,
        );
      }

      const state = store.getState() as RootState;
      assertCanManageScopeType(state, scopeTypeId, target);
      if (!selectItemsLoadedForType(state, scopeTypeId)) {
        throw new Error(
          `${target}: the field list for scope type "${scopeTypeId}" has not loaded yet, so an existing field of the same name cannot be ruled out. Sections load lazily — check loaded_scope_type_ids and try again once it appears.`,
        );
      }

      // Derive the key the way the add form derives it, and refuse a
      // collision rather than minting a duplicate field.
      const existingKeys = new Set(
        selectItemsByType(state, scopeTypeId).map((entry) => entry.key),
      );
      const parsed = rawItems.map((entry, index) => {
        const record = asRecord(entry, `${target}: items[${index}]`);
        const displayName = optionalText(
          record,
          "display_name",
          `${target}: items[${index}]`,
        );
        if (!displayName) {
          throw new Error(
            `${target}: items[${index}].display_name must be a non-empty string.`,
          );
        }
        const rawType = record.value_type;
        if (
          rawType !== undefined &&
          (typeof rawType !== "string" ||
            !AGENT_WRITABLE_VALUE_TYPES.includes(
              rawType as (typeof AGENT_WRITABLE_VALUE_TYPES)[number],
            ))
        ) {
          throw new Error(
            `${target}: items[${index}].value_type must be one of ${AGENT_WRITABLE_VALUE_TYPES.join(
              " | ",
            )}, got ${JSON.stringify(rawType)}.`,
          );
        }
        const key = slugifyKey(displayName) || displayName.toLowerCase();
        if (existingKeys.has(key)) {
          throw new Error(
            `${target}: items[${index}] "${displayName}" resolves to key "${key}", which this scope type already defines. Rename it, or edit the existing field with context_item_copy.`,
          );
        }
        existingKeys.add(key);
        return {
          key,
          display_name: displayName,
          description: optionalText(
            record,
            "description",
            `${target}: items[${index}]`,
          ),
          category: optionalText(
            record,
            "category",
            `${target}: items[${index}]`,
          ),
          value_type: (rawType as ContextValueType | undefined) ?? "string",
        };
      });

      // Sequential, not parallel: the create RPC assigns sort_order from the
      // current tail, so concurrent creates would collide on ordering.
      for (const entry of parsed) {
        await dispatch(
          createContextItem({
            scope_type_id: scopeTypeId,
            key: entry.key,
            display_name: entry.display_name,
            value_type: entry.value_type,
            description: entry.description || undefined,
            category: entry.category || undefined,
          }),
        ).unwrap();
      }
      void dispatch(listScopeTypeItems(scopeTypeId));
    },
  });

  return null;
}
