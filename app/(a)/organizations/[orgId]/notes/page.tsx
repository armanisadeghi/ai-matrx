"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { LuNotepadText } from "react-icons/lu";
import { Loader2 } from "lucide-react";
import { OrgResourceLayout } from "../OrgResourceLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/utils/supabase/client";
import { listOrgSharedResources } from "@/utils/permissions/orgResources";
import { getOrganizationBySlugOrId } from "@/features/organizations/service";
import { formatDistanceToNow } from "date-fns";

type NoteRow = {
  id: string;
  label: string | null;
  updated_at: string | null;
  organization_id: string | null;
  user_id: string | null;
  tags: string[] | null;
};

type NoteCardData = NoteRow & {
  source: "owned" | "shared";
};

/**
 * Organization Notes Page
 * Route: /organizations/[slug]/notes
 *
 * Lists notes either owned by this org (`notes.organization_id`) or explicitly
 * shared with this org via the `permissions` table.
 */
export default function OrgNotesPage() {
  const params = useParams();
  const router = useRouter();
  const orgIdParam = params.orgId as string;

  const [notes, setNotes] = React.useState<NoteCardData[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const org = await getOrganizationBySlugOrId(orgIdParam);
        if (!org) {
          setError("Organization not found");
          return;
        }
        const orgId = org.id;

        const ownedRes = await supabase
          .from("notes")
          .select("id, label, updated_at, organization_id, user_id, tags")
          .eq("organization_id", orgId)
          .order("updated_at", { ascending: false });
        const ownedRows = (ownedRes.data ?? []) as NoteRow[];

        const sharedRefs = await listOrgSharedResources(orgId, "note");
        const sharedIds = sharedRefs
          .map((r) => r.resourceId)
          .filter((id) => !ownedRows.some((n) => n.id === id));

        let sharedRows: NoteRow[] = [];
        if (sharedIds.length > 0) {
          const sharedRes = await supabase
            .from("notes")
            .select("id, label, updated_at, organization_id, user_id, tags")
            .in("id", sharedIds);
          sharedRows = (sharedRes.data ?? []) as NoteRow[];
        }

        if (cancelled) return;
        setNotes([
          ...ownedRows.map<NoteCardData>((n) => ({ ...n, source: "owned" })),
          ...sharedRows.map<NoteCardData>((n) => ({ ...n, source: "shared" })),
        ]);
      } catch (err) {
        if (!cancelled) {
          console.error("Error loading org notes:", err);
          setError("Failed to load notes");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgIdParam]);

  return (
    <OrgResourceLayout
      resourceName="Notes"
      icon={<LuNotepadText className="h-4 w-4" />}
    >
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </Card>
      ) : notes.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <LuNotepadText className="h-8 w-8 text-amber-600 dark:text-amber-400" />
          </div>
          <h2 className="text-xl font-semibold mb-2">No shared notes yet</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Notes you create with this organization as the context will appear
            here, along with notes other members share with this organization.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {notes.map((note) => (
            <button
              key={note.id}
              onClick={() => router.push(`/notes/${note.id}`)}
              className="text-left p-4 rounded-lg border bg-card hover:bg-accent/50 hover:border-primary/30 transition-all cursor-pointer flex flex-col gap-2"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-medium line-clamp-2 flex-1">
                  {note.label || "Untitled"}
                </h3>
                <Badge
                  variant={note.source === "owned" ? "secondary" : "outline"}
                  className="text-[10px] shrink-0"
                >
                  {note.source === "owned" ? "Org" : "Shared"}
                </Badge>
              </div>
              {note.tags && note.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {note.tags.slice(0, 3).map((t) => (
                    <Badge key={t} variant="outline" className="text-[10px]">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
              <div className="text-xs text-muted-foreground mt-auto">
                {note.updated_at
                  ? `Updated ${formatDistanceToNow(new Date(note.updated_at), { addSuffix: true })}`
                  : "Never updated"}
              </div>
            </button>
          ))}
        </div>
      )}
    </OrgResourceLayout>
  );
}
