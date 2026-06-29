// features/education/types.ts
//
// Data model for the Education Hub. The hub is DATA-DRIVEN: every marketing /
// discovery page is rendered by a shared server component from a registry
// entry (see `features/education/data/*`). Adding a page == adding an entry.
//
// SOURCE OF TRUTH for WHAT we build is the vision doc:
//   app/(core)/education/VISION-education-hub.md
// This file only describes the SHAPE of the data, never the strategy. If the
// content here drifts from the vision, the vision wins — report the drift.

import type { LucideIcon } from "lucide-react";

/**
 * Access tier marker. Drives funnel UI (free/trial/premium badges + CTAs)
 * ONLY — it is NOT enforcement. Real entitlement enforcement is owned by the
 * forthcoming entitlements/billing system; see
 *   docs/proposals/ENTITLEMENTS_AND_BILLING_REQUIREMENTS.md
 */
export type AccessTier = "free" | "trial" | "premium";

/** Build status of a route/tool/feature. Mirrors the FeatureAdminMap vocabulary. */
export type EduStatus = "live" | "beta" | "coming-soon" | "planned";

/** The five discovery axes + the content engine. Each is a top-level namespace. */
export type EduAxisId =
  | "subjects"
  | "levels"
  | "exam-prep"
  | "study-aids"
  | "features";

// ---------------------------------------------------------------------------
// Composable, server-rendered content blocks
// ---------------------------------------------------------------------------
// Marketing/axis pages are a list of these blocks. A content-filling agent
// authors blocks, never JSX. Render is 100% server-side (no client logic).

export interface EduLink {
  label: string;
  href: string;
}

export interface EduFeatureItem {
  icon?: LucideIcon;
  title: string;
  description: string;
  /** Optional deep-link — turns the card into a link (the conversion bridge). */
  href?: string;
}

export interface EduStep {
  /** "01", "02", … — caller-controlled so ordering is explicit. */
  number: string;
  title: string;
  description: string;
}

export interface EduStatusCard {
  title: string;
  description?: string;
  status: EduStatus;
  href?: string;
  bullets?: string[];
  icon?: LucideIcon;
  accessTier?: AccessTier;
}

export interface EduStat {
  value: string;
  label: string;
}

export interface EduFaqItem {
  q: string;
  a: string;
}

/**
 * One body section of a marketing/axis page. Discriminated by `kind` and
 * rendered by `SectionRenderer`. Add a new kind here + a branch in the
 * renderer — never inline bespoke JSX in a registry entry.
 */
export type EduSection =
  | { kind: "prose"; heading?: string; body: string }
  | {
      kind: "feature-grid";
      heading?: string;
      subheading?: string;
      items: EduFeatureItem[];
      /** 2 | 3 columns at lg. Defaults to 3. */
      columns?: 2 | 3;
    }
  | { kind: "steps"; heading?: string; subheading?: string; steps: EduStep[] }
  | {
      kind: "status-cards";
      heading?: string;
      subheading?: string;
      cards: EduStatusCard[];
    }
  | { kind: "stat-bar"; stats: EduStat[] }
  | { kind: "faq"; heading?: string; items: EduFaqItem[] }
  | { kind: "cta"; heading: string; body?: string; primary: EduLink; secondary?: EduLink };

// ---------------------------------------------------------------------------
// Axis entry — the unit of the data-driven page system
// ---------------------------------------------------------------------------

export interface AxisEntry {
  /** URL segment. Lowercase, hyphenated, human-readable, SEO-bearing. */
  slug: string;
  /** Display name ("AP World History", "High School", "FastFire"). */
  name: string;
  /** One-line hero subtitle. */
  tagline: string;
  /** Longer description — feeds the meta description + hero intro paragraph. */
  description: string;
  icon: LucideIcon;
  /** 2-char favicon badge, unique within the axis (see route-metadata rules). */
  letter: string;
  status: EduStatus;
  accessTier: AccessTier;
  /** Show on the axis index "featured" rail and the hub. */
  featured?: boolean;
  /**
   * Hide from the axis index grid while keeping a live page + static param.
   * Used for fine-grained leaves reached via a parent (e.g. individual grade
   * pages surfaced only from the Elementary band).
   */
  indexHidden?: boolean;
  /** Extra SEO keywords beyond name/tagline. */
  keywords?: string[];
  /** Body content. Optional so a stub entry still renders a clean page. */
  sections?: EduSection[];
  /**
   * Free-form axis-specific metadata, shown as hero chips.
   * e.g. levels: { gradeRange: "Grades 9–12" }; exam-prep: { examFor: "College admissions" }.
   */
  meta?: Record<string, string>;
  /** Cross-links — the conversion bridge from content → app + related content. */
  related?: {
    /** Tool slugs under /education/<tool>. */
    tools?: string[];
    /** Subject slugs under /education/subjects/<slug>. */
    subjects?: string[];
    /** Content slugs under /education/learn/<slug>. */
    content?: string[];
    /** Exam slugs under /education/exam-prep/<slug>. */
    exams?: string[];
  };
  /** Nested entries (e.g. Elementary → individual grade pages). */
  children?: AxisEntry[];
}

/** Static config for an axis (its index page + nav + hub card). */
export interface AxisConfig {
  id: EduAxisId;
  /** Display label ("Subjects", "Levels", "Exam Prep"). */
  label: string;
  /** Route segment under /education ("subjects", "levels", "exam-prep"). */
  segment: string;
  /** Hub/nav one-liner. */
  blurb: string;
  icon: LucideIcon;
  /** Favicon badge for the index page. */
  letter: string;
}

// ---------------------------------------------------------------------------
// Application tool entry — the interactive, ID-anchored app layer
// ---------------------------------------------------------------------------

export interface EduToolEntry {
  /** URL segment under /education (e.g. "flashcards", "fastfire"). */
  slug: string;
  name: string;
  tagline: string;
  description: string;
  icon: LucideIcon;
  letter: string;
  status: EduStatus;
  accessTier: AccessTier;
  /** Short bullets shown on the coming-soon placeholder — a builder's checklist. */
  capabilities: string[];
  /** Vision-doc section this tool implements, e.g. "§3 FastFire". Keeps the
   *  placeholder honest about its source of truth. */
  visionRef?: string;
  /** Once built, the tool graduates to its own route with full functionality. */
  featured?: boolean;
}

// ---------------------------------------------------------------------------
// Learn doc — the pure-content SEO layer (/education/learn/<...slug>)
// ---------------------------------------------------------------------------
// Pure-information pages (topic explainers / study guides) that rank in search
// and funnel into the app via `related`. Distinct from axis MARKETING pages
// (which sell the platform) — a learn doc is ABOUT the subject matter itself.
// Seeded from a registry now; the production engine reads education.
// study_structured_section. Render is fully server-side.

export interface LearnDoc {
  /** Path-style slug; may contain "/" for hierarchy (e.g. "biology/cell-structure"). */
  slug: string;
  title: string;
  /** Short summary → meta description + hero lede. */
  summary: string;
  /** Subject slug this content belongs to (links back to the subject page). */
  subject?: string;
  letter: string;
  /** Absolute date string (no Date.now in this codebase's static data). */
  updated: string;
  keywords?: string[];
  /** Article body — the same composable section blocks as marketing pages. */
  sections: EduSection[];
  /** Conversion bridge: which app tools / subjects / exams this content feeds. */
  related?: {
    tools?: string[];
    subjects?: string[];
    exams?: string[];
  };
}
