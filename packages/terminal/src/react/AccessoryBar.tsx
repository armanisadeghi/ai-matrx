"use client";

/**
 * The keyboard accessory bar: one 44px row of the keys a phone keyboard lacks, scrolling
 * sideways. Every key keeps the terminal focused (pointerdown is cancelled), so the keyboard
 * stays up while you tap Esc, arrows or Ctrl. Ctrl / Alt: tap = next key only, double-tap = locked.
 */
import type { ReactNode } from "react";

import { ACCESSORY_KEYS } from "../core/keys";
import type { AccessoryKeyDef, AccessoryKeyId } from "../core/keys";
import type { ModifierState } from "../core/modifiers";

function PasteIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </svg>
  );
}

function HideKeyboardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="3" width="20" height="12" rx="2" />
      <path d="M6 7h.01M10 7h.01M14 7h.01M18 7h.01M7 11h10" />
      <path d="m8 19 4 3 4-3" />
    </svg>
  );
}

const ICONS: Partial<Record<AccessoryKeyId, () => ReactNode>> = { paste: PasteIcon, hide: HideKeyboardIcon };

export interface AccessoryBarProps {
  ctrl: ModifierState;
  alt: ModifierState;
  onKey: (id: AccessoryKeyId) => void;
}

export function AccessoryBar({ ctrl, alt, onKey }: AccessoryBarProps) {
  const groups: AccessoryKeyDef[][] = [];
  for (const key of ACCESSORY_KEYS) (groups[key.group] ??= []).push(key);
  return (
    <div className="mxt-bar" role="toolbar" aria-label="Terminal keys">
      {groups.map((group, gi) => (
        <div key={gi} className="mxt-bar-group">
          {gi > 0 ? <span className="mxt-bar-divider" aria-hidden="true" /> : null}
          {group.map((key) => {
            const state = key.id === "ctrl" ? ctrl : key.id === "alt" ? alt : null;
            const Icon = ICONS[key.id];
            return (
              <button
                key={key.id}
                type="button"
                className="mxt-key"
                data-state={state ?? undefined}
                aria-label={key.aria}
                aria-pressed={state === null ? undefined : state !== "off"}
                // Keep focus (and the keyboard) on the terminal.
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onKey(key.id)}
              >
                {Icon ? <Icon /> : key.label}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
