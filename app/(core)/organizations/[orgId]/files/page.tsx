"use client";

import React from "react";
import { useParams } from "next/navigation";
import { FolderOpen, Loader2 } from "lucide-react";
import { OrgResourceLayout } from "../OrgResourceLayout";
import { OrgResourceList } from "@/features/organizations/components/OrgResourceList";
import { supabase } from "@/utils/supabase/client";
import { filesDb } from "@/features/files/filesDb";
import { getOrganizationBySlugOrId } from "@/features/organizations/service";

const SELECT_COLS = "id, file_name, mime_type, size_bytes, updated_at";

const fetchOwned = async (orgId: string) => {
  const res = await filesDb(supabase)
    .from("files")
    .select(SELECT_COLS)
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
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

const getHref = (id: string) => `/files/f/${id}`;

export default function OrgFilesPage() {
  const params = useParams();
  const orgIdParam = params.orgId as string;
  const [resolvedOrgId, setResolvedOrgId] = React.useState<string | null>(null);

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
      icon={<FolderOpen className="h-4 w-4" />}
    >
      {!resolvedOrgId ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <OrgResourceList
          orgId={resolvedOrgId}
          // Canonical permissions key after the 2026 file-system
          // canonicalization (was `cld_files`). Owned rows hydrate via
          // `ownedQuery` (filesDb → files.files); `tableName` is the
          // `permissions.resource_type` join key.
          resourceType="file"
          tableName="file"
          selectColumns={SELECT_COLS}
          ownedQuery={fetchOwned}
          mapRow={mapRow}
          getHref={getHref}
          emptyTitle="No shared files yet"
          emptyDescription="Files uploaded under this organization will appear here, along with files other members share."
          emptyIcon={<FolderOpen className="h-8 w-8 text-blue-600 dark:text-blue-400" />}
        />
      )}
    </OrgResourceLayout>
  );
}
