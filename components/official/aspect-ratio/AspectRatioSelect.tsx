"use client";

/**
 * AspectRatioSelect — the aspect-ratio picker every surface uses.
 *
 * A compact select where each ratio carries a small shape preview and a plain
 * name (Square, Widescreen, Story…); common ratios first, the rest behind
 * "More ratios"; words such as "auto" read as words. Champion: the ratio menus
 * in Midjourney's web app and Figma's frame presets — a shape you can see beats
 * a number you must picture.
 */

import { OptionCombobox } from "@/components/official/option-combobox/OptionCombobox";
import { cn } from "@/lib/utils";
import {
  groupRatioOptions,
  humanizeRatioWord,
  parseRatio,
  ratioShapeName,
} from "./aspect-ratio-options";

/** A ratio drawn as a rectangle inside a 14px box. */
export function AspectRatioGlyph({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const r = parseRatio(value);
  const box = 14;
  if (!r) {
    return (
      <span
        aria-hidden
        className={cn(
          "inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center",
          className,
        )}
      >
        <span className="h-2.5 w-2.5 rounded-[2px] border border-dashed border-current opacity-60" />
      </span>
    );
  }
  const k = r.w / r.h;
  const w = k >= 1 ? box : Math.max(3, box * k);
  const h = k >= 1 ? Math.max(3, box / k) : box;
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center",
        className,
      )}
    >
      <span
        className="rounded-[2px] border-[1.5px] border-current opacity-80"
        style={{ width: w, height: h }}
      />
    </span>
  );
}

export interface AspectRatioSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  variant?: "field" | "inline";
  compact?: boolean;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
  placeholder?: string;
}

export function AspectRatioSelect({
  value,
  onChange,
  options,
  variant = "field",
  compact,
  disabled,
  id,
  ariaLabel = "Aspect ratio",
  placeholder = "Choose a ratio",
}: AspectRatioSelectProps) {
  const { words, common, more } = groupRatioOptions(options);
  const groups = [
    ...(words.length ? [{ options: words }] : []),
    { options: common },
    ...(more.length
      ? [{ heading: "More ratios", options: more, collapsed: true }]
      : []),
  ];
  return (
    <OptionCombobox
      value={value}
      onChange={onChange}
      groups={groups}
      getLabel={(o) => (parseRatio(o) ? o : humanizeRatioWord(o))}
      getHint={(o) => ratioShapeName(o)}
      renderIcon={(o) => (
        <AspectRatioGlyph value={o} className="text-muted-foreground" />
      )}
      searchable={options.length > 12}
      searchPlaceholder="Search ratios…"
      placeholder={placeholder}
      variant={variant}
      compact={compact}
      disabled={disabled}
      id={id}
      ariaLabel={ariaLabel}
    />
  );
}
