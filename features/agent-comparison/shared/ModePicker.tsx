"use client";

/**
 * ModePicker — cross-mode navigation chip strip.
 *
 * Mounted at the top of every comparison page so users can hop between
 * comparison modes (Open, Settings, Tools, ...) without going back to
 * the agents index. Each mode entry knows its route + whether it's
 * available; non-available modes render disabled with a "soon" badge.
 *
 * Adding a new mode = one entry in MODES[]. Route + label live here so
 * the picker stays a single-file source of truth.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Layers,
  SlidersHorizontal,
  Wrench,
  FileText,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ModeEntry {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Short hint that surfaces on hover. */
  hint: string;
  /** Set when the mode ships in a later phase. */
  comingSoon?: boolean;
}

const MODES: ModeEntry[] = [
  {
    id: "open",
    label: "Open",
    href: "/agents/battle",
    icon: Layers,
    hint: "Anything goes — pick any agent + version per column",
  },
  {
    id: "settings",
    label: "Settings",
    href: "/agents/battle/settings",
    icon: SlidersHorizontal,
    hint: "Lock the agent + input; vary the LLM settings (model, temp, reasoning)",
  },
  {
    id: "tools",
    label: "Tools",
    href: "/agents/battle/tools",
    icon: Wrench,
    hint: "Lock everything; vary the tools available per column",
  },
  {
    id: "system-prompt",
    label: "System Prompt",
    href: "/agents/battle/system-prompt",
    icon: FileText,
    hint: "Lock everything; vary the system prompt override per column",
  },
  {
    id: "request-mod",
    label: "Request Mod",
    href: "/agents/battle/request-mod",
    icon: Workflow,
    hint: "Lock the agent; vary per-column variables and user message",
  },
];

export function ModePicker() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1 px-2 py-1 border-b border-border bg-muted/30 shrink-0 overflow-x-auto">
      <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/80 shrink-0 pr-1">
        Mode
      </span>
      {MODES.map((m) => {
        const isActive = matchActive(pathname, m.href);
        const Icon = m.icon;

        if (m.comingSoon) {
          return (
            <button
              key={m.id}
              type="button"
              disabled
              title={`${m.hint} — coming soon`}
              className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[11px] font-medium text-muted-foreground/50 cursor-not-allowed shrink-0"
            >
              <Icon className="w-3.5 h-3.5" />
              {m.label}
              <span className="text-[8px] uppercase tracking-wider opacity-70 font-mono">
                soon
              </span>
            </button>
          );
        }

        return (
          <Link
            key={m.id}
            href={m.href}
            title={m.hint}
            className={cn(
              "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] font-medium transition-colors shrink-0",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-muted",
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {m.label}
          </Link>
        );
      })}
    </div>
  );
}

/**
 * Active-route matcher: exact match for /agents/battle (so Settings
 * doesn't trip the Open chip) plus startsWith for nested mode routes.
 */
function matchActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/agents/battle") return pathname === "/agents/battle";
  return pathname === href || pathname.startsWith(href + "/");
}
