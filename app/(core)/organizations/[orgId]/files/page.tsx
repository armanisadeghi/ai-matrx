"use client";

import React from "react";
import { useParams } from "next/navigation";
import { FolderOpen, Loader2 } from "lucide-react";
import { OrgResourceLayout } from "../OrgResourceLayout";
import { OrgResourceList } from "@/features/organizations/components/OrgResourceList";
import { supabase } from "@/utils/supabase/client";
import { getOrganizationBySlugOrId } from "@/features/organizations/service";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";

const SELECT_COLS = "id, file_name, mime_type, size_bytes, updated_at";

// Org file LIST must apply the enumeration predicate (iam.is_discoverable)
// independently — a bare `.from("files")` multi-row read is authorized only by
// the conveyance-INCLUSIVE `files.files` RLS (created_by OR has_access), which
// leaks chat-conveyed private files into the list. Route through the SECURITY
// DEFINER RPC (mirrors the narrowed get_user_file_tree; migration 0177 family)
// so owner + directly-shared files still appear but chat-conveyed ones drop out.
// Curried so the current user id is baked into the `(orgId) => rows` closure
// that OrgResourceList expects.
const makeFetchOwned =
  (userId: string) => async (orgId: string) => {
    const res = await supabase.rpc("get_org_file_list", {
      p_user_id: userId,
      p_org_id: orgId,
    });
    if (res.error) throw res.error;
    return (res.data ?? []) as Array<Record<string, unknown>>;
  };

const mapRow = (row: Record<string, unknown>, source: "owned" | "shared") => {
  const size = row.size_bytes as number | null | undefined;
  const sizeStr =
    size && size > 0
      ? size > 1024 * 1024
        ? `${(size / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.max(1, Math.round(size / 1024))} KB`
      : null;
  return {
    id: String(row.id),
    title: (row.file_name as string | null) ?? "Untitled",
    subtitle: [row.mime_type as string | null, sizeStr]
      .filter(Boolean)
      .join(" · "),
    updatedAt: (row.updated_at as string | null) ?? null,
    source,
  };
};


export default function OrgFilesPage() {
  const params = useParams();
  const orgIdParam = params.orgId as string;
  const userId = useAppSelector(selectUserId);
  const [resolvedOrgId, setResolvedOrgId] = React.useState<string | null>(null);
  const ownedQuery = userId ? makeFetchOwned(userId) : null;

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const org = await getOrganizationBySlugOrId(orgIdParam);
      if (!cancelled && org) setResolvedOrgId(org.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgIdParam]);

  return (
    <OrgResourceLayout
      resourceName="Files"
    >
      {!resolvedOrgId ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <OrgResourceList
          orgId={resolvedOrgId}
          // Canonical permissions key after the 2026 file-system
          // canonicalization (was `cld_files`). Owned/discoverable rows hydrate
          // via `ownedQuery` (get_org_file_list RPC → is_discoverable-gated);
          // `tableName` is the `permissions.resource_type` join key.
          resourceType="file"
          tableName="file"
          selectColumns={SELECT_COLS}
          ownedQuery={ownedQuery}
          mapRow={mapRow}
          emptyTitle="No shared files yet"
          emptyDescription="Files uploaded under this organization will appear here, along with files other members share."
          emptyIcon={<FolderOpen className="h-8 w-8 text-blue-600 dark:text-blue-400" />}
        />
      )}
    </OrgResourceLayout>
  );
}
