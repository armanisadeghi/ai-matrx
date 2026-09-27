"use client";

/**
 * The hub sidebar's reads — all DIRECT from Supabase under RLS (client rule:
 * no server hop for a plain read), each with its own honest state:
 *
 *   Saved views  → platform.saved_view (surface_key `knowledge/hub`), declared
 *                  scope: created by me OR in one of my organizations.
 *   Favorites    → platform.user_entity_state via `ues_list('favorite')`.
 *   Containers   → the registry's candidate reader per container token
 *                  (projects, scopes incl. tags, libraries, research topics,
 *                  data stores) — the same reader every picker uses.
 *
 * With `data: "sample"` the containers come from the fixture (announced by the
 * page); saved views and favorites stay real — they are the person's own rows.
 */

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { getUserOrganizations } from "@/features/organizations/service";
import { listAssociationCandidates } from "@/features/scopes/service/associationCandidates";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import type { EntityTypeToken } from "@ai-matrx/associations";
import { FIXTURE_CONTAINERS } from "@/features/knowledge/api/knowledgeSearchFixture";
import {
  parseSavedViewDefinition,
  HUB_KINDS,
  type HubSavedViewDefinition,
} from "@/features/knowledge/hub/hubState";

export const HUB_SAVED_VIEW_SURFACE = "knowledge/hub";

/** Container tokens shown as the sidebar tree, in order. */
export const HUB_CONTAINER_TOKENS = [
  "project",
  "scope",
  "media_source_library",
  "research_topic",
  "data_store",
] as const;

export const HUB_CONTAINER_LABEL: Record<(typeof HUB_CONTAINER_TOKENS)[number], string> = {
  project: "Projects",
  scope: "Scopes & tags",
  media_source_library: "Libraries",
  research_topic: "Research topics",
  data_store: "Data stores",
};

export interface Loadable<T> {
  status: "loading" | "ready" | "error";
  items: T[];
  error: string | null;
  retry: () => void;
}

export interface HubSavedView {
  id: string;
  name: string;
  definition: HubSavedViewDefinition | null;
}

export interface HubContainerRow {
  id: string;
  title: string;
}

export interface HubFavorite {
  entity: string;
  id: string;
}

function message(err: unknown, what: string): string {
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string")
    return `Could not read ${what}: ${err.message}`;
  return `Could not read ${what}.`;
}

/** `depKey` changes → read again; `retry` → read again. */
function useLoad<T>(
  load: () => Promise<T[]>,
  depKey: string,
  enabled = true,
): Loadable<T> {
  const loadRef = useRef(load);
  loadRef.current = load;
  const [state, setState] = useState<{ status: Loadable<T>["status"]; items: T[]; error: string | null }>({
    status: "loading",
    items: [],
    error: null,
  });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setState((s) => ({ ...s, status: "loading", error: null }));
    loadRef.current()
      .then((items) => {
        if (!cancelled) setState({ status: "ready", items, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setState({
            status: "error",
            items: [],
            error: err instanceof Error ? err.message : String(err),
          });
      });
    return () => {
      cancelled = true;
    };
  }, [depKey, attempt, enabled]);
  return { ...state, retry: () => setAttempt((n) => n + 1) };
}

async function readSavedViews(userId: string): Promise<HubSavedView[]> {
  const orgs = await getUserOrganizations();
  const orgIds = orgs.map((o) => o.id);
  let q = supabase
    .schema("platform")
    .from("saved_view")
    .select("id,name,definition")
    .eq("surface_key", HUB_SAVED_VIEW_SURFACE)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true })
    .limit(200);
  q = orgIds.length
    ? q.or(`created_by.eq.${userId},organization_id.in.(${orgIds.join(",")})`)
    : q.eq("created_by", userId);
  const { data, error } = await q;
  if (error) throw new Error(message(error, "your saved views"));
  return ((data ?? []) as { id: string; name: string; definition: unknown }[]).map((r) => ({
    id: r.id,
    name: r.name,
    definition: parseSavedViewDefinition(r.definition),
  }));
}

