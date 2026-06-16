"use client";

/**
 * SlideView — the per-slide renderer for the presentation block.
 *
 * Three visual TIERS (theme.variant): "generic" (clean, minimal — the original
 * look), "fancy" (gradients, display type, varied layouts, accent shapes), and
 * "deluxe" (fancy + full-bleed imagery). Many LAYOUTS (slide.layout, with sane
 * inference from slide.type/fields): title, section, bullets, two-column, quote,
 * stat, image-full, image-split, closing. Reads only fields that survive BOTH
 * the server-parsed (Pydantic) and client-raw data paths — the known slide
 * fields plus the free-form `extra` dict.
 */

import React from "react";
import { InlineMediaRef } from "@/features/files";

export type SlideVariant = "generic" | "fancy" | "deluxe";

export interface SlideTheme {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  variant?: SlideVariant;
  /** Optional font hint: "serif" | "sans" | "display". */
  font?: string;
}

export interface SlideData {
  type?: string;
  layout?: string;
  title?: string;
  subtitle?: string;
  description?: string;
  bullets?: string[];
  quote?: string;
  author?: string;
  image_url?: string;
  imageUrl?: string;
  notes?: string;
  extra?: Record<string, unknown>;
}

const palette = (t: SlideTheme) => ({
  primary: t.primaryColor || "#4F46E5",
  secondary: t.secondaryColor || "#7C3AED",
  accent: t.accentColor || "#06B6D4",
  text: t.textColor || "#0F172A",
});

