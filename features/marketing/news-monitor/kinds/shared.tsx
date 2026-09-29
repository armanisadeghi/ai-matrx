/**
 * Small presentational pieces the six news kind views share. Semantic tokens
 * only; no wrappers around a host's chrome (each view is the chrome).
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { cn } from "@/lib/utils";

export function KindCard({
  title,
  subtitle,
  children,
  testId,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section
      className="my-2 flex flex-col gap-2 rounded-md border border-border bg-card p-3"
      data-testid={testId}
    >
      <header className="flex flex-col gap-0.5">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {subtitle ? (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </header>
      {children}
    </section>
  );
}

export function Pill({
  children,
  tone = "neutral",
  title,
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad" | "info";
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center rounded-full border px-1.5 py-px text-[11px] leading-4",
        tone === "neutral" && "border-border text-muted-foreground",
        tone === "good" && "border-success/40 bg-success/10 text-success",
        tone === "warn" && "border-warning/40 bg-warning/10 text-warning",
        tone === "bad" && "border-destructive/40 bg-destructive/10 text-destructive",
        tone === "info" && "border-primary/40 bg-primary/10 text-primary",
      )}
    >
      {children}
    </span>
  );
}

/** An app-internal path opens in place; anything else opens a new tab. */
export function SmartLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={cn("text-primary hover:underline", className)}>
        {children}
      </Link>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-0.5 text-primary hover:underline",
        className,
      )}
    >
      {children}
      <ExternalLink className="h-3 w-3 shrink-0" />
    </a>
  );
}

export function formatWhen(value: string | null | undefined): string {
  if (!value) return "no date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Label + value rows for small facts. */
export function FactRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">{children}</span>
    </div>
  );
}
