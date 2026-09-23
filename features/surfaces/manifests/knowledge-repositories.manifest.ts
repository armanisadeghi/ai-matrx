/**
 * Surface manifest — Knowledge Repositories (`matrx-user/knowledge-repositories`).
 *
 * `/knowledge/repositories` lists the caller's code repositories and their
 * indexing coverage. Its direct RPC is caller-scoped, and `?repo=` names the
 * row currently focused in the table.
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
    key: "repository_list",
    label: "Repository list",
    sortOrder: 100,
    description:
      "The caller-scoped repository rows returned by the table source.",
  },
  {
    key: "selected_repository",
    label: "Focused repository",
    sortOrder: 200,
    description: "The repository selected by the route's `?repo` deep link.",
  },
  {
    key: "indexing",
    label: "Indexing state",
    sortOrder: 300,
    description:
      "The one repository this browser is currently sending to indexing, if any.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "repository_list_status",
    label: "Repository list status",
    description:
      '"loading", "loaded", "empty", or "error" for the caller-scoped repository RPC. Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 7,
    group: "repository_list",
    sortOrder: 300,
  },
  {
    name: "repository_list_error",
    label: "Repository list error",
    description:
      "The RPC error shown by the page. Absent unless the repository list failed to load.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 180,
    group: "repository_list",
    sortOrder: 305,
  },
  {
    name: "source_scoped_repository_count",
    label: "Source-scoped repository count",
    description:
      "Number of repository rows returned by `code.fn_list_repositories` for this caller. Always present after the page mounts; 0 when none are visible or while the initial request is in flight.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    group: "repository_list",
    sortOrder: 310,
  },
  {
    name: "repositories",
    label: "Visible repositories",
    description:
      "Repository summaries currently returned by the caller-scoped RPC: id, name, git URL and branch, sync status, file counts, and last sync time. Always present as an empty array until the RPC settles or when none are visible; bind deliberately because the list can be large.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 3200,
    autoContext: false,
    group: "repository_list",
    sortOrder: 315,
  },
  {
    name: "unattached_file_count",
    label: "Unattached file count",
    description:
      "Caller-visible code files that are not bound to a repository. Always present after the page mounts; 0 when every visible code file is attached or while the initial request is in flight.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    group: "repository_list",
    sortOrder: 320,
  },
  {
    name: "selected_repository_id",
    label: "Selected repository ID",
    description:
      "Repository UUID from `?repo` in the route. Present even before the list settles; it may not resolve when the row was deleted or is outside the caller's scope.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "selected_repository",
    sortOrder: 330,
  },
  {
    name: "selected_repository",
    label: "Selected repository",
    description:
      "Summary for the `?repo` row when it exists in the caller-scoped list, including its index coverage. Absent when no repository is selected or the deep link cannot resolve.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 360,
    group: "selected_repository",
    sortOrder: 335,
  },
  {
    name: "indexing_state",
    label: "Indexing state",
    description:
      '"idle" when no request is running, or "indexing" while this browser is indexing one repository. Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    group: "indexing",
    sortOrder: 340,
  },
  {
    name: "indexing_repository_id",
    label: "Indexing repository ID",
    description:
      "Repository UUID currently being indexed by this browser. Absent while indexing is idle.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "indexing",
    sortOrder: 345,
  },
];

export const knowledgeRepositoriesManifest: SurfaceManifest = {
  surfaceName: "matrx-user/knowledge-repositories",
  label: "Knowledge Repositories",
  readiness: "partial",
  readinessNote:
    "The manifest and read-only runtime describe the live repository list, deep link, file rollup, and in-flight indexing state. It has not yet been independently certified or synced to the database mirror.",
  urlPattern: "/knowledge/repositories",
  intro: `<surface_intro>
This is the repository list for Knowledge indexing. The table is populated by a
caller-scoped repository source, so repositories is the visible inventory for
this person rather than a platform-wide catalogue. source_scoped_repository_count
states how many rows that source returned, and unattached_file_count identifies
code files that have not been assigned to any repository.

When a URL includes ?repo=, selected_repository_id is the requested identity and
selected_repository is populated only if that row remains in the caller's list.
Repository records describe source and indexing coverage; they do not contain
file bodies. indexing_state and indexing_repository_id describe an in-flight
browser request only. This surface declares no agent write target.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
};

export interface KnowledgeRepositoryEntry {
  repository_id: string | null;
  name: string;
  git_url: string | null;
  git_branch: string | null;
  sync_status: string | null;
  file_count: number;
  indexed_file_count: number;
  last_synced_at: string | null;
}

export function createKnowledgeRepositoriesScope(values: {
  selection?: string;
  content?: string;
  context?: Record<string, unknown>;
  repository_list_status: string;
  repository_list_error?: string;
  source_scoped_repository_count: number;
  repositories: KnowledgeRepositoryEntry[];
  unattached_file_count: number;
  selected_repository_id?: string;
  selected_repository?: KnowledgeRepositoryEntry;
  indexing_state: string;
  indexing_repository_id?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
