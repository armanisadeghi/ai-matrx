"use client";

/**
 * Drawn swatches — what each option actually LOOKS like.
 *
 * A print buyer is choosing physical objects: a glued spine vs a metal coil,
 * cream stock vs coated white, a glossy cover vs a matte one. A text label
 * cannot carry that, so every option renders its own illustration.
 *
 * All of it is drawn here in SVG against our own tokens — no third-party
 * product photography, no borrowed assets. Everything uses `currentColor` or
 * a theme variable so both themes stay honest.
 *
 * MATCHING IS TOLERANT BY DESIGN. Each `swatchFor*` runs keyword tests
 * against the catalog's own value and falls back to a generic drawing, so a
 * new Lulu option renders as a plausible book the day it appears instead of
 * crashing or rendering nothing. This is presentation only — it never decides
 * what is available.
 */

import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

// ---------------------------------------------------------------------------
// Shared frame — one light, one angle, one background for every swatch.
// ---------------------------------------------------------------------------

function SwatchFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-muted/60 to-muted transition-colors",
        className,
      )}
    >
      <svg
        viewBox="0 0 120 90"
        className="h-full w-full"
        role="presentation"
        aria-hidden="true"
      >
        {children}
      </svg>
    </div>
  );
}

/** The soft contact shadow every object sits on. */
function Shadow({ cx = 60, cy = 74, rx = 34 }: { cx?: number; cy?: number; rx?: number }) {
  return (
    <ellipse
      cx={cx}
      cy={cy}
      rx={rx}
      ry="3.5"
      fill="hsl(var(--foreground))"
      opacity="0.13"
    />
  );
}

