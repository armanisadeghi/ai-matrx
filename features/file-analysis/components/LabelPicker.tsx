/**
 * features/file-analysis/components/LabelPicker.tsx
 *
 * Popover that appears after a user drags a region. Shows:
 *   - Cropped preview of the bbox
 *   - Auto-extracted text (server result of extract-at-bbox)
 *   - Category → label autocomplete (with "+ Add custom label" support)
 *   - Per-value-type editor so the user can correct the parsed value
 *   - Redact checkbox (defaults to label catalog's default_redact)
 *   - "Confirm" → POST /annotations, "Cancel" → drop the draft.
 *
 * Used inline by the studio + analysis tab. Doesn't own routing — calls
 * out via props.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckIcon, Loader2, X } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type {
  LabelCatalogEntry,
  AnnotationCreateBody,
} from "@/features/file-analysis/api/file-analysis";
import { BboxPreview } from "./BboxPreview";
import { ValueEditor } from "./ValueEditor";

export interface LabelPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where to anchor the popover (px from viewport top-left). */
  anchor: { x: number; y: number } | null;
  labels: LabelCatalogEntry[];
  byCategory: Map<string, LabelCatalogEntry[]>;
  categories: Record<string, string>;

  /** The cropped preview returned by extract-at-bbox. */
  previewPng?: string | null;
  /** Auto-extracted text from extract-at-bbox. */
  extractedText: string;
  extractedTextSource?: string;
  loading?: boolean;

  /** Suggested label id (e.g. inferred from extracted text heuristics). */
  suggestedLabelId?: string | null;

  onConfirm: (annotation: Omit<AnnotationCreateBody, "page_number" | "bbox">) => void;
  onCancel: () => void;
}

const ALL_CATEGORIES_ID = "__all__";

export function LabelPicker({
  open,
  onOpenChange,
  anchor,
  labels,
  byCategory,
  categories,
  previewPng,
  extractedText,
  extractedTextSource,
  loading,
  suggestedLabelId,
  onConfirm,
  onCancel,
}: LabelPickerProps) {
  const [category, setCategory] = useState<string>(ALL_CATEGORIES_ID);
  const [labelId, setLabelId] = useState<string | null>(suggestedLabelId ?? null);
  const [customLabel, setCustomLabel] = useState<string>("");
  const [rawValue, setRawValue] = useState<string>(extractedText);
  const [normalized, setNormalized] = useState<Record<string, unknown> | null>(null);
  const [redact, setRedact] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>("");

  // When suggestion changes (new draft) refresh the form.
  useEffect(() => {
    setLabelId(suggestedLabelId ?? null);
    setRawValue(extractedText);
    setNormalized(null);
    setCustomLabel("");
    setNotes("");
  }, [suggestedLabelId, extractedText]);

  const selectedLabel = useMemo(() => {
    if (!labelId) return null;
    return labels.find((l) => l.id === labelId) ?? null;
  }, [labels, labelId]);

  // Sync redact default to the label's catalog hint.
  useEffect(() => {
    if (selectedLabel) setRedact(!!selectedLabel.default_redact);
  }, [selectedLabel]);

  const filteredLabels = useMemo(() => {
    if (category === ALL_CATEGORIES_ID) return labels;
    return byCategory.get(category) ?? [];
  }, [category, byCategory, labels]);

  const finalLabelId = labelId ?? customLabel.trim();
  const finalLabelCategory =
    selectedLabel?.category ?? (category === ALL_CATEGORIES_ID ? "custom" : category);

  const canConfirm = !!finalLabelId;

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm({
      label: finalLabelId,
      label_category: finalLabelCategory,
      extracted_text: rawValue || extractedText,
      normalized_value: normalized,
      redact,
      notes: notes.trim() || null,
      source: "user",
    });
  };

  // Anchor — invisible trigger at the requested coordinates.
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <span
          className="pointer-events-none fixed h-0 w-0"
          style={anchor ? { left: anchor.x, top: anchor.y } : undefined}
          aria-hidden
        />
      </PopoverTrigger>
      <PopoverContent
        className="w-[420px] p-3"
        side="bottom"
        align="start"
        sideOffset={8}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="space-y-3">
          {/* Preview */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Region preview
              </span>
              {extractedTextSource ? (
                <span className="rounded bg-muted px-1.5 py-px text-[9px] uppercase text-muted-foreground">
                  {extractedTextSource}
                </span>
              ) : null}
            </div>
            <BboxPreview pngBase64={previewPng} />
            {loading ? (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> extracting…
              </div>
            ) : null}
          </div>

          {/* Category chips */}
          <div className="flex flex-wrap gap-1">
            <CategoryChip
              active={category === ALL_CATEGORIES_ID}
              onClick={() => setCategory(ALL_CATEGORIES_ID)}
              label="All"
            />
            {Object.entries(categories).map(([id, name]) => (
              <CategoryChip
                key={id}
                active={category === id}
                onClick={() => setCategory(id)}
                label={name}
              />
            ))}
          </div>

          {/* Label search */}
          <Command className="rounded border border-border">
            <CommandInput placeholder="Search labels…" className="text-xs" />
            <CommandList className="max-h-44">
              <CommandEmpty className="text-xs py-2 px-3">
                No matches. Use a custom label below.
              </CommandEmpty>
              <CommandGroup heading={category === ALL_CATEGORIES_ID ? "All labels" : categories[category]}>
                {filteredLabels.map((l) => (
                  <CommandItem
                    key={l.id}
                    value={`${l.display_name} ${l.id} ${l.description ?? ""}`}
                    onSelect={() => {
                      setLabelId(l.id);
                      setCustomLabel("");
                    }}
                    className="text-xs"
                  >
                    <CheckIcon
                      className={cn(
                        "mr-2 h-3 w-3",
                        labelId === l.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="flex-1 truncate">{l.display_name}</span>
                    <span className="ml-2 rounded bg-muted px-1.5 py-px text-[9px] uppercase text-muted-foreground">
                      {l.value_type}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>

          {/* Custom label fallback */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground w-16 shrink-0">Custom</span>
            <input
              type="text"
              placeholder="Add custom label…"
              className="h-7 flex-1 rounded border border-border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
              value={customLabel}
              onChange={(e) => {
                setCustomLabel(e.target.value);
                if (e.target.value) setLabelId(null);
              }}
            />
          </div>

          {/* Value editor */}
          <div className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Value
            </span>
            <ValueEditor
              label={selectedLabel}
              initialRaw={rawValue}
              onChange={({ raw, normalized }) => {
                setRawValue(raw);
                setNormalized(normalized);
              }}
            />
          </div>

          {/* Redact + notes */}
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={redact}
                onCheckedChange={(v) => setRedact(v === true)}
              />
              <span>Mark for redaction</span>
            </label>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={onCancel}
                className="h-7 text-xs"
              >
                <X className="h-3 w-3 mr-1" /> Cancel
              </Button>
              <Button
                size="sm"
                disabled={!canConfirm}
                onClick={handleConfirm}
                className="h-7 text-xs"
              >
                <CheckIcon className="h-3 w-3 mr-1" /> Save
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CategoryChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:bg-accent",
      )}
    >
      {label}
    </button>
  );
}
