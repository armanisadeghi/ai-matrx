// features/marketing/applets/AppletIntroPage.tsx — ONE APPLET'S INTRODUCTORY PAGE (AP-0 item 9).
//
// Server-rendered from the public door, the same for a crawler, a guest and a signed-in person: the
// name, what it does, its pages, its screenshots, then two ways forward — "Open" (sign in, then back to
// the same address, where the Applet runs; row security decides access) and "Make your own" for
// everyone. Shown at `/applets/<slug>` to signed-out visitors and, for a template, to everyone. A template's page carries "Use this template" instead of "Make your own".
// It shows only what the owner published — never a row of their data.

import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@ai-matrx/design-system/controls";

import { PublicFooter } from "@/components/matrx/PublicFooter";
import { PublicHeader } from "@/components/matrx/PublicHeader";
import { JsonLd } from "@/components/seo/JsonLd";
import { siteConfig } from "@/config/extras/site";
import { loginHref, signUpHref } from "@/utils/auth/auth-destination";

import { AppletUseTemplate } from "./AppletUseTemplate";
import { appletHref, APPLET_TEMPLATES_PATH, USE_ON_RETURN, type AppletCard, type AppletIntro } from "./types";

const MAKE_YOUR_OWN_HREF = "/make";

export function AppletIntroPage({ applet, related }: { applet: AppletIntro; related: AppletCard[] }) {
  const path = appletHref(applet.slug);
  const shots = applet.screenshots.length ? applet.screenshots : applet.preview_image_url ? [{ url: applet.preview_image_url, alt: applet.name }] : [];
  // Every page counts, the same as the gallery card's "N pages"; none is a link (a guest sees only this introduction).
  const pages = applet.pages;
  return (
    <div className="bg-textured" data-applet-intro={applet.slug}>
      <PublicHeader />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: applet.name,
          description: applet.description ?? applet.tagline ?? undefined,
          applicationCategory: applet.category ?? "BusinessApplication",
          operatingSystem: "Web",
          url: `${siteConfig.url}${path}`,
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          ...(shots[0] ? { screenshot: shots[0].url } : {}),
        }}
      />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-3">
          <Link href={APPLET_TEMPLATES_PATH} className="type-body text-muted-foreground hover:text-foreground">
            {applet.template ? "Applet templates" : "Applets built on AI Matrx"}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">{applet.name}</h1>
            {applet.category ? <Badge>{applet.category}</Badge> : null}
          </div>
          {applet.tagline ? <p className="text-lg text-muted-foreground">{applet.tagline}</p> : null}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {applet.template ? (
              <Suspense fallback={null}>
                <AppletUseTemplate
                  appletId={applet.id}
                  appletName={applet.name}
                  templateId={applet.template.template_id}
                  signUpHref={signUpHref(`${path}?${USE_ON_RETURN}=1`)}
                />
              </Suspense>
            ) : (
              <>
                <Link
                  href={loginHref(appletHref(applet.slug))}
                  className="inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  data-applet-intro-open=""
                >
                  Open {applet.name}
                </Link>
                <Link
                  href={MAKE_YOUR_OWN_HREF}
                  className="inline-flex h-10 items-center rounded-md border border-border px-5 text-sm font-medium hover:bg-accent"
                  data-applet-intro-make=""
                >
                  Make your own
                </Link>
              </>
            )}
          </div>
        </header>

        {shots.length ? (
          <section aria-label="Screenshots" className="grid gap-3 sm:grid-cols-2">
            {shots.map((s) => (
              // eslint-disable-next-line @next/next/no-img-element -- owner-supplied screenshot URLs from any host
              <img key={s.url} src={s.url} alt={s.alt ?? applet.name} className="w-full rounded-lg border border-border bg-card" loading="lazy" />
            ))}
          </section>
        ) : null}

        {applet.description ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">What it does</h2>
            <p className="max-w-3xl text-base text-muted-foreground">{applet.description}</p>
          </section>
        ) : null}

        {pages.length ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">Inside the Applet</h2>
            <ul className="flex max-w-3xl flex-col gap-1 text-base text-muted-foreground">
              {pages.map((p) => (
                <li key={p.path}>{p.title}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {related.length ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">More Applet templates</h2>
            <AppletCardGrid cards={related} />
          </section>
        ) : null}
      </div>
      <PublicFooter />
    </div>
  );
}

export function AppletCardGrid({ cards }: { cards: readonly AppletCard[] }) {
  // A gallery of nothing but templates says so once (its title), not on every card.
  const badgeTemplates = !cards.every((c) => c.is_template);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-applet-cards="">
      {cards.map((c) => (
        <Link
          key={c.id}
          href={appletHref(c.slug)}
          data-clickable=""
          data-applet-card={c.slug}
          className="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-4 hover:bg-accent"
        >
          {c.screenshot?.url ? (
            // eslint-disable-next-line @next/next/no-img-element -- owner-supplied screenshot URLs from any host
            <img src={c.screenshot.url} alt={c.screenshot.alt ?? c.name} className="mb-1 aspect-video w-full rounded-md border border-border object-cover" loading="lazy" />
          ) : null}
          <span className="flex items-center gap-2 text-base font-semibold">
            {c.name}
            {badgeTemplates && c.is_template ? <Badge tone="primary">Template</Badge> : null}
          </span>
          <span className="line-clamp-2 min-h-10 text-sm text-muted-foreground">{c.tagline}</span>
          <span className="mt-auto pt-1 text-sm text-muted-foreground tabular-nums">{c.page_count === 1 ? "1 page" : `${c.page_count} pages`}</span>
        </Link>
      ))}
    </div>
  );
}
