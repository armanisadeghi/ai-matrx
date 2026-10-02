/**
 * The keyboard accessory bar's keys and the bytes each sends — the keys a phone keyboard lacks.
 * Pure: no DOM, no xterm. Sequences follow xterm's own encoding (CSI 1;<mod> for modified cursor
 * keys, SS3 in application cursor mode), so full-screen programs (vim, less, htop) read them
 * exactly as they read a desktop keyboard.
 */

export type AccessoryKeyId =
  | "esc"
  | "tab"
  | "ctrl"
  | "alt"
  | "left"
  | "down"
  | "up"
  | "right"
  | "pipe"
  | "slash"
  | "tilde"
  | "dash"
  | "home"
  | "end"
  | "pgup"
  | "pgdn"
  | "paste"
  | "hide";

export interface AccessoryKeyDef {
  id: AccessoryKeyId;
  /** What the key shows. */
  label: string;
  /** What a screen reader says. */
  aria: string;
  /** send = bytes to the PTY; modifier = Ctrl/Alt state; action = paste / hide keyboard. */
  kind: "send" | "modifier" | "action";
  /** Keys sharing a group sit together; a divider separates groups. */
  group: number;
}

/** Termius order: Esc Tab Ctrl Alt | ← ↓ ↑ → | | / ~ - | Home End PgUp PgDn | Paste, hide. */
export const ACCESSORY_KEYS: readonly AccessoryKeyDef[] = [
  { id: "esc", label: "Esc", aria: "Escape", kind: "send", group: 0 },
  { id: "tab", label: "Tab", aria: "Tab", kind: "send", group: 0 },
  { id: "ctrl", label: "Ctrl", aria: "Control", kind: "modifier", group: 0 },
  { id: "alt", label: "Alt", aria: "Alt", kind: "modifier", group: 0 },
  { id: "left", label: "←", aria: "Left arrow", kind: "send", group: 1 },
  { id: "down", label: "↓", aria: "Down arrow", kind: "send", group: 1 },
  { id: "up", label: "↑", aria: "Up arrow", kind: "send", group: 1 },
  { id: "right", label: "→", aria: "Right arrow", kind: "send", group: 1 },
  { id: "pipe", label: "|", aria: "Pipe", kind: "send", group: 2 },
  { id: "slash", label: "/", aria: "Slash", kind: "send", group: 2 },
  { id: "tilde", label: "~", aria: "Tilde", kind: "send", group: 2 },
  { id: "dash", label: "-", aria: "Dash", kind: "send", group: 2 },
  { id: "home", label: "Home", aria: "Home", kind: "send", group: 3 },
  { id: "end", label: "End", aria: "End", kind: "send", group: 3 },
  { id: "pgup", label: "PgUp", aria: "Page up", kind: "send", group: 3 },
  { id: "pgdn", label: "PgDn", aria: "Page down", kind: "send", group: 3 },
  { id: "paste", label: "Paste", aria: "Paste", kind: "action", group: 4 },
  { id: "hide", label: "Hide", aria: "Hide keyboard", kind: "action", group: 4 },
];

export interface ActiveModifiers {
  ctrl: boolean;
  alt: boolean;
}

export interface KeyModes {
  /** DECCKM — xterm's `modes.applicationCursorKeysMode`. */
  applicationCursor: boolean;
}

const ESC = "\x1b";
const CURSOR: Partial<Record<AccessoryKeyId, string>> = { up: "A", down: "B", right: "C", left: "D", home: "H", end: "F" };
const TILDE: Partial<Record<AccessoryKeyId, string>> = { pgup: "5", pgdn: "6" };
const LITERAL: Partial<Record<AccessoryKeyId, string>> = { pipe: "|", slash: "/", tilde: "~", dash: "-", tab: "\t", esc: ESC };

/** xterm's modifier parameter: 1 + shift(1) + alt(2) + ctrl(4). */
function modParam(mods: ActiveModifiers): number {
  return 1 + (mods.alt ? 2 : 0) + (mods.ctrl ? 4 : 0);
}

/**
 * Bytes for a "send" key with the active modifiers applied, or null for a modifier/action key.
 * Modifiers on literal keys go through `applyModifiers` (Ctrl+/ → 0x1f, Alt+| → ESC |).
 */
export function keySequence(id: AccessoryKeyId, mods: ActiveModifiers, modes: KeyModes): string | null {
  const cursor = CURSOR[id];
  if (cursor !== undefined) {
    const m = modParam(mods);
    if (m > 1) return `${ESC}[1;${m}${cursor}`;
    return modes.applicationCursor ? `${ESC}O${cursor}` : `${ESC}[${cursor}`;
  }
  const tilde = TILDE[id];
  if (tilde !== undefined) {
    const m = modParam(mods);
    return m > 1 ? `${ESC}[${tilde};${m}~` : `${ESC}[${tilde}~`;
  }
  const literal = LITERAL[id];
  if (literal !== undefined) {
    if (id === "tab" && mods.ctrl === false && mods.alt === false) return literal;
    if (id === "esc") return mods.alt ? ESC + ESC : ESC;
    return applyModifiers(literal, mods).data;
  }
  return null;
}

/** Ctrl applied to one character, as a terminal keyboard encodes it; null when Ctrl has no code. */
export function controlCode(char: string): string | null {
  if (char.length !== 1) return null;
  const code = char.charCodeAt(0);
  if (code >= 0x61 && code <= 0x7a) return String.fromCharCode(code - 0x60); // a-z
  if (code >= 0x40 && code <= 0x5f) return String.fromCharCode(code - 0x40); // @ A-Z [ \ ] ^ _
  switch (char) {
    case " ":
    case "2":
      return "\x00";
    case "3":
      return "\x1b";
    case "4":
      return "\x1c";
    case "5":
      return "\x1d";
    case "6":
      return "\x1e";
    case "7":
    case "/":
    case "-":
      return "\x1f";
    case "8":
    case "?":
      return "\x7f";
    default:
      return null;
  }
}

/**
 * Apply one-shot or locked modifiers to what the keyboard typed. Only a single key press is
 * modified — a paste or a multi-character IME commit passes through and does NOT consume the
 * modifier, so "Ctrl, then paste" never mangles the paste.
 */
export function applyModifiers(data: string, mods: ActiveModifiers): { data: string; consumed: boolean } {
  if (!mods.ctrl && !mods.alt) return { data, consumed: false };
  const chars = Array.from(data);
  if (chars.length !== 1) {
    // A cursor key typed on a hardware keyboard while Ctrl/Alt are latched: re-encode it.
    const m = /^\x1b(?:\[|O)([ABCDHF])$/.exec(data);
    if (m) return { data: `${ESC}[1;${modParam(mods)}${m[1]}`, consumed: true };
    return { data, consumed: false };
  }
  let out = data;
  if (mods.ctrl) {
    const ctl = controlCode(data);
    if (ctl !== null) out = ctl;
  }
  if (mods.alt) out = ESC + out;
  return { data: out, consumed: true };
}
