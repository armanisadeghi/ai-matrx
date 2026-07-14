"use client";

// CmsSiteSwitcher — the [siteId]-route entity dropdown for the shell header
// (the /agents/[id] AgentSelectorIsland pattern): the current site's name is
// a tappable dropdown listing every site; switching keeps the current
// sub-view (pages / components / settings).

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CmsSiteService } from "@/features/cms/services/cmsService";
import type { ClientSite } from "@/features/cms/types";
import { extractErrorMessage } from "@/utils/errors";
import { cn } from "@/lib/utils";

function subViewSuffix(pathname: string, siteId: string): string {
  const rest = pathname.slice(`/cms/${siteId}`.length);
  if (rest.startsWith("/components")) return "/components";
  if (rest.startsWith("/settings")) return "/settings";
  return "";
}

export function CmsSiteSwitcher({
  siteId,
  siteName,
}: {
  siteId: string;
  siteName: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const [sites, setSites] = useState<ClientSite[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || sites !== null) return;
    CmsSiteService.listSites()
      .then(setSites)
      .catch((err: unknown) => {
        console.error(
          "[cms] site switcher list failed:",
          extractErrorMessage(err),
        );
        setSites([]);
      });
  }, [open, sites]);

  const handleSelect = (nextId: string) => {
    if (nextId === siteId) return;
    const suffix = subViewSuffix(pathname, siteId);
    startTransition(() => router.push(`/cms/${nextId}${suffix}`));
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 min-w-0 rounded-full px-2 py-1 text-sm font-medium text-foreground hover:bg-[var(--matrx-glass-bg-active)] transition-colors"
          aria-label="Switch site"
        >
          <span className="truncate max-w-[100px] sm:max-w-[180px]">
            {siteName}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {sites === null ? (
          <DropdownMenuItem disabled>Loading sites…</DropdownMenuItem>
        ) : sites.length === 0 ? (
          <DropdownMenuItem disabled>No other sites</DropdownMenuItem>
        ) : (
          sites.map((s) => (
            <DropdownMenuItem
              key={s.id}
              onSelect={() => handleSelect(s.id)}
              className={cn("truncate", s.id === siteId && "font-semibold")}
            >
              {s.name}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
