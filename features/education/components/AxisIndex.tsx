// Server component. Renders an axis INDEX page (e.g. /education/subjects) from
// a registry: hero + a grid of entry cards linking to each detail page.
// 100% server-rendered, no client logic.
import { MarketingPageShell } from "@/features/shell/components/MarketingPageShell";
import { AuthedWorkspaceCTA } from "@/features/auth/components/module-landing/AuthedWorkspaceCTA";
import { EduHero } from "./sections/EduHero";
import { SectionRenderer } from "./sections/SectionRenderer";
import { EDU_AXIS_BY_ID, EDU_BASE, EDU_WORKSPACE_HREF, EDU_WORKSPACE_LABEL, eduHref } from "../constants";
import type { AxisEntry, EduAxisId, EduSection, EduStatusCard } from "../types";

interface AxisIndexProps {
  axisId: EduAxisId;
  entries: AxisEntry[];
  /** Optional override for the hero title (defaults to the axis label). */
  heroTitle?: string;
  heroAccent?: string;
}

export function AxisIndex({ axisId, entries, heroTitle, heroAccent }: AxisIndexProps) {
  const axis = EDU_AXIS_BY_ID[axisId];
  // Hide fine-grained leaves (e.g. individual grades) from the index; featured
  // entries first, then the rest in declared order.
  const visible = entries.filter((e) => !e.indexHidden);
  const ordered = [...visible].sort(
    (a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)),
  );

  const cards: EduStatusCard[] = ordered.map((e) => ({
    title: e.name,
    description: e.tagline,
    status: e.status,
    href: eduHref(axis.segment, e.slug),
    accessTier: e.accessTier,
    icon: e.icon,
  }));

  const sections: EduSection[] = [
    {
      kind: "status-cards",
      heading: `Browse ${axis.label.toLowerCase()}`,
      subheading: axis.blurb,
      cards,
    },
  ];

  return (
    <MarketingPageShell>
      <AuthedWorkspaceCTA
        workspaceHref={EDU_WORKSPACE_HREF}
        workspaceLabel={EDU_WORKSPACE_LABEL}
      />
      <EduHero
        eyebrow="AI Matrx Education"
        eyebrowIcon={axis.icon}
        title={heroTitle ?? axis.label}
        titleAccent={heroAccent}
        description={axis.blurb}
        chips={[`${visible.length} ${axis.label.toLowerCase()}`]}
        primary={{ label: "Start studying free", href: EDU_BASE }}
      />
      <SectionRenderer sections={sections} />
    </MarketingPageShell>
  );
}
