// app/(public)/seo/page.tsx
//
// PUBLIC index of the SEO tool suite (anonymous lead-gen — must render
// without a session). The tool list itself is declared ONCE in
// features/marketing/lib/marketing-nav.ts (MARKETING_PUBLIC_TOOL_CATEGORIES);
// this page only renders it. Planned tools are non-links until they ship —
// their /seo/* hrefs are reserved but the routes do not exist yet.

import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Braces,
  Brain,
  ClipboardCheck,
  Clock,
  Eye,
  FileSearch,
  FileText,
  Globe,
  Image,
  Layers,
  Link2,
  PartyPopper,
  PenLine,
  PenTool,
  Search,
  Star,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  MARKETING_PUBLIC_TOOL_CATEGORIES,
  type MarketingNavEntry,
} from "@/features/marketing/lib/marketing-nav";

export const metadata: Metadata = {
  title: { absolute: "SEO Tools — AI Matrx" },
  description:
    "A complete suite of AI-powered and scraping-based SEO tools. Analyze meta tags, audit content, research keywords, check backlinks, and more.",
};

type AccentKey = "primary" | "secondary" | "success" | "warning";

/** Presentation-only: category key → accent. Data lives in marketing-nav.ts. */
const CATEGORY_ACCENTS: Record<string, AccentKey> = {
  "on-page": "primary",
  content: "secondary",
  keywords: "success",
  technical: "warning",
};

/** Presentation-only: iconName → Lucide component. */
const ICONS: Record<string, React.FC<{ className?: string }>> = {
  FileText,
  Image,
  ClipboardCheck,
  Layers,
  Braces,
  Brain,
  PenTool,
  PenLine,
  Eye,
  Search,
  TrendingUp,
  BarChart3,
  Link2,
  FileSearch,
  Zap,
  Globe,
};

const accentStyles: Record<
  AccentKey,
  {
    dot: string;
    iconWrap: string;
    liveChip: string;
    heading: string;
    statsTile: string;
    pill: string;
  }
> = {
  primary: {
    dot: "bg-primary",
    iconWrap: "border border-border bg-primary/10 text-primary",
    liveChip: "bg-primary text-primary-foreground",
    heading: "text-primary",
    statsTile: "bg-primary/15 text-primary",
    pill: "border border-primary/25 bg-primary/10 text-primary",
  },
  secondary: {
    dot: "bg-secondary",
    iconWrap: "border border-border bg-secondary/10 text-secondary",
    liveChip: "bg-secondary text-secondary-foreground",
    heading: "text-secondary",
    statsTile: "bg-secondary/15 text-secondary",
    pill: "border border-secondary/25 bg-secondary/10 text-secondary",
  },
  success: {
    dot: "bg-success",
    iconWrap: "border border-border bg-success/10 text-success",
    liveChip: "bg-success text-success-foreground",
    heading: "text-success",
    statsTile: "bg-success/15 text-success",
    pill: "border border-success/30 bg-success/10 text-success",
  },
  warning: {
    dot: "bg-warning",
    iconWrap: "border border-border bg-warning/10 text-warning",
    liveChip: "bg-warning text-warning-foreground",
    heading: "text-warning",
    statsTile: "bg-warning/15 text-warning",
    pill: "border border-warning/35 bg-warning/10 text-warning",
  },
};

function isLiveTool(tool: MarketingNavEntry): boolean {
  return tool.status !== "coming-soon";
}

