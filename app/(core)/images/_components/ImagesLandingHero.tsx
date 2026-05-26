import Link from "next/link";
import {
  ArrowRight,
  Atom,
  Braces,
  Cloud,
  FileImage,
  FolderTree,
  ImageIcon,
  Layers,
  Library,
  Pencil,
  Zap,
  Stamp,
  Upload,
  UserCircle,
  Wrench,
  type LucideIcon
} from "lucide-react";

interface Tile {
  href: string;
  label: string;
  description: string;
  Icon: LucideIcon;
  accent: string;
}

const MANAGER_TILES: Tile[] = [
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
    description: "Your image library, in sync everywhere.",
    Icon: Cloud,
    accent: "text-violet-500",
  },
  {
    href: "/images/all-files",
    label: "All Files",
    description: "Full cloud-files browser, folders and all.",
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
    description: "Cover, OG, thumb, favicon variants in one go.",
    Icon: Stamp,
    accent: "text-orange-500",
  },
  {
    href: "/images/tools",
    label: "Tools",
    description: "Crop, lightbox, gallery, screenshot, and more.",
    Icon: Wrench,
    accent: "text-zinc-500",
  },
];

const STUDIO_TILES: Tile[] = [
  {
    href: "/images/studio-light",
    label: "Studio Light",
    description: "Compact crop + variant flow.",
    Icon: Zap,
    accent: "text-fuchsia-400",
  },
  {
    href: "/images/studio-library",
    label: "Studio Library",
    description: "Every Studio save, in one place.",
    Icon: Library,
    accent: "text-pink-500",
  },
  {
    href: "/images/ai-generate",
    label: "AI Generate",
    description: "Describe an image and generate it.",
    Icon: Zap,
    accent: "text-rose-500",
  },
  {
    href: "/images/generate",
    label: "Generate",
    description: "Text → image, sized any way you want.",
    Icon: Zap,
    accent: "text-violet-400",
  },
  {
    href: "/images/edit",
    label: "Edit",
    description: "Crop, filters, shapes, text, AI assists.",
    Icon: Zap,
    accent: "text-amber-400",
  },
  {
    href: "/images/annotate",
    label: "Annotate",
    description: "Mark up screenshots and images.",
    Icon: Pencil,
    accent: "text-blue-500",
  },
  {
    href: "/images/avatar",
    label: "Avatar",
    description: "Generate avatars from any portrait.",
    Icon: UserCircle,
    accent: "text-teal-500",
  },
  {
    href: "/images/convert",
    label: "Convert",
    description: "60+ platform-perfect sizes from one image.",
    Icon: FileImage,
    accent: "text-indigo-500",
  },
  {
    href: "/images/from-base64",
    label: "Base64",
    description: "Paste base64, get a hosted image URL.",
    Icon: Braces,
    accent: "text-lime-500",
  },
  {
    href: "/images/presets",
    label: "Presets",
    description: "The full preset reference.",
    Icon: Layers,
    accent: "text-purple-500",
  },
  {
    href: "/images/library",
    label: "Library",
    description: "Cloud Files, filtered for studio output.",
    Icon: Library,
    accent: "text-pink-400",
  },
];

export function ImagesLandingHero() {
  return (
    <div className="h-full overflow-y-auto overscroll-contain">
      <div className="space-y-3 px-3 pb-3 pt-10 md:hidden">
        <section className="rounded-lg border border-primary/25 bg-card/85 p-5 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <ImageIcon className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Images
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every image tool, one home.
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <Link
              href="/images/manager"
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors active:scale-[0.99]"
            >
              <ImageIcon className="h-4 w-4" />
              Manager
            </Link>
            <Link
              href="/images/studio"
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors active:scale-[0.99]"
            >
              <Atom className="h-4 w-4" />
              Studio
            </Link>
          </div>
        </section>

        <MobileTileSection
          title="Manager"
          landing="/images/manager"
          tiles={MANAGER_TILES}
        />
        <MobileTileSection
          title="Studio"
          landing="/images/studio"
          tiles={STUDIO_TILES}
        />
      </div>

      <section className="relative hidden overflow-hidden border-b border-border md:block">
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent"
        />
        <div className="relative container mx-auto px-4 sm:px-6 md:px-10 py-5 md:py-14 max-w-[1400px]">
          <div className="flex items-center gap-1.5 text-xs font-medium text-primary mb-3">
            <ImageIcon className="h-3.5 w-3.5" />
            <span className="uppercase tracking-wider">Images</span>
          </div>
          <h1 className="text-2xl md:text-5xl font-bold tracking-tight max-w-3xl">
            Every image tool, one home.
          </h1>
          <p className="hidden sm:block text-base md:text-lg text-muted-foreground mt-3 max-w-2xl leading-relaxed">
            Browse, upload, generate, edit, annotate, convert — pick a tool from
            the sidebar or jump straight in below.
          </p>
          <div className="flex flex-wrap gap-2 md:gap-3 mt-4 md:mt-6">
            <Link
              href="/images/manager"
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 md:px-5 py-2 text-sm font-medium shadow-sm hover:bg-primary/90 transition-colors"
            >
              <ImageIcon className="h-4 w-4" />
              Open Manager
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/images/studio"
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-border px-4 md:px-5 py-2 text-sm font-medium hover:bg-muted/50 transition-colors"
            >
              <Atom className="h-4 w-4" />
              Open Studio
            </Link>
          </div>
        </div>
      </section>

      <div className="hidden md:block">
        <TileSection title="Manager" landing="/images/manager" tiles={MANAGER_TILES} />
        <TileSection title="Studio" landing="/images/studio" tiles={STUDIO_TILES} />
      </div>
    </div>
  );
}

function MobileTileSection({
  title,
  landing,
  tiles,
}: {
  title: string;
  landing: string;
  tiles: Tile[];
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        <Link
          href={landing}
          className="inline-flex min-h-[40px] items-center gap-1 text-sm font-medium text-primary"
        >
          Home <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-card/70">
        {tiles.map(({ href, label, description, Icon, accent }, index) => (
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
      </div>
    </section>
  );
}

function TileSection({
  title,
  landing,
  tiles,
}: {
  title: string;
  landing: string;
  tiles: Tile[];
}) {
  return (
    <section className="container mx-auto px-3 sm:px-6 md:px-10 py-4 md:py-10 max-w-[1400px]">
      <div className="flex items-baseline justify-between gap-4 mb-4">
        <h2 className="text-lg md:text-2xl font-semibold tracking-tight">
          {title}
        </h2>
        <Link
          href={landing}
          className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1"
        >
          {title} home <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 md:gap-3">
        {tiles.map(({ href, label, description, Icon, accent }) => (
          <Link
            key={href}
            href={href}
            className="group rounded-lg border border-border bg-card p-3 md:p-4 hover:border-primary/40 transition-colors flex items-center gap-3 md:flex-col md:items-start md:gap-2"
          >
            <div className="h-9 w-9 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
              <Icon className={`h-4 w-4 ${accent}`} />
            </div>
            <div className="min-w-0 flex-1 md:w-full">
              <div className="flex items-center gap-1.5">
                <h3 className="font-semibold text-sm tracking-tight truncate">
                  {label}
                </h3>
                <ArrowRight className="h-3 w-3 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary shrink-0" />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed truncate md:line-clamp-2 md:whitespace-normal">
                {description}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
