"use client";

/**
 * The ONE format picker. A format select filtered to what the column's storage
 * type can carry, plus only the options that format actually reads.
 *
 * Deliberately says nothing about databases: the user picks "Currency", not a
 * type. Changing a format never touches stored data, so this control needs no
 * confirmation and no warning — that is the whole point of the format layer.
 */
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/utils/cn";
import { Settings2 } from "lucide-react";

import {
  defaultFormatForBase,
  getFieldFormat,
  groupedFormatsForBase,
} from "./registry";
import type { FieldFormatConfig, FieldFormatOptions } from "./types";

export type FieldFormatPickerProps = {
  /** The column's storage type. */
  dataType: string;
  value: FieldFormatConfig | null;
  onChange: (next: FieldFormatConfig) => void;
  /** Hide the options row (e.g. in a very tight header popover). */
  hideOptions?: boolean;
  /**
   * `popover` keeps format-specific controls out of document flow. Use it in
   * dense rows where changing a format must not resize every row below it.
   */
  optionsPresentation?: "inline" | "popover";
  /**
   * `embedded` lets the primary control and options participate directly in a
   * parent flex/grid layout. The default keeps them stacked as one form field.
   */
  layout?: "stacked" | "embedded";
  /** Optional caption for the primary format control. */
  label?: string;
  className?: string;
  optionsClassName?: string;
  triggerClassName?: string;
};

const CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "JPY",
  "CHF",
  "CNY",
  "INR",
  "MXN",
  "BRL",
];