function ToolCard({
  tool,
  accent,
}: {
  tool: MarketingNavEntry;
  accent: AccentKey;
}) {
  const Icon = ICONS[tool.iconName] ?? Search;
  const isLive = isLiveTool(tool);
  const a = accentStyles[accent];

  const inner = (
    <Card
      className={cn(
        "group relative flex h-full min-h-0 flex-col gap-4 rounded-2xl border-border p-5 transition-all duration-200",
        isLive
          ? "cursor-pointer hover:border-primary/30 hover:shadow-md"
          : "cursor-not-allowed bg-muted/30 opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            a.iconWrap,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {isLive ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide",
                a.liveChip,
              )}
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-background/45" />
              Live
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground">
              <Clock className="h-2.5 w-2.5" />
              Coming soon
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col space-y-1.5">
        <h3
          className={cn(
            "text-sm font-semibold leading-snug transition-colors",
            isLive
              ? "text-foreground group-hover:text-primary"
              : "text-foreground",
          )}
        >
          {tool.label}
        </h3>
        <p className="text-xs leading-relaxed text-foreground">
          {tool.description}
        </p>
      </div>

      {isLive ? (
        <div className="mt-auto flex items-center gap-1 pt-1 text-xs font-medium text-primary">
          Open tool
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </div>
      ) : null}
    </Card>
  );

  return isLive ? (
    <Link
      href={tool.href}
      className="ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring block h-full min-h-0 rounded-2xl"
      aria-label={`Open ${tool.label}`}
    >
      {inner}
    </Link>
  ) : (
    <div className="h-full min-h-0" title="Coming soon">
      {inner}
    </div>
  );
}

export default function SeoLandingPage() {
  const categories = MARKETING_PUBLIC_TOOL_CATEGORIES;
  const totalTools = categories.reduce((sum, c) => sum + c.tools.length, 0);
  const liveTools = categories.reduce(
    (sum, c) => sum + c.tools.filter(isLiveTool).length,
    0,
  );

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="relative overflow-hidden border-b border-border">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35] dark:opacity-[0.2] [background-image:linear-gradient(hsl(var(--border))_1px,transparent_1px),linear-gradient(90deg,hsl(var(--border))_1px,transparent_1px)] [background-size:40px_40px]"
          aria-hidden
        />
        <div className="pointer-events-none absolute -top-24 left-1/2 h-[300px] w-[600px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl dark:bg-primary/20" />

        <div className="relative mx-auto max-w-[1200px] px-6 py-6 md:py-8 xl:py-9">
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <PartyPopper className="h-3 w-3" />
              AI-Powered SEO Suite
            </span>
          </div>

          <h1 className="max-w-2xl text-4xl font-bold leading-[1.1] tracking-tight text-foreground xl:text-5xl">
            SEO Tools,
            <br />
            <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              powered by AI
            </span>
          </h1>

          <p className="mt-2 max-w-3xl text-base leading-snug text-muted-foreground">
            A complete toolkit for on-page analysis, content intelligence,
            keyword research, and technical audits. Combine scraping with large
            language models to get insights no standard tool can match.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-6">
            {(
              [
                {
                  icon: Star,
                  accent: "primary" as const,
                  value: totalTools,
                  label: "Total tools",
                },
                {
                  icon: Zap,
                  accent: "success" as const,
                  value: liveTools,
                  label: "Live now",
                },
                {
                  icon: Brain,
                  accent: "secondary" as const,
                  value: categories.length,
                  label: "Categories",
                },
              ] as const
            ).map(({ icon: I, accent, value, label }) => {
              const s = accentStyles[accent];
              return (
                <div key={label} className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg",
                      s.statsTile,
                    )}
                  >
                    <I className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="text-lg font-bold leading-none text-foreground">
                      {value}
                    </div>
                    <div className="text-xs text-muted-foreground">{label}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1200px] space-y-8 px-6 py-8 pb-20 xl:px-8">
        {categories.map((category) => {
          const liveCt = category.tools.filter(isLiveTool).length;
          const accent = CATEGORY_ACCENTS[category.key] ?? "primary";
          const a = accentStyles[accent];
          return (
            <section key={category.key}>
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <span
                      className={cn("inline-block h-2 w-2 rounded-full", a.dot)}
                    />
                    <h2
                      className={cn(
                        "text-xs font-semibold uppercase tracking-widest",
                        a.heading,
                      )}
                    >
                      {category.label}
                    </h2>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {category.subtitle}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium",
                    a.pill,
                  )}
                >
                  {liveCt}/{category.tools.length} live
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {category.tools.map((tool) => (
                  <ToolCard key={tool.href} tool={tool} accent={accent} />
                ))}
              </div>
            </section>
          );
        })}

        <Card className="rounded-2xl border-border bg-muted/30">
          <CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Brain className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                More tools arriving regularly
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Every tool combines web scraping with LLM analysis — giving you
                the depth of a human SEO audit at machine speed.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
