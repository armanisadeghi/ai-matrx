/**
 * /administration/preview/unified-management — the landing page for the three
 * unified-management previews Arman ordered (ruling R13), so the post-merge
 * shape can be SEEN before anything is built.
 *
 * Server Component: pure structure, zero client JS. The previews themselves
 * own their interactivity.
 */

import Link from "next/link";
import { ArrowRight, Boxes, LayoutGrid, MapPin } from "lucide-react";

export const metadata = {
  title: "Unified Management — preview",
  description:
    "Non-functional previews of the post-merge management surface: jobs, places, batch.",
};

const PREVIEWS = [
  {
    slug: "jobs",
    icon: LayoutGrid,
    title: "The Job Board",
    blurb:
      "One board, four altitudes. Every job — server mandate, surface binding and shortcut alike — with its goal, its holder, and a coverage scoreboard that names every red and orange row inline.",
    ready: true,
  },
  {
    slug: "places",
    icon: MapPin,
    title: "The Places View",
    blurb:
      "The same corpus from the other side: what runs HERE. Referenced slots, discovered mandates that would appear, and the per-place exclusion valve.",
    ready: false,
  },
  {
    slug: "batch",
    icon: Boxes,
    title: "The Batch Grid",
    blurb:
      "The three-level cascade, fill-down, copy-a-row-paste-to-many, the attention worklist and a minimal-patch bulk write — lifted out of the shortcut editor and pointed at everything.",
    ready: false,
  },
] as const;

export default function UnifiedManagementPreviewLanding() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Unified Management — preview</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Three non-functional previews of what mandates, surface bindings and
          shortcuts look like once they are ONE job record. Mock data
          throughout: nothing here reads or writes the database, and every
          control reports what it would do rather than doing it. What is real is
          the structure — and the structure is not going to change.
        </p>
      </header>

      <ul className="flex flex-col gap-3">
        {PREVIEWS.map((preview) => {
          const Icon = preview.icon;
          return (
            <li key={preview.slug}>
              <Link
                href={`/administration/preview/unified-management/${preview.slug}`}
                className="group flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent/40"
              >
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{preview.title}</span>
                    {preview.ready ? null : (
                      <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        being built alongside this one
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {preview.blurb}
                  </p>
                </div>
                <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-muted-foreground">
        Sources: the settled model, the coverage scoreboard spec, and the
        management keep/throw harvest — every capability composed here was
        harvested from a page we already have, except the goal editor and the
        coverage board, which exist nowhere today.
      </p>
    </div>
  );
}
