"use client";

/**
 * P23 — EVERY PICKER TAKES NEW INPUT.
 *
 * Arman, 2026-08-23: "We have to annihilate the UIs that offer options but
 * don't allow custom entry because those are the ones that lose the platform
 * the best users… the moment I went in to assign a tier, I got a pop up that
 * forced me to choose from the shitty options I had in front of me. So instead
 * of our system getting significantly better because I took the initiative to
 * add something, our system was too arrogant and cocky and didn't want my
 * opinion. … It's the lazy coding agent who builds a popover with a drop down,
 * but is too lazy to include an add feature."
 *
 * THIS COMPONENT IS THE ANSWER, and it is the ONLY shape a keyword-system
 * choice control may take. Type-ahead over the existing options, and whatever
 * you typed that matched nothing is offered back as "Create «what you typed»".
 * One click turns it into a real row through the feature's ONE write path and
 * selects it — never a second creation path, never a "go somewhere else first".
 *
 * P11 — THE ONE EXCEPTION, AND IT IS NEVER A DEAD END. A platform-shared
 * vocabulary (traffic classes, the platform dimensions every tenant shares) is
 * governed centrally, so this control does not pretend it can widen it. It SAYS
 * so and offers the door instead: `lockedNote` + `lockedAction` render a
 * footer that takes the person to "make this your own dimension".
 *
 * SoR: common-docs/systems/marketing/seo/seo-keywords/keyword-system-decisions.md
 * (P23, P11) + value-system.md § THE ASSIGNMENT LAYER.
 */

import { useState, type ReactNode } from "react";
import { Check, ChevronsUpDown, Loader2, Lock, Plus } from "lucide-react";
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
import { cn } from "@/styles/themes/utils";

export interface CreatableOption {
  value: string;
  label: string;
  /** Right-aligned detail — a count, a description, "yours". */
  hint?: string;
  /** Rendered instead of the plain label (a band chip, a coloured pill). */
  render?: ReactNode;
  /** Extra words the type-ahead should match on. */
  keywords?: string;
}

export function CreatablePicker({
  value,
  options,
  onSelect,
  placeholder,
  searchPlaceholder,
  /** The noun in "Add a level…" / "Create «x»". Always a person's word. */
  noun,
  /**
   * Turns typed text into a real row and returns the option value to select.
   * Return null when the caller handled it another way (opened a dialog that
   * needs more than a name — a level needs a threshold).
   */
  onCreate,
  /**
   * Creating this noun needs more than a name, so the picker hands the typed
   * text to the caller's dialog instead of writing anything itself.
   */
  onCreateRequiresMore,
  disabled,
  loading,
  className,
  triggerClassName,
  emptyLabel = "No match.",
  ariaLabel,
  /** P11: a sentence saying this vocabulary is platform-governed. */
  lockedNote,
  /** P11: the door out of that refusal — never leave them with only "no". */
  lockedAction,
  size = "sm",
}: {
  value: string | null;
  options: CreatableOption[];
  onSelect: (value: string) => void;
  placeholder: string;
  searchPlaceholder?: string;
  noun: string;
  onCreate?: (typed: string) => Promise<string | null>;
  onCreateRequiresMore?: (typed: string) => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  triggerClassName?: string;
  emptyLabel?: string;
  ariaLabel?: string;
  lockedNote?: string;
  lockedAction?: { label: string; onSelect: () => void };
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const selected = options.find((option) => option.value === value) ?? null;
  const typed = query.trim();
  const exactMatch = options.some(
    (option) => option.label.toLowerCase() === typed.toLowerCase(),
  );
  const canCreate = Boolean(onCreate ?? onCreateRequiresMore) && !lockedNote;

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  const create = async (text: string) => {
    const name = text.trim();
    if (busy) return;
    if (onCreateRequiresMore) {
      close();
      onCreateRequiresMore(name);
      return;
    }
    if (!onCreate || !name) return;
    setBusy(true);
    try {
      const next = await onCreate(name);
      if (next) onSelect(next);
      close();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          aria-label={ariaLabel ?? placeholder}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-left shadow-xs transition-colors",
            "hover:border-primary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
            size === "sm" ? "h-8 text-xs" : "h-9 text-sm",
            className,
            triggerClassName,
          )}
        >
          <span className="min-w-0 flex-1 truncate">
            {selected ? (
              (selected.render ?? selected.label)
            ) : (
              <span className="text-muted-foreground">
                {loading ? "Loading…" : placeholder}
              </span>
            )}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[--radix-popover-trigger-width] min-w-56 p-0">
        <Command
          filter={(itemValue, search, keywords) => {
            const haystack = `${itemValue} ${keywords?.join(" ") ?? ""}`.toLowerCase();
            return haystack.includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={searchPlaceholder ?? `Search or add a ${noun}…`}
          />
          <CommandList>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            {options.length > 0 ? (
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    keywords={option.keywords ? [option.keywords] : undefined}
                    onSelect={() => {
                      onSelect(option.value);
                      close();
                    }}
                    className="gap-2 text-xs"
                  >
                    <Check
                      className={cn(
                        "size-3.5 shrink-0",
                        option.value === value ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {option.render ?? option.label}
                    </span>
                    {option.hint ? (
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {option.hint}
                      </span>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>

          {/* The "+ Add" footer sits OUTSIDE CommandList so the search can
              never hide the one thing the person came here to do (P23). */}
          {canCreate ? (
            <div className="border-t border-border p-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => void create(typed)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="size-3.5 shrink-0 animate-spin" />
                ) : (
                  <Plus className="size-3.5 shrink-0" />
                )}
                <span className="min-w-0 truncate">
                  {typed && !exactMatch
                    ? `Create “${typed}”`
                    : `Add a ${noun}…`}
                </span>
              </button>
            </div>
          ) : null}

          {/* P11 — shared vocabulary. Say it, then hand them the door. */}
          {lockedNote ? (
            <div className="space-y-1 border-t border-border p-2">
              <p className="flex gap-1.5 text-[11px] leading-snug text-muted-foreground">
                <Lock className="mt-px size-3 shrink-0" />
                <span>{lockedNote}</span>
              </p>
              {lockedAction ? (
                <button
                  type="button"
                  onClick={() => {
                    close();
                    lockedAction.onSelect();
                  }}
                  className="flex w-full items-center gap-2 rounded-sm px-1 py-1 text-left text-xs font-medium text-primary transition-colors hover:bg-accent"
                >
                  <Plus className="size-3.5 shrink-0" />
                  <span className="min-w-0 truncate">{lockedAction.label}</span>
                </button>
              ) : null}
            </div>
          ) : null}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
