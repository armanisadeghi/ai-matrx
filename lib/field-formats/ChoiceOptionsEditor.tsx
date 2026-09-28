"use client";

/**
 * The options editor for a `choice` / `multi_choice` column.
 *
 * NOBODY TYPES A LIST THEY ALREADY HAVE. The column's real values arrive as
 * `suggestions` (the column's top values from the data seam's `getTableProfile` — the older
 * store's profile door or the record store's, by where the table lives — ordered by how many rows carry
 * them) and this editor opens with them ready to accept in one click. Declaring
 * options on an existing column should feel like confirming what is already
 * true, because it is.
 *
 * Two sources, one of which is the interesting one:
 *
 *   Inline        options private to this column.
 *   Shared list   options hydrated from a `workbench.udt_structured_lists`
 *                 row, so "Status" means the same thing in every table — and,
 *                 because list items carry a `group_name`, the column gets
 *                 TIERED options for free. Narrowing to one group of a list is
 *                 a dropdown here, not a second list to maintain.
 *
 * On the older store, options are a display layer: adding, removing, renaming,
 * or clearing them rewrites no cell, and a value that stops matching simply
 * renders in amber.
 *
 * REMOVING A CHOICE RECORDS STILL HOLD ASKS FIRST (lane CHOICE-TAILS, 2026-09-27).
 * On a record-store table the caller hands `usage` (how many records hold each
 * choice) and `onRehomeChange`. Removing a choice that records hold asks,
 * Notion-style: "3 records use “X-ray”." — move them to another choice, keep the
 * words as other values (only where the column allows other values), or clear
 * them. The answer rides the same save as the list (`rehome`), and the save can
 * be undone.
 */

