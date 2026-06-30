/**
 * features/files/components/inline/InlineMediaRef.tsx
 *
 * The canonical inline media renderer. Pass a `MediaRef` (or a plain URL,
 * or just a cld_files `fileId`), get back a correctly-sized `<img>` /
 * `<video>` / `<audio>` element. URL resolution flows through the
 * universal handler so signed URLs come from the lazy URL cache (minted
 * once, reused while valid), public files prefer the CDN URL, and share
 * links route through Python.
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

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import {
  Check,
  Copy,
  File as FileIcon,
  FileAudio,
  FileVideo,
  Image as ImageIcon,
  ImageOff,
  VideoOff,
  VolumeX,
} from "lucide-react";
import { useFileSrc } from "@/features/files/handler/hooks/useFileSrc";
import { useOutputSinkRef } from "@/features/audio/useOutputSinkRef";
import {
  getOrMintSignedUrl,
  invalidateSignedUrl,
} from "@/features/files/handler/intelligence/signed-url-cache";
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
  /**
   * Rendered when the `ref` can't be resolved to a URL at all (no remote
   * fetch attempted). Default `"icon"`.
   *
   *   - `"icon"`     — neutral lucide icon in a muted tile
   *   - `"skeleton"` — pulsing muted tile (loading-shaped)
   *   - `null`       — render nothing (caller is responsible for layout)
   */
  fallback?: "icon" | "skeleton" | null;
  /** Override the lucide icon shown in `fallback="icon"`. */
  fallbackIcon?: React.ReactNode;
  /**
   * Rendered when the URL *was* resolved but the media element failed to
   * load (network 404, broken bytes, expired signature, CORS, etc.).
   * Default `"info"` — best practice during beta: show what we know
   * (URL, alt, element type) so the failure is debuggable in-place
   * rather than disappearing the element. Use `null` to render nothing
   * if your parent UI explicitly handles the failure case.
   *
   *   - `"info"`     — pretty destructive-tinted panel with URL + copy
   *                    button + alt text. Compacts to icon-only below
   *                    ~80px on the shorter axis. Default.
   *   - `"icon"`     — same neutral lucide icon as the `fallback` prop
   *   - `"skeleton"` — pulsing muted tile
   *   - `null`       — render nothing
   *
   * Independent of the user-supplied `onError` callback, which still
   * fires before this renders (so existing hide-on-error parents keep
   * working). If you want the broken element to disappear entirely,
   * pass `errorFallback={null}` instead of hiding via `onError`.
   */
  errorFallback?: "info" | "icon" | "skeleton" | null;
  /** Alt text for `<img>`. Defaults to "" (decorative). */
  alt?: string;
  /** Force the media element type. Default: infer from `mime_type` (falls back to `<img>`). */
  as?: "img" | "video" | "audio";
  /**
   * Playback flags forwarded to the underlying `<video>` / `<audio>` element.
   * Defaults preserve the historical "display media" behaviour: `controls`
   * shown, nothing autoplaying. Set these for ambient/background video (a hero
   * loop) or autoplaying previews: e.g. `autoPlay muted loop playsInline
   * controls={false}`. Browsers require `muted` for `autoPlay` to start.
   * `playsInline` is ignored for audio.
   */
  controls?: boolean;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  playsInline?: boolean;
  preload?: "none" | "metadata" | "auto";
  /**
   * Space-separated native controls to hide, e.g. `"nofullscreen"`.
   * Forwarded to `<video controlsList>`.
   */
  controlsList?: string;
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

const ROUNDED_CLASS: Record<
  NonNullable<InlineMediaRefProps["rounded"]>,
  string
> = {
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
function toFileSource(ref: InlineMediaRefProps["ref"]): FileSource | null {
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
      style={
        isFill
          ? undefined
          : { width: dimensions.width, height: dimensions.height }
      }
      aria-hidden={kind === "skeleton"}
    >
      {kind === "icon" ? icon : null}
    </div>
  );
}

