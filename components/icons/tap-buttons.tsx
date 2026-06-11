import { forwardRef } from "react";
import {
  TapTargetButton,
  TapTargetButtonTransparent,
  TapTargetButtonSolid,
  TapTargetButtonForGroup,
} from "@/components/icons/TapTargetButton";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

type Variant = "glass" | "transparent" | "solid" | "group";

export interface TapButtonProps {
  variant?: Variant;
  onClick?: () => void;
  as?: "button" | "label";
  htmlFor?: string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  strokeWidth?: number;
  // Solid-variant color overrides — only used when variant="solid"
  bgColor?: string;
  iconColor?: string;
  hoverBgColor?: string;
  activeBgColor?: string;
  // Link support — when set, the button renders as a Next.js Link or <a>.
  // Internal hrefs use next/link; external (http(s)://, mailto:, tel:) use <a>
  // with target="_blank" + rel="noopener noreferrer" by default. Pass an
  // explicit `target` to override (works for internal links too).
  href?: string;
  target?: "_blank" | "_self" | "_parent" | "_top";
  rel?: string;
  prefetch?: boolean | null;
  // Tooltip support — defaults to `ariaLabel`. Pass `false` to opt out.
  tooltip?: string | false;
  tooltipSide?: "top" | "right" | "bottom" | "left";
  tooltipAlign?: "start" | "center" | "end";
}

// ---------------------------------------------------------------------------
// Variant resolver — maps a variant string to the correct wrapper component.
// Runs at build/server time so there's zero client cost.
//
// IMPORTANT: `Wrap` MUST forward refs. The pre-composed `*TapButton` functions
// below are plain function components (in React 19 ref is a regular prop) and
// spread `{...props}` to `Wrap` — that spread carries ref through. `Wrap`
// extracts ref and passes it explicitly to the underlying `forwardRef`
// primitive. Without this, every `*TapButton` placed inside a Radix
// `*Trigger asChild` (DropdownMenu, Popover, Tooltip, etc.) silently loses
// the ref — the popper can't anchor and Radix's injected event handlers /
// `data-state` / `aria-*` get dropped. See `features/files/FEATURE.md` for
// the precedent that established this pattern in this codebase.
// ---------------------------------------------------------------------------

const Wrap = forwardRef<
  HTMLButtonElement,
  TapButtonProps & { children: React.ReactNode }
>(function Wrap({ variant = "glass", children, ...props }, ref) {
  switch (variant) {
    case "transparent":
      return (
        <TapTargetButtonTransparent ref={ref} {...props}>
          {children}
        </TapTargetButtonTransparent>
      );
    case "solid":
      return (
        <TapTargetButtonSolid ref={ref} {...props}>
          {children}
        </TapTargetButtonSolid>
      );
    case "group":
      return (
        <TapTargetButtonForGroup ref={ref} {...props}>
          {children}
        </TapTargetButtonForGroup>
      );
    default:
      return (
        <TapTargetButton ref={ref} {...props}>
          {children}
        </TapTargetButton>
      );
  }
});

// ---------------------------------------------------------------------------
// Pre-composed buttons — one import, one tag, zero configuration needed.
// Default variant is "glass". Override with variant="transparent" etc.
// All SVG paths match lucide-react v0.577.0 exactly.
// ---------------------------------------------------------------------------

// lucide: menu (hand-crafted HeroIcons path — no Lucide equivalent, kept as-is)
export function MenuTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Menu" strokeWidth={1.75} {...props}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
      />
    </Wrap>
  );
}

// lucide: plus (hand-crafted — no drift, kept as-is)
export function PlusTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Add" {...props}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 4.5v15m7.5-7.5h-15"
      />
    </Wrap>
  );
}

// lucide: search → circle cx=11 cy=11 r=8 + line to 21,21
export function SearchTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Search" {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.34-4.34" />
    </Wrap>
  );
}

// lucide: settings (hand-crafted — kept as-is, Lucide uses "settings-2" pattern)
export function SettingsTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Settings" {...props}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
    </Wrap>
  );
}