import { useEffect, useMemo, useState } from "react";
import { Check, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { getAccessibleLists } from "@/features/user-lists/service";
import { useStructuredListForSelection } from "@/features/user-lists/hooks/useStructuredListForSelection";
import type { UserList } from "@/features/user-lists/types";
import { cn } from "@/utils/cn";

import {
  CHOICE_COLOR_NAMES,
  choiceColorClass,
  inlineChoices,
} from "./choices";
import type { FieldChoice, FieldFormatOptions } from "@ai-matrx/design-system/field-formats";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { recordsUseSentence, rehomeSentence, type ChoiceRehome, type ChoiceUsage } from "@ai-matrx/records";

/** One observed value of the column, and how many rows carry it. */
export type ChoiceSuggestion = {
  value: string;
  count?: number;
};

export type ChoiceOptionsEditorProps = {
  options: FieldFormatOptions;
  onChange: (next: FieldFormatOptions) => void;
  /**
   * The values actually in this column, most frequent first. Drives the
   * one-click seeding; omit when the caller has no profile (a brand-new
   * column), and the editor simply starts empty.
   */
  suggestions?: ChoiceSuggestion[];
  /**
   * The table's OTHER columns, so this one can be made dependent on one of
   * them. Omit where there is no sibling context (a standalone preview) and the
   * dependent-column control simply does not appear.
   */
  siblingFields?: { field_name: string; display_name: string }[];
  /**
   * How many records hold each choice, keyed by the option's id (a record-store
   * table's `getChoiceUsage`). With `onRehomeChange`, removing a choice records
   * hold asks where they go; without them, a removal is immediate (older store).
   */
  usage?: Record<string, ChoiceUsage> | null;
  /** Where the records of each removed choice go, keyed by the option's id. */
  rehome?: Record<string, ChoiceRehome>;
  onRehomeChange?: (next: Record<string, ChoiceRehome>) => void;
  className?: string;
};

/** The option id a choice carries on a record-store table (the seam's `StoreChoice`). */
function choiceIdOf(choice: FieldChoice | undefined): string | undefined {
  const id = (choice as (FieldChoice & { id?: unknown }) | undefined)?.id;
  return typeof id === "string" && id !== "" ? id : undefined;
}

type Source = "inline" | "list";

export function ChoiceOptionsEditor({
  options,
  onChange,
  suggestions = [],
  siblingFields = [],
  usage = null,
  rehome = {},
  onRehomeChange,
  className,
}: ChoiceOptionsEditorProps) {
  const binding = options.structuredList;
  const source: Source = binding?.listId ? "list" : "inline";

  const choices = useMemo(() => inlineChoices(options), [options]);
  const [draftValue, setDraftValue] = useState("");

  const patch = (next: Partial<FieldFormatOptions>) =>
    onChange({ ...options, ...next });

  // ─── Inline options ────────────────────────────────────────────────────────

  const declared = new Set(choices.map((c) => c.value.toLowerCase()));

  /** Column values that are not yet options — what "add all" would add. */
  const unclaimed = suggestions.filter(
    (s) => s.value.trim() !== "" && !declared.has(s.value.trim().toLowerCase()),
  );

  const setChoices = (next: FieldChoice[]) => patch({ choices: next });

  const addChoice = (value: string) => {
    const trimmed = value.trim();
    if (trimmed === "" || declared.has(trimmed.toLowerCase())) return;
    setChoices([...choices, { value: trimmed }]);
  };

  const updateChoice = (index: number, next: Partial<FieldChoice>) => {
    setChoices(choices.map((c, i) => (i === index ? { ...c, ...next } : c)));
  };

  // ─── Removing a choice records still hold (lane CHOICE-TAILS) ─────────────
  // `asking` is the queue of choices waiting for an answer (one, or every used one
  // on Clear all); `removed` remembers each answered one so it can be put back.
  const [asking, setAsking] = useState<FieldChoice[]>([]);
  const [moveTo, setMoveTo] = useState<string>("");
  const [removed, setRemoved] = useState<Record<string, { choice: FieldChoice; index: number }>>({});
  const heldBy = (choice: FieldChoice): number => {
    const id = choiceIdOf(choice);
    return id && onRehomeChange ? (usage?.[id]?.records ?? 0) : 0;
  };
  const removeChoice = (index: number) => {
    const choice = choices[index];
    if (choice && heldBy(choice) > 0) {
      setAsking([choice]);
      setMoveTo("");
      return;
    }
    setChoices(choices.filter((_, i) => i !== index));
  };
  const clearAll = () => {
    const held = choices.filter((c) => heldBy(c) > 0);
    setChoices(held);
    setAsking(held);
    setMoveTo("");
  };
  const asked = asking[0];
  const answer = (spec: ChoiceRehome) => {
    if (!asked || !onRehomeChange) return;
    const id = choiceIdOf(asked)!;
    const index = choices.findIndex((c) => choiceIdOf(c) === id);
    setRemoved({ ...removed, [id]: { choice: asked, index: index < 0 ? choices.length : index } });
    setChoices(choices.filter((c) => choiceIdOf(c) !== id));
    onRehomeChange({ ...rehome, [id]: spec });
    setAsking(asking.slice(1));
    setMoveTo("");
  };
  const putBack = (id: string) => {
    const was = removed[id];
    if (!was) return;
    const next = [...choices];
    next.splice(Math.min(was.index, next.length), 0, was.choice);
    setChoices(next);
    const { [id]: _gone, ...rest } = rehome;
    onRehomeChange?.(rest);
    const { [id]: _was, ...keep } = removed;
    setRemoved(keep);
  };
  const wordsOfId = (id: string) =>
    choices.find((c) => choiceIdOf(c) === id)?.value ?? removed[id]?.choice.value ?? usage?.[id]?.words ?? "";
  const waiting = new Set(asking.map(choiceIdOf));
  const moveTargets = choices.filter((c) => choiceIdOf(c) && !waiting.has(choiceIdOf(c)));

  // ─── Shared list ───────────────────────────────────────────────────────────

  const [lists, setLists] = useState<UserList[] | null>(null);
  const [listsFailed, setListsFailed] = useState(false);

  useEffect(() => {
    if (source !== "list" || lists !== null) return;
    let cancelled = false;
    getAccessibleLists()
      .then((rows) => {
        if (!cancelled) setLists(rows);
      })
      .catch(() => {
        if (!cancelled) setListsFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [source, lists]);

  // Groups of the bound list — the tiers this column can narrow to.
  const bound = useStructuredListForSelection(binding?.listId ?? null);
  const groupNames = bound.groups
    .map((g) => g.group)
    .filter((g) => g && g !== "Ungrouped");

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* Source */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Options come from</Label>
        <Select
          value={source}
          onValueChange={(next) =>
            next === "list"
              ? patch({ structuredList: { listId: "" } })
              : patch({ structuredList: undefined })
          }
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="inline">A list just for this column</SelectItem>
            <SelectItem value="list">A shared pick list</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {source === "list" ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Pick list</Label>
            {listsFailed ? (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Your pick lists couldn&rsquo;t be loaded. Try again in a moment.
                <ErrorAlchemyMenu />
              </p>
            ) : (
              <Select
                value={binding?.listId || undefined}
                onValueChange={(listId) =>
                  patch({ structuredList: { ...binding, listId } })
                }
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue
                    placeholder={lists === null ? "Loading…" : "Choose a list"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {(lists ?? []).map((list) => (
                    <SelectItem key={list.id} value={list.id}>
                      {list.list_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Tiering, free: bind to one group instead of building a new list. */}
          {groupNames.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">
                Limit to one group
              </Label>
              <Select
                value={binding?.groupName ?? "__all"}
                onValueChange={(next) =>
                  patch({
                    structuredList: {
                      listId: binding?.listId ?? "",
                      ...(next === "__all" ? {} : { groupName: next }),
                    },
                  })
                }
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">
                    {binding?.groupFromField
                      ? "Let another column decide"
                      : "All groups (shown as sections)"}
                  </SelectItem>
                  {groupNames.map((group) => (
                    <SelectItem key={group} value={group}>
                      {group}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* DEPENDENT COLUMNS. The group can be fixed, or read from another
              column's cell so this column narrows as the user fills that one.
              Declared here, on the column being constrained — the controlling
              column needs no configuration at all. */}
          {groupNames.length > 0 && siblingFields.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">
                Or narrow by another column
              </Label>
              <Select
                value={binding?.groupName ? "__none" : (binding?.groupFromField ?? "__none")}
                onValueChange={(next) =>
                  patch({
                    structuredList: {
                      listId: binding?.listId ?? "",
                      ...(next === "__none" ? {} : { groupFromField: next }),
                    },
                  })
                }
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Don&rsquo;t narrow</SelectItem>
                  {siblingFields.map((f) => (
                    <SelectItem key={f.field_name} value={f.field_name}>
                      Match the group to {f.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {binding?.groupFromField && (
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Each row offers only the options in the group named by its{" "}
                  {siblingFields.find(
                    (f) => f.field_name === binding.groupFromField,
                  )?.display_name ?? binding.groupFromField}{" "}
                  {/* read-gate-exempt: static explanation of group narrowing (an empty cell sees every option), not an empty view */}
                  cell. Rows where that cell is empty see every option, and
                  changing it never rewrites a value already saved here.
                </p>
              )}
            </div>
          )}

          {binding?.listId && !bound.loading && (
            <p className="text-xs text-muted-foreground">
              {bound.error ? (
                <>
                  This list couldn&apos;t be read — its options are unknown right now.
                  <ErrorAlchemyMenu error={bound.error} size="xs" />
                </>
              ) : bound.unavailable
                ? "This list can't be opened — it may have been deleted or unshared."
                : `${bound.items.length} option${bound.items.length === 1 ? "" : "s"}${
                    groupNames.length > 0 && !binding.groupName
                      ? ` across ${groupNames.length} groups`
                      : ""
                  }.`}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {/* Seed from what is already in the column. */}
          {unclaimed.length > 0 && (
            <div className="rounded-md border border-border bg-muted/40 p-2">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  Already in this column
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() =>
                    setChoices([
                      ...choices,
                      ...unclaimed.map((s) => ({ value: s.value.trim() })),
                    ])
                  }
                >
                  <Check className="mr-1 h-3 w-3" />
                  Add all {unclaimed.length}
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {unclaimed.slice(0, 24).map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => addChoice(s.value)}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5 text-xs hover:bg-accent"
                  >
                    <Plus className="h-3 w-3 opacity-60" />
                    <span className="max-w-[12rem] truncate">{s.value}</span>
                    {s.count !== undefined && (
                      <span className="tabular-nums text-muted-foreground">
                        {s.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* A choice column may start with no choices (lane CHOICE-COLUMN-EDIT b). */}
          {choices.length === 0 && (
            <p className="text-xs text-muted-foreground" data-choice-options-empty="">
              No choices yet. Add the first one below, or type it into a cell and answer Add.
            </p>
          )}

          {/* The declared options. */}
          {choices.length > 0 && (
            <div className="flex flex-col gap-1">
              {choices.map((choice, index) => (
                <div key={`${choice.value}-${index}`} className="flex items-center gap-1.5">
                  <Input
                    value={choice.value}
                    onChange={(e) => updateChoice(index, { value: e.target.value })}
                    className="h-8 flex-1 text-sm"
                    aria-label="Option value"
                  />
                  <Select
                    value={choice.color ?? "neutral"}
                    onValueChange={(color) => updateChoice(index, { color })}
                  >
                    <SelectTrigger
                      className={cn(
                        "h-8 w-24 text-xs",
                        choiceColorClass(choice.color),
                      )}
                      aria-label="Option color"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CHOICE_COLOR_NAMES.map((name) => (
                        <SelectItem key={name} value={name} className="text-xs">
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    aria-label={`Remove ${choice.value}`}
                    onClick={() => removeChoice(index)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* THE QUESTION, Notion-style: where do the records that hold it go? */}
          {asked && (
            <div
              role="group"
              aria-label={recordsUseSentence(heldBy(asked), asked.value)}
              data-choice-removal-ask=""
              className="flex flex-col gap-1.5 rounded-md border border-border bg-muted/40 p-2"
            >
              <p className="text-xs">{recordsUseSentence(heldBy(asked), asked.value)}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {moveTargets.length > 0 && (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={moveTo === ""}
                      onClick={() => answer({ then: "move", to: moveTo })}
                    >
                      Move them to
                    </Button>
                    <Select value={moveTo || undefined} onValueChange={setMoveTo}>
                      <SelectTrigger className="h-7 w-36 text-xs" aria-label="Another choice">
                        <SelectValue placeholder="Another choice" />
                      </SelectTrigger>
                      <SelectContent>
                        {moveTargets.map((c) => (
                          <SelectItem key={choiceIdOf(c)} value={choiceIdOf(c)!} className="text-xs">
                            {c.value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
                {options.allowOther !== false && (
                  <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => answer({ then: "keep" })}>
                    Keep the words as other values
                  </Button>
                )}
                <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => answer({ then: "clear" })}>
                  Clear them
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setAsking([])}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* What each answered removal will do on Save, with a way to put it back. */}
          {Object.entries(rehome).map(([id, spec]) =>
            removed[id] ? (
              <div key={id} className="flex items-center justify-between gap-2 text-xs text-muted-foreground" data-choice-rehome="">
                <span>
                  {rehomeSentence(
                    usage?.[id]?.records ?? 0,
                    removed[id]!.choice.value,
                    spec,
                    spec.then === "move" ? wordsOfId(spec.to) : undefined,
                  )}
                </span>
                <button type="button" className="shrink-0 hover:text-foreground" onClick={() => putBack(id)}>
                  Put it back
                </button>
              </div>
            ) : null,
          )}

          <div className="flex items-center gap-1.5">
            <Input
              value={draftValue}
              placeholder="Add an option…"
              className="h-8 flex-1 text-sm"
              onChange={(e) => setDraftValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                addChoice(draftValue);
                setDraftValue("");
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => {
                addChoice(draftValue);
                setDraftValue("");
              }}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          {choices.length > 0 && (
            <button
              type="button"
              className="self-start text-xs text-muted-foreground hover:text-foreground"
              onClick={clearAll}
            >
              <X className="mr-1 inline h-3 w-3" />
              Clear all options
            </button>
          )}
        </div>
      )}

      {/* allowOther. Defaults ON, and the copy says what OFF actually does —
          it never deletes or rejects a stored value, it only stops NEW ones. */}
      <div className="flex items-start justify-between gap-3 rounded-md border border-border p-2">
        <div className="min-w-0">
          <Label className="text-xs">Allow other values</Label>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            {options.allowOther === false
              ? "Only the options above can be entered. Values already saved are kept and shown in amber."
              : "Anyone can type a value that isn't listed."}
          </p>
        </div>
        <Switch
          checked={options.allowOther !== false}
          onCheckedChange={(next) => patch({ allowOther: next })}
        />
      </div>
    </div>
  );
}

export default ChoiceOptionsEditor;
