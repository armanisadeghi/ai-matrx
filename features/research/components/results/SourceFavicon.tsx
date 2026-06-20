"use client";

import { useState } from "react";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { faviconUrl } from "./resultsShared";

interface SourceFaviconProps {
  hostname: string | null;
  /** Source-provided thumbnail/logo — preferred over the favicon service. */
  thumbnailUrl?: string | null;
  className?: string;
  /** Icon size for the Globe fallback. */
  iconClassName?: string;
}

/**
 * Source avatar: prefers the source's own `thumbnail_url`, then the Google
 * favicon service, then a Globe icon. Each image falls through to the next on
 * load error, so a dead logo URL never leaves a broken-image box.
 */
export function SourceFavicon({
  hostname,
  thumbnailUrl,
  className,
  iconClassName,
}: SourceFaviconProps) {
  // 0 = thumbnail, 1 = favicon service, 2 = Globe fallback.
  const initialStage = thumbnailUrl ? 0 : faviconUrl(hostname) ? 1 : 2;
  const [stage, setStage] = useState<0 | 1 | 2>(initialStage);

  const favicon = faviconUrl(hostname);
  const src = stage === 0 ? thumbnailUrl : stage === 1 ? favicon : null;

  if (!src) {
    return (
      <span
        className={cn(
          "flex items-center justify-center rounded-md bg-muted/60 text-muted-foreground",
          className,
        )}
      >
        <Globe className={cn("h-4 w-4", iconClassName)} />
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={hostname ? `${hostname} icon` : "source icon"}
      loading="lazy"
      className={cn(
        "rounded-md object-contain bg-background/60",
        className,
      )}
      onError={() => setStage((s) => (s === 0 && favicon ? 1 : 2))}
    />
  );
}
