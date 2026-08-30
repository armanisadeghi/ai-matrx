/**
 * One icon per website/SEO section, keyed by slug from `route-sections.ts`.
 *
 * Lives here rather than in a component because multiple surfaces render the
 * same sections — the site headers and the marketing sidebar — and a section
 * shown with two different glyphs reads as two different destinations.
 *
 * Not in `features/shell/shellIconMap.ts` deliberately: most of these are
 * marketing-only, and that registry is the shell's curated set for
 * `nav-data.ts`. Growing it for one feature makes every consumer carry them.
 *
 * The maps are exhaustive by type — adding a section without an icon is a
 * compile error, not a blank square.
 */

import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  CircleDollarSign,
  ClipboardCheck,
  FileText,
  FlaskConical,
  Gauge,
  Grid3x3,
  Images,
  KeyRound,
  Link2,
  Map,
  Network,
  Radar,
  RefreshCw,
  Route,
  ScanSearch,
  SearchCheck,
  Settings,
  Timer,
  TrendingUp,
  Workflow,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import {
  MARKETING_SEO_SECTIONS,
  MARKETING_WEBSITE_SECTIONS,
} from "./route-sections";

export const MARKETING_WEBSITE_SECTION_ICONS: Record<
  (typeof MARKETING_WEBSITE_SECTIONS)[number]["slug"],
  LucideIcon
> = {
  "": Gauge,
  pages: FileText,
  structure: Network,
  sitemaps: Map,
  media: Images,
  crawls: ScanSearch,
  settings: Settings,
};

export const MARKETING_SEO_SECTION_ICONS: Record<
  (typeof MARKETING_SEO_SECTIONS)[number]["slug"],
  LucideIcon
> = {
  keywords: KeyRound,
  rankings: TrendingUp,
  "search-console": SearchCheck,
  audit: ClipboardCheck,
  findings: AlertTriangle,
  analysis: Activity,
  coverage: Grid3x3,
  performance: Timer,
  changes: FlaskConical,
  backlinks: BadgeCheck,
  links: Link2,
  authority: Route,
  valuation: CircleDollarSign,
  "ai-visibility": Radar,
  "growth-loop": RefreshCw,
  automations: Workflow,
  capabilities: Wrench,
};