/** Bold-aware text. */
function RichText({ text, className }: { text?: string; className?: string }) {
  if (!text) return null;
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="font-bold">
            {p.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}

/** Normalize the layout name from explicit `layout` or the legacy `type`. */
function resolveLayout(slide: SlideData): string {
  const raw = (slide.layout || slide.type || "").toLowerCase().replace(/[\s_]+/g, "-");
  if (raw === "intro" || raw === "cover" || raw === "hero" || raw === "title-slide") return "title";
  if (raw === "outro" || raw === "thank-you" || raw === "thanks" || raw === "end") return "closing";
  if (raw === "content" || raw === "" || raw === "default") {
    if (slide.quote) return "quote";
    if (Array.isArray((slide.extra as { stats?: unknown[] })?.stats)) return "stat";
    if (slideImage(slide)) return "image-split";
    return "bullets";
  }
  return raw;
}

function slideImage(slide: SlideData): string | undefined {
  return slide.image_url || slide.imageUrl || (slide.extra?.image as string | undefined);
}

export function SlideView({
  slide,
  theme,
  variant,
  fullScreen,
}: {
  slide: SlideData;
  theme: SlideTheme;
  variant: SlideVariant;
  fullScreen: boolean;
}) {
  const c = palette(theme);
  const layout = resolveLayout(slide);
  const fancy = variant !== "generic";
  const big = fullScreen;
  const eyebrow = (slide.extra?.eyebrow as string | undefined) ?? sectionEyebrow(slide, layout);

  const titleSize = big ? "text-5xl" : "text-3xl";
  const bodySize = big ? "text-xl" : "text-base";

  // ── Full-bleed image cover (deluxe / explicit) ──────────────────────────
  if ((layout === "image-full" || layout === "image") && slideImage(slide)) {
    return (
      <div className="relative h-full w-full overflow-hidden rounded-xl">
        <div className="absolute inset-0">
          <InlineMediaRef ref={slideImage(slide)!} alt={slide.title ?? "Slide image"} size="fill" fit="cover" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
        <div className={`absolute inset-x-0 bottom-0 ${big ? "p-12" : "p-7"}`}>
          {eyebrow && <Eyebrow text={eyebrow} color={c.accent} onDark />}
          <h2 className={`font-bold leading-tight text-white ${titleSize}`}>
            <RichText text={slide.title} />
          </h2>
          {slide.description && (
            <p className={`mt-3 max-w-3xl text-white/85 ${bodySize}`}>
              <RichText text={slide.description} />
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Title / cover ───────────────────────────────────────────────────────
  if (layout === "title") {
    return (
      <Frame variant={variant} c={c} center>
        <div className="text-center">
          {eyebrow && <Eyebrow text={eyebrow} color={c.accent} center />}
          <h1
            className={`font-bold leading-[1.05] ${big ? "text-6xl" : "text-4xl"}`}
            style={fancy ? gradientText(c.primary, c.secondary) : { color: c.primary }}
          >
            <RichText text={slide.title} />
          </h1>
          {slide.subtitle && (
            <p className={`mx-auto mt-5 max-w-2xl text-muted-foreground ${big ? "text-2xl" : "text-lg"}`}>
              <RichText text={slide.subtitle} />
            </p>
          )}
          {fancy && <div className="mx-auto mt-7 h-1 w-24 rounded-full" style={{ background: `linear-gradient(90deg, ${c.primary}, ${c.accent})` }} />}
        </div>
      </Frame>
    );
  }

  // ── Section divider ─────────────────────────────────────────────────────
  if (layout === "section") {
    return (
      <Frame variant={variant} c={c} sectionGradient>
        <div className="flex h-full flex-col justify-center">
          {eyebrow && <Eyebrow text={eyebrow} color="#ffffff" onDark />}
          <h2 className={`font-bold leading-tight text-white ${big ? "text-6xl" : "text-4xl"}`}>
            <RichText text={slide.title} />
          </h2>
          {slide.description && (
            <p className={`mt-4 max-w-3xl text-white/80 ${bodySize}`}>
              <RichText text={slide.description} />
            </p>
          )}
        </div>
      </Frame>
    );
  }

  // ── Quote ───────────────────────────────────────────────────────────────
  if (layout === "quote") {
    return (
      <Frame variant={variant} c={c} center>
        <figure className="mx-auto max-w-3xl text-center">
          <div className={`font-serif leading-none ${big ? "text-7xl" : "text-5xl"}`} style={{ color: c.accent }}>
            &ldquo;
          </div>
          <blockquote className={`-mt-4 font-medium leading-snug text-foreground ${big ? "text-3xl" : "text-xl"}`}>
            <RichText text={slide.quote || slide.title} />
          </blockquote>
          {slide.author && (
            <figcaption className={`mt-5 text-muted-foreground ${big ? "text-lg" : "text-sm"}`}>— {slide.author}</figcaption>
          )}
        </figure>
      </Frame>
    );
  }

  // ── Stat / metrics ──────────────────────────────────────────────────────
  if (layout === "stat" || layout === "metrics") {
    const stats = (slide.extra?.stats as Array<{ value?: string; label?: string }> | undefined) ?? [];
    return (
      <Frame variant={variant} c={c}>
        <SlideHeading slide={slide} c={c} fancy={fancy} big={big} eyebrow={eyebrow} />
        <div className={`mt-8 grid gap-5 ${stats.length >= 3 ? "grid-cols-3" : stats.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
          {stats.map((s, i) => (
            <div key={i} className="rounded-xl border border-border bg-card/60 p-5 text-center">
              <div className={`font-bold ${big ? "text-5xl" : "text-3xl"}`} style={gradientText(c.primary, c.accent)}>
                {s.value}
              </div>
              <div className={`mt-1 text-muted-foreground ${big ? "text-base" : "text-xs"}`}>{s.label}</div>
            </div>
          ))}
        </div>
      </Frame>
    );
  }

  // ── Two-column ──────────────────────────────────────────────────────────
  if (layout === "two-column" || layout === "split" || layout === "columns") {
    const cols = (slide.extra?.columns as Array<{ title?: string; bullets?: string[] }> | undefined) ?? splitBullets(slide.bullets);
    return (
      <Frame variant={variant} c={c}>
        <SlideHeading slide={slide} c={c} fancy={fancy} big={big} eyebrow={eyebrow} />
        <div className="mt-7 grid grid-cols-2 gap-6">
          {cols.map((col, i) => (
            <div key={i}>
              {col.title && <h3 className={`mb-3 font-semibold ${big ? "text-xl" : "text-base"}`} style={{ color: c.primary }}>{col.title}</h3>}
              <BulletList bullets={col.bullets ?? []} c={c} fancy={fancy} big={big} />
            </div>
          ))}
        </div>
      </Frame>
    );
  }

  // ── Image split (image + content side by side) ──────────────────────────
  if ((layout === "image-split" || layout === "image-left" || layout === "image-right") && slideImage(slide)) {
    const imageRight = layout === "image-right";
    return (
      <Frame variant={variant} c={c}>
        <div className={`grid h-full grid-cols-2 items-center gap-7 ${imageRight ? "" : ""}`}>
          <div className={imageRight ? "order-1" : "order-2"}>
            <SlideHeading slide={slide} c={c} fancy={fancy} big={big} eyebrow={eyebrow} />
            <div className="mt-5">
              <BulletList bullets={slide.bullets ?? []} c={c} fancy={fancy} big={big} />
            </div>
          </div>
          <div className={`${imageRight ? "order-2" : "order-1"} h-full max-h-full overflow-hidden rounded-xl`}>
            <InlineMediaRef ref={slideImage(slide)!} alt={slide.title ?? "Slide image"} size="fill" fit="cover" />
          </div>
        </div>
      </Frame>
    );
  }

  // ── Closing ─────────────────────────────────────────────────────────────
  if (layout === "closing") {
    return (
      <Frame variant={variant} c={c} sectionGradient center>
        <div className="text-center">
          <h2 className={`font-bold text-white ${big ? "text-5xl" : "text-3xl"}`}>
            <RichText text={slide.title || "Thank you"} />
          </h2>
          {slide.subtitle && <p className={`mx-auto mt-4 max-w-2xl text-white/80 ${bodySize}`}><RichText text={slide.subtitle} /></p>}
        </div>
      </Frame>
    );
  }

  // ── Default: bullets ────────────────────────────────────────────────────
  return (
    <Frame variant={variant} c={c}>
      <SlideHeading slide={slide} c={c} fancy={fancy} big={big} eyebrow={eyebrow} />
      <div className="mt-6">
        <BulletList bullets={slide.bullets ?? []} c={c} fancy={fancy} big={big} />
      </div>
    </Frame>
  );
}

// ── Building blocks ─────────────────────────────────────────────────────────

function Frame({
  children,
  variant,
  c,
  center,
  sectionGradient,
}: {
  children: React.ReactNode;
  variant: SlideVariant;
  c: ReturnType<typeof palette>;
  center?: boolean;
  sectionGradient?: boolean;
}) {
  const style: React.CSSProperties = sectionGradient
    ? { background: `linear-gradient(135deg, ${c.primary}, ${c.secondary})` }
    : variant === "deluxe"
      ? { background: `radial-gradient(120% 120% at 0% 0%, ${c.primary}0D, transparent 50%), radial-gradient(120% 120% at 100% 100%, ${c.accent}0D, transparent 50%)` }
      : {};
  return (
    <div
      className={`relative h-full w-full overflow-hidden rounded-xl border border-border bg-card ${center ? "flex items-center justify-center" : ""} ${
        variant === "generic" ? "p-8" : "p-9"
      }`}
      style={style}
    >
      {variant !== "generic" && !sectionGradient && (
        <div className="pointer-events-none absolute right-0 top-0 h-40 w-40 -translate-y-12 translate-x-12 rounded-full opacity-[0.07]" style={{ background: c.accent }} />
      )}
      <div className={`relative ${center ? "" : "h-full"}`}>{children}</div>
    </div>
  );
}

function SlideHeading({
  slide,
  c,
  fancy,
  big,
  eyebrow,
}: {
  slide: SlideData;
  c: ReturnType<typeof palette>;
  fancy: boolean;
  big: boolean;
  eyebrow?: string;
}) {
  return (
    <div>
      {eyebrow && <Eyebrow text={eyebrow} color={c.accent} />}
      <h2 className={`font-bold leading-tight ${big ? "text-4xl" : "text-2xl"}`} style={fancy ? gradientText(c.primary, c.secondary) : { color: c.primary }}>
        <RichText text={slide.title} />
      </h2>
      {slide.description && (
        <p className={`mt-2 text-muted-foreground ${big ? "text-lg" : "text-sm"}`}>
          <RichText text={slide.description} />
        </p>
      )}
    </div>
  );
}

function BulletList({
  bullets,
  c,
  fancy,
  big,
}: {
  bullets: string[];
  c: ReturnType<typeof palette>;
  fancy: boolean;
  big: boolean;
}) {
  return (
    <ul className="space-y-2.5">
      {bullets.map((b, i) => (
        <li
          key={i}
          className={`flex items-start gap-3 rounded-lg ${fancy ? "bg-muted/40 p-3 transition-transform hover:translate-x-0.5" : "py-1"}`}
          style={{ animation: `slideIn 0.45s ease-out ${i * 0.07}s both` }}
        >
          <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${big ? "mt-2.5" : ""}`} style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.accent})` }} />
          <span className={`leading-relaxed text-foreground ${big ? "text-lg" : "text-sm"}`}>
            <RichText text={b} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function Eyebrow({ text, color, center, onDark }: { text: string; color: string; center?: boolean; onDark?: boolean }) {
  return (
    <div
      className={`mb-3 inline-block rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${center ? "mx-auto" : ""}`}
      style={onDark ? { background: "rgba(255,255,255,0.18)", color: "#fff" } : { background: `${color}1A`, color }}
    >
      {text}
    </div>
  );
}

function gradientText(from: string, to: string): React.CSSProperties {
  return {
    background: `linear-gradient(120deg, ${from}, ${to})`,
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
  };
}

function sectionEyebrow(slide: SlideData, layout: string): string | undefined {
  if (layout === "title") return undefined;
  if (slide.type && /^(intro|cover|hero)$/i.test(slide.type)) return undefined;
  return undefined;
}

function splitBullets(bullets?: string[]): Array<{ bullets: string[] }> {
  const b = bullets ?? [];
  const mid = Math.ceil(b.length / 2);
  return [{ bullets: b.slice(0, mid) }, { bullets: b.slice(mid) }];
}