// lucide: maximize (hand-crafted corner-arrows — kept as-is)
export function MaximizeTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Fullscreen" {...props}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
      />
    </Wrap>
  );
}

// lucide: arrow-down-up (hand-crafted — kept as-is)
export function ArrowDownUpTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Sort" {...props}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 4.5h14.25M3 9h9.75M3 13.5h5.25m5.25-.75L17.25 9m0 0L21 12.75M17.25 9v10.5"
      />
    </Wrap>
  );
}

// lucide: bell v0.577.0
export function BellTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Notifications" {...props}>
      <path d="M10.268 21a2 2 0 0 0 3.464 0" />
      <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
    </Wrap>
  );
}

// lucide: bell-ring v0.577.0 — animated cousin of bell, used for "has unread"
export function BellRingTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Notifications" {...props}>
      <path d="M10.268 21a2 2 0 0 0 3.464 0" />
      <path d="M22 8c0-2.3-.8-4.3-2-6" />
      <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
      <path d="M4 2C2.8 3.7 2 5.7 2 8" />
    </Wrap>
  );
}

// lucide: zap v0.577.0 — lightning bolt, used as the Quick Actions trigger
export function ZapTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Quick actions" {...props}>
      <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
    </Wrap>
  );
}

// lucide: upload v0.577.0
export function UploadTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Upload" {...props}>
      <path d="M12 3v12" />
      <path d="m17 8-5-5-5 5" />
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    </Wrap>
  );
}

// lucide: undo v0.577.0
export function UndoTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Undo" {...props}>
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
    </Wrap>
  );
}

// lucide: redo v0.577.0
export function RedoTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Redo" {...props}>
      <path d="M21 7v6h-6" />
      <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
    </Wrap>
  );
}

// lucide: copy v0.577.0
export function CopyTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Copy" {...props}>
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </Wrap>
  );
}

// lucide: trash v0.577.0
export function TrashTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Delete" {...props}>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </Wrap>
  );
}

// lucide: files v0.577.0
export function FilesTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Copy all" {...props}>
      <path d="M20 7h-3a2 2 0 0 1-2-2V2" />
      <path d="M9 18a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h7l4 4v10a2 2 0 0 1-2 2Z" />
      <path d="M3 7.6v12.8A1.6 1.6 0 0 0 4.6 22h9.8" />
    </Wrap>
  );
}

// lucide: chevron-left v0.577.0 — arms extended from 6 to 7 (45° kept) for a
// slightly larger glyph that better fills the 32px inner pill.
export function ChevronLeftTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Back" {...props}>
      <path d="m16 19-7-7 7-7" />
    </Wrap>
  );
}

// lucide: panel-left v0.577.0
export function PanelLeftTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Toggle sidebar" {...props}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
    </Wrap>
  );
}

// lucide: panel-right v0.577.0
export function PanelRightTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Toggle sidebar" {...props}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M15 3v18" />
    </Wrap>
  );
}

// lucide: square-pen v0.577.0
export function SquarePenTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="New chat" {...props}>
      <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" />
    </Wrap>
  );
}

// lucide: x v0.577.0
export function XTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Close" {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Wrap>
  );
}

// lucide: funnel v0.577.0 (filter is an alias for funnel in this version)
export function FilterTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Filter" {...props}>
      <path d="M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z" />
    </Wrap>
  );
}

// lucide: play v0.577.0
export function PlayTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Play" {...props}>
      <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />
    </Wrap>
  );
}

// lucide: pause v0.577.0 — two rects (redesigned from bar paths)
export function PauseTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Pause" {...props}>
      <rect x="14" y="3" width="5" height="18" rx="1" />
      <rect x="5" y="3" width="5" height="18" rx="1" />
    </Wrap>
  );
}

// lucide: square v0.577.0 (stop uses filled square)
export function StopTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Stop" {...props}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
    </Wrap>
  );
}

// lucide: volume-2 v0.577.0
export function Volume2TapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Speaker" {...props}>
      <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" />
      <path d="M16 9a5 5 0 0 1 0 6" />
      <path d="M19.364 18.364a9 9 0 0 0 0-12.728" />
    </Wrap>
  );
}

