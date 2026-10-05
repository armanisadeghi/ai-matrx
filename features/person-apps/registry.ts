// features/person-apps/registry.ts — EVERY APP AN AGENT BUILT FOR A PERSON ON THEIR OWN TABLES.
//
// One row per app: its address (`/apps/<slug>`), its name, the organization its tables live in (where
// its writes go), and its screen, loaded on demand. The tables are the person's own store tables, typed
// by `pnpm tables:types` into the app's `tables/` folder; every read and write runs under the signed-in
// viewer's own seat, so the store — never the app — decides who sees and changes what.
// How to add one: the skill `build-an-app-on-their-tables` (matrx-frontend/.claude/skills).

import type { ComponentType } from "react";

export interface PersonAppProps {
  /** The address below the app's root: `/apps/<slug>/client/<id>` → ["client", "<id>"]. */
  path: string[];
}

export interface PersonApp {
  slug: string;
  name: string;
  /** Who it was built for, in words. */
  builtFor: string;
  /** The organization the app's tables live in; writes go here. */
  organizationId: string;
  load: () => Promise<{ default: ComponentType<PersonAppProps> }>;
}

export const PERSON_APPS: Record<string, PersonApp> = {
  "holloway-content": {
    slug: "holloway-content",
    name: "Holloway Creative — Content",
    builtFor: "Holloway Creative (social-media agency): posting calendar, approvals, client review",
    organizationId: "344cfaa8-2b0c-4971-854a-9694614816f2",
    load: () => import("./holloway-content/ContentApp"),
  },
};

export function personApp(slug: string): PersonApp | null {
  return Object.prototype.hasOwnProperty.call(PERSON_APPS, slug) ? PERSON_APPS[slug]! : null;
}
