"use client";

// features/scopes/components/CategoryTagPicker.tsx
//
// THE multi-select picker that tags an entity with `platform.categories` rows
// through the canonical association edge (`entity → category`, one typed edge
// role per use). The generic form of the flashcards FolderTagPicker — that
// component is now a thin wrapper over this one, and CRM party roles consume
// it directly. Never fork a per-feature tag picker.
//
// Reads/writes go through the canonical `useCategories` (category nouns) +
// `useAssociations` (assignment edges) hooks — never a bespoke table or a
// direct `associationsService` call.
//
// EDGE SEMANTICS: `setTargets` replaces ALL of this entity's category edges
// carrying `edgeRole`. To keep edges from OTHER dimensions that share the same
// role intact, the toggle set starts from every current category edge with
// this role (not just this dimension's) — same contract FolderTagPicker
// established. Prefer a distinct edge role per dimension when registering
// association pairs.

import { useState } from "react";
import {
  Check,
  ChevronsUpDown,
  CornerDownRight,
  Loader2,
  Tag,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useCategories } from "@/features/scopes/hooks/useCategories";
import { useAssociations } from "@/features/scopes/hooks/useAssociations";
import type { CategoryDimension } from "@/features/scopes/types";
import { buildCategoryHierarchy } from "@/features/scopes/utils/categoryHierarchy";
import { ensureOrgId } from "@/lib/organizations/personalOrg";

const ROOT_PARENT = "__root__";

export interface CategoryTagPickerProps {
  /** The tagged entity's registered association type (e.g. "fc_set", "party"). */
  entityType: string;
  entityId: string;
  /** The `platform.categories` facet the picker offers. */
  dimension: CategoryDimension;
  /** The typed edge role the assignment edges carry (e.g. "theme", "member"). */
  edgeRole: string;
  /**
   * Org for the edge write and for inline-created categories. Defaults to the
   * caller's personal org — pass the owning entity's org when it has one.
   */
  orgId?: string | null;
  /** Trigger label while nothing is selected. */
  addLabel?: string;
  /** Trigger icon. */
  icon?: LucideIcon;
  /** Offer "Create <term>" for unmatched search terms. Default true. */
  allowCreate?: boolean;
  /**
   * Force the two-level face on or off. Omit to detect it from parentId rows,
   * which leaves every existing flat facet visually unchanged.
   */
  hierarchical?: boolean;
  emptyText?: string;
}

/**
 * Multi-select combobox: badges for the entity's current tags in `dimension`,
 * a popover to toggle existing categories, optional inline create. Fully
 * self-contained — mount it once per entity and it reads/writes the edges.
 */
