// features/education/constants.ts
//
// Static configuration for the Education Hub: the discovery axes, the content
// engine, and access-tier display metadata. Registries (data/*) hold the
// page-level entries; this file holds the structural skeleton everything maps
// onto. See VISION-education-hub.md for the WHY.

import {
  BookOpen,
  GraduationCap,
  Target,
  Layers,
  Sparkles,
  Crown,
  Gift,
  Clock,
  type LucideIcon,
} from "lucide-react";
import { siteConfig } from "@/config/extras/site";
import type { AccessTier, AxisConfig } from "./types";

/** Base path for the entire hub. Change here, propagates everywhere. */
export const EDU_BASE = "/education" as const;

/**
 * Public origin for every PUBLIC education/creator URL: page canonicals, OG
 * image URLs, JSON-LD `url`/`sameAs`, and sitemap `<loc>` entries. Defaults to
 * the main site (`siteConfig.url`) — unset env, unchanged behavior.
 *
 * Set `NEXT_PUBLIC_EDU_ORIGIN=https://learn.aimatrx.com` to point every one of
 * those URLs at the dedicated school-safe subdomain in one change, with no
 * per-callsite edits. Pairs with the host gate in `proxy.ts` (redirects
 * non-education app routes away from that host) — see
 * `features/education/creators/FEATURE.md` § "Public education origin
 * (learn.aimatrx.com)" for the full cutover (DNS, Vercel domain, cookie
 * domain).
 */
export const EDU_ORIGIN = (process.env.NEXT_PUBLIC_EDU_ORIGIN?.trim() || siteConfig.url).replace(
  /\/$/,
  "",
);

/**
 * The discovery axes, in nav/hub order. Each is a top-level path namespace
 * under /education. Subject-first ordering mirrors the industry (every major
 * platform leads with subjects; grade/level is a facet, exam-prep a cross-cut).
 */
export const EDU_AXES: AxisConfig[] = [
  {
    id: "subjects",
    label: "Subjects",
    segment: "subjects",
    blurb: "Every subject, from arithmetic to organic chemistry.",
    icon: BookOpen,
    letter: "Es",
  },
  {
    id: "levels",
    label: "Levels",
    segment: "levels",
    blurb: "Built for your stage — kindergarten through professional boards.",
    icon: GraduationCap,
    letter: "El",
  },
  {
    id: "exam-prep",
    label: "Exam Prep",
    segment: "exam-prep",
    blurb: "SAT, AP, MCAT, LSAT, bar, CPA — the test is the goal.",
    icon: Target,
    letter: "Ex",
  },
  {
    id: "study-aids",
    label: "Study Aids",
    segment: "study-aids",
    blurb: "Flashcards, quizzes, podcasts, mind maps — every way to study.",
    icon: Layers,
    letter: "Ea",
  },
  {
    id: "features",
    label: "Features",
    segment: "features",
    blurb: "FastFire, the AI tutor, voice grading — what makes us different.",
    icon: Sparkles,
    letter: "Ef",
  },
];

/** Quick lookup by axis id. */
export const EDU_AXIS_BY_ID: Record<string, AxisConfig> = Object.fromEntries(
  EDU_AXES.map((a) => [a.id, a]),
);

/** The pure-content SEO engine — a separate namespace from the app + axes. */
export const EDU_LEARN_SEGMENT = "learn" as const;

/** Helper: build an absolute hub URL from path parts. */
export function eduHref(...parts: string[]): string {
  return [EDU_BASE, ...parts].join("/");
}

/** Display metadata for access tiers. Icons are Lucide (no emoji). */
export const ACCESS_TIER_META: Record<
  AccessTier,
  { label: string; icon: LucideIcon; tone: "free" | "trial" | "premium" }
> = {
  free: { label: "Free", icon: Gift, tone: "free" },
  trial: { label: "Free trial", icon: Clock, tone: "trial" },
  premium: { label: "Pro", icon: Crown, tone: "premium" },
};

/**
 * The workspace a guest lands in after converting from a content/marketing
 * page. Used by the funnel CTA. Points at the hub for now; retarget when the
 * primary study workspace ships.
 */
export const EDU_WORKSPACE_HREF = EDU_BASE;
export const EDU_WORKSPACE_LABEL = "Study Hub";
