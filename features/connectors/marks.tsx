// features/connectors/marks.tsx
//
// Local brand marks for connectors. NEVER hotlink a remote logo — a connector
// row that waits on a third-party CDN is a layout shift and a privacy leak.
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

/** Gmail — the envelope. */
export function GmailMark({ colored = false, className }: ConnectorLogoProps) {
  return (
    <MarkSvg className={className}>
      <path
        fill={colored ? "#EA4335" : "currentColor"}
        d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457Z"
      />
    </MarkSvg>
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