// lucide: arrow-up v0.577.0
export function ArrowUpTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Send" {...props}>
      <path d="m5 12 7-7 7 7" />
      <path d="M12 19V5" />
    </Wrap>
  );
}

// lucide: mic v0.577.0
export function MicTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Start recording" {...props}>
      <path d="M12 19v3" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <rect x="9" y="2" width="6" height="13" rx="3" />
    </Wrap>
  );
}

// lucide: mic-off v0.577.0
export function MicOffTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Stop recording" {...props}>
      <path d="M12 19v3" />
      <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
      <path d="M16.95 16.95A7 7 0 0 1 5 12v-2" />
      <path d="M18.89 13.23A7 7 0 0 0 19 12v-2" />
      <path d="m2 2 20 20" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
    </Wrap>
  );
}

// lucide: bug v0.577.0 (major update — full insect anatomy)
export function BugTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Debug" {...props}>
      <path d="M12 20v-9" />
      <path d="M14 7a4 4 0 0 1 4 4v3a6 6 0 0 1-12 0v-3a4 4 0 0 1 4-4z" />
      <path d="M14.12 3.88 16 2" />
      <path d="M21 21a4 4 0 0 0-3.81-4" />
      <path d="M21 5a4 4 0 0 1-3.55 3.97" />
      <path d="M22 13h-4" />
      <path d="M3 21a4 4 0 0 1 3.81-4" />
      <path d="M3 5a4 4 0 0 0 3.55 3.97" />
      <path d="M6 13H2" />
      <path d="m8 2 1.88 1.88" />
      <path d="M9 7.13V6a3 3 0 1 1 6 0v1.13" />
    </Wrap>
  );
}

// lucide: settings-2 v0.577.0 (gear + center circle — kept as-is, matches intent)
export function Settings2TapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Settings" {...props}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </Wrap>
  );
}

// lucide: save (hand-crafted floppy disk — no direct Lucide equivalent, kept as-is)
export function SaveTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Save" {...props}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.5 6a2 2 0 012-2h9.25L20.5 9v9a2 2 0 01-2 2h-12a2 2 0 01-2-2V6z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.5 4v4.5a.5.5 0 00.5.5h6a.5.5 0 00.5-.5V4"
      />
      <rect
        x="8"
        y="14"
        width="8"
        height="5.5"
        rx="0.5"
        strokeLinejoin="round"
      />
    </Wrap>
  );
}

// lucide: send v0.577.0 (paper-airplane redesign)
export function SendTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Send" {...props}>
      <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
      <path d="m21.854 2.147-10.94 10.939" />
    </Wrap>
  );
}

// lucide: message-square v0.577.0
export function MessageTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Message" {...props}>
      <path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z" />
    </Wrap>
  );
}

// lucide: variable v0.577.0 (major update — uses line elements + bracket paths)
export function VariableTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Variable" {...props}>
      <path d="M8 21s-4-3-4-9 4-9 4-9" />
      <path d="M16 3s4 3 4 9-4 9-4 9" />
      <line x1="15" x2="9" y1="9" y2="15" />
      <line x1="9" x2="15" y1="9" y2="15" />
    </Wrap>
  );
}

// lucide: wrench v0.577.0 (single clean path)
export function WrenchTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Tool" {...props}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z" />
    </Wrap>
  );
}

// lucide: command v0.577.0 (single continuous path)
export function CommandTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Command" {...props}>
      <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" />
    </Wrap>
  );
}

// lucide: terminal v0.577.0 (two paths: chevron + underline)
export function TerminalTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Terminal" {...props}>
      <path d="M12 19h8" />
      <path d="m4 17 6-6-6-6" />
    </Wrap>
  );
}

// lucide: test-tube v0.577.0 (3 clean paths)
export function TestTubeTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Test" {...props}>
      <path d="M14.5 2v17.5c0 1.4-1.1 2.5-2.5 2.5c-1.4 0-2.5-1.1-2.5-2.5V2" />
      <path d="M8.5 2h7" />
      <path d="M14.5 16h-5" />
    </Wrap>
  );
}

