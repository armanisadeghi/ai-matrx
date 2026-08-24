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
 * WHERE THIS LIVES. It started inside the keyword system and was promoted here
 * because the law is not a keyword-system law: any control offering a set of
 * choices takes new input, so the shape belongs beside the other primitives and
 * not inside one feature. `CategorySelect` (features/scopes) is the other
 * canonical consumer.
 *
 * It knows nothing about any vocabulary. The caller supplies the options and
 * ONE `onCreate` that writes through whatever the canonical path for that
 * vocabulary already is — this component must never grow a write path of its
 * own, or it becomes the second one.
 *
 * SoR: common-docs/systems/marketing/seo/seo-keywords/keyword-system-decisions.md
 * (P23, P11) + value-system.md § THE ASSIGNMENT LAYER.
 */

import { useRef, useState, type ReactNode } from "react";
import {
  Check,
  ChevronsUpDown,
  ExternalLink,
  Loader2,
  Lock,
  Plus,
  type LucideIcon,
} from "lucide-react";
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

/**
 * "Add a offering…" is the kind of small wrongness that makes a product feel
 * unfinished, and the noun is caller-supplied so the article has to be derived.
 */
function article(noun: string): string {
  return /^[aeiou]/i.test(noun.trim()) ? `an ${noun}` : `a ${noun}`;
}

export interface CreatableOption {
  value: string;
  label: string;
  /** Right-aligned detail — a count, a description, "yours". */
  hint?: string;
  /** Rendered instead of the plain label (a band chip, a coloured pill). */
  render?: ReactNode;
  /** Extra words the type-ahead should match on. */
  keywords?: string;
  /**
   * The heading this option files under. Options keep the caller's order; a
   * group is opened the first time an option names it. Omit on every option
   * for a single ungrouped list.
   *
   * THE CATALOG IS NOT A WALL (Arman, 2026-08-24, on being shown offerings
   * that were not his): a set that legitimately holds more than this tenant's
   * own rows says so with a heading instead of hiding the rest.
   */
  group?: string;
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
  /**
   * Rendered inside the create footer, above the create button — for the one
   * extra choice a vocabulary needs at creation time (a category's parent, say).
   * It is a SLOT, not a second write path: whatever it collects is read by the
   * caller's own `onCreate`.
   */
  createExtra,
  /**
   * THE MANAGE DOOR. Arman, 2026-08-24: "where we have 'add' we should also
   * have a 'manage' button that opens that thing in a new tab." A control that
   * names a vocabulary must also be able to reach the place that vocabulary is
   * governed — otherwise the person who wants to rename, re-parent, or retire
   * an option has to go hunting for a screen they may not know exists.
   *
   * It opens in a NEW TAB on purpose: nobody loses the row they were editing
   * in order to go look at the catalog.
   */
  manageAction,
  /**
   * Doors to a DIFFERENT answer than this vocabulary can give. The offering
   * picker's "this isn't something we offer" lives here, because that ruling
   * is a traffic class, not an offering — and sending someone to look for
   * another column on their own is the dead end this slot exists to close.
   */
  footerActions,
  /**
   * What the TRIGGER shows for the current selection, when the caller wants
   * something other than the option row's own `render`. A dense table cell
   * needs one compact line ("Data Destruction Services · ITAD"); the list row
   * it came from is indented and annotated. Same selection, two jobs.
   */
  renderSelected,
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
  createExtra?: ReactNode;
  manageAction?: { label: string; href: string };
  footerActions?: Array<{
    label: string;
    icon?: LucideIcon;
    onSelect: () => void;
    /** A sentence under the door saying what it does, when it needs one. */
    note?: string;
  }>;
  renderSelected?: ReactNode;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  /**
   * THE FOOTER IS NEVER A DEAD CLICK. Arman, 2026-08-24: "one of the options is
   * to allow you to add. When I click add offering, however, nothing happens."
   * He was right, and the cause was here, not in the popover: with nothing
   * typed, `create("")` fell straight out of `if (!name) return` and the
   * button ate the click in silence. A control whose whole purpose is P23 may
   * not be the control that ignores you — so an empty "Add…" now puts the
   * cursor in the box and SAYS what it wants.
   */
  const inputRef = useRef<HTMLInputElement>(null);
  const [needsName, setNeedsName] = useState(false);

