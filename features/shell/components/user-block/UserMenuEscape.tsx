"use client";

// Escape closes the profile menu. The menu is a CSS checkbox toggle
// (`#shell-user-menu`, and the canvas copy) so every item's
// `<label htmlFor>` close works without JavaScript — but a checkbox has no
// keyboard dismissal, and Escape did nothing (page-pass /notes, 2026-09-28).
// Only an OPEN menu is closed; Escape is left alone otherwise.

import { useEffect } from "react";

const MENU_TOGGLE_IDS = ["shell-user-menu", "canvas-user-menu"];

export default function UserMenuEscape() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      for (const id of MENU_TOGGLE_IDS) {
        const toggle = document.getElementById(id);
        if (toggle instanceof HTMLInputElement && toggle.checked) {
          toggle.checked = false;
          toggle.dispatchEvent(new Event("change", { bubbles: true }));
          event.stopPropagation();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
  return null;
}
