"use client";

// features/admin/shared-knowledge/packs/ProposePackDialog.tsx
//
// "Propose from sample sites": pick the industry (or create it inline through
// the ONE taxonomy write, industry_upsert), describe it, choose the sample
// sites whose real Search Console demand the proposer reads, paste the expert
// rulings verbatim, run. The proposer streams in the platform's live-run
// surface; the structured result lands as a DRAFT pack that opens for editing.
// The agent is the `seo.starter_pack_proposer` mandate — no id in this file.

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BrainCircuit, Loader2, Plus, Search, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { useIndustries } from "@/features/industries/hooks";
import { upsertIndustry } from "@/features/industries/service";
import { searchAdminSites, type AdminPackRecord, type AdminSiteOption } from "./data";
import { useProposePack, type ProposeStage } from "./useProposePack";

const NEW = "__new__";
const NONE = "__none__";

const STAGE_LABEL: Record<ProposeStage, string> = {
  idle: "",
  corpus: "Reading real demand from the sample sites…",
  running: "The proposer is working — watch it in the live run window.",
  landing: "Landing the proposal as a draft pack…",
  done: "Draft pack created.",
  error: "Something went wrong.",
};

function slugify(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function ProposePackDialog({
  open,
  onOpenChange,
  onProposed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProposed: (pack: AdminPackRecord) => Promise<void> | void;
}) {
  const { industries, refresh: refreshIndustries } = useIndustries();
  const [industryId, setIndustryId] = useState<string>(NONE);
  const [newIndustryName, setNewIndustryName] = useState("");
  const [creatingIndustry, setCreatingIndustry] = useState(false);
  const [hint, setHint] = useState("");
  const [rulings, setRulings] = useState("");
  const [siteQuery, setSiteQuery] = useState("");
  const [siteRows, setSiteRows] = useState<AdminSiteOption[]>([]);
  const [sites, setSites] = useState<AdminSiteOption[]>([]);
  const [searching, setSearching] = useState(false);
  const { propose, cancel, reset, stage, error } = useProposePack();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      searchAdminSites(siteQuery)
        .then((rows) => {
          if (!cancelled) setSiteRows(rows);
        })
        .catch((e) => toast.error(extractErrorMessage(e)))
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, siteQuery]);

  const busy = stage === "corpus" || stage === "running" || stage === "landing";
  const chosen = industries.find((i) => i.id === industryId) ?? null;
  const effectiveHint = hint.trim() || chosen?.name || newIndustryName.trim();
  const valid = sites.length > 0 && effectiveHint.length > 0 && (industryId !== NEW || newIndustryName.trim().length > 0);

  const onCreateIndustry = async (): Promise<string | null> => {
    const name = newIndustryName.trim();
    if (!name) return null;
    setCreatingIndustry(true);
    try {
      const created = await upsertIndustry({ slug: slugify(name), name, facet: "domain", description: hint.trim() || null });
      refreshIndustries();
      setIndustryId(created.id);
      toast.success(`Industry “${created.name}” created`);
      return created.id;
    } catch (e) {
      toast.error(extractErrorMessage(e));
      return null;
    } finally {
      setCreatingIndustry(false);
    }
  };

  const onRun = async () => {
    let resolvedIndustry: string | null = industryId === NONE ? null : industryId;
    if (industryId === NEW) {
      resolvedIndustry = await onCreateIndustry();
      if (!resolvedIndustry) return;
    }
    const pack = await propose({
      industryId: resolvedIndustry,
      industryHint: effectiveHint,
      siteIds: sites.map((s) => s.id),
      expertRulings: rulings,
    });
    if (pack) {
      toast.success(`Draft “${pack.name}” is ready to review.`);
      await onProposed(pack);
      reset();
      onOpenChange(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && busy) return;
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BrainCircuit className="size-4 text-primary" /> Propose a starter pack from sample sites
          </DialogTitle>
          <DialogDescription>
            Real Search Console demand from a few sites in one industry, the controlled vocabularies, and the expert&apos;s rulings go in; a draft pack comes out. No sample company, city or brand ever lands in the pack.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Industry</span>
            <Select value={industryId} onValueChange={setIndustryId} disabled={busy}>
              <SelectTrigger>
                <SelectValue placeholder="Choose…" />
              </SelectTrigger>
              <SelectContent>
                {industries.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name}
                  </SelectItem>
                ))}
                <SelectItem value={NEW}>
                  <span className="inline-flex items-center gap-1">
                    <Plus className="size-3" /> New industry…
                  </span>
                </SelectItem>
                <SelectItem value={NONE}>Decide later (draft keeps the hint)</SelectItem>
              </SelectContent>
            </Select>
            {industryId === NEW ? (
              <Input value={newIndustryName} onChange={(e) => setNewIndustryName(e.target.value)} placeholder="Industry name, e.g. Dental practices" className="h-8 text-sm" disabled={busy || creatingIndustry} />
            ) : null}
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Industry hint (one line)</span>
            <Input value={hint} onChange={(e) => setHint(e.target.value)} placeholder="ITAD / electronics recycling and secure data destruction" disabled={busy} />
          </label>
        </div>

        <div className="space-y-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Sample sites (their demand is the evidence)</span>
          {sites.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {sites.map((s) => (
                <Badge key={s.id} variant="outline" className="gap-1 pr-1 text-xs">
                  {s.domain ?? s.name ?? s.id}
                  <button type="button" onClick={() => setSites((prev) => prev.filter((x) => x.id !== s.id))} aria-label={`Remove ${s.domain ?? s.id}`} disabled={busy} className="rounded hover:bg-muted">
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          ) : null}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={siteQuery} onChange={(e) => setSiteQuery(e.target.value)} placeholder="Search sites by domain or name…" className="h-8 pl-7 text-sm" disabled={busy} />
          </div>
          <ul className="max-h-36 divide-y divide-border overflow-y-auto rounded-md border border-border">
            {searching && siteRows.length === 0 ? (
              <li className="px-2.5 py-1.5 text-xs text-muted-foreground">Searching…</li>
            ) : siteRows.filter((r) => !sites.some((s) => s.id === r.id)).length === 0 ? (
              <li className="px-2.5 py-1.5 text-xs text-muted-foreground">No more sites match.</li>
            ) : (
              siteRows
                .filter((r) => !sites.some((s) => s.id === r.id))
                .map((r) => (
                  <li key={r.id}>
                    <button type="button" disabled={busy} onClick={() => setSites((prev) => [...prev, r])} className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-muted/60">
                      <span className="truncate text-foreground">{r.domain ?? r.name ?? r.id}</span>
                      {r.name && r.domain ? <span className="shrink-0 text-muted-foreground">{r.name}</span> : null}
                    </button>
                  </li>
                ))
            )}
          </ul>
        </div>

        <label className="space-y-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Expert rulings (verbatim — they override the agent completely)</span>
          <Textarea value={rulings} onChange={(e) => setRulings(e.target.value)} placeholder="CRT and TV are consumer signals; enterprise is where the money is. The word free massively reduces value…" className="min-h-20 text-sm" disabled={busy} />
        </label>

        {stage !== "idle" ? (
          <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs">
            {busy ? <Loader2 className="size-3.5 animate-spin text-primary" /> : null}
            <span className={stage === "error" ? "text-destructive" : "text-muted-foreground"}>{stage === "error" ? (error ?? STAGE_LABEL.error) : STAGE_LABEL[stage]}</span>
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          {busy ? (
            <Button variant="ghost" size="sm" onClick={cancel}>
              Cancel run
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          )}
          <Button size="sm" onClick={onRun} disabled={!valid || busy || creatingIndustry}>
            {busy ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <BrainCircuit className="mr-1 size-3.5" />}
            Propose pack
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
