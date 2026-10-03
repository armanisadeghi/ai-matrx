/**
 * The one-line provenance every honest sample carries (owner, 2026-10-03,
 * feedback item 7: "always state the OLD url"). 11px meta, links to the real
 * route so the two can be compared side by side.
 */

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function ReplacesLine({ href, className }: { href: string; className?: string }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-1 text-[0.6875rem] text-muted-foreground", className)}>
      <span className="shrink-0">Replaces</span>
      <Link
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-w-0 cursor-pointer items-center gap-0.5 font-mono hover:text-foreground hover:underline"
      >
        <span className="truncate">{href}</span>
        <ArrowUpRight className="size-3 shrink-0" aria-hidden />
      </Link>
    </div>
  );
}
