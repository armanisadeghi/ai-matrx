import Link from "next/link";
import {
  ArrowRight,
  Cloud,
  FolderTree,
  ImageIcon,
  Stamp,
  Upload,
  Wrench,
  type LucideIcon,
} from "lucide-react";

interface Tile {
  href: string;
  label: string;
  description: string;
  Icon: LucideIcon;
  accent: string;
}

const TILES: Tile[] = [
  {
    href: "/images/public-search",
    label: "Public Search",
    description: "Curated covers and Unsplash search.",
    Icon: ImageIcon,
    accent: "text-sky-500",
  },
  {
    href: "/images/my-cloud",
    label: "My Cloud",
    description: "Image-filtered view of your cloud library.",
    Icon: Cloud,
    accent: "text-violet-500",
  },
  {
    href: "/images/all-files",
    label: "All Files",
    description: "Full cloud-files browser, folders + non-image files.",
    Icon: FolderTree,
    accent: "text-amber-500",
  },
  {
    href: "/images/upload",
    label: "Upload",
    description: "Drag, drop, paste — saves to your cloud.",
    Icon: Upload,
    accent: "text-emerald-500",
  },
  {
    href: "/images/branded",
    label: "Branded",
    description: "Generate cover / OG / thumb / favicon variants from one image.",
    Icon: Stamp,
    accent: "text-orange-500",
  },
  {
    href: "/images/tools",
    label: "Tools",
    description: "Crop, lightbox, floating gallery, screenshot, and more.",
    Icon: Wrench,
    accent: "text-zinc-500",
  },
];

export function ManagerLandingHero() {
  return (
    <div className="h-full overflow-y-auto overscroll-contain">
      <div className="space-y-3 px-3 pb-3 pt-10 md:hidden">
        <section className="rounded-lg border border-primary/25 bg-card/85 p-5 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <ImageIcon className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Manager
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse, upload, and organize.
          </p>
        </section>

        <section className="overflow-hidden rounded-lg border border-border bg-card/70">
          {TILES.map(({ href, label, description, Icon, accent }, index) => (
            <Link
              key={href}
              href={href}
              className={`flex min-h-[58px] items-center gap-3 px-3 py-2 active:bg-muted/70 ${
                index > 0 ? "border-t border-border/70" : ""
              }`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/70">
                <Icon className={`h-4 w-4 ${accent}`} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold tracking-tight">
                    {label}
                  </span>
                  <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {description}
                </span>
              </span>
            </Link>
          ))}
        </section>
      </div>

      <section className="relative hidden overflow-hidden border-b border-border md:block">
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent"
        />
        <div className="relative container mx-auto px-4 sm:px-6 md:px-10 py-5 md:py-12 max-w-[1400px]">
          <div className="flex items-center gap-1.5 text-xs font-medium text-primary mb-3">
            <ImageIcon className="h-3.5 w-3.5" />
            <span className="uppercase tracking-wider">Images / Manager</span>
          </div>
          <h1 className="text-2xl md:text-4xl font-bold tracking-tight max-w-3xl">
            Browse, upload, and create.
          </h1>
          <p className="hidden sm:block text-base text-muted-foreground mt-3 max-w-2xl leading-relaxed">
            Every upload lands in your cloud and stays in sync across every
            Matrx surface. Pick a workflow below or browse with the sidebar.
          </p>
        </div>
      </section>

      <section className="container mx-auto hidden max-w-[1400px] px-3 py-4 sm:px-6 md:grid md:px-10 md:py-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3">
          {TILES.map(({ href, label, description, Icon, accent }) => (
            <Link
              key={href}
              href={href}
              className="group rounded-lg border border-border bg-card p-3 md:p-5 hover:border-primary/40 transition-colors flex items-center gap-3 md:flex-col md:items-start md:gap-2"
            >
              <div className="h-10 w-10 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                <Icon className={`h-5 w-5 ${accent}`} />
              </div>
              <div className="min-w-0 flex-1 md:w-full">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-semibold text-sm tracking-tight truncate">
                    {label}
                  </h3>
                  <ArrowRight className="h-3 w-3 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary shrink-0" />
                </div>
                <p className="text-xs md:text-sm text-muted-foreground leading-relaxed truncate md:line-clamp-2 md:whitespace-normal">
                  {description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
