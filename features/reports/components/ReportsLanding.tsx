/**
 * Reports landing — the card grid you see at /reports (and /administration/
 * reports in admin mode). Iterates the metadata-only REPORTS registry.
 */

"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { shellIconComponents } from "@/features/shell/shellIconMap";
import { REPORTS } from "@/features/reports/registry";

export function ReportsLanding({ mode = "user" }: { mode?: "user" | "admin" }) {
  const reports = mode === "admin" ? REPORTS.filter((r) => r.adminHref) : REPORTS;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {reports.map((report) => {
        const Icon = shellIconComponents[report.iconName] ?? shellIconComponents.FileText;
        const href = mode === "admin" ? (report.adminHref ?? report.href) : report.href;
        const isLive = report.status === "live";
        const card = (
          <div
            className={cn(
              "group flex h-full flex-col rounded-lg border border-border bg-card p-4 transition-colors",
              isLive ? "hover:border-primary/40 hover:bg-accent/40" : "opacity-70",
            )}
          >
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon className="h-4.5 w-4.5" aria-hidden />
              </span>
              <span className="text-sm font-semibold text-foreground">{report.title}</span>
              {!isLive && (
                <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  Soon
                </span>
              )}
            </div>
            <p className="mt-2 flex-1 text-xs leading-relaxed text-muted-foreground">
              {report.description}
            </p>
            {isLive && (
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">
                Open report
                <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
              </span>
            )}
          </div>
        );
        return isLive ? (
          <Link key={report.slug} href={href} className="block">
            {card}
          </Link>
        ) : (
          <div key={report.slug}>{card}</div>
        );
      })}
    </div>
  );
}
