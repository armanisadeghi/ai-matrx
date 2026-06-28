"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface PageSpecificHeaderProps {
  children: React.ReactNode;
}

/** Minimal portal target — import this file directly, never the route-header barrel. */
export function PageSpecificHeader({ children }: PageSpecificHeaderProps) {
  const [mounted, setMounted] = useState(false);
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setMounted(true);
    const element =
      document.getElementById("shell-header-center") ||
      document.getElementById("page-specific-header-content");
    setTargetElement(element);
  }, []);

  if (!mounted || !targetElement) {
    return null;
  }

  if (targetElement.id === "shell-header-center") {
    return createPortal(
      <div className="shell-header-inject">{children}</div>,
      targetElement,
    );
  }

  return createPortal(children, targetElement);
}
