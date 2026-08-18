import type { ReactNode } from "react";
import {
  ArrowDownToLine,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  ExternalLink,
  Laptop,
  Monitor,
  MousePointerClick,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MATRX_LOCAL_RELEASE, type DesktopPlatform } from "./release";

const PLATFORM_COPY: Record<
  Exclude<DesktopPlatform, "unknown">,
  { eyebrow: string; message: string }
> = {
  windows: {
    eyebrow: "Recommended for this computer",
    message: "It looks like you’re using Windows.",
  },
  mac: {
    eyebrow: "Recommended for this computer",
    message: "It looks like you’re using a Mac.",
  },
  linux: {
    eyebrow: "Recommended for this computer",
    message: "It looks like you’re using Linux.",
  },
  mobile: {
    eyebrow: "You’re on a phone or tablet",
    message:
      "Open this page on the Windows, Mac, or Linux computer where you want to use Matrx Local.",
  },
};

function DownloadButton({
  href,
  children,
  variant = "default",
}: {
  href: string;
  children: ReactNode;
  variant?: "default" | "outline";
}) {
  return (
    <Button
      asChild
      size="lg"
      variant={variant}
      className="h-11 w-full justify-center gap-2 rounded-xl text-sm font-semibold shadow-sm"
    >
      <a href={href} rel="noopener noreferrer">
        <ArrowDownToLine className="h-4 w-4" aria-hidden="true" />
        {children}
      </a>
    </Button>
  );
}

function Step({ number, children }: { number: number; children: ReactNode }) {
  return (
    <li className="flex gap-3 text-sm leading-6 text-muted-foreground">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
        {number}
      </span>
      <span>{children}</span>
    </li>
  );
}

function PlatformCard({
  id,
  icon,
  title,
  subtitle,
  detected,
  children,
}: {
  id: "windows" | "mac" | "linux";
  icon: ReactNode;
  title: string;
  subtitle: string;
  detected: DesktopPlatform;
  children: ReactNode;
}) {
  const recommended = detected === id;
  const defaultOrder = { windows: 1, mac: 2, linux: 3 }[id];

  return (
    <article
      id={`${id}-download`}
      style={{ order: recommended ? 0 : defaultOrder }}
      className={cn(
        "relative flex scroll-mt-20 flex-col rounded-3xl border bg-card/90 p-5 shadow-sm backdrop-blur-sm transition-all",
        recommended
          ? "border-primary/60 shadow-lg shadow-primary/10 ring-2 ring-primary/10"
          : "border-border/80 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg",
      )}
    >
      {recommended && (
        <span className="absolute -top-3 left-5 inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow-sm">
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          Best match
        </span>
      )}
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {icon}
        </div>
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            {title}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="mt-5 flex flex-1 flex-col">{children}</div>
    </article>
  );
}

