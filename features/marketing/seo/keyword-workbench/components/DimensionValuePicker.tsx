"use client";

/**
 * DIMENSION + VALUE, both of which take new input (P23).
 *
 * This is a COMPOSITION, not a picker: the picker shape itself is
 * `CreatablePicker` (the keyword system's one type-ahead-with-Create control)
 * and the write is `quickAddDimensionValue` (its one creation path). What this
 * file adds is the two-step relationship between them:
 *
 *   • pick a dimension — or invent one by typing its name;
 *   • pick a value inside it — or invent one by typing that.
 *
 * A dimension a person invents is not written until its first value lands, so
 * an abandoned "New way of looking at things" never leaves an empty vocabulary
 * behind for the next person to wonder about.
 *
 * P11 lives in the primitive: a platform dimension refuses to widen, says so
 * in a sentence a person can act on, and offers the "make it your own" door
 * rather than a bare no.
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Eraser, PenLine } from "lucide-react";

import { toast } from "@/lib/toast";
import type { FacetDimension } from "@/features/marketing/seo/value-system/dimensions/data";
import { CreatablePicker } from "@/components/ui/creatable-picker";
import {
  QuickAddRefusal,
  quickAddDimensionValue,
} from "@/features/marketing/seo/value-system/quick-add";

export interface PickedValue {
  dimensionId: string;
  dimensionSlug: string;
  dimensionLabel: string;
  valueId: string;
  valueLabel: string;
}

export function DimensionValuePicker({
  siteId,
  dimensions,
  loading,
  picked,
  onPicked,
  /** Fix the dimension when the gesture already chose one (a column, a cell). */
  lockedDimensionSlug,
  variant = "form",
  onClear,
  onAssignWithReason,
}: {
  siteId: string;
  dimensions: FacetDimension[];
  loading?: boolean;
  picked: PickedValue | null;
  onPicked: (next: PickedValue | null) => void;
  lockedDimensionSlug?: string;
  /** `cell` keeps the same picker visible in assigned and empty table cells. */
  variant?: "form" | "cell";
  onClear?: () => void;
  onAssignWithReason?: () => void;
}) {
  const queryClient = useQueryClient();
  /** A dimension chosen but not yet paired with a value. */
  const [pendingDimensionId, setPendingDimensionId] = useState<string | null>(
    null,
  );
  /**
   * A dimension being INVENTED — real only once its first value lands.
   * `null` means nobody is inventing one; `""` means they clicked "Add a
   * dimension…" without typing a name yet, which is a REAL state and not a
   * no-op (the three sibling editors that open a dialog treat it the same
   * way). Modelling it as `""`-means-nothing is what made that click dead.
   */
  const [newDimensionLabel, setNewDimensionLabel] = useState<string | null>(
    null,
  );

  const locked = lockedDimensionSlug
    ? (dimensions.find((d) => d.slug === lockedDimensionSlug) ?? null)
    : null;
  const activeDimension =
    locked ??
    dimensions.find(
      (d) => d.dimension_id === (picked?.dimensionId ?? pendingDimensionId),
    ) ??
    null;

  const refreshCatalog = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["marketing", "seo", "dimension-catalog", siteId],
    });
    await queryClient.invalidateQueries({
      queryKey: ["marketing", "gsc", "filter-dimension-catalog", siteId],
    });
  };

  const createValue = async (typed: string): Promise<string | null> => {
    try {
      const created = await quickAddDimensionValue({
        siteId,
        valueLabel: typed,
        ...(newDimensionLabel
          ? { newDimensionLabel }
          : { dimensionId: activeDimension?.dimension_id }),
      });
      await refreshCatalog();
      onPicked({
        dimensionId: created.dimension_id,
        dimensionSlug: created.dimension_slug,
        dimensionLabel: created.dimension_label,
        valueId: created.value_id,
        valueLabel: created.value_label,
      });
      setNewDimensionLabel(null);
      setPendingDimensionId(created.dimension_id);
      toast.success(
        created.created_dimension
          ? `Created “${created.dimension_label}” with its first value “${created.value_label}”.`
          : created.created_value
            ? `Added “${created.value_label}” to ${created.dimension_label}.`
            : `“${created.value_label}” already existed — selected it.`,
      );
      // The picker selects by option value; we already set the full selection.
      return null;
    } catch (error) {
      toast.error(
        error instanceof QuickAddRefusal || error instanceof Error
          ? error.message
          : "Could not add that value.",
      );
      return null;
    }
  };

  const valueRows = (activeDimension?.values ?? []).filter((v) => !v.abstain);
  const dimensionPlaceholder = newDimensionLabel
    ? `New: ${newDimensionLabel}`
    : newDimensionLabel === ""
      ? "Naming a new dimension…"
      : "Dimension";

  const cell = variant === "cell";

  return (
    <div className={cell ? "min-w-0" : "grid gap-2 sm:grid-cols-2"}>
      {locked ? null : (
        <CreatablePicker
          value={activeDimension?.dimension_id ?? null}
          options={dimensions.map((dimension) => ({
            value: dimension.dimension_id,
            label: dimension.label,
            hint: dimension.scope === "site" ? "yours" : undefined,
          }))}
          onSelect={(dimensionId) => {
            onPicked(null);
            setNewDimensionLabel(null);
            setPendingDimensionId(dimensionId);
          }}
          placeholder={dimensionPlaceholder}
          searchPlaceholder="Find or name a dimension…"
          noun="dimension"
          loading={loading}
          ariaLabel="Dimension"
          emptyLabel="Nothing by that name yet."
          // Naming a dimension is only half a decision — it needs its first
          // value before it means anything, so the typed name is held here and
          // written by the value picker's create.
          onCreateRequiresMore={(typed) => {
            onPicked(null);
            setPendingDimensionId(null);
            setNewDimensionLabel(typed);
          }}
        />
      )}

      <CreatablePicker
        value={picked?.valueId ?? null}
        options={valueRows.map((value) => ({
          value: value.value_id,
          label: value.label,
          hint:
            value.keyword_count > 0
              ? value.keyword_count.toLocaleString()
              : undefined,
        }))}
        onSelect={(valueId) => {
          const value = valueRows.find((v) => v.value_id === valueId);
          if (!value || !activeDimension) return;
          onPicked({
            dimensionId: activeDimension.dimension_id,
            dimensionSlug: activeDimension.slug,
            dimensionLabel: activeDimension.label,
            valueId: value.value_id,
            valueLabel: value.label,
          });
        }}
        placeholder={
          cell
            ? "Unassigned"
            : newDimensionLabel
              ? `First value for “${newDimensionLabel}”`
              : newDimensionLabel === ""
                ? "Name the dimension first"
                : activeDimension
                  ? "Value"
                  : "Pick a dimension first"
        }
        searchPlaceholder="Find or type a new value…"
        noun="value"
        disabled={!activeDimension && !newDimensionLabel}
        loading={loading}
        ariaLabel={
          cell ? `${activeDimension?.label ?? "Dimension"} value` : "Value"
        }
        emptyLabel={
          newDimensionLabel !== null
            ? "Type what this new dimension's first value should be."
            : "Nothing by that name yet — type it and add it."
        }
        className={
          cell
            ? "h-auto min-h-6 border-0 px-1 py-0.5 shadow-none hover:bg-accent"
            : locked
              ? "sm:col-span-2"
              : undefined
        }
        renderSelected={
          cell && picked ? (
            <span className="block min-w-0 truncate text-[11px] text-foreground">
              {picked.valueLabel}
            </span>
          ) : undefined
        }
        footerActions={
          cell
            ? [
                ...(picked && onClear
                  ? [
                      {
                        label: "Clear this value",
                        icon: Eraser,
                        onSelect: onClear,
                      },
                    ]
                  : []),
                ...(onAssignWithReason
                  ? [
                      {
                        label: "Assign with a reason…",
                        icon: PenLine,
                        onSelect: onAssignWithReason,
                      },
                    ]
                  : []),
              ]
            : undefined
        }
        onCreate={createValue}
      />

      {!cell && newDimensionLabel !== null ? (
        <p className="text-[11px] leading-snug text-muted-foreground sm:col-span-2">
          {newDimensionLabel
            ? `New dimension “${newDimensionLabel}” — it becomes yours the moment you add its first value.`
            : "Naming a new dimension — type its name in the Dimension box, then give it a first value."}{" "}
          <button
            type="button"
            className="underline underline-offset-2 hover:text-foreground"
            onClick={() => setNewDimensionLabel(null)}
          >
            Cancel
          </button>
        </p>
      ) : null}
    </div>
  );
}
