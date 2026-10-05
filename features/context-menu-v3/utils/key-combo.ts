// features/context-menu-v3/utils/key-combo.ts
//
// THE ONE READER OF A SHORTCUT'S ADVERTISED KEY COMBO ("Alt+Shift+S").
//
// The menu prints `keyboard_shortcut` beside an item; the shell's key listener
// runs it. Both read the combo HERE, so an advertised combo either runs or is
// not shown (`parseKeyCombo` returns null → the menu draws no hint).
//
// MATCH ON `code`, NEVER `key`: on macOS Option rewrites the character —
// Alt+Shift+S arrives as `key: "Í"`, `code: "KeyS"` (2026-10-02 → 10-05, the
// advertised combo did nothing on /notes).

export interface KeyCombo {
  alt: boolean;
  shift: boolean;
  ctrl: boolean;
  meta: boolean;
  /** `KeyboardEvent.code` for letters/digits ("KeyS", "Digit1"), else null. */
  code: string | null;
  /** Lowercased `KeyboardEvent.key` for named keys ("enter", "/"), else null. */
  key: string | null;
}

const MOD_ALIASES: Record<string, keyof Pick<KeyCombo, "alt" | "shift" | "ctrl" | "meta"> | "mod"> = {
  alt: "alt",
  option: "alt",
  opt: "alt",
  "⌥": "alt",
  shift: "shift",
  "⇧": "shift",
  ctrl: "ctrl",
  control: "ctrl",
  "⌃": "ctrl",
  cmd: "meta",
  command: "meta",
  meta: "meta",
  "⌘": "meta",
  win: "meta",
  mod: "mod",
};

function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent || "");
}

/**
 * Parse an advertised combo. Null when it cannot be a combo this listener can
 * honour: no non-Shift modifier (plain typing), or no key.
 */
export function parseKeyCombo(raw: string | null | undefined): KeyCombo | null {
  if (!raw) return null;
  const parts = raw
    .split(/\s*\+\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  const combo: KeyCombo = { alt: false, shift: false, ctrl: false, meta: false, code: null, key: null };
  const last = parts[parts.length - 1];
  for (const part of parts.slice(0, -1)) {
    const mod = MOD_ALIASES[part.toLowerCase()];
    if (!mod) return null;
    if (mod === "mod") combo[isApplePlatform() ? "meta" : "ctrl"] = true;
    else combo[mod] = true;
  }
  if (/^[a-z]$/i.test(last)) combo.code = `Key${last.toUpperCase()}`;
  else if (/^[0-9]$/.test(last)) combo.code = `Digit${last}`;
  else combo.key = last.toLowerCase();
  if (!combo.alt && !combo.ctrl && !combo.meta) return null;
  // ⌘/Ctrl+Shift+K opens the palette on every surface (ContextMenuV3); a
  // shortcut cannot take the platform's key, so it is not advertised either.
  if ((combo.ctrl || combo.meta) && combo.shift && !combo.alt && combo.code === "KeyK") return null;
  return combo;
}

type KeyEventLike = Pick<KeyboardEvent, "altKey" | "shiftKey" | "ctrlKey" | "metaKey" | "code" | "key">;

export function eventMatchesCombo(e: KeyEventLike, combo: KeyCombo): boolean {
  if (!!e.altKey !== combo.alt || !!e.shiftKey !== combo.shift) return false;
  if (!!e.ctrlKey !== combo.ctrl || !!e.metaKey !== combo.meta) return false;
  if (combo.code) return e.code === combo.code;
  return !!combo.key && (e.key ?? "").toLowerCase() === combo.key;
}

/** First item whose advertised combo this key event presses. */
export function findComboMatch<T>(
  e: KeyEventLike,
  items: readonly T[],
  comboOf: (item: T) => string | null | undefined,
): T | null {
  if (!e.altKey && !e.ctrlKey && !e.metaKey) return null;
  for (const item of items) {
    const combo = parseKeyCombo(comboOf(item));
    if (combo && eventMatchesCombo(e, combo)) return item;
  }
  return null;
}
