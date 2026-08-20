"use client";

/**
 * The options editor for a `choice` / `multi_choice` column.
 *
 * NOBODY TYPES A LIST THEY ALREADY HAVE. The column's real values arrive as
 * `suggestions` (from `udt_column_facets`, ordered by how many rows carry
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
 * Nothing here can damage data. Options are a display layer: adding, removing,
 * renaming, or clearing them rewrites no cell, and a value that stops matching
 * simply renders in amber. That is why this editor has no confirmation step.
 */

import { useEffect, useMemo, useState } from "react";
import { Check, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import type { FieldChoice, FieldFormatOptions } from "./types";

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
  className?: string;
};

type Source = "inline" | "list";

export function ChoiceOptionsEditor({
  options,
  onChange,
  suggestions = [],
  siblingFields = [],
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
                  cell. Rows where that cell is empty see every option, and
                  changing it never rewrites a value already saved here.
                </p>
              )}
            </div>
          )}

          {binding?.listId && !bound.loading && (
            <p className="text-xs text-muted-foreground">
              {bound.unavailable
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
                    onClick={() =>
                      setChoices(choices.filter((_, i) => i !== index))
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
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
              onClick={() => setChoices([])}
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
