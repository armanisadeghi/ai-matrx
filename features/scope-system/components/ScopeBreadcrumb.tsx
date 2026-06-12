"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2, ChevronRight, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { orgScopesHref } from "@/features/scope-system/utils/scopeRoutes";

export interface ScopeBreadcrumbTrailNode {
  label: string;
  href?: string;
}

export interface ScopeBreadcrumbProps {
  orgSlugOrId: string;
  orgName: string;
  orgIsPersonal: boolean;
  trail?: ScopeBreadcrumbTrailNode[];
  /** When set, Back navigates here instead of `router.back()` — use on hub pages to avoid history traps. */
  backHref?: string;
  /** Where the org segment links. Defaults to the org scopes hub. */
  orgLinkHref?: string;
  className?: string;
  actions?: React.ReactNode;
}

export function ScopeBreadcrumb({
  orgSlugOrId,
  orgName,
  orgIsPersonal,
  trail = [],
  backHref,
  orgLinkHref = orgScopesHref(orgSlugOrId),
  className,
  actions,
}: ScopeBreadcrumbProps) {
  const router = useRouter();

  const backControl = backHref ? (
    <Button variant="ghost" size="sm" asChild className="h-7 px-2 -ml-2">
      <Link href={backHref}>
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back
      </Link>
    </Button>
  ) : (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => router.back()}
      className="h-7 px-2 -ml-2"
    >
      <ArrowLeft className="h-4 w-4 mr-1" />
      Back
    </Button>
  );

  const crumbs = (
    <div className="flex items-center gap-1.5 text-sm flex-wrap min-w-0">
      {backControl}
      <span className="text-muted-foreground/50">·</span>
      <Link
        href={orgLinkHref}
        className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
      >
        {orgIsPersonal ? (
          <Home className="h-3.5 w-3.5" />
        ) : (
          <Building2 className="h-3.5 w-3.5" />
        )}
        {orgIsPersonal ? "Personal workspace" : orgName}
      </Link>
      {trail.map((node, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
          {node.href ? (
            <Link
              href={node.href}
              className="text-muted-foreground hover:text-foreground"
            >
              {node.label}
            </Link>
          ) : (
            <span className="font-medium text-foreground">{node.label}</span>
          )}
        </span>
      ))}
    </div>
  );

  if (actions) {
    return (
      <div
        className={[
          "flex items-center justify-between gap-2 flex-wrap",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {crumbs}
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      </div>
    );
  }

  return <div className={className}>{crumbs}</div>;
}