export function CategoryTagPicker({
  entityType,
  entityId,
  dimension,
  edgeRole,
  orgId,
  addLabel = "Add tag",
  icon: Icon = Tag,
  allowCreate = true,
  hierarchical,
  emptyText = "No categories yet.",
}: CategoryTagPickerProps) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  // Writes replace the full role-set from a render-time snapshot of the
  // edges, so overlapping toggles would silently drop the first change.
  // One write at a time.
  const [writing, setWriting] = useState(false);
  const [search, setSearch] = useState("");
  const [createParentId, setCreateParentId] = useState(ROOT_PARENT);
  const {
    categories,
    create: createCategory,
    reload: reloadCategories,
  } = useCategories({ dimension });
  const { edges, setTargets } = useAssociations({
    type: entityType,
    id: entityId,
  });
  const hierarchy = buildCategoryHierarchy(categories);
  const showHierarchy = hierarchical ?? hierarchy.hasHierarchy;
  const hierarchyById = new Map(
    hierarchy.items.map((item) => [item.category.id, item]),
  );

  // Every current category edge with this role — INCLUDING other dimensions'
  // (see EDGE SEMANTICS above); display intersects with this dimension.
  const selectedIds = new Set(
    edges
      .filter(
        (e) =>
          e.direction === "outgoing" &&
          e.otherType === "category" &&
          e.role === edgeRole,
      )
      .map((e) => e.otherId),
  );
  const selected = categories.filter((c) => selectedIds.has(c.id));

  const toggle = async (categoryId: string) => {
    if (writing) return;
    setWriting(true);
    try {
      const next = selectedIds.has(categoryId)
        ? [...selectedIds].filter((id) => id !== categoryId)
        : [...selectedIds, categoryId];
      const res = await setTargets({
        targetType: "category",
        targetIds: next,
        orgId: orgId ?? undefined,
        role: edgeRole,
      });
      if (!res.ok) {
        console.error("[CategoryTagPicker] setTargets failed:", res.error);
        toast.error(res.error ?? "Could not update categories");
      }
    } finally {
      setWriting(false);
    }
  };

  const createAndAttach = async () => {
    const name = search.trim();
    if (!name) return;
    setCreating(true);
    try {
      const resolvedOrgId = await ensureOrgId(orgId ?? null);
      const parentId =
        showHierarchy && createParentId !== ROOT_PARENT ? createParentId : null;
      const createRes = await createCategory({
        name,
        orgId: resolvedOrgId,
        parentId,
      });
      if (!createRes.ok || !createRes.id) {
        console.error("[CategoryTagPicker] create failed:", createRes);
        toast.error(createRes.error ?? "Could not create the category");
        return;
      }
      await reloadCategories();
      await toggle(createRes.id);
      setSearch("");
      setCreateParentId(ROOT_PARENT);
    } finally {
      setCreating(false);
    }
  };

  const filtered = categories.filter((c) =>
    c.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const filteredHierarchy = hierarchy.items.filter((item) =>
    item.displayName.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const exactMatch = categories.some(
    (c) => c.name.toLowerCase() === search.trim().toLowerCase(),
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selected.map((c) => (
        <Badge
          key={c.id}
          variant="secondary"
          className="gap-1 pr-1 text-xs font-medium"
        >
          {showHierarchy
            ? (hierarchyById.get(c.id)?.displayName ?? c.name)
            : c.name}
          <button
            type="button"
            onClick={() => void toggle(c.id)}
            className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
            aria-label={`Remove ${c.name}`}
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </Badge>
      ))}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
          >
            <Icon className="h-3.5 w-3.5" />
            {selected.length === 0 ? addLabel : "Edit"}
            <ChevronsUpDown className="h-3 w-3 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={allowCreate ? "Search or create..." : "Search..."}
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty className="px-2 py-3 text-xs text-muted-foreground">
                {search.trim() ? "No match." : emptyText}
              </CommandEmpty>
              <CommandGroup>
                {showHierarchy
                  ? filteredHierarchy.map(({ category, depth, parent }) => (
                      <CommandItem
                        key={category.id}
                        value={category.id}
                        keywords={parent ? [parent.name, category.name] : []}
                        onSelect={() => void toggle(category.id)}
                        className={cn("text-xs", depth === 1 && "pl-6")}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-3.5 w-3.5",
                            selectedIds.has(category.id)
                              ? "opacity-100"
                              : "opacity-0",
                          )}
                        />
                        {depth === 1 ? (
                          <CornerDownRight className="mr-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        ) : null}
                        <span className={cn(depth === 0 && "font-medium")}>
                          {category.name}
                        </span>
                      </CommandItem>
                    ))
                  : filtered.map((c) => (
                      <CommandItem
                        key={c.id}
                        value={c.id}
                        onSelect={() => void toggle(c.id)}
                        className="text-xs"
                      >
                        <Check
                          className={cn(
                            "mr-2 h-3.5 w-3.5",
                            selectedIds.has(c.id) ? "opacity-100" : "opacity-0",
                          )}
                        />
                        {c.name}
                      </CommandItem>
                    ))}
              </CommandGroup>
              {allowCreate && search.trim() && !exactMatch ? (
                <CommandGroup>
                  {showHierarchy ? (
                    <div className="space-y-1.5 px-2 pb-2">
                      <p className="text-[11px] font-medium text-muted-foreground">
                        Place in
                      </p>
                      <Select
                        value={createParentId}
                        onValueChange={setCreateParentId}
                      >
                        <SelectTrigger size="sm" className="bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ROOT_PARENT}>Top level</SelectItem>
                          {hierarchy.roots.map((root) => (
                            <SelectItem key={root.id} value={root.id}>
                              {root.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  <CommandItem
                    value={`__create__${search}`}
                    onSelect={() => void createAndAttach()}
                    disabled={creating}
                    className="text-xs text-primary"
                  >
                    {creating ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Icon className="mr-2 h-3.5 w-3.5" />
                    )}
                    Create &ldquo;{search.trim()}&rdquo;
                  </CommandItem>
                </CommandGroup>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
