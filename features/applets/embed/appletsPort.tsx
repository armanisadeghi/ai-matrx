"use client";

// features/applets/embed/appletsPort.tsx — APPLETS INSIDE A PAGE. One port, two hosts:
//   - records-ui's "page built from tables" (`RecordsUiHost.applets`, a dashboard record whose
//     `presentation.page_blocks` hold an `applet` block) — `APPLETS_PORT`;
//   - a Space page's `applet` block (features/spaces/editor/applet-block.tsx) — the picker's list
//     (`listPlaceableApplets`), the live Applet (`AppletInPageLazy`), the static card a published Site and
//     the first paint draw (`AppletCardLazy`), the reads Markdown export uses (`readAppletCards`).
//
// v7 APPS-ON-DATA item 3 (Arman's endgame, 2026-10-02) and the "one roof" first piece (2026-10-09): an
// Applet placed inside a page, drawn by the ONE Applet host. Every read is the viewer's own (RLS is the
// ceiling); the lists are never narrowed by the active organization.

import dynamic from "next/dynamic";
import { createClient } from "@/utils/supabase/client";
import { appletState } from "@/features/applets/lib/applet-state";

const AppletInPage = dynamic(() => import("./AppletInPage"), {
  loading: () => <p className="text-xs text-muted-foreground">Opening the Applet…</p>,
});

/** The live Applet in a page, loaded on demand (the Applet host never rides the page's own chunk). */
export const AppletInPageLazy = AppletInPage;

/** The static Applet card (name, description, "Open this Applet"), loaded on demand. */
export const AppletCardLazy = dynamic(() => import("./AppletCard"));

/** Where an Applet lives on the web. The full address, so it opens the same from a Site, an export or a tab. */
export const APPLET_WEB_ORIGIN = "https://www.aimatrx.com";
export const appletWebUrl = (slug: string) => `${APPLET_WEB_ORIGIN}/applets/${encodeURIComponent(slug)}`;
/** The Applet's own page in the app (publish, settings) and its builder ("Change with AI"). */
export const appletManageHref = (appletId: string) => `/applets/manage/${appletId}`;
export const appletBuilderHref = (appletId: string) => `/applets/manage/${appletId}/code`;
/** Where a new Applet is started (the picker's "Build a new Applet"). */
export const NEW_APPLET_HREF = "/applets/build";

/** One Applet as a page shows it without running it. */
export interface AppletCardInfo {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdBy: string | null;
  /** Live at its public link: published AND on the web (the same answer the Applets list gives). */
  onTheWeb: boolean;
}

const CARD_COLUMNS = "id, name, slug, description, created_by, status, published_to_web, deleted_at";

interface CardRow {
  id: string;
  name: string | null;
  slug: string;
  description: string | null;
  created_by: string | null;
  status: string;
  published_to_web: boolean;
  deleted_at: string | null;
}

function toCard(r: CardRow): AppletCardInfo {
  return {
    id: r.id,
    name: r.name || "Untitled Applet",
    slug: r.slug,
    description: r.description?.trim() || null,
    createdBy: r.created_by,
    onTheWeb: appletState(r).live,
  };
}

/** The Applets a person may place: every one she can open, newest first (the Applets home's own read). */
export async function listPlaceableApplets(): Promise<AppletCardInfo[]> {
  const { data, error } = await createClient()
    .schema("app")
    .from("definition")
    .select(CARD_COLUMNS)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(500);
  // A list read: row security answers with fewer rows, never an error — an error here is a fault, said as one.
  if (error) throw new Error("Your Applets could not be listed.", { cause: error });
  return ((data ?? []) as CardRow[]).map(toCard);
}

/** These Applets by id, as the viewer may read them; an id she cannot open is simply absent. */
export async function readAppletCards(ids: readonly string[]): Promise<Map<string, AppletCardInfo>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) return new Map();
  const { data, error } = await createClient().schema("app").from("definition").select(CARD_COLUMNS).in("id", unique).is("deleted_at", null);
  if (error) throw new Error("The Applet could not be read.", { cause: error });
  return new Map(((data ?? []) as CardRow[]).map((r) => [r.id, toCard(r)]));
}

/** The Applet a pasted `/applets/<slug>` link names, when the viewer can open it. */
export async function readAppletBySlug(slug: string): Promise<AppletCardInfo | null> {
  const { data, error } = await createClient().schema("app").from("definition").select(CARD_COLUMNS).eq("slug", slug).is("deleted_at", null).maybeSingle();
  if (error) throw new Error("The Applet could not be read.", { cause: error });
  return data ? toCard(data as CardRow) : null;
}

/** Every applet this person can see, newest first — the apps home's own read (RLS is the ceiling). */
async function listApplets(): Promise<ReadonlyArray<{ id: string; name: string }>> {
  return (await listPlaceableApplets()).map((a) => ({ id: a.id, name: a.name }));
}

/** The records-ui host port (`RecordsUiHost.applets`). Spread into a host object. */
export const APPLETS_PORT = {
  applets: {
    list: listApplets,
    render: (appId: string) => <AppletInPage key={appId} appId={appId} />,
  },
};
