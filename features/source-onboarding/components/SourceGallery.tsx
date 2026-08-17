import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SourceGalleryConfig, SourceProviderConfig } from "../types";

/**
 * The provider gallery — big recognizable cards, each opening that provider's
 * dedicated hand-holding guide page. Config-driven (HOUSE DOCTRINE for
 * external-source onboarding): a new gallery is a new `SourceGalleryConfig`,
 * zero new components. Public: renders for anonymous visitors.
 */

function ProviderCard({
  galleryKey,
  provider,
}: {
  galleryKey: string;
  provider: SourceProviderConfig;
}) {
  const comingSoon = provider.support === "coming_soon";
  return (
    <Link
      href={`/import/${galleryKey}/${provider.key}`}
      className={cn(
        "group flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-md",
        comingSoon && "opacity-80",
      )}
    >
      <div
        className="flex h-24 items-center justify-center"
        style={{
          backgroundColor: provider.brandColor,
          color: provider.brandText ?? "#ffffff",
        }}
      >
        <span className="text-3xl font-bold tracking-tight">
          {provider.mark}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">
            {provider.name}
          </p>
          {comingSoon ? (
            <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              Coming soon
            </span>
          ) : (
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          )}
        </div>
        <p className="text-xs text-muted-foreground">{provider.tagline}</p>
      </div>
    </Link>
  );
}

export function SourceGallery({ gallery }: { gallery: SourceGalleryConfig }) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold text-foreground">{gallery.title}</h1>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
        {gallery.intro}
      </p>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {gallery.providers.map((provider) => (
          <ProviderCard
            key={provider.key}
            galleryKey={gallery.key}
            provider={provider}
          />
        ))}
      </div>
      <div className="mt-8 rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-foreground">
          Already have your export? {gallery.ctaLabel.toLowerCase()} takes a few
          minutes.
        </p>
        <Link
          href={gallery.ctaHref}
          className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          {gallery.ctaLabel}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
