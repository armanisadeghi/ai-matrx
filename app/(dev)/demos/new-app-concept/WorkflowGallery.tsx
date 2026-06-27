"use client";

// app/(dev)/demos/new-app-concept/WorkflowGallery.tsx
//
// The row of workflow cards under the composer, rendered in one of several
// arrangement styles so the layout can be compared side by side. A small
// segmented control switches the active style live. Pure presentation — the
// parent owns which workflow is selected.

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Code,
  Globe,
  Image as ImageIcon,
  Mail,
  Presentation,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface GalleryItem {
  id: string;
  label: string;
  icon: LucideIcon;
  iconBubble: string;
}

type Variant =
  | "wave"
  | "fan-up"
  | "fan-down"
  | "straight"
  | "slider"
  | "compact"
  | "spotlight";

const VARIANTS: { id: Variant; label: string }[] = [
  { id: "wave", label: "Wave" },
  { id: "fan-up", label: "Fan up" },
  { id: "fan-down", label: "Fan down" },
  { id: "straight", label: "Straight" },
  { id: "slider", label: "Slider" },
  { id: "compact", label: "Compact" },
  { id: "spotlight", label: "Spotlight" },
];

const MUTED_BUBBLE =
  "bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground";

// Display-only extras so the Slider variant can demonstrate "more on either side".
const SLIDER_EXTRAS: GalleryItem[] = [
  { id: "slides", label: "Slides", icon: Presentation, iconBubble: MUTED_BUBBLE },
  { id: "image", label: "Image", icon: ImageIcon, iconBubble: MUTED_BUBBLE },
  { id: "email", label: "Email", icon: Mail, iconBubble: MUTED_BUBBLE },
  { id: "webpage", label: "Webpage", icon: Globe, iconBubble: MUTED_BUBBLE },
  { id: "code", label: "Code", icon: Code, iconBubble: MUTED_BUBBLE },
];

interface WorkflowGalleryProps {
  items: GalleryItem[];
  activeId: string;
  onSelect: (id: string) => void;
}

/** Per-card transform for the arc / wave arrangements. */
function cardStyle(variant: Variant, i: number, n: number, active: boolean): CSSProperties {
  const center = (n - 1) / 2;
  const offset = i - center;
  switch (variant) {
    case "wave":
      return {
        transform: `translateY(${i % 2 === 0 ? -10 : 10}px) rotate(${i % 2 === 0 ? -2 : 1.5}deg)`,
      };
    // Radial fan: rotation is linear (constant angular step) and the vertical
    // rise compounds as offset², so the cards stay tangent to one shallow arc —
    // a slight, consistent curve. Keep the coefficients small so the ends don't
    // run ahead of their neighbours (left card tilts CW, right card CCW).
    case "fan-up":
      return {
        transform: `translateY(${offset * offset * -7}px) rotate(${-offset * 5}deg)`,
        transformOrigin: "center bottom",
        marginLeft: i === 0 ? 0 : -12,
        zIndex: active ? 20 : 10 - Math.abs(offset),
      };
    // Mirror: center high, ends settle down along the same shallow arch.
    case "fan-down":
      return {
        transform: `translateY(${offset * offset * 7}px) rotate(${offset * 5}deg)`,
        transformOrigin: "center top",
        marginLeft: i === 0 ? 0 : -12,
        zIndex: active ? 20 : 10 - Math.abs(offset),
      };
    case "spotlight":
      return { transform: active ? "scale(1.08)" : "scale(0.94)", zIndex: active ? 20 : 1 };
    default:
      return {};
  }
}

function WorkflowCard({
  item,
  active,
  onSelect,
  style,
  size = "md",
  className,
}: {
  item: GalleryItem;
  active: boolean;
  onSelect: (id: string) => void;
  style?: CSSProperties;
  size?: "md" | "sm";
  className?: string;
}) {
  const Icon = item.icon;
  const sm = size === "sm";
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      style={style}
      className={cn(
        "group relative flex shrink-0 flex-col items-center justify-center rounded-2xl border border-border bg-card text-foreground shadow-sm transition hover:border-primary/40 hover:shadow-lg",
        sm ? "h-24 w-20 gap-2" : "h-32 w-28 gap-3",
        active &&
          "border-primary/50 shadow-[0_18px_44px_rgba(37,99,235,0.18)] ring-2 ring-primary/30",
        className,
      )}
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-full",
          sm ? "h-11 w-11" : "h-16 w-16",
          item.iconBubble,
        )}
      >
        <Icon className={sm ? "h-5 w-5" : "h-8 w-8"} />
      </span>
      <span className={cn("font-semibold", sm ? "text-sm" : "text-base")}>{item.label}</span>
    </button>
  );
}

export function WorkflowGallery({ items, activeId, onSelect }: WorkflowGalleryProps) {
  const [variant, setVariant] = useState<Variant>("wave");
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Center the slider on mount / when switching to it, so "more" peeks both sides.
  useEffect(() => {
    if (variant !== "slider") return;
    const el = scrollerRef.current;
    if (el) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, [variant]);

  const nudge = (dir: 1 | -1) => {
    scrollerRef.current?.scrollBy({ left: dir * 280, behavior: "smooth" });
  };

  return (
    <div className="w-full">
      {/* Variant switcher — a demo-only control */}
      <div className="mb-6 flex flex-wrap items-center justify-center gap-1.5">
        {VARIANTS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setVariant(v.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition",
              variant === v.id
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            {v.label}
          </button>
        ))}
      </div>

      {variant === "slider" ? (
        <div className="relative mx-auto max-w-[640px]">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-background to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-background to-transparent" />
          <button
            type="button"
            onClick={() => nudge(-1)}
            aria-label="Scroll left"
            className="absolute left-1 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-md transition hover:border-primary/40 hover:text-primary"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => nudge(1)}
            aria-label="Scroll right"
            className="absolute right-1 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-md transition hover:border-primary/40 hover:text-primary"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div
            ref={scrollerRef}
            className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-12 py-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {[...items, ...SLIDER_EXTRAS].map((item) => (
              <div key={item.id} className="snap-center">
                <WorkflowCard
                  item={item}
                  active={item.id === activeId}
                  onSelect={onSelect}
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div
          className={cn(
            "flex h-56 w-full items-center justify-center overflow-visible px-2",
            variant === "fan-up" || variant === "fan-down"
              ? "flex-nowrap gap-0"
              : "flex-wrap gap-3 sm:gap-4",
            variant === "compact" && "gap-2 sm:gap-3",
          )}
        >
          {items.map((item, i) => (
            <WorkflowCard
              key={item.id}
              item={item}
              active={item.id === activeId}
              onSelect={onSelect}
              size={variant === "compact" ? "sm" : "md"}
              style={cardStyle(variant, i, items.length, item.id === activeId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Handler helper: route real workflow ids to the parent, toast on slider extras. */
export function makeGallerySelect(
  realIds: readonly string[],
  onReal: (id: string) => void,
) {
  return (id: string) => {
    if (realIds.includes(id)) {
      onReal(id);
    } else {
      toast.info("Preview tile — not wired in this concept demo.");
    }
  };
}
