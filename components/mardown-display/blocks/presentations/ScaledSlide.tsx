"use client";

import React, { useEffect, useRef, useState } from "react";
import { fitScale } from "../canvas-adaptive";

/** The fixed stage a slide is laid out on before it is scaled to its box. */
export const SLIDE_STAGE = { width: 960, height: 540 } as const;

/**
 * A slide laid out at one fixed 16:9 stage and scaled to fit its box, keeping
 * the aspect ratio — so a narrow canvas pane shows the same slide, smaller,
 * instead of reflowing its text until it overflows. The box is whatever the
 * parent gives it (`className`); the stage is centred inside it.
 */
export function ScaledSlide({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () =>
      setBox({ width: el.clientWidth, height: el.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = fitScale(SLIDE_STAGE, box);
  const left = (box.width - SLIDE_STAGE.width * scale) / 2;
  const top = Math.max(0, (box.height - SLIDE_STAGE.height * scale) / 2);

  return (
    <div ref={boxRef} className={`relative overflow-hidden ${className ?? ""}`}>
      {scale > 0 && (
        <div
          data-slide-scale={scale.toFixed(3)}
          className="absolute origin-top-left"
          style={{
            width: SLIDE_STAGE.width,
            height: SLIDE_STAGE.height,
            // A narrow-screen global max-width would clamp the stage to the
            // pane and reflow the slide; the stage is fixed by design.
            maxWidth: "none",
            maxHeight: "none",
            left,
            top,
            transform: `scale(${scale})`,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
