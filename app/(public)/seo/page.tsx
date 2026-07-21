import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Brain,
  Clock,
  Code2,
  Eye,
  FileText,
  Globe,
  Layers,
  Link2,
  PartyPopper,
  PenTool,
  Search,
  Share2,
  ShieldCheck,
  Star,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "SEO Tools — AI Matrx",
  description:
    "A complete suite of AI-powered and scraping-based SEO tools. Analyze meta tags, audit content, research keywords, check backlinks, and more.",
};

type ToolStatus = "live" | "coming-soon";

type AccentKey = "primary" | "secondary" | "success" | "warning";

interface Tool {
  id: string;
  title: string;
  description: string;
  icon: React.FC<{ className?: string }>;
  href: string;
  status: ToolStatus;
}

interface Category {
  id: string;
  title: string;
  subtitle: string;
  accent: AccentKey;
  tools: Tool[];
}

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

const categories: Category[] = [
  {
    id: "on-page",
    title: "On-Page Analysis",
    subtitle: "Inspect and score every element Google reads on your pages",
    accent: "primary",
    tools: [
      {
        id: "metadata",
        title: "Meta Width Calculator",
        description:
          "Calculate pixel widths and character counts for titles and descriptions with a live Google SERP preview.",
        icon: FileText,
        href: "/seo/metadata",
        status: "live",
      },
      {
        id: "social-preview",
        title: "Social Card Preview",
        description:
          "Preview exactly how your link renders on X, Facebook, and LinkedIn — with instant checks on your Open Graph and Twitter card tags.",
        icon: Share2,
        href: "/seo/social-preview",
        status: "live",
      },
      {
        id: "page-audit",
        title: "Page SEO Audit",
        description:
          "Scrape any URL and get an instant on-page audit — title, description, headings, canonical, robots directives, and more.",
        icon: ShieldCheck,
        href: "/seo/page-audit",
        status: "coming-soon",
      },
      {
        id: "heading-structure",
        title: "Heading Structure Analyzer",
        description:
          "Visualize the H1–H6 hierarchy of any page and flag structural issues that hurt crawlability.",
        icon: Layers,
        href: "/seo/heading-structure",
        status: "coming-soon",
      },
      {
        id: "structured-data",
        title: "Structured Data Validator",
        description:
          "Parse JSON-LD and microdata on any page and validate against Google's rich result requirements.",
        icon: Code2,
        href: "/seo/structured-data",
        status: "coming-soon",
      },
    ],
  },
  {
    id: "content",
    title: "AI Content Intelligence",
    subtitle: "Let an LLM analyze, score, and improve your content",
    accent: "secondary",
    tools: [
      {
        id: "content-score",
        title: "Content Quality Scorer",
        description:
          "AI reads your page and scores readability, depth, E-E-A-T signals, and topical coverage against the top 10 SERP results.",
        icon: Brain,
        href: "/seo/content-score",
        status: "coming-soon",
      },
      {
        id: "content-brief",
        title: "Content Brief Generator",
        description:
          "Provide a keyword, and the AI builds a complete content brief — target audience, outline, FAQs, and internal link suggestions.",
        icon: PenTool,
        href: "/seo/content-brief",
        status: "coming-soon",
      },
      {
        id: "meta-writer",
        title: "AI Meta Tag Writer",
        description:
          "Paste your page content or URL, and the AI drafts optimized title and description variants ranked by predicted CTR.",
        icon: PartyPopper,
        href: "/seo/meta-writer",
        status: "coming-soon",
      },
      {
        id: "readability",
        title: "Readability Analyzer",
        description:
          "Score content across Flesch-Kincaid, Gunning Fog, and SMOG indexes, with sentence-level suggestions from an LLM.",
        icon: Eye,
        href: "/seo/readability",
        status: "coming-soon",
      },
    ],
  },
  {
    id: "keywords",
    title: "Keyword Research",
    subtitle: "Find, cluster, and prioritize the terms that drive traffic",
    accent: "success",
    tools: [
      {
        id: "keyword-clustering",
        title: "AI Keyword Clusterer",
        description:
          "Paste a list of keywords and the AI groups them by semantic intent, making it easy to plan pages and content hubs.",
        icon: Layers,
        href: "/seo/keyword-clustering",
        status: "coming-soon",
      },
      {
        id: "serp-analysis",
        title: "SERP Intent Analyzer",
        description:
          "Scrape the top 10 results for any keyword and use an LLM to identify the dominant search intent and content format.",
        icon: Search,
        href: "/seo/serp-analysis",
        status: "coming-soon",
      },
      {
        id: "lsi-keywords",
        title: "LSI & Entity Finder",
        description:
          "AI extracts the semantic entities and latent terms from top-ranking pages so your content covers the full topic graph.",
        icon: TrendingUp,
        href: "/seo/lsi-keywords",
        status: "coming-soon",
      },
      {
        id: "title-optimizer",
        title: "Title Tag Optimizer",
        description:
          "A/B-test headline variants with predicted CTR scoring. LLM rewrites your titles for clarity, keyword placement, and length.",
        icon: BarChart3,
        href: "/seo/title-optimizer",
        status: "coming-soon",
      },
    ],
  },
  {
    id: "technical",
    title: "Technical SEO",
    subtitle: "Diagnose infrastructure issues that block rankings",
    accent: "warning",
    tools: [
      {
        id: "redirect-tracer",
        title: "Redirect Chain Tracer",
        description:
          "Follow every redirect hop from a URL and surface chain loops, unnecessary hops, and mixed-protocol issues.",
        icon: Link2,
        href: "/seo/redirect-tracer",
        status: "coming-soon",
      },
      {
        id: "robots-tester",
        title: "Robots.txt Tester",
        description:
          "Fetch and parse any site's robots.txt, then test whether specific URLs are allowed or blocked by each rule.",
        icon: ShieldCheck,
        href: "/seo/robots-tester",
        status: "coming-soon",
      },
      {
        id: "page-speed",
        title: "Core Web Vitals Analyzer",
        description:
          "Measure LCP, CLS, and INP with an AI summary of the biggest opportunities to improve your CWV scores.",
        icon: Zap,
        href: "/seo/page-speed",
        status: "coming-soon",
      },
      {
        id: "hreflang",
        title: "Hreflang Validator",
        description:
          "Scrape a URL and validate all hreflang tags — check for missing reciprocals, incorrect locale codes, and self-referencing issues.",
        icon: Globe,
        href: "/seo/hreflang",
        status: "coming-soon",
      },
    ],
  },
];

function ToolCard({ tool, accent }: { tool: Tool; accent: AccentKey }) {
  const Icon = tool.icon;
  const isLive = tool.status === "live";
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
          {tool.title}
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
      aria-label={`Open ${tool.title}`}
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
  const totalTools = categories.reduce((sum, c) => sum + c.tools.length, 0);
  const liveTools = categories.reduce(
    (sum, c) => sum + c.tools.filter((t) => t.status === "live").length,
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
                  value: 4,
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
          const liveCt = category.tools.filter(
            (t) => t.status === "live",
          ).length;
          const a = accentStyles[category.accent];
          return (
            <section key={category.id}>
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
                      {category.title}
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
                  <ToolCard
                    key={tool.id}
                    tool={tool}
                    accent={category.accent}
                  />
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
