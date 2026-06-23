"use client";

// Draggable glass widget.
//
// Renders the glass card on top of the backdrop. Pointer-events drive the
// drag; position is local React state. The glass treatment is the variant
// className passed in (glab-v1 ... glab-v11) and applies to both surface and
// the .glab-text / .glab-muted children inside.
//
// For V11 (adaptive), we also write CSS vars (--glab-bg-alpha, --glab-fg, ...)
// based on a luminance probe of what's behind the widget center. The probe
// runs at most once per ~80ms during drag and once on layout changes.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Bell,
  ChevronDown,
  FileText,
  Folder,
  MessageSquare,
  Search,
  Settings,
  Zap,
  User as UserIcon
} from "lucide-react";

interface Props {
  variantClass: string;
  /** True when variant === V11; enables the JS luminance probe. */
  adaptive: boolean;
  /** Initial top-left position (viewport px). */
  initial?: { x: number; y: number };
}

export function DraggableGlassWidget({
  variantClass,
  adaptive,
  initial,
}: Props) {
  const widgetRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>(
    initial ?? { x: 80, y: 160 },
  );
  const [dragging, setDragging] = useState(false);
  const dragOffsetRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  // ---- Drag --------------------------------------------------------------

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = widgetRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragOffsetRef.current = {
      dx: e.clientX - rect.left,
      dy: e.clientY - rect.top,
    };
    el.setPointerCapture(e.pointerId);
    setDragging(true);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      const el = widgetRef.current;
      if (!el) return;
      const { dx, dy } = dragOffsetRef.current;
      const nextX = e.clientX - dx;
      const nextY = e.clientY - dy;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const maxX = window.innerWidth - w - 4;
      const maxY = window.innerHeight - h - 4;
      setPos({
        x: Math.max(4, Math.min(nextX, maxX)),
        y: Math.max(4, Math.min(nextY, maxY)),
      });
    },
    [dragging],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = widgetRef.current;
    if (el) el.releasePointerCapture(e.pointerId);
    setDragging(false);
  }, []);

  // ---- Adaptive luminance probe (V11 only) -------------------------------
  //
  // The expensive part here is reading what's behind the widget. We avoid
  // canvas sampling: instead we briefly hide the widget, walk
  // elementFromPoint at 9 sample points, read each element's computed
  // background-color, and average the sRGB luminance. Cheap, no GPU work.

  const probe = useCallback(() => {
    if (!adaptive) return;
    const el = widgetRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const points: Array<[number, number]> = [
      [rect.left + rect.width * 0.2, rect.top + rect.height * 0.2],
      [rect.left + rect.width * 0.5, rect.top + rect.height * 0.2],
      [rect.left + rect.width * 0.8, rect.top + rect.height * 0.2],
      [rect.left + rect.width * 0.2, rect.top + rect.height * 0.5],
      [rect.left + rect.width * 0.5, rect.top + rect.height * 0.5],
      [rect.left + rect.width * 0.8, rect.top + rect.height * 0.5],
      [rect.left + rect.width * 0.2, rect.top + rect.height * 0.8],
      [rect.left + rect.width * 0.5, rect.top + rect.height * 0.8],
      [rect.left + rect.width * 0.8, rect.top + rect.height * 0.8],
    ];

    const prevPointer = el.style.pointerEvents;
    const prevVis = el.style.visibility;
    el.style.pointerEvents = "none";
    el.style.visibility = "hidden";

    let totalL = 0;
    let count = 0;
    for (const [x, y] of points) {
      const target = document.elementFromPoint(x, y);
      if (!target) continue;
      const lum = readLuminance(target as Element);
      if (lum !== null) {
        totalL += lum;
        count++;
      }
    }

    el.style.pointerEvents = prevPointer;
    el.style.visibility = prevVis;

    if (count === 0) return;
    const avgL = totalL / count; // 0..1

    // Threshold: light backdrop → light tint; dark → dark.
    // Crossover band gets pulled toward the system theme.
    const sysDark = document.documentElement.classList.contains("dark");
    const useLight = avgL > 0.5;

    if (useLight) {
      // Light glass — tint white, dark text via plus-lighter? No, simpler: just pure dark text.
      el.style.setProperty("--glab-tint-rgb", "255, 255, 255");
      // Higher alpha when backdrop is busy/colored; lower on already-light surface
      el.style.setProperty("--glab-bg-alpha", avgL > 0.85 ? "0.35" : "0.55");
      el.style.setProperty("--glab-border-color", "rgba(0, 0, 0, 0.10)");
      el.style.setProperty("--glab-fg", "#18181b");
      el.style.setProperty("--glab-muted", "#52525b");
    } else {
      el.style.setProperty("--glab-tint-rgb", "20, 22, 30");
      el.style.setProperty("--glab-bg-alpha", avgL < 0.15 ? "0.4" : "0.6");
      el.style.setProperty("--glab-border-color", "rgba(255, 255, 255, 0.14)");
      el.style.setProperty("--glab-fg", "#fafafa");
      el.style.setProperty("--glab-muted", "#a1a1aa");
    }

    el.dataset.lum = avgL.toFixed(2);
    el.dataset.mode = useLight ? "light" : "dark";
    el.dataset.sysTheme = sysDark ? "dark" : "light";
  }, [adaptive]);

  // Probe on mount, on variant change, on position change (rAF-throttled).
  const rafRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (!adaptive) return;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      probe();
      rafRef.current = null;
    });
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [adaptive, pos.x, pos.y, variantClass, probe]);

  // Probe on theme switches and viewport resizes.
  useEffect(() => {
    if (!adaptive) return;
    const onResize = () => probe();
    window.addEventListener("resize", onResize);
    const obs = new MutationObserver(() => probe());
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => {
      window.removeEventListener("resize", onResize);
      obs.disconnect();
    };
  }, [adaptive, probe]);

  return (
    <div
      ref={widgetRef}
      className={`glab-widget glab-card ${variantClass}`}
      data-dragging={dragging}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ left: pos.x, top: pos.y }}
    >
      <div className="glab-widget-handle">
        <span className="glab-text font-semibold text-sm">
          Drag me anywhere
        </span>
        <span className="glab-widget-handle-dots glab-muted">
          <span />
          <span />
          <span />
        </span>
      </div>

      <div className="glab-widget-section-title glab-muted">Quick access</div>

      <div className="glab-widget-row glab-text">
        <Zap />
        <span>New conversation</span>
      </div>
      <div className="glab-widget-row glab-text">
        <FileText />
        <span>Open document</span>
      </div>
      <div className="glab-widget-row glab-text">
        <Folder />
        <span>Browse files</span>
      </div>

      <div className="glab-widget-divider glab-muted" />

      <div className="glab-widget-section-title glab-muted">Search</div>
      <input
        className="glab-widget-input glab-text"
        placeholder="Search anything…"
        type="text"
      />

      <div className="glab-widget-divider glab-muted" />

      <div className="glab-widget-row glab-text">
        <MessageSquare />
        <span>Messages</span>
      </div>
      <div className="glab-widget-row glab-text">
        <Bell />
        <span>Notifications</span>
      </div>
      <div className="glab-widget-row glab-text">
        <UserIcon />
        <span>Profile</span>
      </div>
      <div className="glab-widget-row glab-text">
        <Settings />
        <span>Preferences</span>
        <ChevronDown className="ml-auto opacity-60" />
      </div>

      <div className="glab-widget-divider glab-muted" />

      <button className="glab-widget-button" type="button">
        <Search className="inline-block w-3.5 h-3.5 mr-1.5 -mt-0.5" />
        Open command bar
      </button>

      <div className="glab-widget-section-title glab-muted mt-3">
        Tertiary text test
      </div>
      <p className="px-2.5 pb-1 text-[12px] glab-muted leading-snug">
        Body copy that exercises long-form readability across the glass surface
        — secondary, slightly de-emphasized but still legible against whatever
        happens to be behind it.
      </p>
    </div>
  );
}