/**
 * Best-effort URL prettifier — splits a URL into "host" / "path" pieces
 * for display. Falls back to a raw truncation for non-URL strings (data
 * URIs, blob: URIs, etc).
 */
function prettifyUrl(url: string): { host: string | null; tail: string } {
  try {
    const u = new URL(url);
    const tail = `${u.pathname}${u.search}`;
    return { host: u.host, tail: tail === "/" ? "" : tail };
  } catch {
    return { host: null, tail: url };
  }
}

function InformativeErrorFallback({
  url,
  alt,
  elementType,
  mediaRef,
  dimensions,
  rounded,
  className,
}: {
  url: string;
  alt: string;
  elementType: "img" | "video" | "audio";
  mediaRef: InlineMediaRefProps["ref"];
  dimensions: { width: number; height: number } | "fill";
  rounded: NonNullable<InlineMediaRefProps["rounded"]>;
  className?: string;
}) {
  const shortAxis =
    dimensions === "fill"
      ? Number.POSITIVE_INFINITY
      : Math.min(dimensions.width, dimensions.height);

  // Below ~64px on the short axis there's no room for text — show a
  // tinted error tile with just the icon and tooltip the URL so the
  // user can still inspect it. (`isCompact` implies `dimensions !==
  // "fill"` since "fill" maps to +Infinity, but TS can't see that.)
  const isCompact = dimensions !== "fill" && shortAxis < 64;
  // Between 64 and 140px we have room for one line; above we get the
  // full info panel with URL + copy button + alt.
  const isMidsize = shortAxis < 140;

  const fileId =
    mediaRef && typeof mediaRef === "object" && "file_id" in mediaRef
      ? (mediaRef.file_id ?? null)
      : null;

  const FailIcon =
    elementType === "video"
      ? VideoOff
      : elementType === "audio"
        ? VolumeX
        : ImageOff;

  const tooltip = [
    `Failed to load ${elementType}`,
    alt && `alt: ${alt}`,
    `url: ${url}`,
    fileId && `file_id: ${fileId}`,
  ]
    .filter(Boolean)
    .join("\n");

  // Compact tile — icon only, dashed destructive border, full tooltip
  // (and same dimensions as the original so layouts don't shift).
  // TS narrows `dimensions` here via the `isCompact` definition.
  if (isCompact) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-destructive/5 text-destructive border border-destructive/40 border-dashed",
          ROUNDED_CLASS[rounded],
          className,
        )}
        style={{ width: dimensions.width, height: dimensions.height }}
        role="img"
        aria-label={`Failed to load ${elementType}${alt ? `: ${alt}` : ""}`}
        title={tooltip}
      >
        <FailIcon className="h-1/2 w-1/2 max-h-5 max-w-5" />
      </div>
    );
  }

  return (
    <InformativeErrorPanel
      url={url}
      alt={alt}
      elementType={elementType}
      fileId={fileId}
      dimensions={dimensions}
      rounded={rounded}
      className={className}
      compact={isMidsize}
      icon={<FailIcon className="h-3.5 w-3.5 shrink-0" />}
      tooltip={tooltip}
    />
  );
}

