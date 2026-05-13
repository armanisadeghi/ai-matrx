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
  /** Optional border style. Default `"none"`. */
  border?: "none" | "subtle";
  /** Extra class names. */
  className?: string;
}

const SIZE_PX: Record<Exclude<InlineMediaRefSize, { width: number; height: number }>, number> = {
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

function resolveDimensions(size: InlineMediaRefSize): { width: number; height: number } {
  if (typeof size === "object") return size;
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
  width,
  height,
  rounded,
  border,
  className,
  icon,
}: {
  kind: "icon" | "skeleton";
  width: number;
  height: number;
  rounded: NonNullable<InlineMediaRefProps["rounded"]>;
  border: NonNullable<InlineMediaRefProps["border"]>;
  className?: string;
  icon: React.ReactNode;
}) {
  const wrapperCls = cn(
    "flex items-center justify-center bg-muted/60 text-muted-foreground",
    ROUNDED_CLASS[rounded],
    border === "subtle" && "border border-border",
    kind === "skeleton" && "animate-pulse",
    className,
  );
  return (
    <div
      className={wrapperCls}
      style={{ width, height }}
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
  border = "none",
  className,
}: InlineMediaRefProps) {
  const source = useMemo(() => toFileSource(ref), [ref]);
  const url = useFileSrc(source);
  const { width, height } = resolveDimensions(size);
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
        width={width}
        height={height}
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
    ROUNDED_CLASS[rounded],
    border === "subtle" && "border border-border",
    onClick && "cursor-pointer",
    interactiveProps.className,
    className,
  );

  const objectFitClass =
    fit === "cover" ? "object-cover" : fit === "contain" ? "object-contain" : "object-fill";

  if (elementType === "video") {
    return (
      <video
        src={url}
        width={width}
        height={height}
        className={cn(baseCls, objectFitClass)}
        controls
        {...interactiveProps}
      />
    );
  }
  if (elementType === "audio") {
    return (
      <audio
        src={url}
        className={cn(baseCls)}
        controls
        {...interactiveProps}
      />
    );
  }

  // Use next/image for cld_files-hosted CDN URLs (better lazy-loading +
  // device-pixel-ratio handling); external arbitrary URLs may not be on
  // the configured remotePatterns list, so fall back to a plain <img>.
  const isCdnUrl = url.startsWith("https://cdn.") || url.includes("/cdn/");
  if (isCdnUrl) {
    return (
      <Image
        src={url}
        alt={alt}
        width={width}
        height={height}
        className={cn(baseCls, objectFitClass)}
        unoptimized
        {...interactiveProps}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      width={width}
      height={height}
      className={cn(baseCls, objectFitClass)}
      {...interactiveProps}
    />
  );
}

export default InlineMediaRef;