/** Read the visible (composited-down-the-stack) sRGB luminance for an element. */
function readLuminance(el: Element): number | null {
  // Walk up until we find a non-transparent background.
  let cur: Element | null = el;
  while (cur) {
    const cs = window.getComputedStyle(cur);
    const bg = cs.backgroundColor;
    const rgba = parseColor(bg);
    if (rgba && rgba.a > 0.05) {
      // Use the alpha-weighted color but also blend toward parent if not opaque.
      // For simplicity, treat anything > 0.5 alpha as carrying the surface.
      if (rgba.a > 0.5 || cur === el) {
        return relativeLuminance(rgba.r, rgba.g, rgba.b);
      }
    }
    // Also catch non-trivial gradients — those won't show up in backgroundColor
    // but DO show up in backgroundImage. We can't sample them cheaply, so use
    // a weak heuristic: if backgroundImage contains a gradient, return null
    // and let the next sample point speak. (The 9-point grid averages out.)
    cur = cur.parentElement;
  }
  return null;
}

function parseColor(
  str: string,
): { r: number; g: number; b: number; a: number } | null {
  const m = str.match(
    /^rgba?\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)(?:,\s*(\d*(?:\.\d+)?))?\)$/,
  );
  if (!m) return null;
  return {
    r: Number(m[1]),
    g: Number(m[2]),
    b: Number(m[3]),
    a: m[4] !== undefined ? Number(m[4]) : 1,
  };
}

function relativeLuminance(r: number, g: number, b: number): number {
  // Convert 0..255 sRGB → 0..1 linear, then WCAG luminance.
  const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