function InformativeErrorPanel({
  url,
  alt,
  elementType,
  fileId,
  dimensions,
  rounded,
  className,
  compact,
  icon,
  tooltip,
}: {
  url: string;
  alt: string;
  elementType: "img" | "video" | "audio";
  fileId: string | null;
  dimensions: { width: number; height: number } | "fill";
  rounded: NonNullable<InlineMediaRefProps["rounded"]>;
  className?: string;
  compact: boolean;
  icon: React.ReactNode;
  tooltip: string;
}) {
  const [copied, setCopied] = useState(false);
  const isFill = dimensions === "fill";
  const { host, tail } = prettifyUrl(url);

  const handleCopy = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      event.preventDefault();
      navigator.clipboard
        ?.writeText(url)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
        .catch(() => {
          // Clipboard API can fail in non-HTTPS / permission-denied
          // contexts. Tooltip + selectable text below already give the
          // user the URL, so this is non-fatal.
        });
    },
    [url],
  );

  return (
    <div
      className={cn(
        "flex flex-col bg-destructive/5 text-foreground border border-destructive/40 border-dashed overflow-hidden",
        ROUNDED_CLASS[rounded],
        compact ? "p-1.5 gap-0.5" : "p-2 gap-1",
        isFill ? "w-full h-full" : "",
        className,
      )}
      style={
        isFill
          ? undefined
          : { width: dimensions.width, height: dimensions.height }
      }
      role="img"
      aria-label={`Failed to load ${elementType}${alt ? `: ${alt}` : ""}`}
      title={tooltip}
    >
      {/* Headline row */}
      <div
        className={cn(
          "flex items-center gap-1.5 text-destructive font-medium leading-tight",
          compact ? "text-[10px]" : "text-xs",
        )}
      >
        {icon}
        <span className="truncate">
          {elementType === "img"
            ? "Image failed to load"
            : elementType === "video"
              ? "Video failed to load"
              : "Audio failed to load"}
        </span>
      </div>

      {/* Alt text (when supplied and there's vertical room) */}
      {alt && !compact && (
        <div
          className="text-[11px] text-muted-foreground italic line-clamp-1"
          title={alt}
        >
          {alt}
        </div>
      )}

      {/* URL + copy button — fills remaining vertical space */}
      <div
        className={cn(
          "flex items-end gap-1 mt-auto min-w-0",
          compact ? "text-[9px]" : "text-[10px]",
        )}
      >
        <div className="font-mono text-muted-foreground truncate flex-1 min-w-0">
          {host ? (
            <>
              <span className="text-foreground/80">{host}</span>
              {tail && <span className="opacity-70">{tail}</span>}
            </>
          ) : (
            <span>{tail}</span>
          )}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            "shrink-0 p-0.5 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors focus:outline-none focus:ring-1 focus:ring-destructive/40",
            copied && "text-emerald-600 dark:text-emerald-500",
          )}
          aria-label={copied ? "URL copied" : "Copy URL"}
          title={copied ? "URL copied" : "Copy URL"}
        >
          {copied ? (
            <Check className="h-3 w-3" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </button>
      </div>

      {/* file_id badge — only when room and we have one */}
      {fileId && !compact && (
        <div className="text-[9px] font-mono text-muted-foreground/70 truncate">
          {fileId}
        </div>
      )}
    </div>
  );
}

