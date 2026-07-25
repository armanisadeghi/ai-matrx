"use client";

/**
 * features/scopes/components/reference/ReferenceValuePicker.tsx
 *
 * THE canonical way to author a `value_type="reference"` cell. Renders the
 * current selection as chips (via the item's display hints) and an "Add"
 * popover constrained by the item's `allowed_reference_types` + `max_items`
 * (+ `allowed_scope_type_ids` when `scope` is allowed). Emits a full
 * ```matrx reference fence string (or `null` when cleared) — never a bare id.
 *
 * One sub-picker per reference type, added here as the taxonomy grows:
 *   - `file`   → THE canonical stored-files picker (`FilePickerWindow` =
 *                non-blocking WindowPanel around `FilesResourcePicker`, the
 *                same component as chat's "Stored Files"; never a plain
 *                file list, never a blocking sheet/dialog)
 *   - `url`    → a plain URL + optional label form (no Matrx-owned id)
 *   - `scope`  → the org's scope tree, filtered by `allowed_scope_type_ids`
 *   - default  → `useUniversalEntitySearch` for any other listable
 *                `EntityTypeToken` (task, note, project, agent, app, …)
 */

import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/utils/cn";
import dynamic from "next/dynamic";
import { ReferenceTypeAdder } from "@/features/matrx-envelope/components/ReferenceTypeAdder";
import { ReferencePickerChip } from "@/features/matrx-envelope/components/ReferencePickerChip";
import type { ReferenceItem } from "@/features/matrx-envelope/envelope";
import {
  buildReferenceCellValue,
  parseReferenceCellValue,
  referenceTypeLabel,
  type ReferenceItemConfig,
} from "@/features/scopes/utils/referenceCell";

export interface ReferenceValuePickerProps {
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  config: ReferenceItemConfig;
  /** The cell's raw `value_text` (a ```matrx fence), or null when unset. */
  value: string | null;
  onChange: (nextFenceOrNull: string | null) => void;
  /** The scope this cell lives on — resolves the org for the `scope` picker. */
  scopeId: string;
  disabled?: boolean;
  className?: string;
}

// THE one canonical file picker. Lazy — WindowPanel must never be parsed in
// a route/boot bundle (features/window-panels FEATURE.md → Bundle invariant).
const FilePickerWindow = dynamic(
  () =>
    import("@/features/resource-manager/resource-picker/FilePickerWindow").then(
      (m) => ({ default: m.FilePickerWindow }),
    ),
  { ssr: false, loading: () => null },
);

const typeLabel = referenceTypeLabel;

export function ReferenceValuePicker({
  id,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  config,
  value,
  onChange,
  scopeId,
  disabled,
  className,
}: ReferenceValuePickerProps) {
  const addContentRef = useRef<HTMLDivElement>(null);
  const allowedTypes = config.allowed_reference_types ?? [];
  const parsed = parseReferenceCellValue(value);
  const currentType = parsed?.type ?? null;
  const items = parsed?.items ?? [];
  const remaining = Math.max(0, config.max_items - items.length);
  const canAddMore = remaining > 0 && allowedTypes.length > 0;

  const [addOpen, setAddOpen] = useState(false);
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  const [addType, setAddType] = useState<string>(
    currentType ?? allowedTypes[0] ?? "",
  );

  const activeAddType = allowedTypes.includes(addType)
    ? addType
    : currentType && allowedTypes.includes(currentType)
      ? currentType
      : (allowedTypes[0] ?? "");

  function addItems(type: string, newItems: ReferenceItem[]) {
    if (newItems.length === 0) return;
    // A cell carries exactly one `type` at a time — switching type when items
    // already exist replaces them, matching the fence's single `type` field.
    const base = type === currentType ? items : [];
    const capacity = config.max_items - base.length;
    if (capacity <= 0) return;
    const next = [...base, ...newItems.slice(0, capacity)];
    onChange(buildReferenceCellValue(type, next));
  }

  function removeItem(index: number) {
    if (!currentType) return;
    const next = items.filter((_, i) => i !== index);
    onChange(
      next.length > 0 ? buildReferenceCellValue(currentType, next) : null,
    );
  }

  return (
    <div
      id={id}
      role="group"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      className={cn("space-y-1.5", className)}
    >
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <li key={i}>
              <ReferencePickerChip
                item={item}
                type={currentType ?? ""}
                onRemove={disabled ? undefined : () => removeItem(i)}
              />
            </li>
          ))}
        </ul>
      )}

      {!disabled && canAddMore && (
        <Popover
          open={addOpen}
          onOpenChange={(next) => {
            // File is picked with the canonical picker WINDOW, not a popover
            // form — when "file" is the active type, the Add button goes
            // straight to the picker (zero intermediate clicks). Other types
            // (and the type-switch chips) still use the popover.
            if (next && activeAddType === "file" && allowedTypes.length === 1) {
              setFilePickerOpen(true);
              return;
            }
            setAddOpen(next);
          }}
        >
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              Add {typeLabel(activeAddType)}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            ref={addContentRef}
            className="w-80 p-2"
            align="start"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              requestAnimationFrame(() => {
                addContentRef.current
                  ?.querySelector<HTMLElement>("[data-reference-autofocus]")
                  ?.focus();
              });
            }}
          >
            {allowedTypes.length > 1 && (
              <div className="mb-2 flex flex-wrap gap-1">
                {allowedTypes.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setAddType(t)}
                    aria-pressed={activeAddType === t}
                    className={cn(
                      "rounded-md border px-2 py-0.5 text-[11px] transition-colors",
                      activeAddType === t
                        ? "border-primary/50 bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground hover:bg-accent",
                    )}
                  >
                    {typeLabel(t)}
                  </button>
                ))}
              </div>
            )}
            <ReferenceTypeAdder
              type={activeAddType}
              scopeId={scopeId}
              allowedScopeTypeIds={config.allowed_scope_type_ids}
              onBrowseFiles={() => {
                // The canonical picker lives in a portal Sheet — close the
                // popover first so its dismiss logic can't unmount the sheet.
                setAddOpen(false);
                setFilePickerOpen(true);
              }}
              onPickMany={(picked) => {
                addItems(activeAddType, picked);
                if (remaining - picked.length <= 0) setAddOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      )}

      {/* THE canonical stored-files picker, in a NON-BLOCKING draggable
          window (never a sheet/dialog). Mounted at the component root so it
          survives the popover closing. Stays open for multi-pick until
          max_items is reached. */}
      {!disabled && (
        <FilePickerWindow
          open={filePickerOpen}
          onClose={() => setFilePickerOpen(false)}
          scopeId={`reference:${scopeId}`}
          title="Choose file(s)"
          onPick={(selection) => {
            const label = selection.details.filename || undefined;
            addItems("file", [
              {
                file_id: selection.fileId,
                ...(label ? { label } : {}),
              } as unknown as ReferenceItem,
            ]);
            return remaining - 1 <= 0 ? "close" : undefined;
          }}
        />
      )}

      {!disabled && !canAddMore && items.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Max {config.max_items} item{config.max_items === 1 ? "" : "s"}{" "}
          reached.
        </p>
      )}

      {allowedTypes.length === 0 && (
        <p className="text-[11px] text-amber-700 dark:text-amber-300">
          No reference types configured for this item yet — edit the item
          definition to allow at least one.
        </p>
      )}
    </div>
  );
}

export default ReferenceValuePicker;
