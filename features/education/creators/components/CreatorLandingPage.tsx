// Server component. The public creator landing page rendered at /c/[handle].
// 100% server-rendered for SEO (crawlable content in the initial HTML) + Person
// & Course JSON-LD. Interactivity lives in leaf client islands (EnrollButton).
// House style: MarketingPageShell, semantic colors, Lucide icons, no emoji.
import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  ExternalLink,
  GraduationCap,
  Layers,
  Lock,
  PlayCircle,
  Sparkles,
} from "lucide-react";
import { MarketingPageShell } from "@/features/shell/components/MarketingPageShell";
import { EDU_ORIGIN } from "../../constants";
import type {
  CreatorPublicPage,
  FeaturedClass,
  FeaturedResource,
  FeaturedYouTube,
} from "../types";
import { youTubeThumbnail } from "../youtube";
import { YouTubeEmbed } from "./YouTubeEmbed";
import { EnrollButton } from "./EnrollButton";

const RESOURCE_META: Record<string, { label: string; icon: typeof Layers }> = {
  fc_set: { label: "Flashcards", icon: Layers },
  learn_doc: { label: "Study guide", icon: BookOpen },
  note: { label: "Notes", icon: BookOpen },
  study_media: { label: "Audio / media", icon: PlayCircle },
};

