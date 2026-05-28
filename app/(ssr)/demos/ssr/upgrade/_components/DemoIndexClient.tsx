"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Bell,
  ExternalLink,
  Image as ImageIcon,
  Lock,
  Megaphone,
  Crown,
  Square,
  Zap
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { UpgradeModal } from "@/features/pricing/components/UpgradeModal";
import { UsageLimitDialog } from "@/features/pricing/components/UsageLimitDialog";
import { UpgradeBanner } from "@/features/pricing/components/nudges/UpgradeBanner";
import { UpgradeToast } from "@/features/pricing/components/nudges/UpgradeToast";
import { UpgradeInlineCard } from "@/features/pricing/components/nudges/UpgradeInlineCard";
import { UpgradeFloatingPill } from "@/features/pricing/components/nudges/UpgradeFloatingPill";
import { SidebarPromo } from "@/features/pricing/components/nudges/SidebarPromo";
import { PricingGrid } from "@/features/pricing/components/PricingGrid";
import { IndustryUpgrade } from "@/features/pricing/components/industry/IndustryUpgrade";
import { IndustryUpgradeModal } from "@/features/pricing/components/industry/IndustryUpgradeModal";
import {
  INDUSTRIES,
  INDUSTRY_ORDER,
  type IndustryId,
} from "@/features/pricing/components/industry/industries";
import { DemoSection } from "./DemoSection";

function notify(plan: { name?: string; id?: string } | undefined) {
  if (!plan) return;
  toast.success(`${plan.name ?? plan.id} selected`, {
    description: "Demo only — would route to checkout in production.",
  });
}

const SECTIONS = [
  { id: "modals", label: "Blocking modals", icon: Square },
  { id: "industry-modals", label: "Industry modals", icon: Megaphone },
  { id: "usage", label: "Usage limit", icon: Activity },
  { id: "grid", label: "Pricing grid", icon: Crown },
  { id: "nudges", label: "Non-blocking nudges", icon: Bell },
  { id: "inline", label: "Inline upsells", icon: Lock },
  { id: "industries", label: "Industry pages", icon: Megaphone },
] as const;

