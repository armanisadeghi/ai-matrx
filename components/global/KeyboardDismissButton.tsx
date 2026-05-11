"use client";

// KeyboardDismissButton — a single global FAB that lets users dismiss the
// on-screen keyboard on devices where the OS gives no dismiss control
// (Tesla in-car browser is the motivating case; Android Chrome and any
// kiosk Chromium build benefit too).
//
// Design goals:
//   1. Zero per-page integration. Mounted once at the provider root.
//   2. No JS focus listeners. Visibility is driven by `html:has(:focus)`
//      so the button costs literally nothing when no input is focused.
//   3. Position the button DIRECTLY above the keyboard. We opt the page
//      into the VirtualKeyboard API (Chromium), which exposes
//      `env(keyboard-inset-height)` — a CSS env var that resolves to
//      the actual keyboard height in real time. The button's `bottom`
//      offset is computed from that var, so it tracks the keyboard
//      pixel-for-pixel as it opens, animates, and closes.
//   4. Fallback gracefully on iOS / non-Chromium: the visual viewport
//      already resizes there, so `bottom: 1rem` lands above the keyboard.
//
// The dismiss action is a single `blur()` on the active element. We
// preventDefault on pointerdown so the focused input does NOT lose focus
// before we call blur — that way the activeElement we read in onClick
// is still the input the user was typing in.

import { KeyboardOff } from "lucide-react";
import { useEffect } from "react";

interface VirtualKeyboardLike {
  overlaysContent: boolean;
}

interface NavigatorWithVirtualKeyboard extends Navigator {
  virtualKeyboard?: VirtualKeyboardLike;
}

export function KeyboardDismissButton() {
  // One-time opt-in to the VirtualKeyboard API. Tells Chromium "don't
  // resize my layout — overlay the keyboard on top and expose its size
  // via env(keyboard-inset-*)." Safari / Firefox ignore this; they're
  // unaffected. Tesla's browser is Chromium and respects it.
  useEffect(() => {
    const nav = navigator as NavigatorWithVirtualKeyboard;
    if (nav.virtualKeyboard) {
      nav.virtualKeyboard.overlaysContent = true;
    }
  }, []);

  const handleDismiss = () => {
    const el = document.activeElement;
    if (el && el !== document.body && "blur" in el) {
      (el as HTMLElement).blur();
    }
  };

  return (
    <button
      type="button"
      aria-label="Dismiss keyboard"
      data-keyboard-dismiss=""
      tabIndex={-1}
      onPointerDown={(e) => e.preventDefault()}
      onClick={handleDismiss}
      className="kbd-dismiss-fab"
    >
      <KeyboardOff className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
