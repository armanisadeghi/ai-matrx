// features/marketing/seo/topical-map/start/startMapSources.ts
//
// THE SIX SOURCES A MAP STARTS FROM — as data, the way
// `features/podcasts/generator/constants.ts` declares its sources. Pure data,
// no JSX, so a test can prove it and a server module can import it.
//
// `MAP_AUTHOR_SOURCE_KINDS` (the wire, `../map-author.ts`) deliberately carries
// NO labels: every word a person reads lives HERE, once. The two lists are
// bound at the type level (`satisfies` over the wire's kinds) and at test time
// (`startMapSources.test.ts` proves every kind has exactly one tile, in the
// wire's order).
//
// How each tile collects what the server needs (`AuthorMapRequest`,
// `extra=forbid` — a tile sends only its own fields):
//
//   data               → nothing to type: the brand's own sites (optionally ONE
//                        site); the server reads crawl, keywords and plan.
//   documents          → an EDITABLE BOX (`document_text`) the person corrects
//                        before anything runs — pasted, or pulled from one of
//                        their Notes through the podcast studio's note resolver.
//   prompt             → the person's own description (`prompt`).
//   web_search         → a web page, scraped and cleaned into the same editable
//                        box (`web_search_text`), the address kept as
//                        `web_search_query`. The client scraper exposes URL
//                        scraping only (no search call), so the tile takes a
//                        page address and says so — never a query it cannot run.
//   existing_research  → a finished research topic (`research_topic_id`).
//   new_research       → nothing: the server commissions the research and
//                        answers `research_started` (R8 — no hidden continuation).

import {
  BookOpenCheck,
  Database,
  FileText,
  FlaskConical,
  Globe,
  PenLine,
  type LucideIcon,
} from "lucide-react";

import { MAP_AUTHOR_SOURCE_KINDS, type MapAuthorSourceKind } from "../map-author";

/**
 * What the tile renders under it.
 *   none     — nothing to collect (data, new_research).
 *   site     — an optional site picker (data).
 *   text     — a textarea (prompt).
 *   resolve  — the editable box fed by a resolver (documents, web_search).
 *   research — the research-topic picker (existing_research).
 */
export type StartMapControl = "site" | "text" | "resolve" | "research" | "none";

export interface StartMapSource {
  kind: MapAuthorSourceKind;
  label: string;
  /** One line: what the author reads when this tile is chosen. */
  helper: string;
  icon: LucideIcon;
  control: StartMapControl;
  /** Placeholder for the `text` and `resolve` controls. */
  placeholder?: string;
  /** The verb on the launch button — what pressing it actually does. */
  launchLabel: string;
}

export const START_MAP_SOURCES = [
  {
    kind: "data",
    label: "From this brand's data",
    helper:
      "The brand profile, business facts, locations and each site's crawl, keywords and content plan — nothing to type.",
    icon: Database,
    control: "site",
    launchLabel: "Build the map",
  },
  {
    kind: "documents",
    label: "From documents",
    helper:
      "Paste a service menu, a brochure or a note. You edit the text before the author reads it.",
    icon: FileText,
    control: "resolve",
    placeholder: "Paste the document text here, or pick one of your notes above…",
    launchLabel: "Build the map",
  },
  {
    kind: "prompt",
    label: "From a description",
    helper: "Describe the business in your own words: what it sells, to whom, where.",
    icon: PenLine,
    control: "text",
    placeholder:
      "e.g. A certified e-waste recycler serving California businesses: pickups, data destruction, ITAD…",
    launchLabel: "Build the map",
  },
  {
    kind: "web_search",
    label: "From a web page",
    helper:
      "A page address — the company's services page, a competitor's — scraped and cleaned into text you can edit.",
    icon: Globe,
    control: "resolve",
    placeholder: "The cleaned page text appears here once the address is fetched…",
    launchLabel: "Build the map",
  },
  {
    kind: "existing_research",
    label: "From finished research",
    helper: "A research topic that has already run — the author reads its findings.",
    icon: BookOpenCheck,
    control: "research",
    launchLabel: "Build the map",
  },
  {
    kind: "new_research",
    label: "Research it first",
    helper:
      "Commission a company topic-tree research run. The map is built from it once the research finishes — you will be offered that step here.",
    icon: FlaskConical,
    control: "none",
    launchLabel: "Start the research",
  },
] as const satisfies readonly StartMapSource[];

export type StartMapSourceKind = (typeof START_MAP_SOURCES)[number]["kind"];

/** The tile for one kind. Throws on a kind the data does not declare — the test guarantees it never does. */
export function startMapSource(kind: MapAuthorSourceKind): StartMapSource {
  const found = START_MAP_SOURCES.find((s) => s.kind === kind);
  if (!found) {
    throw new Error(
      `[topical-map/start] No tile declared for source kind "${kind}". ` +
        `Add it to START_MAP_SOURCES — every kind in MAP_AUTHOR_SOURCE_KINDS needs exactly one.`,
    );
  }
  return found;
}

/** Re-exported so a screen iterates the wire's order and never its own. */
export const START_MAP_SOURCE_ORDER = MAP_AUTHOR_SOURCE_KINDS;