/** Entity tokens the hub lists — a favorite of anything else is not knowledge. */
const KNOWLEDGE_TOKENS = new Set<string>([
  ...HUB_KINDS.flatMap((k) => k.query.types ?? []),
  ...HUB_CONTAINER_TOKENS,
]);

async function readFavorites(): Promise<HubFavorite[]> {
  const { data, error } = await supabase.rpc("ues_list", { p_kind: "favorite" });
  if (error) throw new Error(message(error, "your favorites"));
  const rows = (Array.isArray(data) ? data : []) as {
    entity_type: string;
    entity_id: string;
    is_favorite: boolean;
  }[];
  return rows
    .filter((r) => r.is_favorite && KNOWLEDGE_TOKENS.has(r.entity_type))
    .map((r) => ({ entity: r.entity_type, id: r.entity_id }));
}

/**
 * Libraries have no registry title column (the picker cannot list them), so —
 * like the Source Save panel — read `media.source_library` directly, with a
 * declared scope: the ones I made or that live in my organizations.
 */
async function readLibraries(userId: string): Promise<HubContainerRow[]> {
  const orgIds = (await getUserOrganizations()).map((o) => o.id);
  let q = supabase
    .schema("media")
    .from("source_library")
    .select("id,name")
    .is("deleted_at", null)
    .order("name")
    .limit(200);
  q = orgIds.length
    ? q.or(`created_by.eq.${userId},organization_id.in.(${orgIds.join(",")})`)
    : q.eq("created_by", userId);
  const { data, error } = await q;
  if (error) throw new Error(message(error, "your libraries"));
  return ((data ?? []) as { id: string; name: string | null }[]).map((r) => ({
    id: r.id,
    title: r.name || "Untitled library",
  }));
}

async function readContainers(
  token: string,
  sample: boolean,
): Promise<HubContainerRow[]> {
  if (sample) {
    return Object.values(FIXTURE_CONTAINERS)
      .filter((c) => c.type === token || (token === "scope" && c.type === "tag"))
      .map((c) => ({ id: c.id, title: c.name }));
  }
  if (!tryGetEntityInfo(token)) throw new Error(`The registry does not know "${token}".`);
  const res = await listAssociationCandidates({
    token: token as EntityTypeToken,
    limit: 100,
  });
  if (!res.ok) throw new Error(res.error);
  return res.data.map((r) => ({ id: r.id, title: r.title }));
}

export interface HubSidebarData {
  savedViews: Loadable<HubSavedView>;
  favorites: Loadable<HubFavorite>;
  containers: Record<(typeof HUB_CONTAINER_TOKENS)[number], Loadable<HubContainerRow>>;
}

export function useHubSidebarData(data: "live" | "sample"): HubSidebarData {
  const userId = useAppSelector(selectUserId);
  const sample = data === "sample";
  const savedViews = useLoad(
    () => (userId ? readSavedViews(userId) : Promise.resolve([])),
    userId ?? "",
    Boolean(userId),
  );
  const favorites = useLoad(readFavorites, userId ?? "", Boolean(userId));
  const k = String(sample);
  const project = useLoad(() => readContainers("project", sample), k);
  const scope = useLoad(() => readContainers("scope", sample), k);
  const media_source_library = useLoad(
    () =>
      sample
        ? readContainers("media_source_library", true)
        : userId
          ? readLibraries(userId)
          : Promise.resolve([]),
    `${k}|${userId ?? ""}`,
  );
  const research_topic = useLoad(() => readContainers("research_topic", sample), k);
  const data_store = useLoad(() => readContainers("data_store", sample), k);
  return {
    savedViews,
    favorites,
    containers: { project, scope, media_source_library, research_topic, data_store },
  };
}
