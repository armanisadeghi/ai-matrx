"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function MarketingUrlRow({
  url,
  className,
  textClassName,
}: {
  url: string;
  className?: string;
  textClassName?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onCopy = () => {
    void copyText(url).then((ok) => {
      if (!ok) {
        toast.error("Couldn't copy URL");
        return;
      }
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className={cn("flex min-w-0 items-center gap-1", className)}>
      <span
        className={cn(
          "min-w-0 truncate text-xs text-muted-foreground",
          textClassName,
        )}
      >
        {url}
      </span>
      <button
        type="button"
        onClick={onCopy}
        aria-label={copied ? "Copied" : "Copy URL"}
        title="Copy URL"
        className={cn(
          "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground focus:outline-none",
          copied && "text-primary",
        )}
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </button>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        aria-label="Open URL in new tab"
        title="Open in new tab"
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground focus:outline-none"
      >
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}
