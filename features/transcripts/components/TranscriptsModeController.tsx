"use client";

import { useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  deriveTranscriptsMode,
  getTranscriptsModeHref,
  TRANSCRIPTS_MODES,
  type TranscriptsPageMode,
} from "@/features/transcripts/constants/transcriptsRoutes";
import {
  NAV_ITEM_SELECTED,
  NAV_ITEM_UNSELECTED,
} from "@/features/shell/components/header/navItemClasses";
import {
  NavItemTooltip,
  NavTooltipProvider,
} from "@/features/shell/components/header/NavItemTooltip";

export function TranscriptsModeController() {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const mode = deriveTranscriptsMode(pathname);

  const handleModeChange = (next: TranscriptsPageMode) => {
    if (next === mode) return;
    startTransition(() => router.push(getTranscriptsModeHref(next)));
  };

  return (
    <NavTooltipProvider>
      <div className="pointer-events-auto matrx-glass-thin-border flex min-w-0 items-center gap-0 rounded-full p-0.5">
        {TRANSCRIPTS_MODES.map(({ id, label, icon: Icon, href }) => {
          const isActive = id === mode;
          return (
            <NavItemTooltip key={id} label={label} contentClassName="lg:hidden">
              <Link
                href={href}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey) return;
                  e.preventDefault();
                  handleModeChange(id);
                }}
                aria-label={label}
                className={cn(
                  "flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1 rounded-full px-2.5 text-[0.6875rem] font-medium transition-colors lg:min-h-8 lg:min-w-0",
                  "[&_svg]:h-4 [&_svg]:w-4 lg:[&_svg]:h-3.5 lg:[&_svg]:w-3.5",
                  isActive ? NAV_ITEM_SELECTED : NAV_ITEM_UNSELECTED,
                )}
              >
                <Icon />
                <span className="hidden lg:inline">{label}</span>
              </Link>
            </NavItemTooltip>
          );
        })}
      </div>
    </NavTooltipProvider>
  );
}
