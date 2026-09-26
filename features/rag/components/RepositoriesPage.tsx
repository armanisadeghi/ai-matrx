"use client";

/**
 * /knowledge/repositories — code repositories you can index for Knowledge.
 *
 * Lists every code.code_repositories row owned by the caller, with
 * file counts (total vs already-indexed) and a one-click "Index" button
 * that walks every code_file in the repo through ingest_source().
 *
 * The LIST is direct-to-Supabase (`code.fn_list_repositories`, identity from
 * auth.uid() only) — pure DB read, no processing. Index stays on Python —
 * genuine background work.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Code2,
  Database,
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { RAG_VOCAB } from "@/features/rag/constants/vocabulary";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RagHubHeader } from "@/features/rag/components/shell/RagHubHeader";
import { Skeleton } from "@ai-matrx/design-system";
import {
  MatrxDataTable,
  type MatrxColumnDef,
} from "@ai-matrx/design-system/data-table";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { postJson } from "@/lib/python-client";
import { createClient } from "@/utils/supabase/client";
import { codeDb } from "@/utils/supabase/codeDb";
import type { components } from "@/types/python-generated/api-types";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { buildKnowledgeRepositoriesContextData } from "@/features/rag/agent-context/buildKnowledgeRepositoriesContextData";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

const KNOWLEDGE_REPOSITORIES_SURFACE = "matrx-user/knowledge-repositories";

// Index-response shape — DERIVED from the generated contract (never hand-mirrored).
type ApiIndexResponse = components["schemas"]["IndexRepositoryResponse"];

// List shape comes from `code.fn_list_repositories` (jsonb) — same field
// names as the retired RepositorySummary contract.
interface ApiRepo {
  repository_id: string | null;
  name: string;
  git_url: string | null;
  git_branch: string | null;
  sync_status: string | null;
  file_count: number;
  indexed_file_count: number;
  last_synced_at: string | null;
}

interface RpcReposResponse {
  repositories: ApiRepo[];
  unattached_files: number;
}

function isFullyIndexed(repo: ApiRepo) {
  return repo.file_count > 0 && repo.indexed_file_count >= repo.file_count;
}

const repositoryColumns = (
  focusedId: string | null,
): MatrxColumnDef<ApiRepo>[] => [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    label: "Name",
    sortValue: (repo) => repo.name,
    filterValue: (repo) => repo.name,
    width: 220,
    cell: (repo) =>
      repo.repository_id ? (
        <Link
          href={`/knowledge/repositories?repo=${encodeURIComponent(repo.repository_id)}`}
          className="block truncate font-medium hover:underline focus-visible:underline"
          title={repo.name}
          aria-current={
            repo.repository_id === focusedId ? "location" : undefined
          }
        >
          {repo.name}
        </Link>
      ) : (
        <span className="block truncate font-medium" title={repo.name}>
          {repo.name}
        </span>
      ),
  },
  {
    id: "git_url",
    accessorKey: "git_url",
    header: "URL",
    label: "URL",
    sortValue: (repo) => repo.git_url ?? "",
    filterValue: (repo) => repo.git_url ?? "",
    width: 360,
    cell: (repo) =>
      repo.git_url ? (
        <span
          className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground"
          title={repo.git_url}
        >
          <ExternalLink className="h-3 w-3 shrink-0" />
          <span className="whitespace-nowrap">{repo.git_url}</span>
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    id: "git_branch",
    accessorKey: "git_branch",
    header: "Branch",
    label: "Branch",
    sortValue: (repo) => repo.git_branch ?? "",
    filterValue: (repo) => repo.git_branch ?? "",
    width: 140,
    cell: (repo) =>
      repo.git_branch ? (
        <code
          className="block whitespace-nowrap rounded bg-muted/50 px-1.5 py-0.5 text-xs"
          title={repo.git_branch}
        >
          {repo.git_branch}
        </code>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    id: "file_count",
    accessorKey: "file_count",
    header: "Files",
    label: "Files",
    sortValue: (repo) => repo.file_count,
    filterValue: (repo) => repo.file_count,
    filter: "number",
    align: "right",
    width: 88,
    cell: (repo) => <span className="tabular-nums">{repo.file_count}</span>,
  },
  {
    id: "indexed_file_count",
    accessorKey: "indexed_file_count",
    header: "Indexed",
    label: "Indexed",
    sortValue: (repo) => repo.indexed_file_count,
    filterValue: (repo) => repo.indexed_file_count,
    filter: "number",
    align: "right",
    width: 112,
    cell: (repo) => {
      const fullyIndexed = isFullyIndexed(repo);
      const partial =
        repo.indexed_file_count > 0 &&
        repo.indexed_file_count < repo.file_count;
      return fullyIndexed ? (
        <Badge variant="success" className="gap-1">
          <CheckCircle2 className="h-3 w-3" />
          {repo.indexed_file_count}
        </Badge>
      ) : partial ? (
        <Badge variant="warning">
          {repo.indexed_file_count} / {repo.file_count}
        </Badge>
      ) : (
        <Badge variant="outline">0</Badge>
      );
    },
  },
  {
    id: "last_synced_at",
    accessorKey: "last_synced_at",
    header: "Last sync",
    label: "Last sync",
    sortValue: (repo) => repo.last_synced_at ?? "",
    filterValue: (repo) => repo.last_synced_at ?? "",
    filter: "date",
    width: 180,
    cell: (repo) => (
      <span
        className="block truncate text-xs text-muted-foreground"
        title={
          repo.last_synced_at
            ? new Date(repo.last_synced_at).toLocaleString()
            : "never"
        }
      >
        {repo.last_synced_at
          ? new Date(repo.last_synced_at).toLocaleString()
          : "never"}
      </span>
    ),
  },
];

export function RepositoriesPage() {
  const router = useRouter();
  const userId = useAppSelector(selectUserId);
  // `?repo=<id>` is THE deep link to one code.code_repositories row — what
  // `entityRegistry.code_repository.hrefFor` emits. This page is the only
  // surface over that table, so "open this repository" means "land on this
  // page with its row highlighted and scrolled into view".
  const searchParams = useSearchParams();
  const focusRepoId = searchParams?.get("repo") ?? null;
  const [repos, setRepos] = useState<ApiRepo[]>([]);
  const [unattached, setUnattached] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [indexingId, setIndexingId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const supabase = createClient();
      const { data, error: rpcError } = await codeDb(supabase).rpc(
        "fn_list_repositories",
      );
      if (cancelled) return;
      if (rpcError) {
        setError(rpcError.message ?? "Failed to load repositories");
        setLoading(false);
        return;
      }
      const resp = data as unknown as RpcReposResponse | null;
      setRepos(Array.isArray(resp?.repositories) ? resp.repositories : []);
      setUnattached(
        typeof resp?.unattached_files === "number" ? resp.unattached_files : 0,
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, refreshKey]);

  useEffect(() => {
    if (focusRepoId) {
      const row = document.querySelector<HTMLTableRowElement>(
        `tr[data-row-id="${CSS.escape(focusRepoId)}"]`,
      );
      row?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [focusRepoId, repos]);

  // A deep-linked repository that isn't in the list is the honest failure
  // case: `fn_list_repositories` is scoped to the caller, so the row was
  // deleted or belongs to someone else. Say so instead of silently showing an
  // unhighlighted list that looks like the link worked.
  const focusMissing =
    Boolean(focusRepoId) &&
    !loading &&
    !error &&
    !repos.some((r) => r.repository_id === focusRepoId);

  const indexRepo = async (id: string, force = false) => {
    setIndexingId(id);
    try {
      // Left on the raw client: the endpoint declares NO request body
      // (`requestBody: never`) yet the call sends an empty `{}` body, and carries
      // a `force` query param — apiPost takes no query option and would send no
      // body. Routing it would change the exact wire. Response type is DERIVED
      // from the contract (`IndexRepositoryResponse`) so a rename still fails here.
      const params = force ? "?force=true" : "";
      const { data } = await postJson<ApiIndexResponse, Record<string, never>>(
        `/knowledge/repositories/${id}/index${params}`,
        {} as Record<string, never>,
      );
      const errs = data?.errors ?? [];
      if (errs.length > 0) {
        toast.warning(
          `Indexed ${data?.files_processed ?? 0} files (${errs.length} errors)`,
        );
      } else {
        toast.success(
          `Indexed ${data?.files_processed ?? 0} files · ${data?.chunks_written ?? 0} ${RAG_VOCAB.segmentsShort.toLowerCase()} · ${data?.embeddings_written ?? 0} embeddings`,
        );
      }
      setRefreshKey((n) => n + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Indexing failed");
    } finally {
      setIndexingId(null);
    }
  };

  const getScope = () =>
    buildKnowledgeRepositoriesContextData({
      repositories: repos,
      loading,
      error,
      selectedRepositoryId: focusRepoId,
      unattachedFileCount: unattached,
      indexingRepositoryId: indexingId,
    });

  return (
    <SurfaceRuntimeProvider
      surfaceName={KNOWLEDGE_REPOSITORIES_SURFACE}
      getScope={getScope}
      isEditable={false}
    >
      <RagHubHeader />
      <div className="flex flex-col h-full overflow-hidden bg-background pt-[var(--shell-header-h)]">
        {focusMissing && (
          <div className="mx-6 mb-2 shrink-0 rounded-md border border-warning/50 bg-warning/5 p-3 text-sm">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <span className="text-muted-foreground">
                The repository you followed a link to isn&apos;t in your list —
                it may have been deleted, or it belongs to someone who
                hasn&apos;t shared it with you.
              </span>
            </div>
          </div>
        )}

        {unattached > 0 && (
          <div className="px-6 pb-2 text-xs text-muted-foreground shrink-0">
            <Badge variant="warning" className="mr-2">
              {unattached}
            </Badge>
            code files exist that aren't bound to any repository yet.
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-auto">
          {error && (
            <div className="m-6 p-4 border border-destructive/50 bg-destructive/5 rounded-md text-sm text-destructive">
              <strong>Could not load repositories:</strong> {error}
              <ErrorAlchemyMenu error={error} />
            </div>
          )}

          {loading && repos.length === 0 ? (
            <div className="p-6 space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <MatrxDataTable<ApiRepo>
              data={repos}
              columns={repositoryColumns(focusRepoId)}
              getRowId={(repo) => repo.repository_id ?? repo.name}
              getRowHref={(repo) =>
                repo.repository_id
                  ? `/knowledge/repositories?repo=${encodeURIComponent(repo.repository_id)}`
                  : undefined
              }
              onRowOpen={(repo) => {
                if (repo.repository_id)
                  router.push(
                    `/knowledge/repositories?repo=${encodeURIComponent(repo.repository_id)}`,
                  );
              }}
              detail={{ enabled: false }}
              density="condensed"
              pageSize={0}
              isFetching={loading && repos.length > 0}
              rowClassName={(repo) =>
                repo.repository_id === focusRepoId
                  ? "bg-accent ring-1 ring-inset ring-primary/40"
                  : undefined
              }
              rowActions={(repo) => {
                const fullyIndexed = isFullyIndexed(repo);
                return (
                  <Button
                    size="sm"
                    variant={fullyIndexed ? "outline" : "default"}
                    onClick={() =>
                      repo.repository_id &&
                      indexRepo(repo.repository_id, fullyIndexed)
                    }
                    disabled={
                      !repo.repository_id ||
                      indexingId === repo.repository_id ||
                      repo.file_count === 0
                    }
                  >
                    {indexingId === repo.repository_id ? (
                      <>
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        Indexing…
                      </>
                    ) : fullyIndexed ? (
                      <>
                        <RefreshCw className="mr-1 h-3 w-3" />
                        Re-index
                      </>
                    ) : (
                      <>
                        <Database className="mr-1 h-3 w-3" />
                        Index
                      </>
                    )}
                  </Button>
                );
              }}
              toolbar={{
                title: "Repositories",
                search: true,
                searchPlaceholder: "Search name, URL, branch, or sync…",
                refresh: { onRefresh: () => setRefreshKey((n) => n + 1) },
              }}
              emptyState={{
                icon: <Code2 className="h-12 w-12 text-muted-foreground/50" />,
                title: "No repositories yet",
                description:
                  "Repositories live in code.code_repositories. Once you create one and bind code files to it (via code_files.metadata.repository_id), it will appear here ready to index.",
                action: (
                  <Link href="/sandbox" className="text-sm underline">
                    Open a sandbox to create one
                  </Link>
                ),
              }}
            />
          )}
        </div>
      </div>
    </SurfaceRuntimeProvider>
  );
}
