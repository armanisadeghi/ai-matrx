"use client";

import { AlertCircle, AlertTriangle, ChevronRight, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import AppLink from "@/components/navigation/AppLink";
import type { SettingsBadge, SettingsCommonProps } from "./types";

export type SettingsNavigationRowProps = SettingsCommonProps & {
  value?: ReactNode;
  loading?: boolean;
  last?: boolean;
} &
  (
    | { href: string; onNavigate?: never }
    | { href?: never; onNavigate: () => void }
  );

/** A settings row with exactly one navigation action. */
export function SettingsNavigationRow({
  href,
  onNavigate,
  value,
  loading = false,
  last,
  disabled,
  label,
  description,
  warning,
  error,
  badge,
  icon: Icon,
  modified,
  id,
}: SettingsNavigationRowProps) {
  const rowClass = cn(
    "flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:min-h-9",
    !disabled && !loading && "hover:bg-accent/60",
    (disabled || loading) && "cursor-default opacity-50",
    !last && "border-b border-border/40",
  );
  const content = (
    <>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          {modified && <span aria-label="Modified from default" className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
          {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
          <span className="truncate text-sm font-medium text-foreground">{label}</span>
          {badge && <Badge badge={badge} />}
        </span>
        {description && <span className="mt-0.5 block text-xs leading-snug text-muted-foreground sm:truncate">{description}</span>}
        {warning && <span className="mt-1 flex items-start gap-1.5 text-xs leading-snug text-amber-600 dark:text-amber-400"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{warning}</span>}
        {error && <span className="mt-1 flex items-start gap-1.5 text-xs leading-snug text-red-600 dark:text-red-400"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{error}</span>}
      </span>
      {value && <span className="max-w-40 truncate text-sm text-muted-foreground">{value}</span>}
      {loading ? <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
    </>
  );

  if (disabled || loading) {
    return <div id={id} className={rowClass} aria-disabled="true" aria-busy={loading || undefined}>{content}</div>;
  }
  if (href) {
    return <AppLink id={id} className={rowClass} href={href}>{content}</AppLink>;
  }
  return <button id={id} className={rowClass} type="button" onClick={onNavigate}>{content}</button>;
}

function Badge({ badge }: { badge: SettingsBadge }) {
  return <span className="rounded border border-border bg-muted px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{badge.label}</span>;
}
