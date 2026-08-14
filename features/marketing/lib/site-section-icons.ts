/**
 * One icon per site section, keyed by the slug in `MARKETING_SITE_SECTIONS`.
 *
 * Lives here rather than in a component because two surfaces render the same
 * sections — the site header (`MarketingSiteLayoutClient`) and the marketing
 * sidebar (`MarketingSidebarMenu`) — and a section shown with two different
 * glyphs reads as two different destinations.
 *
 * Not in `features/shell/shellIconMap.ts` deliberately: twelve of these are
 * marketing-only, and that registry is the shell's curated set for
 * `nav-data.ts`. Growing it for one feature makes every consumer carry them.
 *
 * The map is exhaustive by type — adding a section without an icon is a
 * compile error, not a blank square.
 */

import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  ClipboardCheck,
  Compass,
  FileText,
  FlaskConical,
  Gauge,
  Grid3x3,
  Images,
  Inbox,
  KeyRound,
  Link2,
  Map,
  Network,
  Newspaper,
  Plug,
  Radar,
  RefreshCw,
  Route,
  ScanSearch,
  Settings,
  ShieldCheck,
  Timer,
  TrendingUp,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { MARKETING_SITE_SECTIONS } from "./route-sections";

export const MARKETING_SITE_SECTION_ICONS: Record<
  (typeof MARKETING_SITE_SECTIONS)[number]["slug"],
  LucideIcon
> = {
  "": Gauge,
  "growth-loop": RefreshCw,
  capabilities: Wrench,
  performance: Timer,
  discovery: Inbox,
  sitemaps: Map,
  coverage: Grid3x3,
  audit: ClipboardCheck,
  pages: FileText,
  structure: Network,
  media: Images,
  crawls: ScanSearch,
  analysis: Activity,
  findings: AlertTriangle,
  links: Link2,
  authority: Route,
  backlinks: BadgeCheck,
  changes: FlaskConical,
  reputation: Newspaper,
  keywords: KeyRound,
  intake: Compass,
  ranks: TrendingUp,
  "ai-visibility": Radar,
  integrations: Plug,
  access: ShieldCheck,
  settings: Settings,
};
