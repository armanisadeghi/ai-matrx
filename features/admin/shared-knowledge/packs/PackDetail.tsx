"use client";

// features/admin/shared-knowledge/packs/PackDetail.tsx
//
// One pack: header (name · industry · status · version · subscribers), the
// lifecycle actions (Propose → Ratify → Publish · New version · Retire), and the
// segmented sections — Overview · Rules · Topics · Bands & geo · Guidelines.
// Every write is one of the seo.starter_pack_* authoring RPCs; publishing is
// the generic LibraryPublishPanel over platform.entity_grants.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Archive,
  BadgeCheck,
  BookOpenText,
  ChevronDown,
  GitBranchPlus,
  Layers,
  ListChecks,
  Loader2,
  MapPinned,
  Send,
  TreePine,
  Undo2,
  Users,
} from "lucide-react";
import { cn } from "@/styles/themes/utils";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { LibraryPublishPanel } from "@/features/rag/components/library/LibraryPublishPanel";
import type { SharedKnowledgeDirectory } from "../types";
import {
  adminPackDetailQueryKey,
  adminPacksQueryKey,
  fetchAdminPackDetail,
  newPackVersion,
  setPackStatus,
  PACK_STATUS_META,
  type PackStatus,
} from "./data";
import { PackOverview } from "./PackOverview";
import { PackRulesSection } from "./PackRulesSection";
import { PackTopicsSection } from "./PackTopicsSection";
import { PackBandsSection } from "./PackBandsSection";
import { PackGuidelinesSection } from "./PackGuidelinesSection";

