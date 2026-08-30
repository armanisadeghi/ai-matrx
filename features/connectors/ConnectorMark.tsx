"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ConnectorDefinition } from "./types";

interface ConnectorMarkProps {
  connector: ConnectorDefinition;
  className?: string;
  colored?: boolean;
}

/**
 * One artwork renderer for every connector surface. MCP providers use the
 * catalogue's real brand asset; first-party providers use their local SVG.
 */
export function ConnectorMark({
  connector,
  className,
  colored = true,
}: ConnectorMarkProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const iconUrl = connector.iconUrl?.trim() || null;

  if (iconUrl && failedUrl !== iconUrl) {
    return (
      <img
        src={iconUrl}
        alt=""
        aria-hidden
        decoding="async"
        referrerPolicy="no-referrer"
        className={cn(
          "shrink-0 object-contain",
          !colored && "grayscale opacity-70",
          className,
        )}
        onError={() => setFailedUrl(iconUrl)}
      />
    );
  }

  if (connector.logo) {
    const Logo = connector.logo;
    return <Logo colored={colored} className={className} />;
  }

  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-sm bg-primary text-[0.55rem] font-semibold leading-none text-primary-foreground",
        !colored && "grayscale opacity-70",
        className,
      )}
      style={
        connector.brandColor
          ? { backgroundColor: connector.brandColor }
          : undefined
      }
    >
      {connector.name.charAt(0).toLocaleUpperCase()}
    </span>
  );
}