export function FieldFormatPicker({
  dataType,
  value,
  onChange,
  hideOptions = false,
  optionsPresentation = "inline",
  layout = "stacked",
  label,
  className,
  optionsClassName,
  triggerClassName,
}: FieldFormatPickerProps) {
  const groups = groupedFormatsForBase(dataType);
  // `||`, not `??` — an empty-string id is as absent as undefined, and one can
  // arrive from a cleared Radix value or a hand-edited metadata row.
  const activeId = value?.id || defaultFormatForBase(dataType);
  const def = getFieldFormat(activeId);
  const options = value?.options ?? {};

  const setOption = <K extends keyof FieldFormatOptions>(
    key: K,
    next: FieldFormatOptions[K],
  ) => {
    const merged = { ...options, [key]: next };
    if (next === undefined || next === "") delete merged[key];
    onChange({ id: activeId, options: merged });
  };

  const optionKeys = def?.optionKeys ?? [];
  const isEmbedded = layout === "embedded";
  const showOptions = !hideOptions && optionKeys.length > 0;

  const optionControls = (
    <>
      {optionKeys.includes("currency") && (
        <div className="w-28">
          <Label className="text-[11px] text-muted-foreground">Currency</Label>
          <Select
            value={options.currency ?? "USD"}
            onValueChange={(v) => setOption("currency", v)}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {optionKeys.includes("percentScale") && (
        <div className="w-40">
          <Label className="text-[11px] text-muted-foreground">Stored as</Label>
          <Select
            value={options.percentScale ?? "whole"}
            onValueChange={(v) =>
              setOption("percentScale", v as "whole" | "fraction")
            }
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="whole">45 means 45%</SelectItem>
              <SelectItem value="fraction">0.45 means 45%</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {optionKeys.includes("durationUnit") && (
        <div className="w-32">
          <Label className="text-[11px] text-muted-foreground">Unit</Label>
          <Select
            value={options.durationUnit ?? "seconds"}
            onValueChange={(v) =>
              setOption(
                "durationUnit",
                v as NonNullable<FieldFormatOptions["durationUnit"]>,
              )
            }
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="milliseconds">Milliseconds</SelectItem>
              <SelectItem value="seconds">Seconds</SelectItem>
              <SelectItem value="minutes">Minutes</SelectItem>
              <SelectItem value="hours">Hours</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {optionKeys.includes("precision") && (
        <div className="w-20">
          <Label className="text-[11px] text-muted-foreground">Decimals</Label>
          <Input
            type="number"
            min={0}
            max={10}
            className="h-10 text-base sm:h-7 sm:text-xs"
            value={options.precision ?? ""}
            placeholder="auto"
            onChange={(e) =>
              setOption(
                "precision",
                e.target.value === "" ? undefined : Number(e.target.value),
              )
            }
          />
        </div>
      )}

      {optionKeys.includes("ratingMax") && (
        <div className="w-20">
          <Label className="text-[11px] text-muted-foreground">Out of</Label>
          <Input
            type="number"
            min={1}
            max={10}
            className="h-10 text-base sm:h-7 sm:text-xs"
            value={options.ratingMax ?? 5}
            onChange={(e) => setOption("ratingMax", Number(e.target.value))}
          />
        </div>
      )}

      {optionKeys.includes("dateStyle") && (
        <div className="w-28">
          <Label className="text-[11px] text-muted-foreground">Style</Label>
          <Select
            value={options.dateStyle ?? "medium"}
            onValueChange={(v) =>
              setOption("dateStyle", v as "short" | "medium" | "long")
            }
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="short">Short</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="long">Long</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {optionKeys.includes("prefix") && (
        <div className="w-24">
          <Label className="text-[11px] text-muted-foreground">Prefix</Label>
          <Input
            className="h-10 text-base sm:h-7 sm:text-xs"
            value={options.prefix ?? ""}
            onChange={(e) => setOption("prefix", e.target.value)}
          />
        </div>
      )}

      {optionKeys.includes("suffix") && (
        <div className="w-24">
          <Label className="text-[11px] text-muted-foreground">Suffix</Label>
          <Input
            className="h-10 text-base sm:h-7 sm:text-xs"
            value={options.suffix ?? ""}
            placeholder="e.g. kg"
            onChange={(e) => setOption("suffix", e.target.value)}
          />
        </div>
      )}

      {optionKeys.includes("useGrouping") && (
        <div className="flex items-center gap-1.5 pb-1">
          <Switch
            checked={options.useGrouping !== false}
            onCheckedChange={(checked) => setOption("useGrouping", checked)}
          />
          <Label className="text-[11px] text-muted-foreground">
            Thousands separators
          </Label>
        </div>
      )}
    </>
  );

  return (
    <div className={cn(isEmbedded ? "contents" : "space-y-2", className)}>
      <div className="min-w-0">
        {label && (
          <Label className="mb-0.5 block text-[10px] uppercase tracking-wide text-muted-foreground">
            {label}
          </Label>
        )}
        <div
          className={cn(
            optionsPresentation === "popover" && "flex items-center gap-1",
          )}
        >
          <Select
            value={activeId}
            onValueChange={(id) => {
              // Radix fires onValueChange("") when the currently-selected item
              // leaves the list — which happens every time the storage type
              // changes and the option set is rebuilt. Writing that "" back
              // clobbered the format the caller had just set (pick Number as the
              // type and the format silently became "", rendering as "Text").
              // Only accept a real, known format id.
              if (!getFieldFormat(id)) return;
              onChange({ id: id as FieldFormatConfig["id"], options: {} });
            }}
          >
            <SelectTrigger
              className={cn("h-7 min-w-0 text-xs", triggerClassName)}
            >
              {/* A plain span, NOT <SelectValue>. Radix renders the trigger's text
                  by portaling it out of the matching <SelectItem>, which only
                  exists while the dropdown is open — so changing the storage type
                  (and with it the whole option list) left the trigger BLANK, and
                  the two-line label+description item body truncated to "Text…"
                  even when it did render. The label is ours to draw. */}
              <span className="truncate">{def?.label ?? "Text"}</span>
            </SelectTrigger>
            <SelectContent>
              {groups.map((group) => (
                <SelectGroup key={group.group}>
                  <SelectLabel className="text-[11px] uppercase tracking-wide">
                    {group.group}
                  </SelectLabel>
                  {group.formats.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      <div>
                        <div className="font-medium">{f.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {f.description}
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>

          {optionsPresentation === "popover" &&
            (showOptions ? (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    aria-label={`Format options for ${def?.label ?? "Text"}`}
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="w-[min(26rem,calc(100vw-2rem))] p-3"
                >
                  <div className="mb-2 text-xs font-medium">
                    {def?.label ?? "Text"} options
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    {optionControls}
                  </div>
                </PopoverContent>
              </Popover>
            ) : (
              <span aria-hidden className="h-7 w-7 shrink-0" />
            ))}
        </div>
      </div>

      {showOptions && optionsPresentation === "inline" && (
        <div className={cn("flex flex-wrap items-end gap-2", optionsClassName)}>
          {optionControls}
        </div>
      )}
    </div>
  );
}

export default FieldFormatPicker;
