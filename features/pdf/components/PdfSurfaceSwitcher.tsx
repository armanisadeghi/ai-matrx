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
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, ExternalLink, Layers, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

const surfaceActionClassName =
  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50";

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
          className={cn(
            "shrink-0",
            size === "icon" ? "h-7 w-7" : "h-7 gap-1.5 px-2",
            className,
          )}
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
          const canNavigate = Boolean(href) && !isCurrent && !isPending;

          return (
            <DropdownMenuItem
              key={surface.id}
              disabled={isCurrent || !href}
              onSelect={(event) => event.preventDefault()}
              className="gap-2 py-1.5"
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium">
                  {surface.label}
                </span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {surface.description}
                </span>
              </span>
              {isCurrent ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
              ) : href ? (
                <span className="flex shrink-0 items-center gap-0.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        disabled={!canNavigate}
                        aria-label={`Open ${surface.label} here`}
                        className={surfaceActionClassName}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!href) return;
                          startTransition(() => router.push(href));
                        }}
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Open here</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open ${surface.label} in new tab`}
                        className={surfaceActionClassName}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="top">Open in new tab</TooltipContent>
                  </Tooltip>
                </span>
              ) : null}
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
