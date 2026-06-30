"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  FEATURE_DOC_DOT_DIRS,
  dotDirRouteSlug,
  type FeatureDocDotDir,
  type FeatureDocZone,
} from "@/features/feature-docs/constants";

interface FeatureDocsShellProps {
  title: string;
  subtitle?: string;
  zone: FeatureDocZone | "hub";
  dotDir?: FeatureDocDotDir;
  children: React.ReactNode;
}

const MAIN_TABS: {
  href: string;
  label: string;
  zone: FeatureDocZone | "hub";
}[] = [
  {
    href: "/administration/feature-docs/codebase",
    label: "Codebase",
    zone: "codebase",
  },
  { href: "/administration/feature-docs/docs", label: "Docs", zone: "docs" },
  {
    href: "/administration/feature-docs/dotdirs",
    label: "Tooling dirs",
    zone: "dotdir",
  },
];

export default function FeatureDocsShell({
  title,
  subtitle,
  zone,
  dotDir,
  children,
}: FeatureDocsShellProps) {
  const pathname = usePathname();

  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden bg-background">
      <header className="border-b border-border px-4 py-3 shrink-0 space-y-2">
        <div className="flex items-baseline gap-2 flex-wrap">
          <Link
            href="/administration/feature-docs"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Feature Docs
          </Link>
          <span className="text-xs text-muted-foreground">/</span>
          <h1 className="text-sm font-bold tracking-tight">{title}</h1>
          {subtitle && (
            <span className="text-xs text-muted-foreground">{subtitle}</span>
          )}
        </div>

        <nav className="flex flex-wrap items-center gap-1">
          {MAIN_TABS.map((tab) => {
            const active =
              zone === tab.zone ||
              (tab.zone === "dotdir" && zone === "dotdir" && !dotDir);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        {zone === "dotdir" && (
          <nav className="flex flex-wrap items-center gap-1 pt-1 border-t border-border/60">
            {FEATURE_DOC_DOT_DIRS.map((dir) => {
              const href = `/administration/feature-docs/dotdirs/${dotDirRouteSlug(dir)}`;
              const active = dotDir === dir || pathname === href;
              return (
                <Link
                  key={dir}
                  href={href}
                  className={cn(
                    "px-2 py-0.5 rounded font-mono text-[11px] transition-colors",
                    active
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {dir}
                </Link>
              );
            })}
          </nav>
        )}
      </header>
      {children}
    </div>
  );
}
