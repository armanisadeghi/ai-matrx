"use client";

import { type RefObject, useEffect } from "react";

/** Collapse all MenuGroup accordions whenever the user menu opens. */
export function useResetMenuGroupsOnOpen(
  panelRef: RefObject<HTMLElement | null>,
  menuCheckboxId: string,
) {
  useEffect(() => {
    const menuToggle = document.getElementById(menuCheckboxId);
    if (!menuToggle) return;

    const resetGroups = () => {
      if (!(menuToggle as HTMLInputElement).checked) return;

      panelRef.current
        ?.querySelectorAll<HTMLInputElement>('input[id^="menu-group-"]')
        .forEach((input) => {
          input.checked = false;
        });
    };

    menuToggle.addEventListener("change", resetGroups);
    return () => menuToggle.removeEventListener("change", resetGroups);
  }, [menuCheckboxId, panelRef]);
}
