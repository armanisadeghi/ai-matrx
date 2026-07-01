"use client";

// Closes the mobile side sheet after any client-side route change so route
// menus (chat history, agent run sidebars, etc.) don't leave the drawer open
// over the destination page. View switches inside the sheet (main ↔ route)
// do not change pathname and are intentionally unaffected.

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { closeShellMobileMenu } from "@/features/shell/utils/closeShellMobileMenu";

export default function MobileMenuPathSync() {
  const pathname = usePathname();
  const previousPathname = useRef(pathname);

  useEffect(() => {
    if (previousPathname.current !== pathname) {
      closeShellMobileMenu();
      previousPathname.current = pathname;
    }
  }, [pathname]);

  return null;
}
