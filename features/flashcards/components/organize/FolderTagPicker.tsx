"use client";

// features/flashcards/components/organize/FolderTagPicker.tsx
//
// Phase 1A (Flashcards Competitive Parity Push) — folders/tags for flashcard
// sets. Per the plan: extend the ALREADY-MODELED `EDGE_ROLE.theme` association
// edge (fc_set → category) rather than add a new table. Folders and tags are
// the SAME primitive here (a `platform.categories` row under the
// `flashcard-folder` dimension, attached via a `theme` edge) — the only
// difference from Quizlet's two concepts is navigational, not structural, and
// keeping one system avoids a second parallel taxonomy.
//
// Reads/writes go through the canonical `useCategories` (category nouns) +
// `useAssociations` (assignment edges) hooks — never a bespoke table or a
// direct `associationsService` call from a component.

import { useState } from "react";
import { Check, ChevronsUpDown, FolderPlus, Loader2, X } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { useCategories } from "@/features/scopes/hooks/useCategories";
import { useAssociations } from "@/features/scopes/hooks/useAssociations";
import { CATEGORY_DIMENSIONS } from "@/features/scopes/categoryDimensions";
import { EDGE_ROLE } from "@/features/flashcards/data/types";
import { ensureOrgId } from "@/lib/organizations/personalOrg";

const DIMENSION = CATEGORY_DIMENSIONS.flashcardFolder;

/** The set's currently-attached folder/tag category ids, derived from its edges. */
export function useSetFolderIds(setId: string | null): {
  folderIds: string[];
  loading: boolean;
} {
  const { edges, status } = useAssociations({ type: "fc_set", id: setId });
  const folderIds = edges
    .filter(
      (e) =>
        e.direction === "outgoing" &&
        e.otherType === "category" &&
        e.role === EDGE_ROLE.theme,
    )
    .map((e) => e.otherId);
  return { folderIds, loading: status === "loading" || status === "idle" };
}

/**
 * Multi-select combobox: pick existing folders/tags for one flashcard set, or
 * create a new one inline. Fully self-contained — mount it once per set (edit
 * page) and it reads/writes the theme edges itself.
 */
export function FolderTagPicker({ setId }: { setId: string }) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const { categories, create: createCategory, reload: reloadCategories } =
    useCategories({ dimension: DIMENSION });
  const { edges, setTargets } = useAssociations({
    type: "fc_set",
    id: setId,
  });

  const selectedIds = new Set(
    edges
      .filter(
        (e) =>
          e.direction === "outgoing" &&
          e.otherType === "category" &&
          e.role === EDGE_ROLE.theme,
      )
      .map((e) => e.otherId),
  );
  const selected = categories.filter((c) => selectedIds.has(c.id));

  const toggle = async (categoryId: string) => {
    const next = selectedIds.has(categoryId)
      ? [...selectedIds].filter((id) => id !== categoryId)
      : [...selectedIds, categoryId];
    const res = await setTargets({
      targetType: "category",
      targetIds: next,
      role: EDGE_ROLE.theme,
    });
    if (!res.ok) {
      console.error("[FolderTagPicker] setTargets failed:", res.error);
    }
  };

  const createAndAttach = async () => {
    const name = search.trim();
    if (!name) return;
    setCreating(true);
    try {
      const orgId = await ensureOrgId(null);
      const createRes = await createCategory({ name, orgId });
      if (!createRes.ok || !createRes.id) {
        console.error("[FolderTagPicker] create failed:", createRes);
        return;
      }
      await reloadCategories();
      await toggle(createRes.id);
      setSearch("");
    } finally {
      setCreating(false);
    }
  };

  const filtered = categories.filter((c) =>
    c.name.toLowerCase().includes(search.trim().toLowerCase()),
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
          {c.name}
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
            <FolderPlus className="h-3.5 w-3.5" />
            {selected.length === 0 ? "Add folder / tag" : "Edit"}
            <ChevronsUpDown className="h-3 w-3 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search or create..."
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty className="px-2 py-3 text-xs text-muted-foreground">
                {search.trim() ? "No matching folder/tag." : "No folders yet."}
              </CommandEmpty>
              <CommandGroup>
                {filtered.map((c) => (
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
              {search.trim() && !exactMatch ? (
                <CommandGroup>
                  <CommandItem
                    value={`__create__${search}`}
                    onSelect={() => void createAndAttach()}
                    disabled={creating}
                    className="text-xs text-primary"
                  >
                    {creating ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FolderPlus className="mr-2 h-3.5 w-3.5" />
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
