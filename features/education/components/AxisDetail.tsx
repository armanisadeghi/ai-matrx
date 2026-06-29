// Server component. Renders a single axis ENTRY page (e.g.
// /education/subjects/biology) from its registry entry: hero → authored
// sections → child grid (if any) → related cross-links (the conversion
// bridge) → a default funnel CTA when the entry didn't author its own.
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MarketingPageShell } from "@/features/shell/components/MarketingPageShell";
import { AuthedWorkspaceCTA } from "@/features/auth/components/module-landing/AuthedWorkspaceCTA";
import { cn } from "@/lib/utils";
import { EduHero } from "./sections/EduHero";
import { SectionRenderer } from "./sections/SectionRenderer";
import { ACCESS_TIER_META, EDU_AXIS_BY_ID, EDU_BASE, EDU_LEARN_SEGMENT, EDU_WORKSPACE_HREF, EDU_WORKSPACE_LABEL, eduHref } from "../constants";
import { getAxisEntry } from "../data/registry";
import { EDU_TOOL_BY_SLUG } from "../data/tools";
import { LEARN_DOC_BY_SLUG } from "../data/learn-content";
import type { AxisEntry, EduAxisId, EduSection } from "../types";

/** Slug → Title Case, used ONLY as a fallback when no registry name exists. */
function humanize(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Name resolvers — always prefer the referenced entry's real display name
// (e.g. "FastFire", "MCAT", "Mathematics") over a slug-derived guess.
const toolName = (s: string) => EDU_TOOL_BY_SLUG[s]?.name ?? humanize(s);
const examName = (s: string) => getAxisEntry("exam-prep", s)?.name ?? humanize(s);
const subjectName = (s: string) => getAxisEntry("subjects", s)?.name ?? humanize(s);
const contentName = (s: string) => LEARN_DOC_BY_SLUG[s]?.title ?? humanize(s);

interface RelatedGroup {
  label: string;
  links: { label: string; href: string }[];
}

function buildRelated(entry: AxisEntry): RelatedGroup[] {
  const groups: RelatedGroup[] = [];
  const r = entry.related;
  if (!r) return groups;
  if (r.tools?.length)
    groups.push({
      label: "Study it now",
      links: r.tools.map((s) => ({ label: toolName(s), href: eduHref(s) })),
    });
  if (r.exams?.length)
    groups.push({
      label: "Exam prep",
      links: r.exams.map((s) => ({ label: examName(s), href: eduHref("exam-prep", s) })),
    });
  if (r.subjects?.length)
    groups.push({
      label: "Related subjects",
      links: r.subjects.map((s) => ({ label: subjectName(s), href: eduHref("subjects", s) })),
    });
  if (r.content?.length)
    groups.push({
      label: "Read up",
      links: r.content.map((s) => ({
        label: contentName(s),
        href: eduHref(EDU_LEARN_SEGMENT, s),
      })),
    });
  return groups;
}

interface AxisDetailProps {
  axisId: EduAxisId;
  entry: AxisEntry;
}

export function AxisDetail({ axisId, entry }: AxisDetailProps) {
  const axisSegment = EDU_AXIS_BY_ID[axisId].segment;
  const sections = entry.sections ?? [];
  const hasCta = sections.some((s) => s.kind === "cta");
  const related = buildRelated(entry);
  const tierLabel = ACCESS_TIER_META[entry.accessTier].label;

  const heroChips = [
    ...(entry.meta ? Object.values(entry.meta) : []),
    tierLabel,
  ];

  return (
    <MarketingPageShell>
      <AuthedWorkspaceCTA
        workspaceHref={EDU_WORKSPACE_HREF}
        workspaceLabel={EDU_WORKSPACE_LABEL}
      />
      <EduHero
        eyebrow={entry.tagline}
        eyebrowIcon={entry.icon}
        title={entry.name}
        description={entry.description}
        chips={heroChips}
        primary={{ label: "Start studying free", href: EDU_BASE }}
        secondary={
          entry.related?.tools?.[0]
            ? { label: "See the tools", href: eduHref(entry.related.tools[0]) }
            : undefined
        }
      />

      <SectionRenderer sections={sections} />

      {/* Child entries (e.g. Elementary → individual grades) */}
      {entry.children && entry.children.length > 0 ? (
        <section className="bg-card/50 border-y border-border">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-20">
            <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.5rem)] font-bold tracking-tight text-center mb-10">
              Pick a grade
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {entry.children.map((child) => {
                const ChildIcon = child.icon;
                return (
                  <Link
                    key={child.slug}
                    // Children are flat sibling entries in the same axis
                    // namespace (e.g. /education/levels/3rd-grade), not a
                    // nested route — matches the industry's flat grade URLs.
                    href={eduHref(axisSegment, child.slug)}
                    className="group rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-md hover:shadow-primary/5"
                  >
                    <ChildIcon className="h-5 w-5 text-primary mb-2" />
                    <div className="text-sm font-semibold group-hover:text-primary transition-colors">
                      {child.name}
                    </div>
                    <div className="text-xs text-muted-foreground line-clamp-1">
                      {child.tagline}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      {/* Related cross-links — the conversion bridge */}
      {related.length > 0 ? (
        <section>
          <div className="mx-auto max-w-5xl px-4 sm:px-6 py-14 sm:py-20">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              {related.map((group) => (
                <div key={group.label}>
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/70 mb-3">
                    {group.label}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {group.links.map((l) => (
                      <Link
                        key={l.href}
                        href={l.href}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-1.5 text-sm",
                          "min-h-[44px] sm:min-h-0", // ≥44px touch target on mobile
                          "hover:border-primary/40 hover:text-primary transition-colors",
                        )}
                      >
                        {l.label}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* Default funnel CTA when the entry didn't author its own */}
      {!hasCta ? (
        <SectionRenderer
          sections={
            [
              {
                kind: "cta",
                heading: `Master ${entry.name} with AI Matrx`,
                body: "Generate flashcards, quizzes, and audio from your own notes — then study with an AI tutor that knows exactly where you're stuck.",
                primary: { label: "Start free", href: EDU_BASE },
                secondary: { label: "Browse study aids", href: eduHref("study-aids") },
              },
            ] satisfies EduSection[]
          }
        />
      ) : null}
    </MarketingPageShell>
  );
}
