"use client";

/**
 * /rag/repositories — code repositories you can index for RAG.
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
import { TapTargetButton } from "@/components/icons/TapTargetButton";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { postJson } from "@/lib/python-client";
import { createClient } from "@/utils/supabase/client";
import { codeDb } from "@/utils/supabase/codeDb";
import type { components } from "@/types/python-generated/api-types";

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

export function RepositoriesPage() {
  const userId = useAppSelector(selectUserId);
  const [repos, setRepos] = useState<ApiRepo[]>([]);
  const [unattached, setUnattached] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [indexingId, setIndexingId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
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
        `/rag/repositories/${id}/index${params}`,
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

  return (
    <>
      <RagHubHeader
        right={
          <TapTargetButton
            icon={<RefreshCw className="h-4 w-4" />}
            ariaLabel="Refresh"
            onClick={() => setRefreshKey((n) => n + 1)}
          />
        }
      />
      <div className="flex flex-col h-full overflow-hidden bg-background pt-[var(--shell-header-h)]">
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
          </div>
        )}

        {loading && repos.length === 0 ? (
          <div className="p-6 space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : repos.length === 0 && !error ? (
          <EmptyState />
        ) : (
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead>Repository</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead className="text-right">Files</TableHead>
                <TableHead className="text-right">Indexed</TableHead>
                <TableHead>Last sync</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {repos.map((r) => {
                const fullyIndexed =
                  r.file_count > 0 && r.indexed_file_count >= r.file_count;
                const partial =
                  r.indexed_file_count > 0 &&
                  r.indexed_file_count < r.file_count;
                return (
                  <TableRow key={r.repository_id ?? r.name}>
                    <TableCell>
                      <div className="font-medium">{r.name}</div>
                      {r.git_url && (
                        <div className="text-xs text-muted-foreground break-all flex items-center gap-1">
                          <ExternalLink className="h-3 w-3" />
                          {r.git_url}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.git_branch ? (
                        <code className="px-1.5 py-0.5 rounded bg-muted/50">
                          {r.git_branch}
                        </code>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.file_count}
                    </TableCell>
                    <TableCell className="text-right">
                      {fullyIndexed ? (
                        <Badge variant="success" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          {r.indexed_file_count}
                        </Badge>
                      ) : partial ? (
                        <Badge variant="warning">
                          {r.indexed_file_count} / {r.file_count}
                        </Badge>
                      ) : (
                        <Badge variant="outline">0</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {r.last_synced_at
                        ? new Date(r.last_synced_at).toLocaleString()
                        : "never"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant={fullyIndexed ? "outline" : "default"}
                        onClick={() =>
                          r.repository_id &&
                          indexRepo(r.repository_id, fullyIndexed)
                        }
                        disabled={
                          !r.repository_id ||
                          indexingId === r.repository_id ||
                          r.file_count === 0
                        }
                      >
                        {indexingId === r.repository_id ? (
                          <>
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            Indexing…
                          </>
                        ) : fullyIndexed ? (
                          <>
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Re-index
                          </>
                        ) : (
                          <>
                            <Database className="h-3 w-3 mr-1" />
                            Index
                          </>
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
      </div>
    </>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-20 px-6">
      <Code2 className="h-12 w-12 text-muted-foreground/50 mb-3" />
      <h3 className="text-lg font-medium">No repositories yet</h3>
      <p className="text-sm text-muted-foreground max-w-md mt-1">
        Repositories live in <code>code.code_repositories</code>. Once you
        create one and bind code files to it (via
        <code> code_files.metadata.repository_id</code>), it will appear here
        ready to index.
      </p>
      <p className="text-xs text-muted-foreground max-w-md mt-3">
        Don't have repos yet but have orphan code files?{" "}
        <a href="/sandbox" className="underline">
          Open a sandbox
        </a>{" "}
        to create one.
      </p>
    </div>
  );
}
