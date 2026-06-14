"use client";

// hooks/useGalleryLayout.ts
//
// React binding for the generic gallery-layout engine. Measures a container
// with ResizeObserver and recomputes the layout on size or count change.
// Reusable by any tiled workspace — see lib/layout/galleryLayout.ts.

import { useEffect, useRef, useState } from "react";
import {
  computeGalleryLayout,
  type GalleryInput,
  type GalleryLayout,
} from "@/lib/layout/galleryLayout";

export interface UseGalleryLayoutResult {
  ref: React.RefObject<HTMLDivElement | null>;
  layout: GalleryLayout;
  viewport: { width: number; height: number };
}

export function useGalleryLayout(
  count: number,
  opts?: Omit<GalleryInput, "count" | "viewport">,
): UseGalleryLayoutResult {
  const ref = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = (w: number, h: number) => {
      setViewport((prev) =>
        prev.width === w && prev.height === h ? prev : { width: w, height: h },
      );
    };

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        measure(width, height);
      }
    });
    ro.observe(el);

    const rect = el.getBoundingClientRect();
    measure(rect.width, rect.height);

    return () => ro.disconnect();
  }, []);

  const layout = computeGalleryLayout({ count, viewport, ...opts });
  return { ref, layout, viewport };
}
