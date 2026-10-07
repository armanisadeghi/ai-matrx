// features/marketing/applets/types.ts — THE APPLET PUBLIC FACE (AP-0 items 9 and 10, lane E).
//
// What the public doors answer: `public.applet_public_intro(p_slug)` (one Applet's introductory page)
// and `public.applets_public(p_templates_only)` (cards for the template gallery and the sitemap).
// Both answer ONLY what an owner published to the web (`published_to_web`): name, words, screenshots
// and page titles — never rows, code or sources.

export interface AppletScreenshot {
  url: string;
  alt?: string | null;
}

export interface AppletIntro {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  category: string | null;
  tags: string[];
  screenshots: AppletScreenshot[];
  preview_image_url: string | null;
  pages: Array<{ path: string; title: string }>;
  jobs: number;
  sources: number;
  /** Set when the Applet is a template: the data template its tables come from. */
  template: { template_id: string; template_slug: string } | null;
  updated_at: string | null;
}

export interface AppletCard {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  category: string | null;
  screenshot: AppletScreenshot | null;
  preview_image_url: string | null;
  page_count: number;
  is_template: boolean;
  featured: boolean;
  updated_at: string | null;
}

/** The Applet record's `template` column (only the owner's own read sees `bind`). */
export interface AppletTemplateLink {
  template_id: string;
  catalogue_id: string;
  template_slug: string;
  /** Applet source alias → the data template's table token. */
  bind: Record<string, string>;
}

/** The query flag a sign-up round trip carries back to a template page. Lives here, not in the "use client" component, so the server page can read the value. */
export const USE_ON_RETURN = "use";
export const APPLET_TEMPLATES_PATH = "/templates/applets";
/** An Applet's one address: it runs there, and a signed-out visitor or a template's visitor gets its introductory page. */
export const appletHref = (slug: string) => `/applets/${encodeURIComponent(slug)}`;