/** Shared paint. Ids are namespaced so several swatches can co-exist. */
function Paints({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-cover`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.95" />
        <stop offset="100%" stopColor="hsl(var(--secondary))" stopOpacity="0.9" />
      </linearGradient>
      <linearGradient id={`${id}-spine`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="hsl(var(--secondary))" stopOpacity="0.75" />
        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.95" />
      </linearGradient>
      <linearGradient id={`${id}-pages`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="hsl(var(--card))" />
        <stop offset="100%" stopColor="hsl(var(--muted))" />
      </linearGradient>
    </defs>
  );
}

// ---------------------------------------------------------------------------
// Binding — a book seen from the spine corner, so the binding IS the subject.
// ---------------------------------------------------------------------------

type BindingKind =
  | "perfect"
  | "coil"
  | "saddle"
  | "wire"
  | "case"
  | "linen"
  | "generic";

export function bindingKindFor(value: string): BindingKind {
  const v = value.toLowerCase();
  if (v.includes("perfect")) return "perfect";
  if (v.includes("coil")) return "coil";
  if (v.includes("saddle")) return "saddle";
  if (v.includes("wire")) return "wire";
  if (v.includes("case")) return "case";
  if (v.includes("linen")) return "linen";
  return "generic";
}

function BindingSwatch({ value }: { value: string }) {
  const kind = bindingKindFor(value);
  const id = `bind-${kind}`;

  // Thickness reads the binding: saddle is thin, hardcovers are chunky.
  const depth =
    kind === "saddle" ? 4 : kind === "case" || kind === "linen" ? 17 : 12;
  const top = 20;
  const height = 46;
  const faceWidth = 46;
  const x = 34;

  return (
    <SwatchFrame>
      <Paints id={id} />
      <Shadow cx={62} rx={38} />

      {/* Page block, visible as the fore-edge under the cover. */}
      <rect
        x={x + 2}
        y={top + 3}
        width={faceWidth}
        height={height}
        rx="1"
        fill={`url(#${id}-pages)`}
        stroke="hsl(var(--border))"
        strokeWidth="0.7"
      />

      {/* The spine face, drawn as the slanted left plane. */}
      <path
        d={`M${x - depth} ${top + depth} L${x} ${top} L${x} ${top + height} L${x - depth} ${top + height + depth} Z`}
        fill={`url(#${id}-spine)`}
      />

      {/* Front cover. Hardcovers overhang the block on all sides. */}
      <rect
        x={x}
        y={kind === "case" || kind === "linen" ? top - 2 : top}
        width={faceWidth}
        height={kind === "case" || kind === "linen" ? height + 4 : height}
        rx={kind === "case" || kind === "linen" ? 2 : 1}
        fill={`url(#${id}-cover)`}
      />

      {/* Linen wrap: woven texture + the foil-stamp rule. */}
      {kind === "linen" ? (
        <>
          {Array.from({ length: 9 }).map((_, i) => (
            <line
              key={i}
              x1={x + 2}
              y1={top + 2 + i * 5}
              x2={x + faceWidth - 2}
              y2={top + 2 + i * 5}
              stroke="white"
              strokeWidth="0.4"
              opacity="0.16"
            />
          ))}
          <rect
            x={x + 9}
            y={top + 16}
            width={faceWidth - 18}
            height="2"
            rx="1"
            fill="#f5d78a"
          />
        </>
      ) : null}

      {/* Case wrap: an edge-to-edge printed band. */}
      {kind === "case" ? (
        <rect
          x={x + 7}
          y={top + 15}
          width={faceWidth - 14}
          height="2"
          rx="1"
          fill="white"
          opacity="0.75"
        />
      ) : null}

      {/* Coil: the spiral wraps through the spine edge. */}
      {kind === "coil"
        ? Array.from({ length: 8 }).map((_, i) => {
            const y = top + 4 + i * 5.6;
            return (
              <path
                key={i}
                d={`M${x - depth - 3} ${y + depth - 2} Q${x - depth / 2} ${y - 5} ${x + 4} ${y + 1}`}
                fill="none"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            );
          })
        : null}

      {/* Wire-O: squared twin loops rather than a round spiral. */}
      {kind === "wire"
        ? Array.from({ length: 9 }).map((_, i) => {
            const y = top + 3 + i * 5;
            return (
              <rect
                key={i}
                x={x - depth - 2}
                y={y + depth - 4}
                width={depth + 6}
                height="2"
                rx="1"
                fill="hsl(var(--muted-foreground))"
                opacity="0.85"
              />
            );
          })
        : null}

      {/* Saddle stitch: a folded signature with two staples on the fold. */}
      {kind === "saddle" ? (
        <>
          <rect
            x={x - depth - 1}
            y={top + depth - 1}
            width="2.5"
            height={height - 2}
            rx="1.2"
            fill="hsl(var(--secondary))"
            opacity="0.9"
          />
          {[0.3, 0.66].map((t) => (
            <rect
              key={t}
              x={x - depth - 2.5}
              y={top + depth + height * t}
              width="5.5"
              height="1.8"
              rx="0.9"
              fill="hsl(var(--muted-foreground))"
            />
          ))}
        </>
      ) : null}

      {/* Perfect bound: the square glued spine reads as a crisp edge. */}
      {kind === "perfect" ? (
        <line
          x1={x}
          y1={top}
          x2={x}
          y2={top + height}
          stroke="hsl(var(--foreground))"
          strokeWidth="0.8"
          opacity="0.22"
        />
      ) : null}
    </SwatchFrame>
  );
}

// ---------------------------------------------------------------------------
// Interior colour — a printed page, showing what the ink does.
// ---------------------------------------------------------------------------

function InteriorSwatch({ value }: { value: string }) {
  const v = value.toLowerCase();
  const isColor = v.includes("color") || v.includes("colour");
  const isPremium = v.includes("prem");
  const id = `ink-${isColor ? "c" : "bw"}-${isPremium ? "p" : "s"}`;

  return (
    <SwatchFrame>
      <defs>
        <linearGradient id={`${id}-photo`} x1="0" y1="0" x2="1" y2="1">
          {isColor ? (
            <>
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="45%" stopColor="#a855f7" />
              <stop offset="100%" stopColor="#f97316" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#1f2937" />
              <stop offset="55%" stopColor="#9ca3af" />
              <stop offset="100%" stopColor="#e5e7eb" />
            </>
          )}
        </linearGradient>
      </defs>
      <Shadow cx={60} cy={73} rx={30} />

      {/* The page. */}
      <rect
        x="32"
        y="14"
        width="56"
        height="56"
        rx="1.5"
        fill="hsl(var(--card))"
        stroke="hsl(var(--border))"
        strokeWidth="0.8"
      />

      {/* Premium prints a rich image; standard prints a simple figure. */}
      {isPremium ? (
        <rect
          x="37"
          y="19"
          width="46"
          height="27"
          rx="1"
          fill={`url(#${id}-photo)`}
        />
      ) : isColor ? (
        <g>
          <rect x="37" y="31" width="9" height="15" rx="1" fill="#3b82f6" />
          <rect x="49" y="24" width="9" height="22" rx="1" fill="#22c55e" />
          <rect x="61" y="34" width="9" height="12" rx="1" fill="#f59e0b" />
          <rect x="73" y="27" width="9" height="19" rx="1" fill="#ef4444" />
        </g>
      ) : (
        <g>
          <rect x="37" y="31" width="9" height="15" rx="1" fill="#6b7280" />
          <rect x="49" y="24" width="9" height="22" rx="1" fill="#9ca3af" />
          <rect x="61" y="34" width="9" height="12" rx="1" fill="#4b5563" />
          <rect x="73" y="27" width="9" height="19" rx="1" fill="#d1d5db" />
        </g>
      )}

      {/* Body text lines below the figure. */}
      {Array.from({ length: 5 }).map((_, i) => (
        <rect
          key={i}
          x="37"
          y={51 + i * 3.6}
          width={i === 4 ? 26 : 46}
          height="1.6"
          rx="0.8"
          fill="hsl(var(--muted-foreground))"
          opacity={isPremium ? 0.55 : 0.38}
        />
      ))}
    </SwatchFrame>
  );
}

// ---------------------------------------------------------------------------
// Paper — a curled sheet, so shade and sheen are both visible.
// ---------------------------------------------------------------------------

function PaperSwatch({ value }: { value: string }) {
  const v = value.toLowerCase();
  const cream = v.includes("cream");
  const coated = v.includes("coated") && !v.includes("uncoated");
  const heavy = /\b(80|100)#/.test(v);
  const id = `paper-${cream ? "cream" : "white"}-${coated ? "c" : "u"}`;

  const sheet = cream ? "#f5ecd9" : "#fbfbfb";
  const sheetEdge = cream ? "#e6d7b8" : "#e4e4e7";

  return (
    <SwatchFrame>
      <defs>
        <linearGradient id={`${id}-face`} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0%" stopColor={sheet} />
          <stop offset="100%" stopColor={sheetEdge} />
        </linearGradient>
        <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity={coated ? 0.85 : 0.2} />
          <stop offset="50%" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>
      <Shadow cx={60} cy={73} rx={31} />

      {/* A stack whose thickness reads the weight. */}
      {Array.from({ length: heavy ? 4 : 3 }).map((_, i) => (
        <rect
          key={i}
          x={30 + i * 1.4}
          y={22 + i * 1.6}
          width="58"
          height="46"
          rx="1.5"
          fill={sheetEdge}
          opacity={0.55}
        />
      ))}

      {/* The top sheet, with a lifted corner. */}
      <path
        d="M30 20 H88 V60 Q88 66 82 66 H30 Z"
        fill={`url(#${id}-face)`}
        stroke={sheetEdge}
        strokeWidth="0.8"
      />
      <path d="M88 60 Q88 66 82 66 L88 60 Z" fill={sheetEdge} />
      <path
        d="M30 20 H88 V60 Q88 66 82 66 H30 Z"
        fill={`url(#${id}-sheen)`}
      />

      {/* Uncoated shows its tooth; coated stays smooth. */}
      {!coated
        ? Array.from({ length: 14 }).map((_, i) => (
            <line
              key={i}
              x1={33 + (i % 7) * 8}
              y1={26 + Math.floor(i / 7) * 16}
              x2={36 + (i % 7) * 8}
              y2={26 + Math.floor(i / 7) * 16}
              stroke={cream ? "#c9b48c" : "#c9c9cf"}
              strokeWidth="0.7"
              opacity="0.5"
            />
          ))
        : null}
    </SwatchFrame>
  );
}

// ---------------------------------------------------------------------------
// Cover finish — the same cover under the same light, twice.
// ---------------------------------------------------------------------------

function CoverFinishSwatch({ value }: { value: string }) {
  const v = value.toLowerCase();
  const gloss = v.startsWith("gloss");
  const bare = v.includes("unlaminated");
  const id = `finish-${gloss ? "g" : bare ? "u" : "m"}`;

  return (
    <SwatchFrame>
      <Paints id={id} />
      <defs>
        <linearGradient id={`${id}-hi`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity={gloss ? 0.9 : 0.16} />
          <stop
            offset={gloss ? "34%" : "70%"}
            stopColor="white"
            stopOpacity="0"
          />
        </linearGradient>
      </defs>
      <Shadow cx={60} cy={73} rx={28} />

      <rect
        x="36"
        y="14"
        width="48"
        height="56"
        rx="2"
        fill={bare ? "#e8e4dc" : `url(#${id}-cover)`}
      />
      <rect x="36" y="14" width="48" height="56" rx="2" fill={`url(#${id}-hi)`} />

      {/* Gloss throws a hard specular band; matte scatters it away. */}
      {gloss ? (
        <path
          d="M44 70 L68 14 L78 14 L54 70 Z"
          fill="white"
          opacity="0.32"
        />
      ) : null}
    </SwatchFrame>
  );
}

// ---------------------------------------------------------------------------
// The one entry point the grid uses.
// ---------------------------------------------------------------------------

export type SwatchDimension = "binding" | "color" | "paper" | "coverFinish";

export function OptionSwatch({
  dimension,
  value,
}: {
  dimension: SwatchDimension;
  value: string;
}) {
  switch (dimension) {
    case "binding":
      return <BindingSwatch value={value} />;
    case "color":
      return <InteriorSwatch value={value} />;
    case "paper":
      return <PaperSwatch value={value} />;
    case "coverFinish":
      return <CoverFinishSwatch value={value} />;
  }
}
