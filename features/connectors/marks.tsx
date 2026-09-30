// features/connectors/marks.tsx
//
// Local first-party brand marks for connectors. Dynamic MCP providers render
// their canonical catalogue artwork through ConnectorMark.
//
// Same contract as `components/icons/brand-glyphs.tsx`: `colored={false}` paints
// `currentColor` so a mark inherits the row's muted/foreground token, and a
// brand whose color IS black stays `currentColor` even when colored (otherwise
// it disappears in dark mode).

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConnectorLogo, ConnectorLogoProps } from "./types";

function MarkSvg({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
      className={cn("shrink-0", className)}
    >
      {children}
    </svg>
  );
}

/** Full-color product artwork on the 48-unit grid Google's product marks use. */
function BrandSvg({
  className,
  viewBox = "0 0 48 48",
  children,
}: {
  className?: string;
  viewBox?: string;
  children: React.ReactNode;
}) {
  return (
    <svg
      viewBox={viewBox}
      aria-hidden
      focusable="false"
      className={cn("shrink-0", className)}
    >
      {children}
    </svg>
  );
}

/** Google — the multicolor G. Used for any Google account connection. */
export function GoogleMark({ colored = false, className }: ConnectorLogoProps) {
  if (!colored) {
    return (
      <MarkSvg className={className}>
        <path
          fill="currentColor"
          d="M12 11.09v2.94h4.1a3.51 3.51 0 0 1-1.53 2.3l2.47 1.92A7.44 7.44 0 0 0 19.4 12c0-.54-.05-1.06-.14-1.56H12Zm-6.2 1.9a4.4 4.4 0 0 1 0-1.98V9.05H3.32a7.5 7.5 0 0 0 0 6.72l2.48-1.93ZM12 6.6a4.1 4.1 0 0 1 2.9 1.13l2.16-2.16A7.24 7.24 0 0 0 12 3.5a7.5 7.5 0 0 0-6.7 4.1L7.8 9.5A4.47 4.47 0 0 1 12 6.6Zm0 13.9a7.15 7.15 0 0 0 4.96-1.81l-2.47-1.92c-.67.45-1.53.72-2.49.72a4.47 4.47 0 0 1-4.2-3.06L5.3 16.4A7.49 7.49 0 0 0 12 20.5Z"
        />
      </MarkSvg>
    );
  }
  return (
    <MarkSvg className={className}>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.56c2.08-1.92 3.28-4.74 3.28-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1a11 11 0 0 0-9.82 6.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </MarkSvg>
  );
}

/** Gmail — the four-color M. `colored={false}` keeps a single-ink envelope. */
export function GmailMark({ colored = false, className }: ConnectorLogoProps) {
  if (!colored) {
    return (
      <MarkSvg className={className}>
        <path
          fill="currentColor"
          d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457Z"
        />
      </MarkSvg>
    );
  }
  return (
    <BrandSvg className={className}>
      <path fill="#4caf50" d="M45 16.2l-5 2.75-5 4.75V40h7a3 3 0 0 0 3-3V16.2z" />
      <path fill="#1e88e5" d="M3 16.2l3.614 1.71L13 23.7V40H6a3 3 0 0 1-3-3V16.2z" />
      <path fill="#e53935" d="M35 11.2l-11 8.25-11-8.25-1 5.8 1 6.7 11 8.25 11-8.25 1-6.7z" />
      <path fill="#c62828" d="M3 12.298V16.2l10 7.5V11.2L9.876 8.859A4.298 4.298 0 0 0 7.298 8 4.298 4.298 0 0 0 3 12.298z" />
      <path fill="#fbc02d" d="M45 12.298V16.2l-10 7.5V11.2l3.124-2.341A4.298 4.298 0 0 1 40.702 8 4.298 4.298 0 0 1 45 12.298z" />
    </BrandSvg>
  );
}

/** Notion — the N. Brand color is black, so it always rides `currentColor`. */
export function NotionMark({ className }: ConnectorLogoProps) {
  return (
    <MarkSvg className={className}>
      <path
        fill="currentColor"
        d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.681 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747L1.278 19.5c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.451-1.632z"
      />
    </MarkSvg>
  );
}

/**
 * Adapt a Lucide icon into a connector mark — the sanctioned fallback for a
 * product with no local brand mark. Lucide strokes `currentColor`, so it looks
 * right in both themes and ignores `colored`.
 */
export function lucideMark(Icon: LucideIcon): ConnectorLogo {
  function LucideConnectorMark({ className }: ConnectorLogoProps) {
    return <Icon className={cn("shrink-0", className)} aria-hidden />;
  }
  LucideConnectorMark.displayName = `LucideConnectorMark(${Icon.displayName ?? "icon"})`;
  return LucideConnectorMark;
}

/**
 * Google product marks for the connect dialog and Settings. Each is the
 * product's own color artwork; with `colored={false}` they fall back to a
 * single-ink silhouette so a muted row still reads in both themes.
 */
export function GoogleDriveMark({ colored = false, className }: ConnectorLogoProps) {
  const ink = colored ? undefined : "currentColor";
  return (
    <BrandSvg className={className} viewBox="0 0 87.3 78">
      <path fill={ink ?? "#0066da"} d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" />
      <path fill={ink ?? "#00ac47"} d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" />
      <path fill={ink ?? "#ea4335"} d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" />
      <path fill={ink ?? "#00832d"} d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" />
      <path fill={ink ?? "#2684fc"} d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" />
      <path fill={ink ?? "#ffba00"} d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" />
    </BrandSvg>
  );
}

