"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function useContextKeyboard() {
  const router = useRouter();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      )
        return;

      switch (e.key) {
        case "n":
        case "N":
          e.preventDefault();
          router.push("/agent-context/items/new");
          break;
        case "t":
        case "T":
          e.preventDefault();
          router.push("/agent-context/templates");
          break;
        case "/":
          e.preventDefault();
          const searchInput = document.querySelector<HTMLInputElement>(
            "[data-context-search]",
          );
          searchInput?.focus();
          break;
        case "Escape":
          // Close any open popover/dialog by blurring active element
          (document.activeElement as HTMLElement)?.blur();
          break;
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [router]);
}
