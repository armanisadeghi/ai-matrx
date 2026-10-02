/**
 * Terminal look: font, metrics and the two palettes. One place, so every terminal in every app
 * renders the same.
 */
import type { ITheme } from "@xterm/xterm";

/** The system monospace first: SF Mono on Apple platforms, then the usual fallbacks. */
export const TERMINAL_FONT_FAMILY = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

export const TERMINAL_DEFAULTS = {
  fontSize: 13,
  lineHeight: 1.2,
  scrollback: 5000,
  /** Side padding inside the terminal box, px. */
  padding: 8,
} as const;

/** The keyboard accessory bar's height, px (styles.css .mxt-bar) — hosts reserve it as a bottom dock. */
export const ACCESSORY_BAR_HEIGHT = 44;

export function terminalTheme(dark: boolean): ITheme {
  return dark
    ? {
        background: "#1e1e1e",
        foreground: "#e4e4e7",
        cursor: "#e4e4e7",
        cursorAccent: "#1e1e1e",
        black: "#1e1e1e",
        red: "#f87171",
        green: "#4ade80",
        yellow: "#facc15",
        blue: "#60a5fa",
        magenta: "#c084fc",
        cyan: "#22d3ee",
        white: "#e5e7eb",
        brightBlack: "#71717a",
        brightRed: "#fca5a5",
        brightGreen: "#86efac",
        brightYellow: "#fde047",
        brightBlue: "#93c5fd",
        brightMagenta: "#d8b4fe",
        brightCyan: "#67e8f9",
        brightWhite: "#f4f4f5",
        selectionBackground: "#3b82f680",
      }
    : {
        background: "#ffffff",
        foreground: "#18181b",
        cursor: "#18181b",
        cursorAccent: "#ffffff",
        black: "#18181b",
        red: "#b91c1c",
        green: "#15803d",
        yellow: "#b45309",
        blue: "#1d4ed8",
        magenta: "#7c3aed",
        cyan: "#0e7490",
        white: "#d4d4d8",
        brightBlack: "#71717a",
        brightRed: "#dc2626",
        brightGreen: "#16a34a",
        brightYellow: "#d97706",
        brightBlue: "#2563eb",
        brightMagenta: "#9333ea",
        brightCyan: "#0891b2",
        brightWhite: "#a1a1aa",
        selectionBackground: "#93c5fd99",
      };
}