export function PackDetail({
  packId,
  directory,
  onSelectPack,
}: {
  packId: string;
  /**
   * The admin console's directory. Optional so this ONE editor also serves the curator
   * front door (`/knowledge/library-curate`), which has no admin reads: without it the
   * publish panel — an admin-only action anyway — is simply not mounted.
   */
  directory?: SharedKnowledgeDirectory;
  onSelectPack: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: adminPackDetailQueryKey(packId),
    queryFn: ({ signal }) => fetchAdminPackDetail(packId, signal),
  });
  const [publishOpen, setPublishOpen] = useState(false);
  const [ratifyOpen, setRatifyOpen] = useState(false);
  const [ratifyNotes, setRatifyNotes] = useState("");
  const [retireOpen, setRetireOpen] = useState(false);
  // Publishing writes grants, not the pack row — the Overview's audience list reads
  // grants through its own hook, so a publish/revoke bumps this to refresh it.
  const [grantsBump, setGrantsBump] = useState(0);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: adminPackDetailQueryKey(packId) }),
      queryClient.invalidateQueries({ queryKey: adminPacksQueryKey }),
    ]);
  };

  const status = useMutation({
    mutationFn: ({ to, notes }: { to: PackStatus; notes?: string }) => setPackStatus(packId, to, notes),
    onSuccess: async (_row, vars) => {
      toast.success(
        vars.to === "ratified"
          ? "Pack ratified — it can now be published to its industry."
          : vars.to === "proposed"
            ? "Submitted for ratification."
            : vars.to === "retired"
              ? "Pack retired. Industry and global audiences were withdrawn; adopted sites keep their rows."
              : "Back to draft.",
      );
      setRatifyOpen(false);
      setRetireOpen(false);
      setRatifyNotes("");
      await invalidate();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const fork = useMutation({
    mutationFn: () => newPackVersion(packId),
    onSuccess: async (created) => {
      toast.success(`New draft “${created.slug}” cloned from v${detail.data?.pack.pack_version ?? "?"}.`);
      await invalidate();
      onSelectPack(created.id);
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  if (detail.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (detail.isError || !detail.data) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        {detail.isError ? extractErrorMessage(detail.error) : "This pack could not be loaded."}
      </div>
    );
  }

  const { pack } = detail.data;
  const meta = PACK_STATUS_META[(pack.status as PackStatus) ?? "draft"] ?? PACK_STATUS_META.draft;
  const canAuthor = pack.can_author;
  const isAdmin = pack.is_admin;
  const busy = status.isPending || fork.isPending;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border pb-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-semibold text-foreground">{pack.name}</h2>
            <Badge variant="outline" className={cn("text-[10px]", meta.tone)} title={meta.hint}>
              {meta.label}
            </Badge>
            <span className="text-xs tabular-nums text-muted-foreground">v{pack.pack_version}</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {pack.industry_name ?? (pack.industry_id ? "Industry" : "Every industry (platform defaults)")}
            {" · "}
            <span className="inline-flex items-center gap-1">
              <Users className="size-3" aria-hidden />
              {pack.subscriber_count} subscribed
            </span>
            {" · "}
            <span className="inline-flex items-center gap-1">
              <ListChecks className="size-3" aria-hidden />
              {detail.data.rules.length}
            </span>
            {" "}
            <span className="inline-flex items-center gap-1">
              <TreePine className="size-3" aria-hidden />
              {detail.data.topics.length}
            </span>
            {" "}
            <span className="inline-flex items-center gap-1">
              <Layers className="size-3" aria-hidden />
              {detail.data.value_bands.length + detail.data.geo_bands.length}
            </span>
            {" "}
            <span className="inline-flex items-center gap-1">
              <MapPinned className="size-3" aria-hidden />
              {detail.data.geo_areas.length}
            </span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {pack.status === "draft" && canAuthor ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => status.mutate({ to: "proposed" })}>
              {busy ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Send className="mr-1 size-3.5" />}
              Submit for ratification
            </Button>
          ) : null}
          {pack.status === "proposed" && isAdmin ? (
            <Button size="sm" disabled={busy} onClick={() => setRatifyOpen(true)}>
              <BadgeCheck className="mr-1 size-3.5" /> Ratify
            </Button>
          ) : null}
          {isAdmin && directory && pack.status !== "draft" ? (
            <Button size="sm" variant={pack.status === "ratified" ? "default" : "outline"} onClick={() => setPublishOpen(true)}>
              <Send className="mr-1 size-3.5" /> Publish
            </Button>
          ) : null}
          {(isAdmin || canAuthor) ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="px-2" aria-label="More actions">
                  <ChevronDown className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => fork.mutate()} disabled={busy}>
                  <GitBranchPlus className="mr-2 size-3.5" /> New version (clone as draft)
                </DropdownMenuItem>
                {isAdmin && pack.status === "proposed" ? (
                  <DropdownMenuItem onClick={() => status.mutate({ to: "draft" })} disabled={busy}>
                    <Undo2 className="mr-2 size-3.5" /> Send back to draft
                  </DropdownMenuItem>
                ) : null}
                {isAdmin && pack.status === "retired" ? (
                  <DropdownMenuItem onClick={() => status.mutate({ to: "draft" })} disabled={busy}>
                    <Undo2 className="mr-2 size-3.5" /> Reopen as draft
                  </DropdownMenuItem>
                ) : null}
                {isAdmin && pack.status !== "retired" ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setRetireOpen(true)}
                      disabled={busy}
                    >
                      <Archive className="mr-2 size-3.5" /> Retire pack
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>

      {/* Sections */}
      <Tabs defaultValue="overview" className="mt-2 flex min-h-0 flex-1 flex-col">
        <TabsList className="h-auto w-fit max-w-full overflow-x-auto">
          <TabsTrigger value="overview" className="px-2.5 py-1.5 text-xs">
            Overview
          </TabsTrigger>
          <TabsTrigger value="rules" className="px-2.5 py-1.5 text-xs">
            <ListChecks className="mr-1 size-3.5" /> Rules {detail.data.rules.length}
          </TabsTrigger>
          <TabsTrigger value="topics" className="px-2.5 py-1.5 text-xs">
            <TreePine className="mr-1 size-3.5" /> Topics {detail.data.topics.length}
          </TabsTrigger>
          <TabsTrigger value="bands" className="px-2.5 py-1.5 text-xs">
            <Layers className="mr-1 size-3.5" /> Bands & geo
          </TabsTrigger>
          <TabsTrigger value="guidelines" className="px-2.5 py-1.5 text-xs">
            <BookOpenText className="mr-1 size-3.5" /> Guidelines
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="min-h-0 flex-1 overflow-y-auto pt-3">
          <PackOverview detail={detail.data} directory={directory} onChanged={invalidate} onSelectPack={onSelectPack} grantsBump={grantsBump} />
        </TabsContent>
        <TabsContent value="rules" className="min-h-0 flex-1 overflow-y-auto pt-3">
          <PackRulesSection detail={detail.data} onChanged={invalidate} />
        </TabsContent>
        <TabsContent value="topics" className="min-h-0 flex-1 overflow-y-auto pt-3">
          <PackTopicsSection detail={detail.data} onChanged={invalidate} />
        </TabsContent>
        <TabsContent value="bands" className="min-h-0 flex-1 overflow-y-auto pt-3">
          <PackBandsSection detail={detail.data} onChanged={invalidate} />
        </TabsContent>
        <TabsContent value="guidelines" className="min-h-0 flex-1 overflow-y-auto pt-3">
          <PackGuidelinesSection detail={detail.data} onChanged={invalidate} />
        </TabsContent>
      </Tabs>

      {directory ? (
      <LibraryPublishPanel
        isOpen={publishOpen}
        onClose={() => setPublishOpen(false)}
        entityType="seo_starter_pack"
        entityId={packId}
        entityName={pack.name}
        recipientHint="Organizations in the audience can adopt this pack onto their sites — every row becomes their own starting position. Industry and Everyone need a ratified pack; Organization is the pilot lane."
        organizationOptions={directory.organizations
          .filter((o) => !o.is_personal)
          .map((o) => ({ id: o.id, name: o.name }))
          .sort((a, b) => a.name.localeCompare(b.name))}
        onChanged={() => {
          setGrantsBump((b) => b + 1);
          void invalidate();
        }}
      />
      ) : null}

      <ConfirmDialog
        open={ratifyOpen}
        onOpenChange={(o) => !o && setRatifyOpen(false)}
        title={`Ratify “${pack.name}”?`}
        description="You are signing off these defaults as a domain expert. Ratified packs can be published to an industry or to everyone; every later edit bumps the version and adopted sites see what changed."
        content={
          <Textarea
            value={ratifyNotes}
            onChange={(e) => setRatifyNotes(e.target.value)}
            placeholder="Ratification notes (what you checked, what you changed, what stays open)…"
            className="min-h-24 text-sm"
          />
        }
        confirmLabel="Ratify"
        busy={status.isPending}
        onConfirm={() => status.mutate({ to: "ratified", notes: ratifyNotes.trim() || undefined })}
      />

      <ConfirmDialog
        open={retireOpen}
        onOpenChange={(o) => !o && setRetireOpen(false)}
        title={`Retire “${pack.name}”?`}
        description="Its industry and global audiences are withdrawn immediately; organizations that already adopted it keep every row (those are theirs). Pilot grants stay so the record of who used it survives."
        variant="destructive"
        confirmLabel="Retire"
        busy={status.isPending}
        onConfirm={() => status.mutate({ to: "retired" })}
      />
    </div>
  );
}