// lucide: rotate-ccw v0.577.0 (same shape as history minus the clock hand — used for Reset)
export function ResetTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Reset" {...props}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </Wrap>
  );
}

// lucide: eraser v0.577.0 (major update — proper eraser shape)
export function ClearTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Clear" {...props}>
      <path d="M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21" />
      <path d="m5.082 11.09 8.828 8.828" />
    </Wrap>
  );
}

// lucide: retry (hand-crafted refresh arc — kept as-is, intentionally distinct from reset)
export function RetryTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Retry" {...props}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0011.667-1.046M9.75 6.75l-2.766 2.266a8.25 8.25 0 001.046 11.667"
      />
    </Wrap>
  );
}

// lucide: loading spinner (custom animated — no Lucide equivalent)
export function LoadingTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Loading" {...props}>
      <circle
        className="animate-spin"
        cx="12"
        cy="12"
        r="9"
        strokeDasharray="28.27"
        strokeDashoffset="9"
        strokeLinecap="round"
        style={{ transformOrigin: "12px 12px" }}
      />
    </Wrap>
  );
}

// lucide: bot/robot (hand-crafted — kept as-is)
export function RobotTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="AI Agent" {...props}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 3.75H6.912a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H15M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859M12 3v8.25m0 0-3-3m3 3 3-3"
      />
    </Wrap>
  );
}

// lucide: webhook v0.577.0
export function WebhookTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Webhook" {...props}>
      <path d="M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2" />
      <path d="m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06" />
      <path d="m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8" />
    </Wrap>
  );
}

// lucide: eye v0.577.0
export function ViewTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="View" {...props}>
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <circle cx="12" cy="12" r="3" />
    </Wrap>
  );
}

// lucide: hammer v0.577.0
export function BuildTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Build" {...props}>
      <path d="m15 12-9.373 9.373a1 1 0 0 1-3.001-3L12 9" />
      <path d="m18 15 4-4" />
      <path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172v-.344a2 2 0 0 0-.586-1.414l-1.657-1.657A6 6 0 0 0 12.516 3H9l1.243 1.243A6 6 0 0 1 12 8.485V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5" />
    </Wrap>
  );
}

// lucide: play v0.577.0 (alias for Run context)
export function RunTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Run" {...props}>
      <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />
    </Wrap>
  );
}

// lucide: history v0.577.0
export function HistoryTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="History" {...props}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </Wrap>
  );
}

// lucide: paperclip v0.577.0
export function PaperclipTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Attach file" {...props}>
      <path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551" />
    </Wrap>
  );
}

// lucide: thumbs-up v0.577.0
export function ThumbsUpTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Like" {...props}>
      <path d="M7 10v12" />
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
    </Wrap>
  );
}

// lucide: thumbs-down v0.577.0
export function ThumbsDownTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Dislike" {...props}>
      <path d="M17 14V2" />
      <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
    </Wrap>
  );
}

// lucide: check v0.577.0
export function CheckTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Done" {...props}>
      <path d="M20 6 9 17l-5-5" />
    </Wrap>
  );
}

// lucide: pencil v0.577.0
export function PencilTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Edit" {...props}>
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="m15 5 4 4" />
    </Wrap>
  );
}

// lucide: ellipsis (more-horizontal) v0.577.0
export function MoreHorizontalTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="More options" {...props}>
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </Wrap>
  );
}

// lucide: check-square v0.577.0
export function CheckSquareTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Task" {...props}>
      <path d="m9 11 3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </Wrap>
  );
}

// lucide: ghost v0.577.0
export function GhostTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Incognito chat" {...props}>
      <path d="M9 10h.01" />
      <path d="M15 10h.01" />
      <path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z" />
    </Wrap>
  );
}

// lucide: link (chain link — used for "attach to task") v0.577.0
export function LinkTapButton(props: TapButtonProps) {
  return (
    <Wrap ariaLabel="Attach" {...props}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </Wrap>
  );
}
