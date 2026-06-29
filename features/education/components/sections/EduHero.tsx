// Server component. The canonical Education Hub hero, lifted from the
// LegalLanding house style (gradient wash, badge, clamp() headline, dual CTA).
// Used by the hub home and every axis page so they read as one product.
import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EduLink } from "../../types";

interface EduHeroProps {
  /** Small pill above the headline. */
  eyebrow?: string;
  eyebrowIcon?: LucideIcon;
  title: string;
  /** Optional trailing fragment rendered in the brand gradient. */
  titleAccent?: string;
  description?: string;
  /** Hero chips (e.g. grade range, "12 subjects"). */
  chips?: string[];
  primary?: EduLink;
  secondary?: EduLink;
}

export function EduHero({
  eyebrow,
  eyebrowIcon: EyebrowIcon,
  title,
  titleAccent,
  description,
  chips,
  primary,
  secondary,
}: EduHeroProps) {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent"
      />
      <div
        aria-hidden
        className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl"
      />
      <div className="relative mx-auto max-w-5xl px-4 sm:px-6 pt-14 sm:pt-20 pb-10 sm:pb-16 text-center">
        {eyebrow ? (
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary mb-6">
            {EyebrowIcon ? <EyebrowIcon className="h-3.5 w-3.5" /> : null}
            {eyebrow}
          </div>
        ) : null}
        <h1 className="text-[clamp(2rem,1.5rem+2.5vw,3.75rem)] font-bold tracking-tight text-foreground leading-[1.1]">
          {title}
          {titleAccent ? (
            <>
              {" "}
              <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                {titleAccent}
              </span>
            </>
          ) : null}
        </h1>
        {description ? (
          <p className="mt-6 mx-auto max-w-2xl text-[clamp(1rem,0.95rem+0.25vw,1.25rem)] text-muted-foreground leading-relaxed">
            {description}
          </p>
        ) : null}
        {chips && chips.length > 0 ? (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {chips.map((chip) => (
              <span
                key={chip}
                className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground"
              >
                {chip}
              </span>
            ))}
          </div>
        ) : null}
        {(primary || secondary) && (
          <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-4">
            {primary ? (
              <Button
                size="lg"
                className="w-full sm:w-auto min-h-[44px] text-base px-8 gap-2"
                asChild
              >
                <Link href={primary.href}>
                  {primary.label}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            ) : null}
            {secondary ? (
              <Button
                variant="outline"
                size="lg"
                className="w-full sm:w-auto min-h-[44px] text-base px-8"
                asChild
              >
                <Link href={secondary.href}>{secondary.label}</Link>
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