  const selected = options.find((option) => option.value === value) ?? null;

  // Caller order is the order. A heading opens the first time an option names
  // it, so a tree stays in tree order inside its own heading.
  const groups: Array<{ heading?: string; options: CreatableOption[] }> = [];
  for (const option of options) {
    const last = groups[groups.length - 1];
    if (last && last.heading === option.group) last.options.push(option);
    else groups.push({ heading: option.group, options: [option] });
  }

  const typed = query.trim();
  const exactMatch = options.some(
    (option) => option.label.toLowerCase() === typed.toLowerCase(),
  );
  const canCreate = Boolean(onCreate ?? onCreateRequiresMore) && !lockedNote;

  const close = () => {
    setOpen(false);
    setQuery("");
    setNeedsName(false);
  };

  const create = async (text: string) => {
    const name = text.trim();
    if (busy) return;
    // `onCreateRequiresMore` opens a dialog that asks for the name itself, so
    // a blank click there is legitimate — it opens the dialog empty. Only the
    // write-it-now path needs a name before it can do anything.
    if (onCreateRequiresMore) {
      close();
      onCreateRequiresMore(name);
      return;
    }
    if (!onCreate) return;
    if (!name) {
      setNeedsName(true);
      inputRef.current?.focus();
      return;
    }
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
              (renderSelected ?? selected.render ?? selected.label)
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
            ref={inputRef}
            value={query}
            onValueChange={(next) => {
              setQuery(next);
              if (next.trim()) setNeedsName(false);
            }}
            placeholder={searchPlaceholder ?? `Search or add ${article(noun)}…`}
          />
          <CommandList>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            {groups.map((group) => (
              <CommandGroup key={group.heading ?? "__ungrouped__"} heading={group.heading}>
                {group.options.map((option) => (
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
            ))}
          </CommandList>

          {/* The "+ Add" footer sits OUTSIDE CommandList so the search can
              never hide the one thing the person came here to do (P23). */}
          {canCreate ? (
            <div className="space-y-1 border-t border-border p-1">
              {createExtra && typed && !exactMatch ? (
                <div className="px-1 pt-0.5">{createExtra}</div>
              ) : null}
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
                    : `Add ${article(noun)}…`}
                </span>
              </button>
              {needsName ? (
                <p className="px-2 pb-0.5 text-[11px] leading-snug text-muted-foreground">
                  Type the name of the {noun} you want to add — then this
                  creates it.
                </p>
              ) : null}
            </div>
          ) : null}

          {/* THE DOORS. Everything this control names must be reachable from
              it: the place the vocabulary is governed, and the other answer
              when this vocabulary is the wrong one to be answering with. */}
          {footerActions?.length || manageAction ? (
            <div className="space-y-0.5 border-t border-border p-1">
              {footerActions?.map((action) => {
                const Icon = action.icon;
                return (
                  <div key={action.label}>
                    <button
                      type="button"
                      onClick={() => {
                        close();
                        action.onSelect();
                      }}
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      {Icon ? <Icon className="size-3.5 shrink-0" /> : null}
                      <span className="min-w-0 truncate">{action.label}</span>
                    </button>
                    {action.note ? (
                      <p className="px-2 pb-1 text-[10px] leading-snug text-muted-foreground">
                        {action.note}
                      </p>
                    ) : null}
                  </div>
                );
              })}
              {manageAction ? (
                <a
                  href={manageAction.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={close}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <ExternalLink className="size-3.5 shrink-0" />
                  <span className="min-w-0 truncate">{manageAction.label}</span>
                </a>
              ) : null}
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
