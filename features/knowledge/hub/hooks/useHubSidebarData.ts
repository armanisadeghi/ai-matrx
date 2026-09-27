"use client";

/**
 * The hub sidebar's reads — all DIRECT from Supabase under RLS (client rule:
 * no server hop for a plain read), each with its own honest state:
 *
 *   Saved views  → platform.saved_view (surface_key `knowledge/hub`) through
 *                  the one saved-views service, declared scope: created by me
 *                  OR in one of my organizations OR the system organization
 *                  (the platform-owned presets); pins from user_entity_state.
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
  encodeSavedViewDefinition,
  parseSavedViewDefinition,
  HUB_KINDS,
  HUB_VIEW_DEFINITION_VERSION,
  type HubSavedViewDefinition,
} from "@/features/knowledge/hub/hubState";
import {
  HUB_SAVED_VIEW_SURFACE,
  missingPresets,
  presetDefinition,
} from "@/features/knowledge/hub/hubSavedViews";
import {
  createSurfaceView,
  listSurfaceViews,
  type SavedViewVisibility,
  type SurfaceView,
} from "@/components/official/table-saved-views-service";
import { resolveSystemOrgId } from "@/lib/organizations/systemOrg";

export { HUB_SAVED_VIEW_SURFACE };

/** Registry token of `platform.saved_view` (pins live on user_entity_state under it). */
export const SAVED_VIEW_TOKEN = "platform_saved_view";
/** Id prefix of a preset shown from code because it is not installed yet. */
export const BUILT_IN_PREFIX = "builtin:";

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
  visibility: SavedViewVisibility;
  /** Null only for a built-in preset not installed yet. */
  organizationId: string | null;
  createdBy: string | null;
  /** Row version — the compare-and-swap token for "Save changes". */
  version: number;
  /** I made it (so I can rename, change, share and delete it). */
  mine: boolean;
  /** Pinned to MY sidebar (per person). */
  pinned: boolean;
  preset: string | null;
  /** A preset shown from its code definition because no row is installed yet. */
  builtIn: boolean;
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

/** The pins are per person (`user_entity_state.is_pinned`), never on the shared row. */
async function readPinnedViewIds(): Promise<Set<string>> {
  const { data, error } = await supabase.rpc("ues_list", { p_kind: "pinned" });
  if (error) throw new Error(message(error, "your pinned views"));
  const rows = (Array.isArray(data) ? data : []) as { entity_type: string; entity_id: string; is_pinned: boolean }[];
  return new Set(rows.filter((r) => r.is_pinned && r.entity_type === SAVED_VIEW_TOKEN).map((r) => r.entity_id));
}

/** One refused seed per session is enough to know this person cannot install presets. */
let presetSeedRefused = false;

/**
 * Presets (§6) are platform-owned rows in the system organization. When any
 * are missing, the app installs them — a write only a platform admin's door
 * admits (`iam.has_org_access` on the system org). For everyone else, until
 * an admin has opened the hub once, the missing presets are shown from their
 * code definition and say so (`builtIn`), never silently absent.
 */
async function ensurePresets(views: HubSavedView[], systemOrgId: string | null): Promise<HubSavedView[]> {
  const installed = views.filter((v) => v.preset && v.organizationId === systemOrgId);
  const missing = missingPresets(installed.map((v) => v.preset as string));
  if (!missing.length) return views;
  const created: HubSavedView[] = [];
  if (systemOrgId && !presetSeedRefused) {
    for (const p of missing) {
      try {
        const row = await createSurfaceView({
          surfaceKey: HUB_SAVED_VIEW_SURFACE,
          organizationId: systemOrgId,
          name: p.name,
          visibility: "internal",
          definition: encodeSavedViewDefinition(presetDefinition(p)),
          definitionVersion: HUB_VIEW_DEFINITION_VERSION,
        });
        created.push(toHubView(row, "", new Set()));
      } catch {
        presetSeedRefused = true;
        break;
      }
    }
  }
  const have = new Set([...installed, ...created].map((v) => v.preset));
  const virtual: HubSavedView[] = missing
    .filter((p) => !have.has(p.key))
    .map((p) => ({
      id: `${BUILT_IN_PREFIX}${p.key}`,
      name: p.name,
      definition: presetDefinition(p),
      visibility: "internal",
      organizationId: null,
      createdBy: null,
      version: 0,
      mine: false,
      pinned: false,
      preset: p.key,
      builtIn: true,
    }));
  return [...views, ...created, ...virtual];
}

function toHubView(row: SurfaceView, userId: string, pins: Set<string>): HubSavedView {
  const definition = parseSavedViewDefinition(row.definition);
  return {
    id: row.id,
    name: row.name,
    definition,
    visibility: row.visibility,
    organizationId: row.organizationId,
    createdBy: row.createdBy,
    version: row.version,
    mine: Boolean(userId) && row.createdBy === userId,
    pinned: pins.has(row.id),
    preset: definition?.preset ?? null,
    builtIn: false,
  };
}

async function readSavedViews(userId: string): Promise<HubSavedView[]> {
  const orgs = await getUserOrganizations();
  const systemOrgId = await resolveSystemOrgId().catch(() => null);
  const orgIds = [...new Set([...orgs.map((o) => o.id), ...(systemOrgId ? [systemOrgId] : [])])];
  const [rows, pins] = await Promise.all([
    listSurfaceViews(HUB_SAVED_VIEW_SURFACE, { userId, organizationIds: orgIds }).catch((err: unknown) => {
      throw new Error(message(err, "your saved views"));
    }),
    readPinnedViewIds(),
  ]);
  return ensurePresets(rows.map((r) => toHubView(r, userId, pins)), systemOrgId);
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