export function DemoIndexClient() {
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [industryModal, setIndustryModal] = useState<IndustryId | null>(null);

  const [showBanner, setShowBanner] = useState(false);
  const [showAccentBanner, setShowAccentBanner] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [showPill, setShowPill] = useState(false);

  return (
    <div className="flex flex-col gap-14">
      {/* Hero */}
      <header className="relative overflow-hidden rounded-3xl border border-border/60 bg-card px-7 py-10 lg:px-12 lg:py-14">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(circle_at_15%_20%,var(--foreground),transparent_45%),radial-gradient(circle_at_85%_75%,var(--foreground),transparent_50%)]"
        />
        <div className="relative flex flex-col gap-5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background px-3 py-1 text-[11px] font-semibold uppercase tracking-wider">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Pricing & upgrade surfaces
            </span>
          </div>
          <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-5xl">
            Every shape an upgrade can take, <br className="hidden md:block" />
            in one demo room.
          </h1>
          <p className="max-w-2xl text-pretty text-base text-muted-foreground md:text-lg">
            Trigger any variant below. Modals, usage limits, ambient nudges, and
            seven industry-specific landing pages — all wired to the same
            pricing data so they stay in sync.
          </p>
          <nav className="mt-3 flex flex-wrap gap-2">
            {SECTIONS.map(({ id, label, icon: Icon }) => (
              <a
                key={id}
                href={`#${id}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:border-foreground/40 hover:bg-accent/40"
              >
                <Icon className="h-3 w-3" strokeWidth={2.25} />
                {label}
              </a>
            ))}
            <Link
              href="/demos/ssr/upgrade/landing"
              className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:bg-foreground/90"
            >
              <ExternalLink className="h-3 w-3" />
              Full landing page
            </Link>
          </nav>
        </div>
      </header>

      {/* Blocking modals */}
      <DemoSection
        id="modals"
        eyebrow="Stop-everything moments"
        title="Blocking upgrade modals"
        description="For deliberate decision points — feature gates, end-of-trial, account-level upgrades. Two-pane layout with a hero left and a plan picker right."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setUpgradeOpen(true)}
            className="group flex flex-col items-start gap-3 rounded-2xl border border-border/70 bg-card p-6 text-left transition-all hover:-translate-y-0.5 hover:border-foreground/40 hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.18)]"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-foreground/[0.06] ring-1 ring-foreground/10">
              <Crown className="h-4 w-4" />
            </span>
            <div className="flex flex-col gap-1">
              <span className="text-base font-semibold tracking-tight">
                Individual upgrade modal
              </span>
              <span className="text-sm text-muted-foreground">
                Free → Entry · Pro · Plus · Max. With trial offer.
              </span>
            </div>
            <span className="inline-flex items-center gap-1 text-sm font-medium">
              Open
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </button>
          <button
            type="button"
            onClick={() => setCompanyOpen(true)}
            className="group flex flex-col items-start gap-3 rounded-2xl border border-border/70 bg-card p-6 text-left transition-all hover:-translate-y-0.5 hover:border-foreground/40 hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.18)]"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-foreground/[0.06] ring-1 ring-foreground/10">
              <Square className="h-4 w-4" />
            </span>
            <div className="flex flex-col gap-1">
              <span className="text-base font-semibold tracking-tight">
                Company upgrade modal
              </span>
              <span className="text-sm text-muted-foreground">
                Team · Pro · Premium. Per-seat pricing. 3-seat minimum.
              </span>
            </div>
            <span className="inline-flex items-center gap-1 text-sm font-medium">
              Open
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </button>
        </div>
      </DemoSection>

      {/* Industry-flavored modals — drop-in popovers for non-marketing pages */}
      <DemoSection
        id="industry-modals"
        eyebrow="Industry-flavored popovers"
        title="Vertical upgrade modals"
        description="Same two-pane modal pattern, but the hero copy, eyebrow, proof points, and guardrail come from the industry config. Drop these on non-marketing pages — chat, code editor, dashboards — to keep the upsell speaking the user's language."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {INDUSTRY_ORDER.map((id) => {
            const cfg = INDUSTRIES[id];
            const Icon = cfg.icon;
            const recommended = cfg.recommendedPlanId;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setIndustryModal(id)}
                className="group flex flex-col items-start gap-3 rounded-2xl border border-border/70 bg-card p-5 text-left transition-all hover:-translate-y-0.5 hover:border-foreground/40 hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.15)]"
              >
                <div className="flex w-full items-center justify-between">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-foreground text-background">
                    <Icon className="h-4 w-4" strokeWidth={1.75} />
                  </span>
                  <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-foreground/70">
                    {recommended}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-base font-semibold tracking-tight">
                    {cfg.label}
                  </span>
                  <span className="line-clamp-2 text-xs text-muted-foreground">
                    {cfg.eyebrow}
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-medium">
                  Open modal
                  <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                </span>
              </button>
            );
          })}
        </div>
      </DemoSection>

      {/* Usage-limit dialog */}
      <DemoSection
        id="usage"
        eyebrow="When the meter runs out"
        title="Usage limit hit"
        description="Hard cap reached. Show what was hit, when it resets, and offer the upgrade as the alternative — never the only path."
      >
        <button
          type="button"
          onClick={() => setUsageOpen(true)}
          className="group flex w-full max-w-2xl items-start justify-between gap-6 rounded-2xl border border-border/70 bg-card p-6 text-left transition-all hover:border-foreground/40"
        >
          <div className="flex flex-col gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Free plan · Messages
            </span>
            <div className="flex items-center gap-3">
              <span className="font-mono text-2xl font-semibold tabular-nums">
                100<span className="text-muted-foreground"> / 100</span>
              </span>
              <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-xs font-medium">
                Limit reached
              </span>
            </div>
            <span className="text-sm text-muted-foreground">
              Resets in 6 days · Click to see options
            </span>
          </div>
          <span className="self-end rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background">
            Open dialog
          </span>
        </button>
      </DemoSection>

      {/* Pricing grid */}
      <DemoSection
        id="grid"
        eyebrow="The grid"
        title="Pricing grid (live)"
        description="The same grid the public pricing page uses. Toggle billing cycle, switch category. Annual saves 20%."
      >
        <PricingGrid onSelect={notify} />
      </DemoSection>

      {/* Non-blocking nudges */}
      <DemoSection
        id="nudges"
        eyebrow="Ambient & non-blocking"
        title="Nudges"
        description="Trigger each variant. Banners stick to the top of a region. Toasts and pills overlay the viewport. Sidebar promos live inside chrome."
      >
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="flex flex-col gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Top banner — subtle
            </span>
            <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
              {showBanner ? (
                <UpgradeBanner
                  onCta={() => {
                    setShowBanner(false);
                    setUpgradeOpen(true);
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setShowBanner(true)}
                  className="w-full px-4 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent/30"
                >
                  Click to show banner →
                </button>
              )}
              <div className="px-4 py-12 text-center text-xs text-muted-foreground">
                <span className="opacity-70">page content</span>
              </div>
            </div>

            <span className="mt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Top banner — accent (high-stakes)
            </span>
            <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
              {showAccentBanner ? (
                <UpgradeBanner
                  variant="accent"
                  message="Your trial ends in 3 days. Don't lose your workspaces."
                  ctaLabel="Pick a plan"
                  onCta={() => {
                    setShowAccentBanner(false);
                    setUpgradeOpen(true);
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAccentBanner(true)}
                  className="w-full px-4 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent/30"
                >
                  Click to show accent banner →
                </button>
              )}
              <div className="px-4 py-12 text-center text-xs text-muted-foreground">
                <span className="opacity-70">page content</span>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowToast((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
                  showToast
                    ? "border-foreground bg-foreground text-background"
                    : "border-border/80 bg-background hover:bg-accent/40",
                )}
              >
                <Zap className="h-3.5 w-3.5" />
                {showToast ? "Hide toast" : "Show corner toast"}
              </button>
              <button
                type="button"
                onClick={() => setShowPill((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
                  showPill
                    ? "border-foreground bg-foreground text-background"
                    : "border-border/80 bg-background hover:bg-accent/40",
                )}
              >
                <Crown className="h-3.5 w-3.5" />
                {showPill ? "Hide pill" : "Show floating pill"}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Sidebar promo (lives in app chrome)
            </span>
            <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
              <div className="mx-auto max-w-[230px]">
                <SidebarPromo
                  onCta={() => setUpgradeOpen(true)}
                  usagePct={0.78}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Designed to sit in a 240–280px sidebar above the user menu. Shows
              real consumption with a progress strip.
            </p>
          </div>
        </div>
      </DemoSection>

      {/* Inline upsells */}
      <DemoSection
        id="inline"
        eyebrow="Where you'd already be reading"
        title="Inline feature upsells"
        description="Drop these next to a gated feature. Three variants for three contexts — bordered card, soft fill, or hairline outline."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <UpgradeInlineCard
            variant="card"
            feature="Tool execution"
            description="Run sandboxed tools, browse, query, and write files — included on Pro and above."
            icon={Lock}
            onCta={() => setUpgradeOpen(true)}
          />
          <UpgradeInlineCard
            variant="soft"
            feature="Replayable trajectories"
            description="Step through every model call, tool invocation, and state transition — included on Plus and above."
            icon={Activity}
            onCta={() => setUpgradeOpen(true)}
          />
          <UpgradeInlineCard
            variant="outline"
            feature="Image generation"
            description="Frontier image models with brand-style memory — included on Pro and above."
            icon={ImageIcon}
            onCta={() => setUpgradeOpen(true)}
          />
        </div>
      </DemoSection>

      {/* Industry pages */}
      <DemoSection
        id="industries"
        eyebrow="Vertical landing surfaces"
        title="Industry-specific upgrade pages"
        description="Each card opens a full landing page tuned to a vertical — proof points, use cases, guardrails, and a recommended plan."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {INDUSTRY_ORDER.map((id) => {
            const cfg = INDUSTRIES[id];
            const Icon = cfg.icon;
            return (
              <Link
                key={id}
                href={`/ssr/demos/upgrade/industry/${id}`}
                className="group relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-border/70 bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-foreground/40 hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.15)]"
              >
                <div className="flex items-center justify-between">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-foreground text-background">
                    <Icon className="h-4 w-4" strokeWidth={1.75} />
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-base font-semibold tracking-tight">
                    {cfg.label}
                  </span>
                  <span className="line-clamp-2 text-sm text-muted-foreground">
                    {cfg.headline}
                  </span>
                </div>
                <span className="mt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Recommended: {cfg.recommendedPlanId}
                </span>
              </Link>
            );
          })}
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-2">
          <span className="lg:col-span-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Compact variants (drop-in card form)
          </span>
          {(["legal", "education"] as IndustryId[]).map((id) => (
            <IndustryUpgrade
              key={id}
              industry={id}
              variant="compact"
              onSelect={notify}
            />
          ))}
        </div>
      </DemoSection>

      {/* Modals */}
      <UpgradeModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        category="individual"
        reason="14-day Pro trial — no card"
        onSelect={(plan, cycle) => {
          toast.success(`Starting ${plan.name} (${cycle}) trial`, {
            description: "Demo only — checkout would happen here.",
          });
          setUpgradeOpen(false);
        }}
      />
      <UpgradeModal
        open={companyOpen}
        onOpenChange={setCompanyOpen}
        category="company"
        reason="3 seat minimum on company plans"
        onSelect={(plan, cycle) => {
          toast.success(`Starting ${plan.name} (${cycle}) team trial`, {
            description: "Demo only — checkout would happen here.",
          });
          setCompanyOpen(false);
        }}
      />
      <IndustryUpgradeModal
        open={!!industryModal}
        onOpenChange={(open) => !open && setIndustryModal(null)}
        industry={industryModal ?? "legal"}
        onSelect={(plan, cycle) => {
          toast.success(`Starting ${plan.name} (${cycle}) trial`, {
            description: `Tuned for ${INDUSTRIES[industryModal ?? "legal"].label} teams.`,
          });
          setIndustryModal(null);
        }}
      />
      <UsageLimitDialog
        open={usageOpen}
        onOpenChange={setUsageOpen}
        meter="Messages"
        used={100}
        limit={100}
        currentPlan="Free"
        onSelect={(plan) => {
          notify(plan);
          setUsageOpen(false);
        }}
      />

      {/* Floating overlays (controlled at this level so demo is interactive) */}
      {showToast && (
        <UpgradeToast
          onCta={() => {
            setShowToast(false);
            setUpgradeOpen(true);
          }}
        />
      )}
      {showPill && (
        <UpgradeFloatingPill
          onCta={() => {
            setShowPill(false);
            setUpgradeOpen(true);
          }}
        />
      )}
    </div>
  );
}
