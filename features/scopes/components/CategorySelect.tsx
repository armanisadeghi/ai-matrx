"use client";

// features/scopes/components/CategorySelect.tsx
//
// THE single-value picker over one `platform.categories` dimension. ONE
// component for every category anywhere in the app: pass the `dimension` and it
// renders that facet's categories, hierarchy and all. There is no per-feature
// copy and there must never be one — the rules do not change between features.
//
// Value is the category ID (the FK the consuming table stores), display is the
// category name. Reads and writes go through the canonical `useCategories`
// hook (`cat_list` / `cat_create`), never a bespoke query.
//
// 🚨 IT TAKES NEW INPUT (P23). Type a name that does not exist and it offers to
// create it, then selects it — because the moment someone wants to teach the
// system a category they did not have is the moment worth the most, and a
// picker that says "choose from these" instead is how the platform loses its
// best users. Its multi-select sibling `CategoryTagPicker` has always done
// this; the two were inconsistent for no reason, and now are not.
//
// Creating requires an explicitly selected organization — a new category
// belongs to that organization, never to a resolver default or the system set
// (those are platform-governed; `isSystem` rows are read-only here by design).

import { useState } from "react";
import { CornerDownRight } from "lucide-react";
import { toast } from "@/lib/toast";
import { CreatablePicker } from "@/components/ui/creatable-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCategories } from "@/features/scopes/hooks/useCategories";
import type { CategoryDimension } from "@/features/scopes/types";
import { buildCategoryHierarchy } from "@/features/scopes/utils/categoryHierarchy";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";

const NONE = "__none__";
const ROOT_PARENT = "__root__";

/** "category" → "categories", "stage" → "stages". Copy a person reads. */
function plural(noun: string): string {
  return /[^aeiou]y$/i.test(noun) ? `${noun.slice(0, -1)}ies` : `${noun}s`;
}

export function CategorySelect({
  dimension,
  value,
  onChange,
  placeholder,
  allowNone = true,
  disabled,
  /**
   * Offer "Create «what you typed»". On by default — a closed category list is
   * a defect, so turning this off needs a reason a person would accept.
   */
  allowCreate = true,
  /** Org for an inline-created category. Defaults to the active organization. */
  orgId,
  /** What one of these is called, for the create affordance ("stage", "folder"). */
  noun = "category",
}: {
  dimension: CategoryDimension;
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder: string;
  allowNone?: boolean;
  disabled?: boolean;
  allowCreate?: boolean;
  orgId?: string | null;
  noun?: string;
}) {
  const selectedOrganizationId = useAppSelector(selectOrganizationId);
  const {
    categories,
    status,
    error,
    create: createCategory,
    reload,
  } = useCategories({ dimension });
  const hierarchy = buildCategoryHierarchy(categories);
  const [createParentId, setCreateParentId] = useState<string>(ROOT_PARENT);

  const options = [
    ...(allowNone
      ? [{ value: NONE, label: "None", keywords: "none clear empty" }]
      : []),
    ...(hierarchy.hasHierarchy
      ? hierarchy.items.map(({ category, depth, parent }) => ({
          value: category.id,
          label: category.name,
          // The type-ahead matches the parent's name too, so someone who knows
          // the branch but not the leaf still finds it.
          keywords: parent ? parent.name : "",
          render:
            depth === 0 ? (
              <span className="font-medium">{category.name}</span>
            ) : (
              <span className="flex items-center gap-1.5 pl-3 text-muted-foreground">
                <CornerDownRight className="h-3.5 w-3.5 shrink-0" />
                <span className="text-foreground">{category.name}</span>
              </span>
            ),
        }))
      : categories.map((category) => ({
          value: category.id,
          label: category.name,
        }))),
  ];

  const selected = value
    ? (hierarchy.items.find((item) => item.category.id === value)?.displayName ??
      categories.find((category) => category.id === value)?.name ??
      null)
    : null;

  const create = async (typed: string): Promise<string | null> => {
    const name = typed.trim();
    if (!name) return null;
    // Typing a name that already exists selects it rather than making a twin.
    const existing = categories.find(
      (category) => category.name.toLowerCase() === name.toLowerCase(),
    );
    if (existing) return existing.id;

    const resolvedOrgId = orgId ?? selectedOrganizationId;
    if (!resolvedOrgId) {
      toast.error(`Select an organization before creating a ${noun}.`);
      return null;
    }
    const parentId =
      hierarchy.hasHierarchy && createParentId !== ROOT_PARENT
        ? createParentId
        : null;
    const result = await createCategory({ name, orgId: resolvedOrgId, parentId });
    if (!result.ok || !result.id) {
      toast.error(`Couldn't create that ${noun}`, {
        description: result.error ?? undefined,
      });
      return null;
    }
    await reload();
    setCreateParentId(ROOT_PARENT);
    const under = parentId
      ? categories.find((category) => category.id === parentId)?.name
      : null;
    toast.success(`“${name}” is now one of your ${plural(noun)}`, {
      description: under
        ? `It sits under ${under}, and every screen that offers ${plural(noun)} offers it.`
        : `Every screen that offers ${plural(noun)} offers it from now on.`,
    });
    return result.id;
  };

  return (
    <div>
      <CreatablePicker
        value={value ?? (allowNone ? NONE : null)}
        onSelect={(next) => onChange(next === NONE ? null : next)}
        options={options}
        placeholder={placeholder}
        searchPlaceholder={
          allowCreate ? `Search or add a ${noun}…` : `Search ${plural(noun)}…`
        }
        noun={noun}
        ariaLabel={placeholder}
        // The old control was h-8/text-sm; keeping it means none of the twelve
        // consuming forms shift when they pick this up.
        className="text-sm"
        disabled={disabled}
        loading={status === "loading"}
        emptyLabel={`No ${noun} matches that.`}
        onCreate={allowCreate ? create : undefined}
        createExtra={
          allowCreate && hierarchy.hasHierarchy ? (
            <Select value={createParentId} onValueChange={setCreateParentId}>
              <SelectTrigger
                className="h-7 text-xs"
                aria-label={`Put the new ${noun} under`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ROOT_PARENT} className="text-xs">
                  Top level
                </SelectItem>
                {hierarchy.items
                  .filter((item) => item.depth === 0)
                  .map((item) => (
                    <SelectItem
                      key={item.category.id}
                      value={item.category.id}
                      className="text-xs"
                    >
                      Under {item.category.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          ) : undefined
        }
      />
      {selected === null && value !== null ? (
        // A stored id whose row this reader cannot see is not "nothing chosen":
        // saying so beats a blank box that looks like an unsaved field.
        <p className="mt-1 text-xs text-muted-foreground">
          This {noun} is no longer available to you.
        </p>
      ) : null}
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
