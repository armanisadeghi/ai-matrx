"use client";

/** The receiving half of SettingDoor: reveal and focus the exact control. */

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useSettingsPresentation } from "@/features/settings/components/SettingsPresentationContext";

function currentSettingHash(): string {
  if (typeof window === "undefined") return "";
  const raw = window.location.hash.replace(/^#/, "");
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function SettingAnchor({
  id,
  children,
  className,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { focusControlId } = useSettingsPresentation();

  useEffect(() => {
    const hash = currentSettingHash();
    if (focusControlId !== id && hash !== id) return;
    const element = ref.current;
    if (!element) return;

    const frame = requestAnimationFrame(() => {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.focus({ preventScroll: true });
      element.classList.add("ring-2", "ring-primary/40", "rounded-lg");
    });
    const timeout = window.setTimeout(() => {
      element.classList.remove("ring-2", "ring-primary/40", "rounded-lg");
    }, 2400);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [focusControlId, id]);

  return (
    <div
      ref={ref}
      id={id}
      data-setting-control={id}
      tabIndex={-1}
      className={cn(
        "scroll-mt-20 outline-none transition-[box-shadow] duration-300",
        className,
      )}
    >
      {children}
    </div>
  );
}
