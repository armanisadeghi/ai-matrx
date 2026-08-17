import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArrowRight, ExternalLink, Mail } from "lucide-react";
import type { SourceGalleryConfig, SourceProviderConfig } from "../types";
import { ScreenshotSlot } from "./ScreenshotSlot";

/**
 * One provider's dedicated hand-holding guide page: exactly how to get your
 * data out, step by step, with deep links, loud trap warnings, honest delivery
 * mechanics, and screenshot slots that fill in as real captures land. Written
 * for a brilliant non-technical Expert. Public: renders for anonymous
 * visitors; the CTA leads to the authed flow.
 */
export function SourceGuidePage({
  gallery,
  provider,
}: {
  gallery: SourceGalleryConfig;
  provider: SourceProviderConfig;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link
        href={`/import/${gallery.key}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        All sources
      </Link>

      <div className="mt-4 flex items-center gap-4">
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg"
          style={{
            backgroundColor: provider.brandColor,
            color: provider.brandText ?? "#ffffff",
          }}
        >
          <span className="text-lg font-bold">{provider.mark}</span>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {provider.name}
          </h1>
          <p className="text-sm text-muted-foreground">{provider.tagline}</p>
        </div>
      </div>

      {provider.support === "coming_soon" ? (
        <div className="mt-6 rounded-lg border border-border bg-muted/40 p-4">
          <p className="text-sm text-foreground">
            {provider.comingSoonNote ??
              "This source is registered and on the way — it is not available yet."}
          </p>
        </div>
      ) : null}

      {provider.support === "tolerant" ? (
        <div className="mt-6 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-sm text-foreground">
            This provider's export is rougher than the others. Upload whatever
            you get — our importer is built to be forgiving — and worst case,
            copy and paste works everywhere.
          </p>
        </div>
      ) : null}

      <div className="mt-6 rounded-lg border border-border bg-card p-4">
        <p className="text-sm font-medium text-foreground">What you end up with</p>
        <p className="mt-1 text-sm text-muted-foreground">{provider.whatYouGet}</p>
        {provider.delivery ? (
          <div className="mt-3 flex items-start gap-2 border-t border-border pt-3">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="text-xs text-muted-foreground">
              <p>{provider.delivery.mechanism}</p>
              <p className="mt-0.5">{provider.delivery.timing}</p>
              {provider.delivery.expiry ? (
                <p className="mt-0.5 font-medium text-foreground">
                  {provider.delivery.expiry}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {provider.steps.length > 0 ? (
        <ol className="mt-8 space-y-6">
          {provider.steps.map((step, index) => (
            <li key={index} className="flex gap-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-sm font-semibold text-foreground">
                  {step.title}
                </p>
                <p className="text-sm text-muted-foreground">{step.body}</p>
                {step.warning ? (
                  <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <p className="text-xs text-foreground">{step.warning}</p>
                  </div>
                ) : null}
                {step.deepLink ? (
                  <a
                    href={step.deepLink.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                  >
                    {step.deepLink.label}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : null}
                {step.deepLink?.note ? (
                  <p className="text-xs text-muted-foreground">
                    {step.deepLink.note}
                  </p>
                ) : null}
                {step.screenshot ? (
                  <ScreenshotSlot
                    providerKey={provider.key}
                    spec={step.screenshot}
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : null}

      {provider.gotchas && provider.gotchas.length > 0 ? (
        <div className="mt-8 rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-medium text-foreground">Worth knowing</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {provider.gotchas.map((gotcha, index) => (
              <li key={index} className="text-sm text-muted-foreground">
                {gotcha}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {provider.support !== "coming_soon" ? (
        <div className="mt-8 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-medium text-foreground">
            Got your export{provider.accepts?.length ? ` (${provider.accepts.join(", ")})` : ""}?
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Bring it in — pick the conversations that matter (never just one),
            and your own judgment becomes rules you approve one by one.
          </p>
          <Link
            href={gallery.ctaHref}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            {gallery.ctaLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
