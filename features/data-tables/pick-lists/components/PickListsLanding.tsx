import Link from "next/link";
import {
  ArrowRight,
  Keyboard,
  Layers,
  ListChecks,
  ClipboardList,
  Tags,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * PickListsLanding — the /pick-lists landing a guest sees (a signed-in person gets the Pick lists page).
 */

const FEATURES = [
  {
    icon: Tags,
    title: "Drop-down option sets",
    description:
      "Build the labels behind a single dropdown — names, statuses, categories, anything you'd otherwise hard-code.",
  },
  {
    icon: Layers,
    title: "Grouped & dependent menus",
    description:
      "Use the group field to split a list into sections — the same data drives grouped dropdowns and dependent pick lists.",
  },
  {
    icon: ClipboardList,
    title: "Every option, richly described",
    description:
      "Each item carries a label, description, help text, group, and icon — enough for menus, cards, forms, or in-app guidance.",
  },
  {
    icon: Keyboard,
    title: "Type, don't click",
    description:
      "Inline editing with autosave, tab between cells, Enter to add a row — the fastest way to curate options.",
  },
  {
    icon: Zap,
    title: "Optimistic & fast",
    description:
      "Every edit applies instantly. Server errors revert quietly. No save buttons, no spinners.",
  },
];

export default function PickListsLanding() {
  return (
    <div className="min-h-dvh">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 pt-12 sm:pt-20 pb-10 sm:pb-16 text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary-ink">
            <ListChecks className="h-3.5 w-3.5" />
            Pick lists
          </div>
          <h1 className="text-[clamp(2rem,1.5rem+2.5vw,3.5rem)] font-bold tracking-tight leading-[1.1]">
            Reusable lists for{" "}
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              dropdowns, menus &amp; forms
            </span>
          </h1>
          <p className="mt-5 mx-auto max-w-2xl text-[clamp(1rem,0.95rem+0.25vw,1.15rem)] text-muted-foreground leading-relaxed">
            Author option sets once — labels, descriptions, help text, groups, and
            icons — then drop them into any dropdown, dependent picker, or form
            across Matrx.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button hero variant="primary" asChild>
              <Link href="/sign-up?source=lists-landing">
                Get started
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* What it is — features grid */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16">
        <div className="mb-10 sm:mb-12">
          <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.25rem)] font-bold tracking-tight">
            What a pick list actually is
          </h2>
          <p className="mt-3 text-muted-foreground text-base sm:text-lg max-w-3xl">
            Not config files, not magic strings — a table of choices you
            edit like a spreadsheet. The same row that shows up in a dropdown
            can carry help text, an icon, and a group, so the UI stays rich
            without extra plumbing.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className={cn(
                "group relative rounded-2xl border border-border bg-card p-5",
                "transition-all duration-300",
                "hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5",
              )}
            >
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary-ink transition-transform duration-300 group-hover:scale-110">
                <f.icon className="h-4.5 w-4.5" />
              </div>
              <h3 className="text-sm font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