export function GoogleCalendarMark({ colored = false, className }: ConnectorLogoProps) {
  const ink = colored ? undefined : "currentColor";
  return (
    <BrandSvg className={className}>
      <path fill={colored ? "#fff" : "none"} d="M13 13h22v22H13z" />
      <path fill={ink ?? "#1e88e5"} d="M25.68 20.92l1.008 1.44 1.584-1.152v8.352H30V18.616h-1.44zM22.943 23.745c.625-.574 1.013-1.37 1.013-2.249 0-1.747-1.533-3.168-3.417-3.168-1.602 0-2.972 1.009-3.33 2.453l1.657.421c.165-.664.868-1.146 1.673-1.146.942 0 1.709.646 1.709 1.44 0 .794-.767 1.44-1.709 1.44h-.997v1.728h.997c1.081 0 1.993.751 1.993 1.64 0 .904-.866 1.64-1.931 1.64-.962 0-1.784-.61-1.914-1.418L17 26.802c.262 1.636 1.81 2.87 3.6 2.87 2.007 0 3.64-1.511 3.64-3.368 0-1.023-.504-1.941-1.297-2.559z" />
      <path fill={ink ?? "#fbc02d"} d="M34 42H14l-1-4 1-4h20l1 4z" />
      <path fill={ink ?? "#4caf50"} d="M38 35l4-1V14l-4-1-4 1v20z" />
      <path fill={ink ?? "#1e88e5"} d="M34 14l1-4-1-4H9a3 3 0 0 0-3 3v25l4 1 4-1V14h20z" />
      <path fill={ink ?? "#e53935"} d="M34 34v8l8-8z" />
      <path fill={ink ?? "#1565c0"} d="M39 6h-5v8h8V9a3 3 0 0 0-3-3zM9 42h5v-8H6v5a3 3 0 0 0 3 3z" />
    </BrandSvg>
  );
}

export function GoogleContactsMark({ colored = false, className }: ConnectorLogoProps) {
  return (
    <BrandSvg className={className}>
      <circle cx="24" cy="16" r="8" fill={colored ? "#1a73e8" : "currentColor"} />
      <path fill={colored ? "#1a73e8" : "currentColor"} d="M8 38c0-7.2 7.2-12 16-12s16 4.8 16 12v2a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2z" />
      {colored ? <path fill="#8ab4f8" d="M8 36h32v4a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2z" /> : null}
    </BrandSvg>
  );
}

export function GoogleTasksMark({ colored = false, className }: ConnectorLogoProps) {
  return (
    <BrandSvg className={className}>
      <circle cx="24" cy="24" r="20" fill={colored ? "#1a73e8" : "currentColor"} />
      <path fill="none" stroke={colored ? "#fff" : "var(--background, #fff)"} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" d="M15 24.5l6 6 12-13" />
      {colored ? <circle cx="37" cy="37" r="6" fill="#fbbc04" /> : null}
    </BrandSvg>
  );
}

export function SearchConsoleMark({ colored = false, className }: ConnectorLogoProps) {
  return (
    <BrandSvg className={className}>
      <path fill="none" stroke={colored ? "#4285f4" : "currentColor"} strokeWidth="5" d="M20 8a12 12 0 1 1 0 24 12 12 0 0 1 0-24z" />
      <path fill="none" stroke={colored ? "#34a853" : "currentColor"} strokeWidth="6" strokeLinecap="round" d="M29.5 29.5 40 40" />
      {colored ? <path fill="#fbbc04" d="M15 23h3v4h-3zM19 19h3v8h-3zM23 16h3v11h-3z" /> : null}
    </BrandSvg>
  );
}

export function GoogleAnalyticsMark({ colored = false, className }: ConnectorLogoProps) {
  return (
    <BrandSvg className={className}>
      <rect x="30" y="5" width="11" height="38" rx="5.5" fill={colored ? "#f9ab00" : "currentColor"} />
      <rect x="18.5" y="18" width="11" height="25" rx="5.5" fill={colored ? "#e37400" : "currentColor"} />
      <circle cx="12.5" cy="37.5" r="5.5" fill={colored ? "#e37400" : "currentColor"} />
    </BrandSvg>
  );
}

export function TagManagerMark({ colored = false, className }: ConnectorLogoProps) {
  return (
    <BrandSvg className={className}>
      <path fill={colored ? "#8ab4f8" : "currentColor"} d="M21.2 4.8a4 4 0 0 1 5.6 0l16.4 16.4a4 4 0 0 1 0 5.6L26.8 43.2a4 4 0 0 1-5.6 0L4.8 26.8a4 4 0 0 1 0-5.6z" />
      {colored ? <path fill="#4285f4" d="M24 9.5 38.5 24 24 38.5 9.5 24z" /> : null}
      <circle cx="24" cy="31" r="4.5" fill={colored ? "#246fdb" : "var(--background, #fff)"} />
    </BrandSvg>
  );
}

export function YouTubeMark({ colored = false, className }: ConnectorLogoProps) {
  return (
    <BrandSvg className={className}>
      <path fill={colored ? "#ff0000" : "currentColor"} d="M44.1 14.1a5.5 5.5 0 0 0-3.9-3.9C36.8 9.3 24 9.3 24 9.3s-12.8 0-16.2.9a5.5 5.5 0 0 0-3.9 3.9C3 17.5 3 24 3 24s0 6.5.9 9.9a5.5 5.5 0 0 0 3.9 3.9c3.4.9 16.2.9 16.2.9s12.8 0 16.2-.9a5.5 5.5 0 0 0 3.9-3.9c.9-3.4.9-9.9.9-9.9s0-6.5-.9-9.9z" />
      <path fill={colored ? "#fff" : "var(--background, #fff)"} d="M20 30.5 30.8 24 20 17.5z" />
    </BrandSvg>
  );
}
