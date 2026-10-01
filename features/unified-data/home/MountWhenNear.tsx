"use client";

// features/unified-data/home/MountWhenNear.tsx — LANE DATA-HOME-3A
//
// Mounts its children only once their place on the page comes near the viewport. Why here: the
// inbox (records-ui ActionInbox) scrolls its keyboard cursor into view on mount
// (`scrollIntoView({ block: "nearest" })`), which scrolls EVERY ancestor — so mounted below the
// list it opened the data home 326 px down on a phone, past the first rows. Mounted when the person
// scrolls to it, the same call moves nothing. (The package fix — scroll only the inbox's own list —
// belongs in @ai-matrx/records-ui.)

import { useEffect, useRef, useState, type ReactNode } from "react";

export function MountWhenNear({ children, placeholderClassName }: { children: ReactNode; placeholderClassName?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return undefined;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return undefined;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setNear(true);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  return near ? <>{children}</> : <div ref={ref} className={placeholderClassName ?? "h-10"} aria-hidden />;
}
