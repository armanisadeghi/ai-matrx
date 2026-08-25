"use client";

/**
 * `/knowledge/library-curate` — THE CURATOR'S FRONT DOOR.
 *
 * An industry curator is an outside Subject Matter Expert (USER.md), not an admin:
 * `iam.industry_curators` grants them real authoring rights over their industry's
 * starter packs, but until this page the only surface exercising those rights was
 * `/administration/shared-knowledge`, which the `(admin)` layout redirects for anyone
 * without an `admin.admins` row. A curator could be granted and reach nothing.
 *
 * What a curator gets here: their industries, their industries' packs, a new draft, the
 * full editor, and Submit for ratification. What they do NOT get — Ratify, Publish,
 * industry creation (D5) — is already gated in the editor on `pack.is_admin`, which the
 * DB decides; this page adds no gate of its own and takes none away.
 *
 * THE EDITOR IS NOT FORKED. `features/admin/shared-knowledge/packs/PackDetail` and its
 * five sections are the ONE pack editor; they already branch on `pack.can_author` /
 * `pack.is_admin` from `seo.starter_pack_detail`, so a curator sees exactly their half.
 * The only change this surface needed was making the admin `directory` prop optional.
 * That matters beyond today: the keyword-intelligence convergence (phase C8) re-shapes
 * what a pack CARRIES — dimension values + matchers + worth. When C8 re-points those
 * section components, this surface follows for free.
 *
 * Selection lives in `?pack=<id>` so a pack is linkable and survives a refresh.
 */

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BadgeCheck,
  BookOpenText,
  ChevronRight,
  Layers,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { cn } from "@/styles/themes/utils";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { RagHubHeader } from "@/features/rag/components/shell/RagHubHeader";
import { useMyCuratorships, type Curatorship } from "@/features/rag/hooks/useMyCuratorships";
import { PackDetail } from "@/features/admin/shared-knowledge/packs/PackDetail";
import {
  adminPacksQueryKey,
  fetchAdminPackCatalog,
  savePack,
  PACK_STATUS_META,
  type PackStatus,
} from "@/features/admin/shared-knowledge/packs/data";
import type { StarterPackSummary } from "@/features/marketing/seo/value-system/types";