export function MatrxLocalDownloadLanding({
  detected,
}: {
  detected: DesktopPlatform;
}) {
  const detectedCopy = detected === "unknown" ? null : PLATFORM_COPY[detected];

  return (
    <div className="relative min-h-full overflow-hidden bg-background text-foreground">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[36rem] bg-[radial-gradient(circle_at_50%_0%,hsl(var(--primary)/0.18),transparent_58%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-28 top-72 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-28 top-48 h-80 w-80 rounded-full bg-violet-500/10 blur-3xl"
      />

      <section className="relative mx-auto max-w-6xl px-4 pb-6 pt-7 text-center sm:px-6 sm:pb-7 sm:pt-8 lg:px-8">
        <h1 className="mx-auto max-w-4xl text-balance text-4xl font-black tracking-[-0.04em] sm:text-5xl">
          Download Matrx Local
        </h1>
        <p className="mx-auto mt-2 max-w-4xl text-pretty text-base leading-7 text-muted-foreground">
          Choose your computer, download the app, and follow the simple setup.
          No technical knowledge needed.
        </p>

        {detectedCopy && (
          <div
            className={cn(
              "mx-auto mt-4 flex min-h-16 max-w-xl items-start gap-3 rounded-2xl border px-4 py-2.5 text-left",
              detected === "mobile"
                ? "border-amber-500/30 bg-amber-500/10"
                : "border-primary/25 bg-primary/5",
            )}
          >
            {detected === "mobile" ? (
              <CircleHelp className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            )}
            <div>
              <p className="text-sm font-semibold text-foreground">
                {detectedCopy.eyebrow}
              </p>
              <p className="mt-0.5 text-sm leading-5 text-muted-foreground">
                {detectedCopy.message}
              </p>
            </div>
          </div>
        )}
      </section>

      <main className="relative mx-auto max-w-6xl px-4 pb-12 sm:px-6 lg:px-8">
        <div className="grid gap-4 lg:grid-cols-3">
          <PlatformCard
            id="windows"
            icon={<Monitor className="h-6 w-6" aria-hidden="true" />}
            title="Windows"
            subtitle="Works on most Windows 10 and 11 computers"
            detected={detected}
          >
            <DownloadButton href={MATRX_LOCAL_RELEASE.downloads.windows}>
              Download for Windows
            </DownloadButton>
            <ol className="mt-5 space-y-2 border-t border-border/70 pt-4">
              <Step number={1}>Open the downloaded setup file.</Step>
              <Step number={2}>Choose “Yes,” then follow the setup.</Step>
              <Step number={3}>Open Matrx Local and sign in.</Step>
            </ol>
          </PlatformCard>

          <PlatformCard
            id="mac"
            icon={<Laptop className="h-6 w-6" aria-hidden="true" />}
            title="Mac"
            subtitle="Two easy choices — we’ll help you pick"
            detected={detected}
          >
            <div className="space-y-2">
              <DownloadButton href={MATRX_LOCAL_RELEASE.downloads.macApple}>
                <span className="flex flex-col items-start leading-tight">
                  <span>Mac with an Apple chip</span>
                  <span className="text-[11px] font-normal opacity-80">
                    Most Macs from late 2020 or newer
                  </span>
                </span>
              </DownloadButton>
              <DownloadButton
                href={MATRX_LOCAL_RELEASE.downloads.macIntel}
                variant="outline"
              >
                <span className="flex flex-col items-start leading-tight">
                  <span>Mac with an Intel processor</span>
                  <span className="text-[11px] font-normal opacity-80">
                    Most Macs from 2020 or earlier
                  </span>
                </span>
              </DownloadButton>
            </div>

            <details className="group mt-3 rounded-xl border border-border/70 bg-muted/30 px-3.5 py-2.5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-foreground [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2">
                  <CircleHelp
                    className="h-4 w-4 text-primary"
                    aria-hidden="true"
                  />
                  Not sure which Mac you have?
                </span>
                <ChevronDown
                  className="h-4 w-4 transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Click the Apple menu at the top-left of your screen, then choose
                <strong className="font-semibold text-foreground">
                  {" "}
                  About This Mac
                </strong>
                . If you see “Chip,” choose Apple chip. If you see “Processor,”
                choose Intel.
              </p>
            </details>

            <ol className="mt-4 space-y-2 border-t border-border/70 pt-4">
              <Step number={1}>Open the downloaded installer.</Step>
              <Step number={2}>Drag AI Matrx into Applications.</Step>
              <Step number={3}>Open Matrx Local and sign in.</Step>
            </ol>
          </PlatformCard>

          <PlatformCard
            id="linux"
            icon={<Terminal className="h-6 w-6" aria-hidden="true" />}
            title="Linux"
            subtitle="For Ubuntu, Linux Mint, Debian, and similar"
            detected={detected}
          >
            <DownloadButton href={MATRX_LOCAL_RELEASE.downloads.linux}>
              Download for Linux
            </DownloadButton>
            <p className="mt-3 rounded-xl bg-muted/40 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
              Using Fedora or another kind of Linux? This installer may not work
              on your computer yet.
            </p>
            <ol className="mt-4 space-y-2 border-t border-border/70 pt-4">
              <Step number={1}>Open the download from your Files app.</Step>
              <Step number={2}>Choose Software Install, then Install.</Step>
              <Step number={3}>Open Matrx Local and sign in.</Step>
            </ol>
          </PlatformCard>
        </div>

        <section className="mt-10 overflow-hidden rounded-3xl border border-border/80 bg-card/80 shadow-sm backdrop-blur-sm">
          <div className="grid md:grid-cols-[1.1fr_0.9fr]">
            <div className="p-6 sm:p-8">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <MousePointerClick className="h-5 w-5" aria-hidden="true" />
              </div>
              <h2 className="mt-4 text-2xl font-bold tracking-tight">
                That’s really all there is to it.
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                The first time Matrx Local opens, it walks you through signing
                in and getting ready. You can change anything later from
                Settings.
              </p>
            </div>
            <div className="border-t border-border/70 bg-muted/25 p-6 sm:p-8 md:border-l md:border-t-0">
              <div className="flex items-start gap-3">
                <ShieldCheck
                  className="mt-0.5 h-5 w-5 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <div>
                  <h3 className="text-sm font-semibold">
                    Official AI Matrx download
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Version {MATRX_LOCAL_RELEASE.version}. Downloads are hosted
                    in the official Matrx Local release.
                  </p>
                  <a
                    href={MATRX_LOCAL_RELEASE.releasePage}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                  >
                    View release details
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
