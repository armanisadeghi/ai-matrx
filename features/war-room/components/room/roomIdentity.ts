// features/war-room/components/room/roomIdentity.ts
//
// Room IDENTITY vocabulary: the curated icon set + semantic color palette a user
// picks from to make each War Room visually distinct on the gallery and in the
// room header. Lives here (not in constants.ts, which other streams own) and is
// the single source of truth for both the editor (RoomIdentityButton) and the
// branding consumers (SessionCard, WarRoomShell header).
//
// Two stored primitives — BOTH plain strings on ctx_war_room_sessions:
//   • session.icon  — one of ROOM_ICON_NAMES (a Lucide icon name)
//   • session.color — one of ROOM_COLOR_TOKENS (a semantic-token id)
//
// Tailwind 4 needs STATIC class strings (no `bg-${token}`), so each color id maps
// to a frozen record of full class strings — mirrors the feature's own tileKind.ts
// pattern. Colors are all semantic tokens (theme-aware: dark mode + theme changes
// flow through automatically), never raw hex.

import {
  Gauge,
  LayoutGrid,
  Target,
  Rocket,
  Compass,
  Flag,
  Briefcase,
  FolderKanban,
  Lightbulb,
  Microscope,
  Megaphone,
  Radar,
  Anchor,
  Beaker,
  Building2,
  Boxes,
  type LucideIcon,
} from "lucide-react";

// ── Icons ──────────────────────────────────────────────────────────────
// A small, curated set — enough to make rooms distinct without a sprawling
// picker. Stored as the icon NAME (the map key); resolve via `roomIconOf`.
export const ROOM_ICONS = {
  gauge: Gauge,
  grid: LayoutGrid,
  target: Target,
  rocket: Rocket,
  compass: Compass,
  flag: Flag,
  briefcase: Briefcase,
  project: FolderKanban,
  idea: Lightbulb,
  research: Microscope,
  campaign: Megaphone,
  radar: Radar,
  anchor: Anchor,
  lab: Beaker,
  org: Building2,
  boxes: Boxes,
} as const satisfies Record<string, LucideIcon>;

export type RoomIconName = keyof typeof ROOM_ICONS;

export const ROOM_ICON_NAMES = Object.keys(ROOM_ICONS) as RoomIconName[];

/** Default icon when a room has no `icon` set — matches the room header's prior glyph. */
export const DEFAULT_ROOM_ICON: RoomIconName = "gauge";

/** Resolve a stored icon name (or null) to a Lucide component, defaulting safely. */
export function roomIconOf(name: string | null | undefined): LucideIcon {
  return (name && ROOM_ICONS[name as RoomIconName]) || ROOM_ICONS[DEFAULT_ROOM_ICON];
}

// ── Colors ─────────────────────────────────────────────────────────────
export interface RoomColor {
  id: string;
  label: string;
  /** Solid swatch / accent bar fill. */
  swatch: string;
  /** Text color for the icon when this color is active. */
  text: string;
  /** Subtle tinted background (e.g. behind the room icon). */
  tint: string;
  /** Ring/border for the active swatch + the card accent border. */
  ring: string;
}

// Keyed by the token id we persist in session.color. Every class is static so
// Tailwind keeps it. The first entry is the default (used when color is unset).
export const ROOM_COLORS: Record<string, RoomColor> = {
  primary: {
    id: "primary",
    label: "Blue",
    swatch: "bg-primary",
    text: "text-primary",
    tint: "bg-primary/10",
    ring: "ring-primary",
  },
  success: {
    id: "success",
    label: "Green",
    swatch: "bg-success",
    text: "text-success",
    tint: "bg-success/10",
    ring: "ring-success",
  },
  warning: {
    id: "warning",
    label: "Amber",
    swatch: "bg-warning",
    text: "text-warning",
    tint: "bg-warning/10",
    ring: "ring-warning",
  },
  info: {
    id: "info",
    label: "Sky",
    swatch: "bg-info",
    text: "text-info",
    tint: "bg-info/10",
    ring: "ring-info",
  },
  destructive: {
    id: "destructive",
    label: "Red",
    swatch: "bg-destructive",
    text: "text-destructive",
    tint: "bg-destructive/10",
    ring: "ring-destructive",
  },
  "accent-2": {
    id: "accent-2",
    label: "Violet",
    swatch: "bg-accent-2",
    text: "text-accent-2",
    tint: "bg-accent-2/10",
    ring: "ring-accent-2",
  },
  "chart-2": {
    id: "chart-2",
    label: "Teal",
    swatch: "bg-chart-2",
    text: "text-chart-2",
    tint: "bg-chart-2/10",
    ring: "ring-chart-2",
  },
  "chart-5": {
    id: "chart-5",
    label: "Rose",
    swatch: "bg-chart-5",
    text: "text-chart-5",
    tint: "bg-chart-5/10",
    ring: "ring-chart-5",
  },
};

export const ROOM_COLOR_TOKENS = Object.keys(ROOM_COLORS);

/** The default color id — the room header / card accent when `color` is unset. */
export const DEFAULT_ROOM_COLOR = "primary";

/** Resolve a stored color token (or null) to its class bundle, defaulting safely. */
export function roomColorOf(token: string | null | undefined): RoomColor {
  return (token && ROOM_COLORS[token]) || ROOM_COLORS[DEFAULT_ROOM_COLOR];
}