export function InlineMediaRef({
  ref,
  size = "md",
  fit = "cover",
  fallback = "icon",
  fallbackIcon,
  errorFallback = "info",
  alt = "",
  as,
  controls = true,
  autoPlay,
  loop,
  muted,
  playsInline,
  preload,
  controlsList,
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
  const resolvedUrl = useFileSrc(source);
  // Routes <audio>/<video> to the user's chosen output device (setSinkId) and
  // re-applies on device change. No-op on Safari. Forwards to mediaElementRef.
  const sinkRef = useOutputSinkRef(mediaElementRef);
  const sourceFileId =
    source && source.kind === "file_id" ? source.fileId : null;

  // A freshly re-minted URL after the resolved one failed to load. For an
  // owned file, a dead URL is a non-event — we re-mint from file_id rather
  // than surface a broken image.
  const [remintedUrl, setRemintedUrl] = useState<string | null>(null);
  const remintAttempts = useRef(0);
  useEffect(() => {
    setRemintedUrl(null);
    remintAttempts.current = 0;
  }, [sourceFileId]);

  const url = remintedUrl ?? resolvedUrl;
  const dimensions = resolveDimensions(size);
  const isFill = dimensions === "fill";
  const elementType = inferElementType(ref, as);

  // Track whether the resolved URL failed to load. Reset whenever the
  // URL changes — a different attempt deserves a fresh chance.
  const [hasLoadError, setHasLoadError] = useState(false);
  useEffect(() => {
    setHasLoadError(false);
  }, [url]);

  const handleLoadError = useCallback(
    (
      event: React.SyntheticEvent<
        HTMLImageElement | HTMLVideoElement | HTMLAudioElement
      >,
    ) => {
      // Owned file (file_id source) → re-mint before surfacing an error.
      if (sourceFileId && remintAttempts.current < 2) {
        remintAttempts.current += 1;
        console.warn(
          "[file-handler] inline media failed to load — re-minting owned " +
            `file (a user's own file never just 'expires'). fileId=${sourceFileId} ` +
            `attempt=${remintAttempts.current}`,
        );
        invalidateSignedUrl(sourceFileId);
        getOrMintSignedUrl(sourceFileId)
          .then((fresh) => setRemintedUrl(fresh.url))
          .catch((err) => {
            console.error(
              `[file-handler] inline re-mint FAILED for ${sourceFileId}`,
              err,
            );
            setHasLoadError(true);
            onError?.(event);
          });
        return;
      }
      setHasLoadError(true);
      onError?.(event);
    },
    [onError, sourceFileId],
  );

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

  // URL resolved but the remote fetch failed — render the informative
  // (or caller-overridden) error fallback. Keeps the original dimensions
  // so layouts don't jump.
  if (hasLoadError) {
    if (errorFallback === null) return null;
    if (errorFallback === "info") {
      return (
        <InformativeErrorFallback
          url={url}
          alt={alt}
          elementType={elementType}
          mediaRef={ref}
          dimensions={dimensions}
          rounded={rounded}
          className={className}
        />
      );
    }
    return (
      <FallbackVisual
        kind={errorFallback}
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
        className: cn(
          "cursor-pointer",
          "focus:outline-none focus:ring-2 focus:ring-primary/50",
        ),
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
    fit === "cover"
      ? "object-cover"
      : fit === "contain"
        ? "object-contain"
        : "object-fill";

  // Explicit width/height attributes for fixed-size renders; omit for fill
  // mode so the parent's flex/grid sizing wins.
  const sizeAttrs = isFill
    ? {}
    : { width: dimensions.width, height: dimensions.height };

  if (elementType === "video") {
    return (
      <video
        ref={sinkRef}
        src={url}
        {...sizeAttrs}
        className={cn(baseCls, objectFitClass)}
        controls={controls}
        autoPlay={autoPlay}
        loop={loop}
        muted={muted}
        playsInline={playsInline}
        preload={preload}
        controlsList={controlsList}
        onLoadedData={
          onLoad as React.ReactEventHandler<HTMLVideoElement> | undefined
        }
        onError={handleLoadError as React.ReactEventHandler<HTMLVideoElement>}
        crossOrigin={crossOrigin}
        {...interactiveProps}
      />
    );
  }
  if (elementType === "audio") {
    return (
      <audio
        ref={sinkRef}
        src={url}
        className={cn(baseCls)}
        controls={controls}
        autoPlay={autoPlay}
        loop={loop}
        muted={muted}
        preload={preload}
        onLoadedData={
          onLoad as React.ReactEventHandler<HTMLAudioElement> | undefined
        }
        onError={handleLoadError as React.ReactEventHandler<HTMLAudioElement>}
        crossOrigin={crossOrigin}
        {...interactiveProps}
      />
    );
  }

  // Bail to plain <img> when the caller needs an event-target escape
  // hatch (onLoad / element ref / crossOrigin). The internal error
  // handler also works on next/image, so onError alone no longer
  // forces the plain-img branch.
  const needsPlainImg = !!onLoad || !!mediaElementRef || !!crossOrigin;

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
        onError={handleLoadError as React.ReactEventHandler<HTMLImageElement>}
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
      onError={handleLoadError}
      crossOrigin={crossOrigin}
      {...interactiveProps}
    />
  );
}

export default InlineMediaRef;
