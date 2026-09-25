"use client";

// KitIcon — a manifest names its icon as a Lucide word; this turns the word into
// the icon. A curated static set (no dynamic import — THE FRAGMENTATION LAW); a word
// outside it falls back to the package icon and says so in the console once.

import {
  BookOpen,
  BrainCircuit,
  Cpu,
  Database,
  FileText,
  Filter,
  Hash,
  Layers,
  LayoutGrid,
  ListChecks,
  MessageCircle,
  MessageSquare,
  Package,
  Palette,
  Search,
  SlidersHorizontal,
  Table2,
  Tag,
  Tags,
  Target,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/utils/cn";

const ICONS: Record<string, LucideIcon> = {
  BookOpen,
  BrainCircuit,
  Cpu,
  Bot: BrainCircuit,
  Database,
  FileText,
  Filter,
  Hash,
  Layers,
  LayoutGrid,
  ListChecks,
  MessageSquare,
  MessageCircle,
  MessagesSquare: MessageSquare,
  Package,
  Palette,
  Search,
  SlidersHorizontal,
  Table: Table2,
  Table2,
  Tag,
  Tags,
  Target,
  Workflow,
};

/** The icons a person may pick for a kit they save (each renders here). */
export const KIT_ICON_CHOICES = [
  "package",
  "cpu",
  "table",
  "tags",
  "search",
  "book-open",
  "layers",
  "message-circle",
  "file-text",
  "list-checks",
  "target",
  "sliders-horizontal",
  "palette",
  "workflow",
  "database",
  "hash",
] as const;

const warned = new Set<string>();

export function kitIconFor(name: string | undefined | null): LucideIcon {
  if (!name) return Package;
  const pascal = name.includes("-")
    ? name
        .split("-")
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join("")
    : name.charAt(0).toUpperCase() + name.slice(1);
  const icon = ICONS[name] ?? ICONS[pascal];
  if (!icon && !warned.has(name)) {
    warned.add(name);
    console.warn(`[kits] icon "${name}" is not in the kit icon set — showing the package icon. Add it to features/kits/components/KitIcon.tsx.`);
  }
  return icon ?? Package;
}

/** Five calm tints from the chart palette, chosen by the kit's key so a kit keeps its colour. */
const TINTS = [
  "bg-chart-1/12 text-chart-1 ring-chart-1/20",
  "bg-chart-2/12 text-chart-2 ring-chart-2/20",
  "bg-chart-3/12 text-chart-3 ring-chart-3/20",
  "bg-chart-4/12 text-chart-4 ring-chart-4/20",
  "bg-chart-5/12 text-chart-5 ring-chart-5/20",
] as const;

export function kitTint(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length]!;
}

export function KitIcon({
  name,
  tintKey,
  size = "md",
  className,
}: {
  name: string | undefined | null;
  tintKey: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const Icon = kitIconFor(name);
  const box = size === "lg" ? "h-14 w-14 rounded-2xl" : size === "sm" ? "h-8 w-8 rounded-lg" : "h-11 w-11 rounded-xl";
  const glyph = size === "lg" ? "h-7 w-7" : size === "sm" ? "h-4 w-4" : "h-5 w-5";
  return (
    <div className={cn("flex shrink-0 items-center justify-center ring-1 ring-inset", box, kitTint(tintKey), className)}>
      <Icon className={glyph} strokeWidth={1.75} />
    </div>
  );
}
