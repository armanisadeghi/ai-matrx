/**
 * features/files/components/inline/InlineMediaRef.tsx
 *
 * The canonical inline media renderer. Pass a `MediaRef` (or a plain URL,
 * or just a cld_files `fileId`), get back a correctly-sized `<img>` /
 * `<video>` / `<audio>` element. URL resolution flows through the
 * universal handler so signed URLs auto-refresh via the expiry-wheel,
 * public files prefer the CDN URL, and share links route through Python.
 *
 * Use this everywhere an `<img src={file.publicUrl ?? someSignedUrl}>`
 * pattern would otherwise appear. The component owns the URL lifecycle;
 * call sites just hand it a reference and a size.
 *
 * Examples:
 *   <InlineMediaRef ref={mediaRef} size="md" fit="cover" />
 *   <InlineMediaRef ref={{ file_id }} size={{ width: 96, height: 96 }} />
 *   <InlineMediaRef ref={{ url }} fallback="icon" onClick={openPreview} />
 */

"use client";

import React, { useMemo } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import {
  FileAudio,
  FileVideo,
  Image as ImageIcon,
  File as FileIcon,
} from "lucide-react";
import { useFileSrc } from "@/features/files/handler/hooks/useFileSrc";
import type { FileSource } from "@/features/files/handler/types";
import type { MediaRef } from "@/features/files/types";

export type InlineMediaRefSize =
  | "xs" // 24×24
  | "sm" // 32×32
  | "md" // 64×64
  | "lg" // 128×128
  | "xl" // 256×256
  | "fill" // parent-controlled — image fills its container via w-full h-full
  | { width: number; height: number };

export type InlineMediaRefFit = "cover" | "contain" | "fill";

export interface InlineMediaRefProps {
  /**
   * Reference to the media. Accepts:
   *   - {@link MediaRef} — the canonical shape (`{file_id?, url?, file_uri?}`)
   *   - a plain URL string — convenience for external URLs
   *   - a bare cld_files UUID — convenience for owned files
   *   - `null` / `undefined` — renders the fallback
   *
   * Construct MediaRefs via the four builders in
   * `features/files/redux/converters` (never as object literals).
   */
  ref?: MediaRef | string | null;
  /** Square dimension preset or explicit width/height. Default `"md"` (64×64). */
  size?: InlineMediaRefSize;
  /** CSS object-fit. Default `"cover"`. */
  fit?: InlineMediaRefFit;
  /** When the source can't render: lucide icon, skeleton, or nothing. Default `"icon"`. */
  fallback?: "icon" | "skeleton" | null;
  /** Override the lucide icon shown in `fallback="icon"`. */
  fallbackIcon?: React.ReactNode;
  /** Alt text for `<img>`. Defaults to "" (decorative). */
  alt?: string;
  /** Force the media element type. Default: infer from `mime_type` (falls back to `<img>`). */
  as?: "img" | "video" | "audio";
  /** Optional rounded corners. Default `"md"`. */
  rounded?: "none" | "sm" | "md" | "lg" | "full";
  /** Click handler — wires up cursor + role + keyboard activation. */
  onClick?: (event: React.MouseEvent | React.KeyboardEvent) => void;
  /**
   * Error handler — fires when the underlying media element fails to load
   * (network 404, broken bytes, expired signature). Use this to hide the
   * element or fall back to a sibling. When supplied, the component skips
   * the `next/image` branch unconditionally so the native error event
   * reaches your handler with the original `SyntheticEvent` shape.
   *
   * Note: distinct from the `fallback` prop, which renders an internal
   * icon/skeleton when the `ref` couldn't be resolved to a URL at all
   * (no remote attempt made). `onError` fires *after* a URL is resolved
   * and the remote fetch fails.
   */
  onError?: (
    event: React.SyntheticEvent<
      HTMLImageElement | HTMLVideoElement | HTMLAudioElement
    >,
  ) => void;
  /**
   * Load handler — fires when the underlying media element finishes
   * loading. Use this for fade-in transitions, canvas initialization, or
   * measuring rendered dimensions. When supplied, the component skips the
   * `next/image` branch so the native `onLoad` event reaches your handler.
   */
  onLoad?: (
    event: React.SyntheticEvent<
      HTMLImageElement | HTMLVideoElement | HTMLAudioElement
    >,
  ) => void;
  /**
   * Forwarded directly to the underlying `<img>` / `<video>` / `<audio>`
   * element for imperative DOM access (annotation canvas overlays,
   * transform calculations, getBoundingClientRect, etc.). Not a React
   * `forwardRef` because the component already uses `ref` as a content
   * prop — pass any ref-like value here instead.
   *
   * When supplied, the component skips the `next/image` branch so your
   * ref attaches to the real DOM node, not next/image's wrapper.
   */
  mediaElementRef?: React.Ref<
    HTMLImageElement | HTMLVideoElement | HTMLAudioElement
  >;
  /**
   * Forwarded to `<img crossorigin>`. Required for canvas pixel reads of
   * cross-origin images (e.g. the annotate-mode tool draws on top of a
   * loaded image and needs `crossOrigin="anonymous"` to avoid tainting
   * the canvas). When supplied, the component skips `next/image`.
   */
  crossOrigin?: "anonymous" | "use-credentials";
  /** Optional border style. Default `"none"`. */
  border?: "none" | "subtle";
  /** Extra class names. */
  className?: string;
}

