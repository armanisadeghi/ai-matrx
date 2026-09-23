/** Maps the live Knowledge repository list state to its declared surface scope. */

import {
  createKnowledgeRepositoriesScope,
  type KnowledgeRepositoryEntry,
} from "@/features/surfaces/manifests/knowledge-repositories.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";

const CONTENT_CHARS = 6000;

export interface BuildKnowledgeRepositoriesContextDataArgs {
  repositories?: readonly KnowledgeRepositoryEntry[];
  loading?: boolean;
  error?: string | null;
  selectedRepositoryId?: string | null;
  unattachedFileCount?: number;
  indexingRepositoryId?: string | null;
}

function repositoriesText(
  repositories: readonly KnowledgeRepositoryEntry[],
): string {
  return repositories
    .map(
      (repository) =>
        `${repository.name} · ${repository.git_branch ?? "no branch"} · ${repository.indexed_file_count}/${repository.file_count} indexed${repository.sync_status ? ` · ${repository.sync_status}` : ""}`,
    )
    .join("\n")
    .slice(0, CONTENT_CHARS);
}

export function buildKnowledgeRepositoriesContextData(
  args: BuildKnowledgeRepositoriesContextDataArgs,
): SurfaceScopePayload {
  const {
    repositories = [],
    loading = false,
    error = null,
    selectedRepositoryId = null,
    unattachedFileCount = 0,
    indexingRepositoryId = null,
  } = args;
  const selectedRepository = selectedRepositoryId
    ? repositories.find(
        (repository) => repository.repository_id === selectedRepositoryId,
      )
    : undefined;
  const repositoryListStatus = error
    ? "error"
    : loading
      ? "loading"
      : repositories.length === 0
        ? "empty"
        : "loaded";

  return createKnowledgeRepositoriesScope({
    content: repositoriesText(repositories) || undefined,
    context: {
      surface: "knowledge-repositories",
      source_scoped_repository_count: repositories.length,
      selected_repository_id: selectedRepositoryId ?? undefined,
      indexing_repository_id: indexingRepositoryId ?? undefined,
      unattached_file_count: unattachedFileCount,
    },
    repository_list_status: repositoryListStatus,
    repository_list_error: error ?? undefined,
    source_scoped_repository_count: repositories.length,
    repositories: [...repositories],
    unattached_file_count: unattachedFileCount,
    selected_repository_id: selectedRepositoryId ?? undefined,
    selected_repository: selectedRepository,
    indexing_state: indexingRepositoryId ? "indexing" : "idle",
    indexing_repository_id: indexingRepositoryId ?? undefined,
  });
}
