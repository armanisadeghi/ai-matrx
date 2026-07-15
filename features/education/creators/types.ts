// features/education/creators/types.ts
//
// Creator profiles + public landing pages (/c/[handle]) — Convergence C.
// A "creator" is a users.profiles row that has claimed a unique public handle
// and opted its page public. Zero new tables (see migrations/education_creator_
// profiles.sql). These types mirror the JSON the creator_* RPCs return.

/** A YouTube video the creator features (privacy-friendly nocookie embed). */
export interface FeaturedYouTube {
  kind: "youtube";
  videoId: string;
  title?: string | null;
}

/** A featured free tool (public flashcard set, study guide, note, media…). */
export interface FeaturedResource {
  kind: "resource";
  resourceType: string; // entity token: fc_set | learn_doc | note | study_media
  id: string;
  /** Enriched server-side by creator_public_page (public resources only). */
  title?: string;
  description?: string | null;
  href?: string;
  extra?: { cardCount?: number } & Record<string, unknown>;
}

/** A class/group with an enroll CTA. Consumes the documented edu_class_join contract. */
export type ClassAccessMode = "open" | "closed" | "paid";
export interface FeaturedClass {
  kind: "class";
  classId: string;
  title: string;
  description?: string | null;
  accessMode: ClassAccessMode;
  /** Display price (USD) for paid classes; the money-movement build is pending. */
  price?: number | null;
}

export type FeaturedItem = FeaturedYouTube | FeaturedResource | FeaturedClass;

/** External link the creator surfaces (YouTube channel, socials, site). */
export interface CreatorLink {
  label: string;
  url: string;
}

/** The public landing-page payload (anon, from creator_public_page). */
export interface CreatorPublicPage {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  tagline: string | null;
  bio: string | null;
  links: CreatorLink[];
  featured: FeaturedItem[];
  publishedAt: string | null;
  updatedAt: string | null;
}

/** The authed owner view (from creator_get_mine / claim / update). */
export interface CreatorProfileMine {
  handle: string | null;
  is_public: boolean;
  display_name: string | null;
  avatar_url: string | null;
  tagline: string | null;
  bio: string | null;
  links: CreatorLink[];
  featured: FeaturedItem[];
  published_at: string | null;
}
