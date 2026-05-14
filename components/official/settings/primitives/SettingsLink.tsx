"use client";

import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { SettingsRow } from "../SettingsRow";
import { cn } from "@/lib/utils";
import { useSettingsNavigate } from "@/features/settings/components/SettingsPresentationContext";
import type { SettingsCommonProps } from "../types";

export type SettingsLinkProps = SettingsCommonProps & {
  /** Internal route (href starting with "/") or external URL. */
  href: string;
  /** Action label shown on the link button. */
  actionLabel?: string;
  /** Forces external-link behavior even for relative hrefs. */
  external?: boolean;
  last?: boolean;
};

export function SettingsLink({
  href,
  actionLabel,
  external,
  last,
  ...rowProps
}: SettingsLinkProps) {
  const id =
    rowProps.id ??
    `settings-${rowProps.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const isExternal = external ?? /^https?:\/\//i.test(href);
  const Icon = isExternal ? ExternalLink : ArrowRight;
  const labelText = actionLabel ?? (isExternal ? "Open" : "View");

  const anchorClasses = cn(
    "inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 h-8 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
    rowProps.disabled && "pointer-events-none opacity-50",
  );

  // Presentation-aware navigation: inside the settings window/drawer
  // this dismisses the shell *before* pushing, so the user lands on the
  // target page instead of seeing the window blink out. Cmd/Ctrl/middle
  // click still opens the link in a new tab (shell stays open).
  const navigate = useSettingsNavigate();

  return (
    <SettingsRow {...rowProps} id={id} variant="inline" last={last}>
      {isExternal ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={anchorClasses}
        >
          <span>{labelText}</span>
          <Icon className="h-3.5 w-3.5" />
        </a>
      ) : (
        <Link
          href={href}
          className={anchorClasses}
          onClick={(e) => {
            if (rowProps.disabled) {
              e.preventDefault();
              return;
            }
            navigate(href, e);
          }}
        >
          <span>{labelText}</span>
          <Icon className="h-3.5 w-3.5" />
        </Link>
      )}
    </SettingsRow>
  );
}
