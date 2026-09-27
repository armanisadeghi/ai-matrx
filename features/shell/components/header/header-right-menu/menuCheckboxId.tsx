"use client";

import {
  createContext,
  useContext,
  type MouseEvent,
  type ReactNode,
} from "react";

/** AppShell's checkbox. Canvas and portable hosts pass a different id. */
export const DEFAULT_MENU_CHECKBOX_ID = "shell-user-menu";

const MenuCheckboxIdContext = createContext(DEFAULT_MENU_CHECKBOX_ID);

export function MenuCheckboxIdProvider({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <MenuCheckboxIdContext.Provider value={id}>
      {children}
    </MenuCheckboxIdContext.Provider>
  );
}

/** Checkbox the open menu should toggle closed. Never hardcode the id. */
export function useMenuCheckboxId(): string {
  return useContext(MenuCheckboxIdContext);
}

/**
 * The wrapper every menu item sits in. A `<label htmlFor>` alone closes the
 * menu only when its content is plain text: HTML label activation SKIPS a
 * click on an interactive descendant (`<button>`, `<a>`), so every button
 * item used to leave the menu open over the window it had just opened. This
 * closes it for those clicks too; a plain-text click still closes through
 * the label itself (never both — that would re-open it).
 */
export function MenuItemCloseLabel({ children }: { children: ReactNode }) {
  const id = useMenuCheckboxId();
  const onClick = (e: MouseEvent<HTMLLabelElement>) => {
    const target = e.target as Element | null;
    if (!target?.closest("button, a, [role='menuitem']")) return;
    const box = document.getElementById(id);
    if (box instanceof HTMLInputElement) box.checked = false;
  };
  return (
    <label htmlFor={id} className="block" onClick={onClick}>
      {children}
    </label>
  );
}
