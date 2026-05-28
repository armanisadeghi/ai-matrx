import { join } from "path";
import Link from "next/link";
import {
  LayoutGrid,
  MonitorPlay,
  Globe,
  FlaskConical,
  ArrowRight,
} from "lucide-react";
import { scanRoutesShallow } from "@/utils/route-discovery";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos", {
  title: "Demos",
  description:
    "Unified index of every demo, test, and experimental route in the app.",
});

// One conceptual landing for every demo/test route in the codebase. Each
// section reads its source directory at build time via `scanRoutesShallow`
// (top-level subroutes only) so adding a new demo automatically shows up
// here without code changes.
//
// Sections — and why each has its own route group:
//   (dev)/demos/*              — auth-required, slim Providers shell
//   (ssr)/demos/ssr/*          — auth-required, LiteStoreProvider + glass shell
//                                (different Redux store, can't nest into (dev))
//   (public-demos)/demos/public/* — no auth, PublicProviders shell
//
// Plus the entity-bound demos that live under (legacy) — those keep that
// group because they need the entity slice; surfaced here as a single link.
type DemoSection = {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  basePath: string;
  directory: string;
  accent: string; // tailwind accent color for the section header
};

const SECTIONS: DemoSection[] = [
  {
    title: "Dev demos & tests",
    description:
      "Internal demos, test pages, and experimental surfaces under the standard auth shell.",
    icon: FlaskConical,
    basePath: "/demos",
    directory: join(process.cwd(), "app", "(dev)", "demos"),
    accent: "text-blue-600 dark:text-blue-400",
  },
  {
    title: "SSR-shell demos",
    description:
      "Server-rendered demos using the lightweight LiteStore + glass shell. Different Redux store from the rest of the app.",
    icon: MonitorPlay,
    basePath: "/demos/ssr",
    directory: join(process.cwd(), "app", "(ssr)", "demos", "ssr"),
    accent: "text-purple-600 dark:text-purple-400",
  },
  {
    title: "Public showcase demos",
    description:
      "Externally linkable demos served without authentication. Use the public providers shell.",
    icon: Globe,
    basePath: "/demos/public",
    directory: join(
      process.cwd(),
      "app",
      "(public-demos)",
      "demos",
      "public",
    ),
    accent: "text-emerald-600 dark:text-emerald-400",
  },
];

async function loadSection(section: DemoSection) {
  const subroutes = await scanRoutesShallow(section.directory);
  return { section, subroutes };
}

export default async function DemosLandingPage() {
  const loaded = await Promise.all(SECTIONS.map(loadSection));
  const totalCount = loaded.reduce((n, { subroutes }) => n + subroutes.length, 0);

  return (
    <div className="h-[calc(100dvh-var(--header-height))] overflow-y-auto bg-textured">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <header className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <LayoutGrid className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-bold">Demos & tests</h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Unified index of every demo, test, and experimental route across
            the codebase ({totalCount} top-level surfaces across{" "}
            {loaded.filter((l) => l.subroutes.length > 0).length} sections).
            Add a new route under any section's directory and it appears here
            automatically on the next request.
          </p>
        </header>

        <div className="space-y-10">
          {loaded.map(({ section, subroutes }) => {
            const Icon = section.icon;
            return (
              <section key={section.basePath}>
                <div className="mb-3 flex items-baseline gap-2">
                  <Icon className={`h-5 w-5 ${section.accent}`} />
                  <h2 className="text-xl font-semibold">{section.title}</h2>
                  <span className="text-xs text-muted-foreground">
                    {subroutes.length} surface
                    {subroutes.length !== 1 ? "s" : ""} · {section.basePath}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mb-4 max-w-3xl">
                  {section.description}
                </p>
                {subroutes.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">
                    No demos in this section yet.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {subroutes.map((name) => {
                      const href = `${section.basePath}/${name}`;
                      return (
                        <Link
                          key={href}
                          href={href}
                          className="group flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm hover:border-primary hover:bg-accent/50 transition-colors"
                        >
                          <span className="truncate font-mono text-xs">
                            {name}
                          </span>
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary shrink-0 ml-2" />
                        </Link>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}

          <section>
            <div className="mb-3 flex items-baseline gap-2">
              <FlaskConical className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              <h2 className="text-xl font-semibold">Entity-bound demos</h2>
              <span className="text-xs text-muted-foreground">
                under /legacy
              </span>
            </div>
            <p className="text-sm text-muted-foreground mb-4 max-w-3xl">
              Demos and tests that depend on the entity slice live under{" "}
              <code className="font-mono">/legacy/*</code> because they need
              the full entity store. These are listed separately because they
              boot a different Redux tree.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {[
                "/legacy/tests",
                "/legacy/demo",
                "/legacy/entity-crud",
                "/legacy/entity-admin",
                "/legacy/workflows",
                "/legacy/workflow-entity",
                "/legacy/workflows-new",
                "/legacy/chat",
              ].map((href) => (
                <Link
                  key={href}
                  href={href}
                  className="group flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm hover:border-primary hover:bg-accent/50 transition-colors"
                >
                  <span className="truncate font-mono text-xs">{href}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary shrink-0 ml-2" />
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