// "fill" → render with width/height "100%"; element sizes from the
// parent. Avoid passing an explicit numeric width/height attribute in
// that mode so flex/grid layouts behave normally.
const SIZE_PX: Record<
  Exclude<InlineMediaRefSize, "fill" | { width: number; height: number }>,
  number
> = {
  xs: 24,
  sm: 32,
  md: 64,
  lg: 128,
  xl: 256,
};

const ROUNDED_CLASS: Record<NonNullable<InlineMediaRefProps["rounded"]>, string> = {
  none: "",
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  full: "rounded-full",
};

/**
 * Resolve the prop into either an explicit width/height pair (px) or
 * a `"fill"` sentinel that callers render as `w-full h-full`. We keep
 * the fill case as `null` for downstream consumers so they can pick
 * different attribute strategies (next/image needs width+height OR fill,
 * plain <img> takes either or omits).
 */
function resolveDimensions(
  size: InlineMediaRefSize,
): { width: number; height: number } | "fill" {
  if (typeof size === "object") return size;
  if (size === "fill") return "fill";
  const px = SIZE_PX[size];
  return { width: px, height: px };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Normalize the `ref` prop into a `FileSource` the handler understands.
 * Returns `null` for missing / unrecognised inputs so the component can
 * render its fallback.
 */
function toFileSource(
  ref: InlineMediaRefProps["ref"],
): FileSource | null {
  if (!ref) return null;
  if (typeof ref === "string") {
    if (UUID_RE.test(ref)) return { kind: "file_id", fileId: ref };
    return { kind: "external_url", url: ref };
  }
  if (ref.file_id) return { kind: "file_id", fileId: ref.file_id };
  if (ref.url) return { kind: "external_url", url: ref.url };
  return null;
}

function inferElementType(
  ref: InlineMediaRefProps["ref"],
  override?: InlineMediaRefProps["as"],
): "img" | "video" | "audio" {
  if (override) return override;
  if (ref && typeof ref === "object" && ref.mime_type) {
    if (ref.mime_type.startsWith("video/")) return "video";
    if (ref.mime_type.startsWith("audio/")) return "audio";
  }
  return "img";
}

function FallbackVisual({
  kind,
  dimensions,
  rounded,
  border,
  className,
  icon,
}: {
  kind: "icon" | "skeleton";
  dimensions: { width: number; height: number } | "fill";
  rounded: NonNullable<InlineMediaRefProps["rounded"]>;
  border: NonNullable<InlineMediaRefProps["border"]>;
  className?: string;
  icon: React.ReactNode;
}) {
  const isFill = dimensions === "fill";
  const wrapperCls = cn(
    "flex items-center justify-center bg-muted/60 text-muted-foreground",
    ROUNDED_CLASS[rounded],
    border === "subtle" && "border border-border",
    kind === "skeleton" && "animate-pulse",
    isFill && "w-full h-full",
    className,
  );
  return (
    <div
      className={wrapperCls}
      style={isFill ? undefined : { width: dimensions.width, height: dimensions.height }}
      aria-hidden={kind === "skeleton"}
    >
      {kind === "icon" ? icon : null}
    </div>
  );
}

export function InlineMediaRef({
  ref,
  size = "md",
  fit = "cover",
  fallback = "icon",
  fallbackIcon,
  alt = "",
  as,
  rounded = "md",
  onClick,
  onError,
  onLoad,
  mediaElementRef,
  crossOrigin,
  border = "none",
  className,
}: InlineMediaRefProps) {
  const source = useMemo(() => toFileSource(ref), [ref]);
  const url = useFileSrc(source);
  const dimensions = resolveDimensions(size);
  const isFill = dimensions === "fill";
  const elementType = inferElementType(ref, as);

  const defaultIcon =
    elementType === "video" ? (
      <FileVideo className="h-1/2 w-1/2" />
    ) : elementType === "audio" ? (
      <FileAudio className="h-1/2 w-1/2" />
    ) : ref ? (
      <ImageIcon className="h-1/2 w-1/2" />
    ) : (
      <FileIcon className="h-1/2 w-1/2" />
    );

  if (!url) {
    if (!fallback) return null;
    return (
      <FallbackVisual
        kind={fallback}
        dimensions={dimensions}
        rounded={rounded}
        border={border}
        className={className}
        icon={fallbackIcon ?? defaultIcon}
      />
    );
  }

  const interactiveProps = onClick
    ? {
        onClick,
        onKeyDown: (event: React.KeyboardEvent) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onClick(event);
          }
        },
        role: "button" as const,
        tabIndex: 0,
        className: cn("cursor-pointer", "focus:outline-none focus:ring-2 focus:ring-primary/50"),
      }
    : {};

  const baseCls = cn(
    "block",
    isFill && "w-full h-full",
    ROUNDED_CLASS[rounded],
    border === "subtle" && "border border-border",
    onClick && "cursor-pointer",
    interactiveProps.className,
    className,
  );

  const objectFitClass =
    fit === "cover" ? "object-cover" : fit === "contain" ? "object-contain" : "object-fill";

  // Explicit width/height attributes for fixed-size renders; omit for fill
  // mode so the parent's flex/grid sizing wins.
  const sizeAttrs = isFill
    ? {}
    : { width: dimensions.width, height: dimensions.height };

  if (elementType === "video") {
    return (
      <video
        ref={
          mediaElementRef as React.Ref<HTMLVideoElement> | undefined
        }
        src={url}
        {...sizeAttrs}
        className={cn(baseCls, objectFitClass)}
        controls
        onLoadedData={
          onLoad as React.ReactEventHandler<HTMLVideoElement> | undefined
        }
        onError={
          onError as React.ReactEventHandler<HTMLVideoElement> | undefined
        }
        crossOrigin={crossOrigin}
        {...interactiveProps}
      />
    );
  }
  if (elementType === "audio") {
    return (
      <audio
        ref={
          mediaElementRef as React.Ref<HTMLAudioElement> | undefined
        }
        src={url}
        className={cn(baseCls)}
        controls
        onLoadedData={
          onLoad as React.ReactEventHandler<HTMLAudioElement> | undefined
        }
        onError={
          onError as React.ReactEventHandler<HTMLAudioElement> | undefined
        }
        crossOrigin={crossOrigin}
        {...interactiveProps}
      />
    );
  }

  // Bail to plain <img> when the caller needs any escape hatch
  // (onError / onLoad / element ref / crossOrigin). next/image accepts
  // its own onLoad/onError but wraps the DOM node, mangles the event
  // target, and refuses crossOrigin — none of which is useful for the
  // canvas-overlay / fade-in / "hide-on-404" cases that drive these
  // props.
  const needsPlainImg =
    !!onError || !!onLoad || !!mediaElementRef || !!crossOrigin;

  // Use next/image for cld_files-hosted CDN URLs (better lazy-loading +
  // device-pixel-ratio handling); external arbitrary URLs may not be on
  // the configured remotePatterns list, so fall back to a plain <img>.
  const isCdnUrl = url.startsWith("https://cdn.") || url.includes("/cdn/");
  if (isCdnUrl && !isFill && !needsPlainImg) {
    return (
      <Image
        src={url}
        alt={alt}
        width={dimensions.width}
        height={dimensions.height}
        className={cn(baseCls, objectFitClass)}
        unoptimized
        {...interactiveProps}
      />
    );
  }
  if (isCdnUrl && isFill) {
    // next/image with `fill` requires a positioned parent — but in
    // "fill" mode we generally already have one (the caller controls
    // sizing). Fall back to plain <img> to stay layout-agnostic.
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={mediaElementRef as React.Ref<HTMLImageElement> | undefined}
      src={url}
      alt={alt}
      {...sizeAttrs}
      className={cn(baseCls, objectFitClass)}
      onLoad={onLoad as React.ReactEventHandler<HTMLImageElement> | undefined}
      onError={
        onError as React.ReactEventHandler<HTMLImageElement> | undefined
      }
      crossOrigin={crossOrigin}
      {...interactiveProps}
    />
  );
}

export default InlineMediaRef;
