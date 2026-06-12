"use client";

/**
 * PdfSurfaceSwitcher — the one-click jump between every PDF surface.
 *
 * Mounted on every UI that renders a PDF (file viewer, Analysis Studio,
 * PDF Extractor, RAG pane, …). Reads the surface registry
 * (features/pdf/surfaces/registry.ts) so the menu is identical everywhere
 * and new surfaces appear on all of them by adding one registry entry.
 *
 * Identity comes from whichever id the host surface knows; the hook
 * resolves the other half via the canonical bridge.
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Check, Layers, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  PDF_SURFACES,
  type PdfSurfaceId,
} from "@/features/pdf/surfaces/registry";
import { usePdfSurfaceLinks } from "@/features/pdf/hooks/usePdfSurfaceLinks";

export interface PdfSurfaceSwitcherProps {
  /** The surface currently rendering this PDF (marked + non-navigable). */
  current: PdfSurfaceId;
  fileId?: string | null;
  processedDocumentId?: string | null;
  /** "icon" = icon-only trigger for dense toolbars; "sm" adds the label. */
  size?: "icon" | "sm";
  className?: string;
}

export function PdfSurfaceSwitcher({
  current,
  fileId,
  processedDocumentId,
  size = "sm",
  className,
}: PdfSurfaceSwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { ids, loading } = usePdfSurfaceLinks({ fileId, processedDocumentId });

  const entries = PDF_SURFACES.map((surface) => ({
    surface,
    href: surface.buildHref(ids),
  })).filter((e) => e.href !== null || e.surface.id === current);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size={size === "icon" ? "icon" : "sm"}
          disabled={isPending}
          aria-label="Open this PDF in another surface"
          className={cn("shrink-0", size === "icon" ? "h-7 w-7" : "h-7 gap-1.5 px-2", className)}
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Layers className="h-3.5 w-3.5" />
          )}
          {size === "sm" && <span className="text-xs">Open in</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-[11px] text-muted-foreground">
          This PDF, everywhere
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {entries.map(({ surface, href }) => {
          const isCurrent = surface.id === current;
          const Icon = surface.icon;
          return (
            <DropdownMenuItem
              key={surface.id}
              disabled={isCurrent || !href || isPending}
              onSelect={() => {
                if (!href || isCurrent) return;
                startTransition(() => router.push(href));
              }}
              className="gap-2"
            >
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-medium">
                  {surface.label}
                </span>
                <span className="block text-[10px] text-muted-foreground truncate">
                  {surface.description}
                </span>
              </span>
              {isCurrent ? (
                <Check className="h-3.5 w-3.5 text-primary" />
              ) : (
                <ArrowUpRight className="h-3 w-3 text-muted-foreground" />
              )}
            </DropdownMenuItem>
          );
        })}
        {loading && (
          <p className="px-2 py-1 text-[10px] text-muted-foreground">
            Resolving linked documents…
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
