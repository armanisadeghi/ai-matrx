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
    <div className="pointer-events-auto matrx-glass-thin-border flex min-w-0 items-center gap-0 rounded-full p-0.5">
      {TRANSCRIPTS_MODES.map(({ id, label, icon: Icon, href }) => {
        const isActive = id === mode;
        return (
          <Link
            key={id}
            href={href}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey) return;
              e.preventDefault();
              handleModeChange(id);
            }}
            title={label}
            className={cn(
              "flex cursor-pointer items-center justify-center gap-1 rounded-full py-0.5 text-[0.6875rem] font-medium transition-colors",
              "px-2.5",
              "[&_svg]:h-3.5 [&_svg]:w-3.5",
              isActive
                ? "bg-[var(--matrx-glass-bg-active)] text-[var(--shell-nav-text-hover)]"
                : "text-[var(--shell-nav-text)] hover:text-[var(--shell-nav-text-hover)]",
            )}
          >
            <Icon />
            <span className="hidden lg:inline">{label}</span>
          </Link>
        );
      })}
    </div>
  );
}
