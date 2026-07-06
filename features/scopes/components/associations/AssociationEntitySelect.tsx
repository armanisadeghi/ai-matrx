"use client";

// features/scopes/components/associations/AssociationEntitySelect.tsx
//
// The canonical "name dropdown" for one kind of associated entity on a
// container — ONE compact control that handles every aspect of the name:
//
//   1. DISPLAY   — the active entity's real name (registry icon beside it)
//   2. RENAME    — click (or double-click) the name to edit it inline
//   3. SWITCH    — a chevron opens the full list of associated entities,
//                  searchable, with the active one checked
//   4. ADD NEW   — the list ends with "+ New <Entity>"; the user types a name
//                  and the new entity is created, associated to the container,
//                  and made active
//   5. REMOVE    — non-active rows offer an unlink X (when the adapter
//                  supports detach)
//
// The dropdown is ALWAYS available — even with a single (or zero) entities —
// so "add another" is never hidden. Registry-driven (icon/labels from
// `getEntityInfo`), Redux-free, and adapter-driven: pass the default
// `useAssociationEntitySelectAdapter` for plain platform.associations
// containers, or a bespoke adapter when the surface has its own lifecycle
// (e.g. war-room threads with is_active edge metadata).

import { useState } from "react";
import { Check, ChevronDown, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
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
import { EditableLabel } from "@/components/official/item/EditableLabel";
import { getEntityInfo } from "@/features/scopes/registry/entityRegistry";
import type { EntityTypeToken } from "@/types/generated/entity-types.generated";
import { cn } from "@/lib/utils";

export interface AssociationEntitySelectItem {
  id: string;
  title: string;
}

/**
 * The read/write seam. `useAssociationEntitySelectAdapter` is the default
 * (plain associations container); surfaces with bespoke active/create
 * semantics implement it themselves — same pattern as AssociationList's
 * ContainerResourcesAdapter.
 */
export interface AssociationEntitySelectAdapter {
  /** True while the association list is still hydrating. */
  loading: boolean;
  /** Every entity of this token associated with the container. */
  items: AssociationEntitySelectItem[];
  activeId: string | null;
  setActive: (id: string) => void | Promise<unknown>;
  /**
   * Create a new entity named `title`, associate it to the container, and
   * make it active. Resolves to the new id, or null on failure (the adapter
   * reports its own error detail; the component toasts generically).
   */
  createAndAttach: (title: string) => Promise<string | null>;
  /** Rename the entity (its real title column). Resolves false on failure. */
  rename: (id: string, title: string) => Promise<boolean>;
  /** Optional: unlink an entity from the container (never deletes the row). */
  detach?: (id: string) => Promise<unknown>;
}

export interface AssociationEntitySelectProps {
  token: EntityTypeToken;
  adapter: AssociationEntitySelectAdapter;
  className?: string;
  /** Label sizing/typography override (defaults to toolbar-dense text-xs). */
  labelClassName?: string;
  align?: "start" | "end";
  showIcon?: boolean;
  /** How the name enters inline edit. Default "click". */
  renameActivation?: "click" | "doubleClick";
  /** Shown while no entity is active yet. Defaults to the plural label. */
  emptyLabel?: string;
  /** Icon color accent (e.g. "text-yellow-500" for notes). */
  iconClassName?: string;
}

export function AssociationEntitySelect({
  token,
  adapter,
  className,
  labelClassName,
  align = "end",
  showIcon = true,
  renameActivation = "click",
  emptyLabel,
  iconClassName,
}: AssociationEntitySelectProps) {
  const info = getEntityInfo(token);
  const { items, activeId } = adapter;
  const active = items.find((i) => i.id === activeId) ?? null;
  const activeIndex = active ? items.indexOf(active) : -1;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [busy, setBusy] = useState(false);

  const entityLabel = info.label.toLowerCase();
  const close = () => {
    setOpen(false);
    setQuery("");
    setCreating(false);
    setDraftName("");
  };

  const create = async (title: string) => {
    const name = title.trim();
    if (!name || busy) return;
    setBusy(true);
    const id = await adapter.createAndAttach(name);
    setBusy(false);
    if (id) close();
    else toast.error(`Couldn't create the ${entityLabel}`);
  };

  return (
    <div className={cn("flex min-w-0 items-center gap-0.5", className)}>
      {showIcon ? (
        <info.Icon
          className={cn("size-3.5 shrink-0", iconClassName ?? "text-muted-foreground")}
          aria-hidden
        />
      ) : null}

      {active ? (
        <EditableLabel
          value={active.title}
          onCommit={async (next) => {
            const ok = await adapter.rename(active.id, next);
            if (!ok) {
              toast.error(`Couldn't rename the ${entityLabel}`);
              throw new Error("rename failed");
            }
          }}
          commitMode="await"
          activation={renameActivation}
          ariaLabel={info.label}
          className={cn("max-w-[14rem]", labelClassName)}
          displayClassName="text-xs font-medium text-foreground"
          inputClassName="text-xs font-medium"
        />
      ) : (
        <span
          className={cn(
            "truncate px-1 text-xs font-medium text-muted-foreground",
            labelClassName,
          )}
        >
          {adapter.loading ? "…" : (emptyLabel ?? info.labelPlural)}
        </span>
      )}

      <Popover
        open={open}
        onOpenChange={(next) => (next ? setOpen(true) : close())}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex h-6 shrink-0 items-center gap-0.5 rounded-md px-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title={`Switch or add ${info.labelPlural.toLowerCase()}`}
            aria-label={`Switch or add ${info.labelPlural.toLowerCase()}`}
          >
            {items.length > 1 ? (
              <span className="tabular-nums">
                {activeIndex >= 0 ? activeIndex + 1 : "—"}/{items.length}
              </span>
            ) : null}
            <ChevronDown className="size-3 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-60 p-0" align={align}>
          <Command>
            {items.length > 5 ? (
              <CommandInput
                value={query}
                onValueChange={setQuery}
                placeholder={`Search ${info.labelPlural.toLowerCase()}…`}
              />
            ) : null}
            <CommandList>
              <CommandEmpty>No match.</CommandEmpty>
              {items.length > 0 ? (
                <CommandGroup>
                  {items.map((item) => (
                    <CommandItem
                      key={item.id}
                      value={`${item.title} ${item.id}`}
                      onSelect={() => {
                        if (item.id !== activeId) void adapter.setActive(item.id);
                        close();
                      }}
                      className="group gap-2"
                    >
                      <Check
                        className={cn(
                          "size-3.5 shrink-0",
                          item.id === activeId ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                      {adapter.detach && item.id !== activeId ? (
                        <button
                          type="button"
                          onPointerDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            void adapter.detach?.(item.id);
                          }}
                          className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-destructive group-hover:opacity-100"
                          title={`Remove this ${entityLabel} from here (does not delete it)`}
                          aria-label={`Remove ${item.title}`}
                        >
                          <X className="size-3" />
                        </button>
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
            </CommandList>

            {/* Create footer — outside CommandList so search never hides it. */}
            <div className="border-t border-border p-1">
              {creating ? (
                <div className="flex items-center gap-1 px-1 py-0.5">
                  <input
                    autoFocus
                    type="text"
                    value={draftName}
                    disabled={busy}
                    placeholder={`New ${entityLabel} name…`}
                    onChange={(e) => setDraftName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void create(draftName);
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        e.stopPropagation();
                        setCreating(false);
                        setDraftName("");
                      }
                    }}
                    className="h-6 w-full min-w-0 rounded-sm bg-transparent px-1 text-base outline-none focus:bg-background focus:ring-1 focus:ring-ring md:text-xs"
                    aria-label={`New ${entityLabel} name`}
                  />
                  <button
                    type="button"
                    disabled={busy || !draftName.trim()}
                    onClick={() => void create(draftName)}
                    className="inline-flex h-6 shrink-0 items-center rounded-md px-1.5 text-[10px] font-medium text-primary transition-colors hover:bg-accent disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="size-3 animate-spin" /> : "Create"}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    // A typed search that matched nothing doubles as the new
                    // name — one click instead of retyping it.
                    if (query.trim()) void create(query);
                    else setCreating(true);
                  }}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {busy ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Plus className="size-3.5" />
                  )}
                  {query.trim()
                    ? `Create "${query.trim()}"`
                    : `New ${info.label}`}
                </button>
              )}
            </div>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
