import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Database,
  FileText,
  Keyboard,
  Layers,
  ListChecks,
  Rows3,
  Sparkles,
  Tags,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * PicklistLanding — overview + chooser for the two picklist editor variants.
 *
 * Routes:
 *   /lists       → this landing
 *   /lists/v1    → PicklistManagerV1 (sidebar + spreadsheet)
 *   /lists/v2    → PicklistManagerV2 (compact switcher + flat table)
 *   /lists/v3    → PicklistManager (Notion-style document) — current primary
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
      "Use the group field to split a list into sections — the same data drives grouped dropdowns and dependent picklists.",
  },
  {
    icon: Sparkles,
    title: "Every option, richly described",
    description:
      "Each item carries a label, description, help text, group, and icon — enough for menus, cards, forms, or in-app guidance.",
  },
  {
    icon: Database,
    title: "Real data, not config",
    description:
      "Backed by udt_picklists / udt_picklist_items in Postgres. Reusable everywhere a list of options is needed.",
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

const VARIANTS: Array<{
  href: string;
  badge: string;
  title: string;
  tagline: string;
  bullets: string[];
  icon: typeof ListChecks;
  primary?: boolean;
}> = [
  {
    href: "/lists/v1",
    badge: "v1",
    title: "Sidebar + spreadsheet",
    tagline:
      "Picklists in the left rail, a dense editable grid on the right. Familiar table feel.",
    bullets: [
      "Persistent sidebar of all picklists",
      "Spreadsheet body with grouped rows",
      "Undo via toast on destructive actions",
      "Created during UX exploration",
    ],
    icon: Rows3,
  },
  {
    href: "/lists/v2",
    badge: "v2",
    title: "Compact switcher + flat table",
    tagline:
      "One screen, one table. List switcher drops down from the top, table fills the rest.",
    bullets: [
      "Maximum space for the table",
      "Inline-editable list name / description / visibility",
      "Native combobox for the Group cell",
      "Uses the official curated icon picker window",
    ],
    icon: ListChecks,
  },
  {
    href: "/lists/v3",
    badge: "v3",
    title: "Notion-style document",
    tagline:
      "List as a clean document: inline title + description, items as lines, hover reveals controls.",
    bullets: [
      "Document-feel layout, no table chrome",
      "Items as lines with one-line preview of description/help text",
      "Click row (or chevron / Cmd+Enter) to expand into a full edit form",
      "Collapsible, inline-renamable group sections",
      "Autosave w/ 500ms debounce; undoable destructive actions via toast",
    ],
    icon: FileText,
    primary: true,
  },
];

const SCHEMA = [
  {
    title: "udt_picklists",
    description:
      "One row per list. Carries name, description, owner, visibility (private / shared / public).",
  },
  {
    title: "udt_picklist_items",
    description:
      "Each row is a selectable option: label, description, help text, group, icon. Cascade-delete with its parent list.",
  },
];

export default function PicklistLanding() {
  return (
    <div className="min-h-dvh">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 pt-12 sm:pt-20 pb-10 sm:pb-16 text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
            <ListChecks className="h-3.5 w-3.5" />
            Picklists
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
            <Button size="lg" className="gap-2" asChild>
              <Link href="/lists/v3">
                Open editor
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="#choose">Choose a variant</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* What it is — features grid */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16">
        <div className="mb-10 sm:mb-12">
          <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.25rem)] font-bold tracking-tight">
            What a picklist actually is
          </h2>
          <p className="mt-3 text-muted-foreground text-base sm:text-lg max-w-3xl">
            Not config files, not magic strings — a small Postgres table you
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
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-110">
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

      {/* Choose a variant */}
      <section
        id="choose"
        className="bg-card/50 border-y border-border"
      >
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-14 sm:py-20">
          <div className="mb-8 sm:mb-12 text-center">
            <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.25rem)] font-bold tracking-tight">
              Two editors, same data
            </h2>
            <p className="mt-3 text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto">
              Both edit <code className="rounded bg-muted px-1.5 py-0.5 text-[0.85em]">udt_picklists</code>{" "}
              directly. Pick whichever feels faster — they're under live
              comparison.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            {VARIANTS.map((v) => {
              const Icon = v.icon;
              return (
                <Link
                  key={v.href}
                  href={v.href}
                  className={cn(
                    "group relative flex flex-col rounded-2xl border bg-card p-6 transition-all",
                    "hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5",
                    v.primary
                      ? "border-primary/30 ring-1 ring-primary/10"
                      : "border-border",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                        v.primary
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {v.badge}
                    </span>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">{v.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    {v.tagline}
                  </p>
                  <ul className="mt-4 space-y-1.5">
                    {v.bullets.map((b) => (
                      <li
                        key={b}
                        className="flex items-start gap-2 text-sm text-foreground/80"
                      >
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-5 flex items-center gap-1.5 text-sm font-medium text-primary opacity-80 group-hover:opacity-100 transition-opacity">
                    Open {v.badge}
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Schema */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-12 sm:py-16">
        <div className="mb-8">
          <h2 className="text-[clamp(1.25rem,1rem+1vw,1.875rem)] font-bold tracking-tight">
            Under the hood
          </h2>
          <p className="mt-3 text-muted-foreground text-sm sm:text-base max-w-2xl">
            Two tables, RLS-scoped per user, public-share-aware. Editors write
            to them directly — no middle tier.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {SCHEMA.map((s) => (
            <div
              key={s.title}
              className="rounded-xl border border-border bg-card p-4"
            >
              <code className="block text-xs sm:text-sm font-mono font-semibold text-primary">
                {s.title}
              </code>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                {s.description}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
