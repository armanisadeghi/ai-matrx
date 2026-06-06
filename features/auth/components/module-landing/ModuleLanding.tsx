import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, CheckCircle2, Zap, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AuthedWorkspaceCTA } from "./AuthedWorkspaceCTA";
import { ModuleLandingConversionNudges } from "../conversion/ModuleLandingConversionNudges";
import { MODULE_LANDING_DIRECTORY } from "./landings/directory";

export interface ModuleCapability {
  icon: LucideIcon;
  title: string;
  description: string;
}

export interface ModuleStep {
  number: string;
  title: string;
  description: string;
}

export interface ModuleSubArea {
  title: string;
  status: "Live" | "Coming soon" | "Bring your own";
  href?: string;
  items: string[];
}

export interface ModuleLandingProps {
  /** Unique surface id for conversion tracking. */
  surfaceId: string;
  /** Tagline pill at the top of the hero (e.g. "AI Matrx for Chat"). */
  eyebrow: string;
  /** Icon shown inside the eyebrow pill. */
  eyebrowIcon: LucideIcon;
  /** Hero headline plain part — appears before the gradient tail. */
  headline: string;
  /** Hero headline gradient tail — visually distinct. */
  headlineGradient: string;
  /** Hero subheadline / pitch paragraph. */
  description: string;
  /** Where the primary "Get Started" CTA routes. Same for guest + authed. */
  primaryCtaHref: string;
  primaryCtaLabel?: string;
  /** Where the workspace lives — for authed-user banner. */
  workspaceHref: string;
  /** Display label for the workspace ("Open Chat", "Open Workspace", etc.). */
  workspaceLabel: string;
  /** Section header — "From copilot to digital workforce" style. */
  capabilitiesHeading: string;
  capabilitiesDescription: string;
  capabilities: ModuleCapability[];
  /** "How it works" steps. */
  stepsHeading?: string;
  stepsDescription?: string;
  steps?: ModuleStep[];
  /** Optional sub-areas grid (calculators, practice areas, etc.). */
  subAreasHeading?: string;
  subAreasDescription?: string;
  subAreas?: ModuleSubArea[];
  /** Final CTA heading + subhead. */
  finalCtaHeading: string;
  finalCtaDescription: string;
  /**
   * Hrefs of other module landings (from `landings/directory.ts`) to
   * surface in a discovery grid below the sub-areas. Each entry must
   * match a directory `href` exactly — unknown entries silently skip.
   * Two-to-four works best. Omit to suppress the section.
   */
  relatedModules?: string[];
}

/**
 * Shared marketing landing shell. Modeled on `features/legal/...`
 * (`LegalLanding.tsx` / `CaWcLanding.tsx`) — same hero + capabilities +
 * how-it-works + sub-areas + final CTA structure. Each module's landing
 * fills in copy and icons; this component owns layout and visual rhythm
 * so future module landings drop in without redesigning the page.
 *
 * Conversion behavior is mounted at the top via `AuthedWorkspaceCTA`
 * (only renders for signed-in visitors) and via the centralized
 * `ModuleLandingConversionNudges` (only fires for guests, on its own
 * polite schedule). Neither shows under the wrong audience.
 */
