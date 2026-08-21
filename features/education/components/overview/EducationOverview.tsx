import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  ChartNoAxesCombined,
  FilePlus2,
  Library,
  Target,
} from "lucide-react";
import { EDU_TOOLS } from "../../data/tools";

const PRIMARY_DESTINATIONS = [
  {
    label: "Create a kit",
    description: "Turn any source into study material",
    href: "/education/start",
    Icon: FilePlus2,
  },
  {
    label: "Your Library",
    description: "Find everything you have created",
    href: "/education/library",
    Icon: Library,
  },
  {
    label: "Study guides",
    description: "Browse concise learning guides",
    href: "/education/learn",
    Icon: BookOpen,
  },
  {
    label: "Study plan",
    description: "Organize what to learn next",
    href: "/education/planner",
    Icon: Target,
  },
  {
    label: "Progress",
    description: "See practice and learning gains",
    href: "/education/progress",
    Icon: ChartNoAxesCombined,
  },
];

export function EducationOverview() {
  return (
    <main className="h-full overflow-y-auto bg-textured">
      <div className="mx-auto max-w-7xl px-3 py-3 sm:px-5 sm:py-4">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Education overview
            </h1>
            <p className="text-xs text-muted-foreground">
              Create, find, and use every study tool from one place.
            </p>
          </div>
        </div>

        <section
          aria-label="Education destinations"
          className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
        >
          {PRIMARY_DESTINATIONS.map(({ label, description, href, Icon }) => (
            <Link
              key={href}
              href={href}
              className="group min-h-20 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-center justify-between gap-2">
                <Icon className="h-4 w-4 text-primary" />
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
              <div className="mt-2 text-sm font-medium text-foreground">
                {label}
              </div>
              <div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                {description}
              </div>
            </Link>
          ))}
        </section>

        <div className="mb-2 mt-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Study tools</h2>
          <span className="text-[11px] text-muted-foreground">
            Choose the way you want to learn
          </span>
        </div>
        <section
          aria-label="Study tools"
          className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
        >
          {EDU_TOOLS.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link
                key={tool.slug}
                href={`/education/${tool.slug}`}
                className="group flex min-h-16 items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {tool.name}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {tool.tagline}
                  </span>
                </span>
              </Link>
            );
          })}
        </section>
      </div>
    </main>
  );
}
