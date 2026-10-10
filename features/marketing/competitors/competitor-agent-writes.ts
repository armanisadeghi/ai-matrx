/**
 * The competitor directory's agent writes (`create_competitors`, `update_competitors` on
 * `matrx-user/marketing-competitor-directory`): pure readers that check the agent's whole list and
 * report every problem at once, before the person's approval card. Saving runs the same paths the
 * Add competitor dialog and the row's Find socials / Track buttons run (`BrandCompetitorDirectory`).
 */

import { collectProblems, readCollectionList, refuseRepeats } from "@ai-matrx/chat/surfaces/runtime/collection-write-targets";

import { parseSocialAccount } from "@/features/marketing/social/link";
import type { SocialPlatform } from "@/features/marketing/social/types";
import { normalizeDomain, type BrandCompetitor } from "./brand-competitors";
import { COMPETITOR_SOCIAL_PLATFORMS } from "./social-links";

type Rec = Record<string, unknown>;

const PLATFORM_IDS = COMPETITOR_SOCIAL_PLATFORMS.map((p) => p.id) as readonly string[];

export interface AddCompetitorPlan {
  name: string;
  domain: string | null;
  /** [platform, profile link or handle] — exactly what the Add competitor dialog submits. */
  handles: [string, string][];
}

export function parseCreateCompetitors(value: unknown): AddCompetitorPlan[] {
  const list = readCollectionList("create_competitors", "competitors", value, 10);
  refuseRepeats("create_competitors", list.map((raw) => String((raw as Rec | null)?.name ?? "")), "names");
  return collectProblems(
    "create_competitors",
    list,
    (raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Each entry must be an object { name, website?, handles? }.");
      const r = raw as Rec;
      const extra = Object.keys(r).filter((k) => !["name", "website", "handles"].includes(k));
      if (extra.length) throw new Error(`Unknown field ${extra.join(", ")}; allowed: name, website, handles.`);
      const name = typeof r.name === "string" ? r.name.trim() : "";
      if (!name) throw new Error("name is required.");
      let domain: string | null = null;
      if (r.website !== undefined) {
        domain = typeof r.website === "string" ? normalizeDomain(r.website) : null;
        if (!domain) throw new Error(`website ${String(r.website)} is not a website address.`);
      }
      const handles: [string, string][] = [];
      if (r.handles !== undefined) {
        if (!r.handles || typeof r.handles !== "object" || Array.isArray(r.handles))
          throw new Error(`handles must be an object { "<platform>": "<link or handle>" }; platforms: ${PLATFORM_IDS.join(", ")}.`);
        for (const [platform, v] of Object.entries(r.handles as Rec)) {
          if (!PLATFORM_IDS.includes(platform)) throw new Error(`handles.${platform}: not a platform here (${PLATFORM_IDS.join(", ")}).`);
          if (typeof v !== "string" || !v.trim()) throw new Error(`handles.${platform} must be a link or handle.`);
          const parsed = parseSocialAccount(v, platform as SocialPlatform);
          if (parsed.status === "post") throw new Error(`handles.${platform} is a link to one post, not an account.`);
          handles.push([platform, parsed.status === "ok" ? parsed.url : v.trim()]);
        }
      }
      return { name, domain, handles };
    },
    { nameOf: (raw) => String((raw as Rec | null)?.name ?? "") },
  );
}

export interface CompetitorUpdatePlan {
  row: BrandCompetitor;
  findSocials: boolean;
  trackFound: boolean;
}

export function parseUpdateCompetitors(value: unknown, rows: readonly BrandCompetitor[]): CompetitorUpdatePlan[] {
  const list = readCollectionList("update_competitors", "competitors", value, 10);
  refuseRepeats("update_competitors", list.map((raw) => String((raw as Rec | null)?.key ?? "")), "keys");
  return collectProblems(
    "update_competitors",
    list,
    (raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error('Each entry must be an object { key, find_socials?, track_found? }.');
      const r = raw as Rec;
      const extra = Object.keys(r).filter((k) => !["key", "find_socials", "track_found"].includes(k));
      if (extra.length) throw new Error(`Unknown field ${extra.join(", ")}; allowed: key, find_socials, track_found.`);
      const row = rows.find((x) => x.key === r.key);
      if (!row) throw new Error(`key ${String(r.key ?? "(missing)")} is not a competitor on this page; use a key from competitors.`);
      const findSocials = r.find_socials === true;
      const trackFound = r.track_found === true;
      if (!findSocials && !trackFound) throw new Error("Nothing to do: send find_socials true and/or track_found true.");
      if (findSocials && !row.domain) throw new Error(`${row.name} has no website to read; add their accounts with create_competitors handles instead.`);
      return { row, findSocials, trackFound };
    },
    { nameOf: (raw) => String((raw as Rec | null)?.key ?? "") },
  );
}
