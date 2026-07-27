/**
 * Surface manifest — Knowledge Data Stores (`matrx-user/rag-data-stores`).
 *
 * `/rag/data-stores` — the two-column manager for `rag.data_stores`: every
 * store the caller can see on the left, the selected store's identity,
 * configuration, members, access tier, and sharing state on the right.
 *
 * A data store is the RETRIEVAL SCOPE. `knowledge_search(query, data_store_id)`
 * searches inside exactly one, so this page decides what an agent is able to
 * retrieve at all. That is why the surface exists: agents bound here are
 * reasoning about curation and reach, not about document text.
 *
 * Selection lives in `?store_id=<uuid>`, so the selected store's values are
 * routed identity — reliable across refresh and deep link.
 *
 * Emitter: `features/rag/components/data-stores/DataStoresPage.tsx` via
 * `buildRagDataStoresContextData` in
 * `features/rag/agent-context/buildRagDataStoresContextData.ts`.
 *
 * NOT THE SAME SURFACE AS `/rag/repositories`. That route lists
 * `code.code_repositories` — git repos with branches, file counts, and an
 * index action. Different table, different vocabulary, different agents. It
 * has no surface today; folding it in here would mean declaring values this
 * page never emits.
 *
 * SHARING DOCTRINE (features/rag/FEATURE.md): data stores are NOT shared
 * through `iam.permissions` / ShareButton. Read access is published via
 * `rag.data_store_grants` audiences (global / industry / organization) and
 * write access stays gated by store ownership. `store_access` and
 * `store_read_only` report which side of that asymmetry the caller is on.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "store_list",
    label: "Accessible stores",
    sortOrder: 100,
    description:
      "Every data store the caller can see in the left column — their own, their orgs', and shared libraries granted to them.",
  },
  {
    key: "store_identity",
    label: "Selected store",
    sortOrder: 200,
    description:
      "Identity and configuration of the store open in the right pane. Empty when nothing is selected.",
  },
  {
    key: "store_access",
    label: "Access and sharing",
    sortOrder: 300,
    description:
      "How the caller reaches the selected store and whether they may change it — the read/write asymmetry of Shared Knowledge Resources.",
  },
  {
    key: "store_members",
    label: "Store members",
    sortOrder: 400,
    description:
      "The sources bound into the selected store. These, and only these, are what an agent retrieves when it scopes to this store.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Accessible stores (300-329) ───────────────────────────────────────
  {
    name: "store_count",
    label: "Accessible store count",
    description:
      "How many data stores the caller can see. Always present once the list settles; 0 when they have none.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    group: "store_list",
    sortOrder: 300,
  },
  {
    name: "store_list_status",
    label: "Store list status",
    description:
      '"loading", "loaded", "empty", or "error" — the state of the left-column fetch. Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 7,
    group: "store_list",
    sortOrder: 305,
  },
  {
    name: "accessible_stores",
    label: "Accessible stores",
    description:
      "Array of `{ id, name, short_code, kind, description, member_count, is_active, access, read_only, organization_id }` for every store in the left column, in display order. Empty array when the caller has none. This is the full menu of retrieval scopes available to an agent on this account.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2600,
    autoContext: false,
    group: "store_list",
    sortOrder: 310,
  },
  {
    name: "store_kind_breakdown",
    label: "Store kinds",
    description:
      'Object mapping store kind ("general", "case", "project", "reference", "inbox", "library") to how many accessible stores hold it. Useful for "what have I organized and how?".',
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 110,
    group: "store_list",
    sortOrder: 315,
  },

  // ── Selected store (330-379) ──────────────────────────────────────────
  {
    name: "store_id",
    label: "Selected store ID",
    description:
      "UUID of the store open in the right pane, mirrored in `?store_id`. This is the value to pass as `data_store_id` when scoping a retrieval. Empty when no store is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "store_identity",
    sortOrder: 330,
  },
  {
    name: "store_name",
    label: "Store name",
    description:
      "Human name of the selected store. Empty when no store is selected or its detail has not loaded.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    group: "store_identity",
    sortOrder: 335,
  },
  {
    name: "store_short_code",
    label: "Store short code",
    description:
      "Optional stable short code for the store, used as a human-typeable handle. Empty when unset, and when no store is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    group: "store_identity",
    sortOrder: 340,
  },
  {
    name: "store_description",
    label: "Store description",
    description:
      "Free-text description the curator wrote — the best statement of what this store is FOR. Empty when unset, and when no store is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 180,
    group: "store_identity",
    sortOrder: 345,
  },
  {
    name: "store_kind",
    label: "Store kind",
    description:
      '"general", "case", "project", "reference", "inbox", or "library". "library" means a system-owned Shared Knowledge Resource — read-only to tenants. Empty when no store is selected.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 9,
    group: "store_identity",
    sortOrder: 350,
  },
  {
    name: "store_is_active",
    label: "Store is active",
    description:
      "False when the store has been deactivated and should not be used as a retrieval scope. Absent when no store is selected.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "store_identity",
    sortOrder: 355,
  },
  {
    name: "store_organization_id",
    label: "Store organization ID",
    description:
      "Organization UUID owning the selected store. Empty for a personal store, and when no store is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "store_identity",
    sortOrder: 360,
  },
  {
    name: "store_created_by",
    label: "Store created by",
    description:
      "User UUID that created the selected store. This identity, not the active organization, is what gates writes. Empty when no store is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "store_identity",
    sortOrder: 365,
  },
  {
    name: "store_created_at",
    label: "Store created at",
    description:
      "ISO-8601 creation timestamp of the selected store. Empty when no store is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    group: "store_identity",
    sortOrder: 370,
  },
  {
    name: "store_updated_at",
    label: "Store updated at",
    description:
      "ISO-8601 timestamp of the last change to the store row itself (not its members). Empty when no store is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    group: "store_identity",
    sortOrder: 375,
  },
  {
    name: "store_settings",
    label: "Store settings",
    description:
      "Free-form JSONB settings bag on the store row (server-defined keys; usually empty). Absent when no store is selected.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 120,
    autoContext: false,
    group: "store_identity",
    sortOrder: 378,
  },
  {
    name: "store_summary",
    label: "Selected store summary",
    description:
      "Composite for the selected store: `{ id, name, short_code, description, kind, is_active, organization_id, created_by, created_at, updated_at, access, read_only, member_count }`. Absent when no store is selected.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 460,
    group: "store_identity",
    sortOrder: 379,
  },

  // ── Access and sharing (380-409) ──────────────────────────────────────
  {
    name: "store_access",
    label: "Caller access tier",
    description:
      '"owner" (the caller created it), "org" (they reach it through org membership), or "granted" (a shared library published to them, read-only). Empty when no store is selected or the server did not report a tier.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 7,
    group: "store_access",
    sortOrder: 380,
  },
  {
    name: "store_read_only",
    label: "Store is read-only",
    description:
      "True when the caller may search the store but not change it — a granted shared library. Editing UI is hidden and every mutation is refused server-side. Absent when no store is selected.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "store_access",
    sortOrder: 385,
  },
  {
    name: "store_provenance_label",
    label: "Why the caller has access",
    description:
      'Human explanation of a shared library grant, e.g. "Shared library · via Workers Compensation". Empty for stores the caller owns or reaches through their org, and when no store is selected.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 45,
    group: "store_access",
    sortOrder: 390,
  },
  {
    name: "store_can_publish",
    label: "Caller may publish",
    description:
      "True when the caller is a super-admin viewing a `library`-kind store and can open the audience publish panel (global / industry / organization grants). Absent otherwise.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "store_access",
    sortOrder: 395,
  },

  // ── Store members (410-449) ───────────────────────────────────────────
  {
    name: "member_count",
    label: "Member count",
    description:
      "How many sources are bound into the selected store. 0 means an agent scoping to this store retrieves nothing. Absent when no store is selected.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    group: "store_members",
    sortOrder: 410,
  },
  {
    name: "member_source_kinds",
    label: "Member source kinds",
    description:
      'Object mapping source kind ("cld_file", "processed_document", "note", "code_file", "library_doc") to how many members of the selected store hold it. Absent when no store is selected.',
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 110,
    group: "store_members",
    sortOrder: 415,
  },
  {
    name: "store_members",
    label: "Store members",
    description:
      "Array of `{ source_kind, source_id, label, notes, added_at }` for the sources bound into the selected store, in load order. `label` is a best-effort human name and is null on a miss. Empty array for an empty store; absent when no store is selected.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 5000,
    autoContext: false,
    group: "store_members",
    sortOrder: 420,
  },
];

export const ragDataStoresManifest: SurfaceManifest = {
  surfaceName: "matrx-user/rag-data-stores",
  readiness: "partial",
  readinessNote:
    "Manifest authored against the live /rag/data-stores component and the emitter is wired via SurfaceRuntimeProvider; not yet DB-synced and no live non-matching-name binding test run. The publish panel's per-audience grant rows stay undeclared — they load inside DataStorePublishPanel and nothing lifts them to the route.",
  label: "Knowledge Data Stores",
  urlPattern: "/rag/data-stores",
  intro: `<surface_intro>
This is where the user curates DATA STORES — the retrieval scopes of the RAG
system. A data store is a named bucket of sources; knowledge_search takes one
data_store_id and searches inside exactly that bucket. So a store decides what
an agent can retrieve at all, and this page is where that decision is made.

The left column lists every store the caller can reach (accessible_stores). The
right pane describes the one they opened: store_id is the value you pass as
data_store_id, store_description is the curator's own statement of what the
store is for, and member_count with member_source_kinds tells you whether there
is anything inside it. A store with 0 members retrieves nothing, no matter how
good the query is.

Access is asymmetric and store_access names the caller's side of it:
  - "owner"   — they created it; they may rename, delete, and add members.
  - "org"     — they reach it through organization membership.
  - "granted" — it is a curated Shared Knowledge Resource published to them.
                store_read_only is true; every mutation is refused server-side,
                and store_provenance_label answers "why can I read this?".

Data stores are NOT shared through the normal permissions system. Never propose
sharing one with a link or a per-user grant; read access comes from audience
grants (everyone / an industry / an organization) and write access comes from
owning the store.

This surface holds store and member METADATA, never document text. To read what
is inside a member, use its id on the document viewer surface.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
};

/** One accessible data store as this surface hands it to an agent. */
export interface RagDataStoreEntry {
  id: string;
  name: string;
  short_code: string | null;
  kind: string | null;
  description: string | null;
  member_count: number;
  is_active: boolean;
  access: string | null;
  read_only: boolean;
  organization_id: string | null;
}