export function ModuleLanding({
  surfaceId,
  eyebrow,
  eyebrowIcon: EyebrowIcon,
  headline,
  headlineGradient,
  description,
  primaryCtaHref,
  primaryCtaLabel = "Get Started",
  workspaceHref,
  workspaceLabel,
  capabilitiesHeading,
  capabilitiesDescription,
  capabilities,
  stepsHeading = "How it works",
  stepsDescription,
  steps,
  subAreasHeading,
  subAreasDescription,
  subAreas,
  finalCtaHeading,
  finalCtaDescription,
  relatedModules,
}: ModuleLandingProps) {
  const relatedEntries = (relatedModules ?? [])
    .map((href) => MODULE_LANDING_DIRECTORY.find((e) => e.href === href))
    .filter((entry): entry is NonNullable<typeof entry> => entry != null);
  return (
    <div className="min-h-dvh">
      <AuthedWorkspaceCTA
        workspaceHref={workspaceHref}
        workspaceLabel={workspaceLabel}
      />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent"
        />
        <div
          aria-hidden
          className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl"
        />
        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 pt-16 sm:pt-24 pb-12 sm:pb-20 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary mb-6">
            <EyebrowIcon className="h-3.5 w-3.5" />
            {eyebrow}
          </div>
          <h1 className="text-[clamp(2rem,1.5rem+2.5vw,3.75rem)] font-bold tracking-tight text-foreground leading-[1.1]">
            {headline}{" "}
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              {headlineGradient}
            </span>
          </h1>
          <p className="mt-6 mx-auto max-w-2xl text-[clamp(1rem,0.95rem+0.25vw,1.25rem)] text-muted-foreground leading-relaxed">
            {description}
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              className="w-full sm:w-auto min-h-[44px] text-base px-8 gap-2"
              asChild
            >
              <Link href={primaryCtaHref}>
                {primaryCtaLabel}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="w-full sm:w-auto min-h-[44px] text-base px-8"
              asChild
            >
              <Link href="#capabilities">See what it does</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section
        id="capabilities"
        className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-24"
      >
        <div className="text-center mb-12 sm:mb-16">
          <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.5rem)] font-bold tracking-tight">
            {capabilitiesHeading}
          </h2>
          <p className="mt-4 text-muted-foreground text-lg max-w-2xl mx-auto">
            {capabilitiesDescription}
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {capabilities.map((feature) => (
            <div
              key={feature.title}
              className={cn(
                "group relative rounded-2xl border border-border bg-card p-6",
                "transition-all duration-300",
                "hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5",
              )}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4 group-hover:scale-110 transition-transform duration-300">
                <feature.icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      {steps && steps.length > 0 && (
        <section
          id="how-it-works"
          className="bg-card/50 border-y border-border"
        >
          <div className="mx-auto max-w-5xl px-4 sm:px-6 py-16 sm:py-24">
            <div className="text-center mb-12 sm:mb-16">
              <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.5rem)] font-bold tracking-tight">
                {stepsHeading}
              </h2>
              {stepsDescription && (
                <p className="mt-4 text-muted-foreground text-lg">
                  {stepsDescription}
                </p>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
              {steps.map((step) => (
                <div key={step.number} className="flex gap-4">
                  <div className="flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-2xl bg-primary/10 text-primary font-bold text-lg">
                    {step.number}
                  </div>
                  <div>
                    <h3 className="font-semibold text-base mb-1">{step.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Sub-areas */}
      {subAreas && subAreas.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-24">
          <div className="text-center mb-12">
            <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.5rem)] font-bold tracking-tight">
              {subAreasHeading}
            </h2>
            {subAreasDescription && (
              <p className="mt-4 text-muted-foreground text-lg max-w-2xl mx-auto">
                {subAreasDescription}
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {subAreas.map((area) => {
              const card = (
                <div
                  className={cn(
                    "h-full rounded-2xl border border-border bg-card p-5",
                    "transition-all duration-300",
                    area.href &&
                      "hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 cursor-pointer",
                  )}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h3 className="font-semibold text-base">{area.title}</h3>
                    <span
                      className={cn(
                        "shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider",
                        area.status === "Live"
                          ? "bg-primary/10 text-primary border border-primary/20"
                          : "bg-muted text-muted-foreground border border-border",
                      )}
                    >
                      {area.status === "Live" ? (
                        <Zap className="h-3 w-3" />
                      ) : null}
                      {area.status}
                    </span>
                  </div>
                  <ul className="space-y-2">
                    {area.items.map((item) => (
                      <li
                        key={item}
                        className="flex items-center gap-2 text-sm text-muted-foreground"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  {area.href ? (
                    <div className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                      Open <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                  ) : null}
                </div>
              );

              if (area.href) {
                return (
                  <Link key={area.title} href={area.href} className="block">
                    {card}
                  </Link>
                );
              }

              return <div key={area.title}>{card}</div>;
            })}
          </div>
        </section>
      )}

      {/* Related modules — discovery grid that turns single-module landings
          into entry points for the rest of the platform. Auto-pulled from
          the directory so titles + teasers stay in sync with /features. */}
      {relatedEntries.length > 0 && (
        <section className="border-t border-border">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16">
            <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-3 mb-8">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary mb-3">
                  <Compass className="h-3 w-3" />
                  Explore the platform
                </div>
                <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.5rem)] font-bold tracking-tight">
                  Pairs well with
                </h2>
              </div>
              <Link
                href="/features"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                Browse every module
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {relatedEntries.map((entry) => {
                const Icon = entry.icon;
                return (
                  <Link
                    key={entry.href}
                    href={entry.href}
                    className={cn(
                      "group block rounded-2xl border border-border bg-card p-5",
                      "transition-all duration-300",
                      "hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5",
                    )}
                  >
                    <div className="flex items-start gap-3 mb-2">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:scale-110 transition-transform duration-300">
                        <Icon className="h-4 w-4" />
                      </div>
                      <h3 className="text-base font-semibold leading-tight pt-1">
                        {entry.label}
                      </h3>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {entry.teaser}
                    </p>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Final CTA */}
      <section className="border-t border-border bg-card/50">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-16 sm:py-24 text-center">
          <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.5rem)] font-bold tracking-tight">
            {finalCtaHeading}
          </h2>
          <p className="mt-4 text-muted-foreground text-lg mb-8">
            {finalCtaDescription}
          </p>
          <Button
            size="lg"
            className="min-h-[44px] text-base px-10 gap-2"
            asChild
          >
            <Link href={primaryCtaHref}>
              {primaryCtaLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Conversion mounts — silent for authed users, polite for guests */}
      <ModuleLandingConversionNudges
        surfaceId={surfaceId}
        moduleName={workspaceLabel}
      />
    </div>
  );
}
