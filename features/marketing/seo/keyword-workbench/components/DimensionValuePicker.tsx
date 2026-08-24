"use client";

/**
 * THE PICKER THAT TAKES NEW INPUT (P23).
 *
 * Arman, 2026-08-23: "the moment I went in to assign a tier, I got a pop up
 * that forced me to choose from the shitty options I had in front of me. So
 * instead of our system getting significantly better because I took the
 * initiative to add something, our system was too arrogant and cocky and
 * didn't want my opinion… it's the lazy coding agent who builds a popover
 * with a drop down but is too lazy to include an add feature."
 *
 * So: type anything. If it does not exist, the last row of the list is
 * "Add <what you typed>" — one click, `seo.gsc_quick_add_value` makes it real,
 * and it is selected before the list closes. That holds for the DIMENSION as
 * well as the value: a person who needs a way of looking at keywords we never
 * imagined gets it in the same gesture.
 *
 * The ONE refusal is a platform vocabulary (P11) — a shared dimension every
 * tenant reads. The DB raises a sentence explaining that and telling the user
 * to make their own; we show that sentence and offer exactly that door.
 *
 * This is the primitive the C15 P23 sweep imports. Do not fork a second
 * add-capable picker for another surface.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "@/lib/toast";
import { cn } from "@/styles/themes/utils";
import type { FacetDimension } from "@/features/marketing/seo/value-system/dimensions/data";
import { quickAddValue } from "@/features/marketing/seo/keyword-workbench/data";

export interface PickedValue {
  dimensionId: string;
  dimensionSlug: string;
  dimensionLabel: string;
  valueId: string;
  valueLabel: string;
}

function DimensionButton({
  label,
  placeholder,
  disabled,
  busy,
}: {
  label: string | null;
  placeholder: string;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <Button
      variant="outline"
      role="combobox"
      size="sm"
      disabled={disabled}
      className="h-8 w-full justify-between gap-2 px-2 text-xs font-normal"
    >
      <span className={cn("truncate", !label && "text-muted-foreground")}>
        {label ?? placeholder}
      </span>
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
      )}
    </Button>
  );
}

export function DimensionValuePicker({
  siteId,
  dimensions,
  loading,
  picked,
  onPicked,
  /** Hide the dimension half when the caller already fixed one (a column). */
  lockedDimensionSlug,
}: {
  siteId: string;
  dimensions: FacetDimension[];
  loading?: boolean;
  picked: PickedValue | null;
  onPicked: (next: PickedValue | null) => void;
  lockedDimensionSlug?: string;
}) {
  const queryClient = useQueryClient();
  const [dimensionOpen, setDimensionOpen] = useState(false);
  const [valueOpen, setValueOpen] = useState(false);
  const [dimensionQuery, setDimensionQuery] = useState("");
  const [valueQuery, setValueQuery] = useState("");
  /** A dimension chosen but not yet paired with a value (a half-selection). */
  const [pendingDimension, setPendingDimension] =
    useState<FacetDimension | null>(null);
  /** A dimension the person is INVENTING — real only once its first value lands. */
  const [newDimensionLabel, setNewDimensionLabel] = useState("");

  const locked = lockedDimensionSlug
    ? (dimensions.find((d) => d.slug === lockedDimensionSlug) ?? null)
    : null;
  const activeDimension =
    locked ??
    (picked ? (dimensions.find((d) => d.dimension_id === picked.dimensionId) ?? null) : null);

  const invalidateCatalog = () =>
    queryClient.invalidateQueries({
      queryKey: ["marketing", "seo", "dimension-catalog", siteId],
    });

  const addValue = useMutation({
    mutationFn: quickAddValue,
    onSuccess: async (result) => {
      await invalidateCatalog();
      await queryClient.invalidateQueries({
        queryKey: ["marketing", "gsc", "filter-dimension-catalog", siteId],
      });
      onPicked({
        dimensionId: result.dimensionId,
        dimensionSlug: result.dimensionSlug,
        dimensionLabel: result.dimensionLabel,
        valueId: result.valueId,
        valueLabel: result.valueLabel,
      });
      setDimensionOpen(false);
      setValueOpen(false);
      setDimensionQuery("");
      setValueQuery("");
      setNewDimensionLabel("");
      setPendingDimension(null);
      toast.success(
        result.createdDimension
          ? `Created “${result.dimensionLabel}” with its first value “${result.valueLabel}”.`
          : result.createdValue
            ? `Added “${result.valueLabel}” to ${result.dimensionLabel}.`
            : `“${result.valueLabel}” already existed — selected it.`,
      );
    },
    onError: (error: unknown) => {
      toast.error(
        error instanceof Error ? error.message : "Could not add that value.",
      );
    },
  });

  const chooseDimension = (dimension: FacetDimension) => {
    onPicked(null);
    setNewDimensionLabel("");
    setDimensionOpen(false);
    setValueQuery("");
    setPendingDimension(dimension);
    // Straight on to the value — the person came here to assign one, and a
    // second click to open the list they obviously want next is friction.
    setValueOpen(true);
  };
  const valueDimension = activeDimension ?? pendingDimension;
  const valueRows = (valueDimension?.values ?? []).filter((v) => !v.abstain);

  const dimensionMatches = dimensions.filter((d) =>
    d.label.toLowerCase().includes(dimensionQuery.trim().toLowerCase()),
  );
  const valueMatches = valueRows.filter((v) =>
    v.label.toLowerCase().includes(valueQuery.trim().toLowerCase()),
  );
  const canAddDimension =
    dimensionQuery.trim().length > 1 &&
    !dimensions.some(
      (d) => d.label.toLowerCase() === dimensionQuery.trim().toLowerCase(),
    );
  const canAddValue =
    valueQuery.trim().length > 0 &&
    !!valueDimension &&
    !valueRows.some(
      (v) => v.label.toLowerCase() === valueQuery.trim().toLowerCase(),
    );

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {locked ? null : (
        <Popover open={dimensionOpen} onOpenChange={setDimensionOpen}>
          <PopoverTrigger asChild>
            <span className="block">
              <DimensionButton
                label={valueDimension?.label ?? null}
                placeholder={loading ? "Loading dimensions…" : "Dimension"}
                disabled={loading}
              />
            </span>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-0">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Find or name a dimension…"
                value={dimensionQuery}
                onValueChange={setDimensionQuery}
              />
              <CommandList>
                <CommandEmpty className="px-3 py-2 text-xs text-muted-foreground">
                  Nothing by that name yet.
                </CommandEmpty>
                <CommandGroup>
                  {dimensionMatches.map((dimension) => (
                    <CommandItem
                      key={dimension.dimension_id}
                      value={dimension.dimension_id}
                      onSelect={() => chooseDimension(dimension)}
                      className="text-xs"
                    >
                      <Check
                        className={cn(
                          "mr-2 h-3.5 w-3.5",
                          valueDimension?.dimension_id === dimension.dimension_id
                            ? "opacity-100"
                            : "opacity-0",
                        )}
                      />
                      <span className="truncate">{dimension.label}</span>
                      {dimension.scope === "site" ? (
                        <span className="ml-auto text-[10px] text-muted-foreground">
                          yours
                        </span>
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
                {canAddDimension ? (
                  <CommandGroup>
                    <CommandItem
                      value="__add_dimension"
                      className="text-xs text-primary"
                      onSelect={() => {
                        // A brand-new dimension needs its first value, and the
                        // person is already telling us what they want to call
                        // the WAY of looking — so we ask for the value next
                        // rather than creating an empty dimension nobody can use.
                        setPendingDimension(null);
                        setNewDimensionLabel(dimensionQuery.trim());
                        setDimensionOpen(false);
                        setValueOpen(true);
                      }}
                    >
                      <Plus className="mr-2 h-3.5 w-3.5" />
                      Add “{dimensionQuery.trim()}” as a new dimension
                    </CommandItem>
                  </CommandGroup>
                ) : null}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}

      <Popover open={valueOpen} onOpenChange={setValueOpen}>
        <PopoverTrigger asChild>
          <span className={cn("block", locked && "sm:col-span-2")}>
            <DimensionButton
              label={picked?.valueLabel ?? null}
              placeholder={
                newDimensionLabel
                  ? `First value for “${newDimensionLabel}”`
                  : valueDimension
                    ? "Value"
                    : "Pick a dimension first"
              }
              disabled={!valueDimension && !newDimensionLabel}
              busy={addValue.isPending}
            />
          </span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Find or type a new value…"
              value={valueQuery}
              onValueChange={setValueQuery}
            />
            <CommandList>
              <CommandEmpty className="px-3 py-2 text-xs text-muted-foreground">
                {newDimensionLabel
                  ? "Type what this new dimension's first value should be."
                  : "Nothing by that name yet — type it and add it."}
              </CommandEmpty>
              <CommandGroup>
                {valueMatches.map((value) => (
                  <CommandItem
                    key={value.value_id}
                    value={value.value_id}
                    className="text-xs"
                    onSelect={() => {
                      if (!valueDimension) return;
                      onPicked({
                        dimensionId: valueDimension.dimension_id,
                        dimensionSlug: valueDimension.slug,
                        dimensionLabel: valueDimension.label,
                        valueId: value.value_id,
                        valueLabel: value.label,
                      });
                      setValueOpen(false);
                      setValueQuery("");
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-3.5 w-3.5",
                        picked?.valueId === value.value_id
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                    />
                    <span className="truncate">{value.label}</span>
                    {value.keyword_count > 0 ? (
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {value.keyword_count.toLocaleString()}
                      </span>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
              {(canAddValue || (newDimensionLabel && valueQuery.trim())) ? (
                <CommandGroup>
                  <CommandItem
                    value="__add_value"
                    className="text-xs text-primary"
                    disabled={addValue.isPending}
                    onSelect={() =>
                      addValue.mutate({
                        siteId,
                        valueLabel: valueQuery.trim(),
                        ...(newDimensionLabel
                          ? { newDimensionLabel }
                          : { dimensionId: valueDimension?.dimension_id }),
                      })
                    }
                  >
                    <Plus className="mr-2 h-3.5 w-3.5" />
                    Add “{valueQuery.trim()}”
                    {newDimensionLabel
                      ? ` and create “${newDimensionLabel}”`
                      : valueDimension
                        ? ` to ${valueDimension.label}`
                        : ""}
                  </CommandItem>
                </CommandGroup>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {newDimensionLabel ? (
        <p className="text-[11px] leading-snug text-muted-foreground sm:col-span-2">
          New dimension “{newDimensionLabel}” — it becomes yours the moment you
          add its first value.{" "}
          <button
            type="button"
            className="underline underline-offset-2 hover:text-foreground"
            onClick={() => setNewDimensionLabel("")}
          >
            Cancel
          </button>
        </p>
      ) : null}
    </div>
  );
}