function SectionHeading({
  icon: Icon,
  title,
  hint,
}: {
  icon: typeof Layers;
  title: string;
  hint?: string;
}) {
  return (
    <div className="mb-5 flex items-baseline justify-between gap-4">
      <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
        <Icon className="h-5 w-5 text-primary" />
        {title}
      </h2>
      {hint ? <span className="text-sm text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

/** A featured free tool — instantly usable, drives signups. */
function FreeToolCard({ item }: { item: FeaturedResource }) {
  const meta = RESOURCE_META[item.resourceType] ?? { label: "Resource", icon: Sparkles };
  const Icon = meta.icon;
  const cardCount = item.extra?.cardCount;
  return (
    <Link
      href={item.href ?? "#"}
      className="group flex flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/50 hover:bg-accent"
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {meta.label}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          Free
        </span>
      </div>
      <h3 className="text-base font-semibold text-foreground group-hover:text-primary">
        {item.title}
      </h3>
      {item.description ? (
        <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
      ) : null}
      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <span>{typeof cardCount === "number" ? `${cardCount} cards` : "Open"}</span>
        <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </div>
    </Link>
  );
}

/** A featured class — free classes join instantly, paid classes show a price. */
function ClassCard({ item, handle }: { item: FeaturedClass; handle: string }) {
  const paid = item.accessMode === "paid";
  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-6">
      <div className="mb-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          <GraduationCap className="h-3.5 w-3.5" />
          Class
        </span>
        {paid ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
            <Lock className="h-3 w-3" />
            {typeof item.price === "number" ? `$${item.price}` : "Paid"}
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            {item.accessMode === "closed" ? "Request to join" : "Free"}
          </span>
        )}
      </div>
      <h3 className="text-lg font-semibold text-foreground">{item.title}</h3>
      {item.description ? (
        <p className="mt-1.5 text-sm text-muted-foreground">{item.description}</p>
      ) : null}
      <div className="mt-5">
        <EnrollButton
          classId={item.classId}
          title={item.title}
          accessMode={item.accessMode}
          price={item.price}
          handle={handle}
        />
      </div>
    </div>
  );
}

export function CreatorLandingPage({ page }: { page: CreatorPublicPage }) {
  const videos = page.featured.filter((f): f is FeaturedYouTube => f.kind === "youtube");
  const resources = page.featured.filter((f): f is FeaturedResource => f.kind === "resource");
  const classes = page.featured.filter((f): f is FeaturedClass => f.kind === "class");

  const pageUrl = `${EDU_ORIGIN}/c/${page.handle}`;

  // Person JSON-LD + a Course per featured class (education-rich results).
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Person",
        name: page.displayName,
        url: pageUrl,
        ...(page.avatarUrl ? { image: page.avatarUrl } : {}),
        ...(page.tagline ? { description: page.tagline } : {}),
        ...(page.links.length ? { sameAs: page.links.map((l) => l.url) } : {}),
      },
      ...classes.map((c) => ({
        "@type": "Course",
        name: c.title,
        ...(c.description ? { description: c.description } : {}),
        provider: { "@type": "Person", name: page.displayName, url: pageUrl },
        ...(c.accessMode === "paid" && typeof c.price === "number"
          ? {
              offers: {
                "@type": "Offer",
                price: String(c.price),
                priceCurrency: "USD",
                category: "Paid",
              },
            }
          : { isAccessibleForFree: true }),
      })),
    ],
  };

  return (
    <MarketingPageShell className="h-full overflow-y-auto">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      {/* Hero */}
      <header className="mx-auto max-w-4xl px-4 pt-12 pb-8 sm:px-6 sm:pt-16">
        <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-start sm:gap-6 sm:text-left">
          {page.avatarUrl ? (
            // Creator avatar is a durable public/CDN URL from the profile system.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={page.avatarUrl}
              alt={page.displayName}
              className="h-24 w-24 shrink-0 rounded-2xl border border-border object-cover"
            />
          ) : (
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border border-border bg-muted text-3xl font-bold text-muted-foreground">
              {page.displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1">
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {page.displayName}
            </h1>
            {page.tagline ? (
              <p className="mt-2 text-lg text-muted-foreground">{page.tagline}</p>
            ) : null}
            {page.links.length > 0 ? (
              <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
                {page.links.map((l) => (
                  <a
                    key={l.url}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                  >
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                    {l.label}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        {page.bio ? (
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground">
            {page.bio}
          </p>
        ) : null}
        <p className="mt-6 inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          Free tools are instantly usable — no account needed. Sign up to save your progress.
        </p>
      </header>

      <div className="mx-auto max-w-4xl space-y-12 px-4 pb-16 sm:px-6">
        {/* Videos */}
        {videos.length > 0 ? (
          <section>
            <SectionHeading icon={PlayCircle} title="Watch" />
            <div className="grid gap-5 sm:grid-cols-2">
              {videos.map((v) => (
                <YouTubeEmbed key={v.videoId} videoId={v.videoId} title={v.title} />
              ))}
            </div>
          </section>
        ) : null}

        {/* Free tools */}
        {resources.length > 0 ? (
          <section>
            <SectionHeading icon={Layers} title="Free study tools" hint="Click to start — free" />
            <div className="grid gap-4 sm:grid-cols-2">
              {resources.map((r) => (
                <FreeToolCard key={`${r.resourceType}:${r.id}`} item={r} />
              ))}
            </div>
          </section>
        ) : null}

        {/* Classes */}
        {classes.length > 0 ? (
          <section>
            <SectionHeading icon={GraduationCap} title="Classes" hint="Study with me" />
            <div className="grid gap-4 sm:grid-cols-2">
              {classes.map((c) => (
                <ClassCard key={c.classId} item={c} handle={page.handle} />
              ))}
            </div>
          </section>
        ) : null}

        {/* Empty state — a claimed but unpopulated page still renders cleanly. */}
        {page.featured.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center text-muted-foreground">
            This creator is setting up their page. Check back soon.
          </div>
        ) : null}

        {/* Acquisition funnel */}
        <section className="rounded-2xl border border-border bg-gradient-to-br from-primary/5 to-accent/40 p-8 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Study smarter with {page.displayName}
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-muted-foreground">
            Create a free AI Matrx account to save your progress, generate your own flashcards and
            guides, and enroll in classes.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href={`/sign-up?redirectTo=${encodeURIComponent(`/c/${page.handle}`)}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Get started free
              <ArrowUpRight className="h-4 w-4" />
            </Link>
            <Link
              href="/education"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
            >
              Explore the study hub
            </Link>
          </div>
        </section>
      </div>

      {/* Preload the first video thumbnail for a snappier hero paint. */}
      {videos[0] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={youTubeThumbnail(videos[0].videoId)} alt="" width={1} height={1} className="hidden" />
      ) : null}
    </MarketingPageShell>
  );
}
