"use client";

import { createContext, useContext, type ReactNode } from "react";

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
