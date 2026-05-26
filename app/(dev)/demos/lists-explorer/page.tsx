import { Metadata } from "next";
import Link from "next/link";
import {
  Columns2,
  GitBranch,
  Table2,
  ArrowRight,
  List,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Lists — Route Explorer | AI Matrx",
};

const ROUTES = [
  {
    href: "/lists",
    label: "Split / Tree View (New)",
    description:
      "Side-by-side split panel (resizable) and tree navigation. Toggle between layouts. All CRUD on the detail page.",
    icon: Columns2,
    badge: "Recommended",
    badgeClass: "bg-primary/10 text-primary border-primary/20",
  },
  {
    href: "/lists/v1",
    label: "Sidebar View (v1)",
    description:
      "Classic sidebar + detail layout. Original implementation — kept for comparison.",
    icon: List,
    badge: "Legacy",
    badgeClass: "bg-muted text-muted-foreground border-border",
  },
] as const;

export default function ListsExplorerPage() {
  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
              <Table2 className="h-5 w-5 text-muted-foreground" />
              Lists — Route Variants
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Multiple layout experiments for the lists feature. Navigate here to
              switch between them.
            </p>
          </div>

          <div className="space-y-3">
            {ROUTES.map((route) => {
              const Icon = route.icon;
              return (
                <Link
                  key={route.href}
                  href={route.href}
                  className="group flex items-start gap-4 p-4 rounded-lg border border-border bg-card hover:bg-accent/30 hover:border-border/80 transition-colors"
                >
                  <div className="flex-shrink-0 h-9 w-9 rounded-md bg-muted flex items-center justify-center mt-0.5">
                    <Icon className="h-4.5 w-4.5 text-foreground/70" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">
                        {route.label}
                      </span>
                      <span
                        className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${route.badgeClass}`}
                      >
                        {route.badge}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      {route.description}
                    </p>
                    <div className="mt-1.5">
                      <span className="text-xs text-muted-foreground/60 font-mono">
                        {route.href}
                      </span>
                    </div>
                  </div>

                  <ArrowRight className="h-4 w-4 text-muted-foreground/40 flex-shrink-0 mt-1 group-hover:text-muted-foreground transition-colors" />
                </Link>
              );
            })}
          </div>

          <div className="mt-6 p-3 rounded-md bg-muted/40 border border-border/40">
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-medium text-foreground">Tip:</span> The new
              split/tree view uses the layout toggle (top right) to switch between
              the resizable side-by-side panel and the tree navigation. Both share
              the same detail page at{" "}
              <code className="font-mono text-[10px] bg-muted px-1 rounded">
                /lists/[id]
              </code>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