export function LibraryCuratePage() {
  const router = useRouter();
  const search = useSearchParams();
  const packId = search?.get("pack") ?? null;
  const queryClient = useQueryClient();

  const curatorships = useMyCuratorships();
  const packs = useQuery({
    queryKey: adminPacksQueryKey,
    queryFn: ({ signal }) => fetchAdminPackCatalog(signal),
    enabled: (curatorships.data?.length ?? 0) > 0,
  });

  const [query, setQuery] = useState("");
  const [newFor, setNewFor] = useState<Curatorship | null>(null);

  const select = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(search?.toString() ?? "");
      if (id) params.set("pack", id);
      else params.delete("pack");
      // Discrete selection — Back closes the pack the user just opened.
      router.push(`/knowledge/library-curate${params.size ? `?${params}` : ""}`, {
        scroll: false,
      });
    },
    [router, search],
  );

  const create = useMutation({
    mutationFn: async ({ name, industry }: { name: string; industry: Curatorship }) =>
      savePack({
        name,
        industry_id: industry.industryId,
        industry: industry.name,
        geo_model: "national",
      }),
    onSuccess: async (created) => {
      setNewFor(null);
      toast.success(`Draft “${created.name}” created. Nothing is shared until you submit it.`);
      await queryClient.invalidateQueries({ queryKey: adminPacksQueryKey });
      await queryClient.invalidateQueries({ queryKey: ["library", "my-curatorships"] });
      select(created.id);
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  /**
   * Only what this person curates. `seo.starter_pack_catalog` deliberately also returns
   * ratified packs the caller is merely ENTITLED to (their org's industry, a pilot, a
   * global grant) — those belong on the catalog, not in an authoring rail.
   */
  const mine = useMemo(() => {
    const industryIds = new Set((curatorships.data ?? []).map((c) => c.industryId));
    const rows = (packs.data ?? []).filter(
      (p) => p.industry_id !== null && industryIds.has(p.industry_id),
    );
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.summary ?? "").toLowerCase().includes(q) ||
        (p.industry ?? "").toLowerCase().includes(q),
    );
  }, [packs.data, curatorships.data, query]);

  const byIndustry = useMemo(() => {
    const map = new Map<string, StarterPackSummary[]>();
    for (const p of mine) {
      const key = p.industry_id as string;
      const list = map.get(key);
      if (list) list.push(p);
      else map.set(key, [p]);
    }
    return map;
  }, [mine]);

  const totalPacks = packs.data
    ? mine.length
    : (curatorships.data ?? []).reduce(
        (n, c) => n + c.draftCount + c.proposedCount + c.ratifiedCount,
        0,
      );

  // ── Gate: not a curator ────────────────────────────────────────────────────
  if (curatorships.isLoading) {
    return (
      <>
        <RagHubHeader />
        <div className="h-full space-y-3 overflow-y-auto p-6 pt-[calc(var(--shell-header-h)+1.5rem)]">
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-40 w-full max-w-3xl" />
        </div>
      </>
    );
  }
  if (curatorships.isError) {
    return (
      <>
        <RagHubHeader />
        <div className="h-full overflow-y-auto p-6 pt-[calc(var(--shell-header-h)+1.5rem)]">
          <div className="max-w-2xl rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {extractErrorMessage(curatorships.error)}
          </div>
        </div>
      </>
    );
  }
  if ((curatorships.data ?? []).length === 0) return <NotACurator />;

  const industries = curatorships.data ?? [];

  return (
    <>
      <RagHubHeader
        right={
          /* Desktop only — on mobile the header is the nav pill plus the avatar,
             and a counter squeezed between them collides with both. */
          <span className="hidden px-2 text-xs tabular-nums text-muted-foreground lg:inline">
            {industries.length} {industries.length === 1 ? "industry" : "industries"} ·{" "}
            {totalPacks} {totalPacks === 1 ? "pack" : "packs"}
          </span>
        }
      />
      <div className="flex h-full overflow-hidden bg-textured pt-[var(--shell-header-h)]">
        {/* Rail — industries and their packs */}
        <aside
          className={cn(
            "flex w-full min-w-0 flex-col border-r border-border bg-card/40 lg:w-[22rem] lg:shrink-0",
            packId && "hidden lg:flex",
          )}
        >
          <div className="border-b border-border px-3 py-2.5">
            <h1 className="text-sm font-semibold text-foreground">Curate</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Starter packs you author for your industry. Drafts are private until you submit
              them.
            </p>
            <div className="relative mt-2">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your packs…"
                className="h-8 pl-8 text-sm"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
            {packs.isLoading ? (
              <div className="space-y-2 p-3">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : packs.isError ? (
              <div className="m-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {extractErrorMessage(packs.error)}
              </div>
            ) : (
              industries.map((ind) => {
                const rows = byIndustry.get(ind.industryId) ?? [];
                return (
                  <section key={ind.industryId} className="border-b border-border/70 last:border-b-0">
                    <div className="flex items-start gap-2 px-3 py-2">
                      <Layers className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-foreground">{ind.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {ind.facet.replace("_", " ")} · you curate this industry
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 shrink-0 px-2 text-xs"
                        onClick={() => setNewFor(ind)}
                      >
                        <Plus className="mr-1 size-3.5" /> New
                      </Button>
                    </div>

                    {rows.length === 0 ? (
                      <p className="px-3 pb-3 pl-8 text-xs text-muted-foreground">
                        {query.trim()
                          ? "No pack here matches that search."
                          : "No packs yet. Start one — it stays a private draft until you submit it."}
                      </p>
                    ) : (
                      <ul className="pb-1.5">
                        {rows.map((p) => {
                          const meta =
                            PACK_STATUS_META[(p.status as PackStatus) ?? "draft"] ??
                            PACK_STATUS_META.draft;
                          const active = p.id === packId;
                          return (
                            <li key={p.id}>
                              <button
                                type="button"
                                onClick={() => select(p.id)}
                                className={cn(
                                  "flex w-full items-center gap-2 px-3 py-1.5 pl-8 text-left transition-colors",
                                  active
                                    ? "bg-accent text-accent-foreground"
                                    : "hover:bg-accent/50",
                                )}
                              >
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-xs font-medium text-foreground">
                                    {p.name}
                                  </span>
                                  <span className="block truncate text-[11px] text-muted-foreground">
                                    v{p.pack_version} · {p.topic_count} topics · {p.meaning_count} meanings
                                  </span>
                                </span>
                                <Badge
                                  variant="outline"
                                  className={cn("shrink-0 text-[10px]", meta.tone)}
                                  title={meta.hint}
                                >
                                  {meta.label}
                                </Badge>
                                <ChevronRight
                                  className="size-3.5 shrink-0 text-muted-foreground"
                                  aria-hidden
                                />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                );
              })
            )}
          </div>
        </aside>

        {/* Detail — the ONE pack editor, no admin directory */}
        <main className={cn("min-w-0 flex-1 overflow-hidden", !packId && "hidden lg:block")}>
          {packId ? (
            <div className="flex h-full min-h-0 flex-col p-4">
              <Button
                variant="ghost"
                size="sm"
                className="mb-2 w-fit lg:hidden"
                onClick={() => select(null)}
              >
                <ArrowLeft className="mr-1 size-3.5" /> All packs
              </Button>
              <div className="min-h-0 flex-1">
                <PackDetail packId={packId} onSelectPack={select} />
              </div>
            </div>
          ) : (
            <CurationPrimer industries={industries} />
          )}
        </main>
      </div>

      <TextInputDialog
        open={newFor !== null}
        onOpenChange={(o) => !o && setNewFor(null)}
        title={`New starter pack for ${newFor?.name ?? ""}`}
        description="Name it the way a business owner in this industry would say it. Everything else — topics, rules, bands, guidelines — you fill in next. It stays a private draft until you submit it."
        placeholder="Certified data destruction — core services"
        confirmLabel="Create draft"
        busy={create.isPending}
        onConfirm={(name) => {
          if (newFor) create.mutate({ name, industry: newFor });
        }}
      />
    </>
  );
}

/** The right pane before a pack is chosen — says what curating actually does. */
function CurationPrimer({ industries }: { industries: Curatorship[] }) {
  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            You curate {industries.length === 1 ? industries[0].name : `${industries.length} industries`}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A starter pack is the head start you give every business in your industry: the topics
            that matter, what each one is worth, the areas they serve, and the rules that tell
            real demand from noise. Pick a pack on the left, or start a new one.
          </p>
        </div>

        <ol className="space-y-3">
          {[
            {
              icon: BookOpenText,
              title: "Write the draft",
              body: "Personal keeps this item out of public discovery. Edit it as long as you like and review its access before sharing.",
            },
            {
              icon: BadgeCheck,
              title: "Submit for ratification",
              body: "A Matrx domain expert reviews it. You keep editing while it is under review.",
            },
            {
              icon: ShieldCheck,
              title: "Matrx publishes it",
              body: "Once ratified, Matrx decides who receives it. Every business that adopts it gets their own copy to change — your pack is their starting position, never a rule imposed on them.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <li
              key={title}
              className="flex gap-3 rounded-lg border border-border bg-card px-4 py-3"
            >
              <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <div>
                <p className="text-sm font-medium text-foreground">{title}</p>
                <p className="text-xs text-muted-foreground">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/**
 * Not a curator. Not an error and not a wall — curation is granted by the Matrx Library
 * team, so this says what the role is and points at the door this person DOES have.
 */
function NotACurator() {
  return (
    <>
      <RagHubHeader />
      <div className="h-full overflow-y-auto bg-textured p-8 pt-[calc(var(--shell-header-h)+2rem)]">
        <div className="mx-auto max-w-xl space-y-4 rounded-lg border border-border bg-card px-6 py-6">
          <div className="flex items-center gap-2.5">
            <Layers className="size-5 text-primary" aria-hidden />
            <h1 className="text-base font-semibold text-foreground">Curating for an industry</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Curators are invited experts who author the starter packs the Matrx Library gives to
            everyone in their industry — the topics that matter, what they are worth, and the
            rules that separate real demand from noise. You are not curating an industry yet.
          </p>
          <p className="text-sm text-muted-foreground">
            If you are the person who knows an industry better than anyone else, ask your Matrx
            contact to make you a curator of it. Curation is granted per industry, and it is the
            whole role — no other access changes.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button asChild size="sm">
              <a href="/knowledge/library-catalog">
                <BookOpenText className="mr-1.5 size-3.5" /> Browse the Matrx Library
              </a>
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