/** One bound member of the selected store. */
export interface RagDataStoreMemberEntry {
  source_kind: string;
  source_id: string;
  label: string | null;
  notes: string | null;
  added_at: string;
}

/**
 * Scope builder for `matrx-user/rag-data-stores`.
 *
 * `store_count` and `store_list_status` are guaranteed — the left column always
 * renders and always reports its state. Everything about a SELECTED store is
 * optional: the user may be looking at the empty right pane.
 */
export function createRagDataStoresScope(values: {
  selection?: string;
  content?: string;
  context?: Record<string, unknown>;

  store_count: number;
  store_list_status: string;
  accessible_stores?: RagDataStoreEntry[];
  store_kind_breakdown?: Record<string, number>;

  // Selected store
  store_id?: string;
  store_name?: string;
  store_short_code?: string;
  store_description?: string;
  store_kind?: string;
  store_is_active?: boolean;
  store_organization_id?: string;
  store_created_by?: string;
  store_created_at?: string;
  store_updated_at?: string;
  store_settings?: Record<string, unknown>;
  store_summary?: Record<string, unknown>;

  // Access and sharing
  store_access?: string;
  store_read_only?: boolean;
  store_provenance_label?: string;
  store_can_publish?: boolean;

  // Members
  member_count?: number;
  member_source_kinds?: Record<string, number>;
  store_members?: RagDataStoreMemberEntry[];
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
