"use client";

/**
 * DIMENSION + VALUE, both of which take new input (P23).
 *
 * This is a COMPOSITION, not a picker: the picker shape itself is
 * `CreatablePicker` (the keyword system's one type-ahead-with-Create control)
 * and the write is `quickAddDimensionValue` (its one creation path). What this
 * file adds is the two-step relationship between them:
 *
 *   • pick a dimension — or invent one through the canonical two-choice form;
 *   • pick a value inside it — or invent one by typing that.
 *
 * A dimension a person invents is not written until its name and first two
 * choices are complete, so an abandoned form never leaves empty vocabulary
 * behind and the new dimension is immediately meaningful.
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
import { AddDimensionDialog } from "@/features/marketing/seo/value-system/pickers/AddDimensionDialog";

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
  selectedHint,
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
  /** Compact provenance shown beside a selected table-cell value. */
  selectedHint?: string | null;
  onClear?: () => void;
  onAssignWithReason?: () => void;
}) {
  const queryClient = useQueryClient();
  /** A dimension chosen but not yet paired with a value. */
  const [pendingDimensionId, setPendingDimensionId] = useState<string | null>(
    null,
  );
  /** The name handed to the canonical two-choice dimension form. */
  const [newDimensionDraft, setNewDimensionDraft] = useState<string | null>(
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
        dimensionId: activeDimension?.dimension_id,
      });
      await refreshCatalog();
      onPicked({
        dimensionId: created.dimension_id,
        dimensionSlug: created.dimension_slug,
        dimensionLabel: created.dimension_label,
        valueId: created.value_id,
        valueLabel: created.value_label,
      });
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
            setNewDimensionDraft(null);
            setPendingDimensionId(dimensionId);
          }}
          placeholder="Dimension"
          searchPlaceholder="Find or name a dimension…"
          noun="dimension"
          loading={loading}
          ariaLabel="Dimension"
          emptyLabel="Nothing by that name yet."
          // Naming a dimension is only half a decision — it needs its first
          // value before it means anything, so the typed name is held here and
          // written by the value picker's create.
          onCreateRequiresMore={(typed) => {
            setNewDimensionDraft(typed);
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
            : activeDimension
              ? "Value"
              : "Pick a dimension first"
        }
        searchPlaceholder="Find or type a new value…"
        noun="value"
        disabled={!activeDimension}
        loading={loading}
        ariaLabel={
          cell ? `${activeDimension?.label ?? "Dimension"} value` : "Value"
        }
        emptyLabel={
          "Nothing by that name yet — type it and add it."
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
            <span className="flex min-w-0 items-baseline gap-1">
              <span className="min-w-0 truncate text-[11px] text-foreground">
                {picked.valueLabel}
              </span>
              {selectedHint ? (
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {selectedHint}
                </span>
              ) : null}
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

      {!cell && newDimensionDraft !== null ? (
        <AddDimensionDialog
          siteId={siteId}
          initialLabel={newDimensionDraft}
          onCancel={() => setNewDimensionDraft(null)}
          onCreated={(created) => {
            setNewDimensionDraft(null);
            setPendingDimensionId(created.dimension_id);
            onPicked({
              dimensionId: created.dimension_id,
              dimensionSlug: created.dimension_slug,
              dimensionLabel: created.dimension_label,
              valueId: created.value_id,
              valueLabel: created.value_label,
            });
            void refreshCatalog();
          }}
        />
      ) : null}
    </div>
  );
}
