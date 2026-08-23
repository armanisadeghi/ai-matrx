"use client";

// features/admin/shared-knowledge/packs/PackOverview.tsx
//
// Identity + audiences + evidence + history of one pack. Core fields save
// inline through seo.starter_pack_save (admin / curator while draft-proposed);
// audiences are read from the generic Library grants (the pilot / subscription
// rows ARE organization-audience grants); evidence is the corpus the proposer
// read; history is the status ledger the DB keeps.

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2, Globe, Layers, Loader2, Save, Users } from "lucide-react";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { useIndustries } from "@/features/industries/hooks";
import { useLibraryGrants } from "@/features/rag/hooks/useLibraryGrants";
import type { SharedKnowledgeDirectory } from "../types";
import { GEO_MODELS, savePack, type AdminPackDetail } from "./data";

const NONE = "__none__";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function PackOverview({
  detail,
  directory,
  onChanged,
  onSelectPack,
  grantsBump,
}: {
  detail: AdminPackDetail;
  directory: SharedKnowledgeDirectory;
  onChanged: () => Promise<void>;
  onSelectPack: (id: string) => void;
  /** Bumped by the detail host after a publish/revoke so the audience list refetches. */
  grantsBump: number;
}) {
  const { pack } = detail;
  const canAuthor = pack.can_author;
  const { industries } = useIndustries();
  const { grants, loading: grantsLoading, refresh: refreshGrants } = useLibraryGrants("seo_starter_pack", pack.id);
  useEffect(() => {
    if (grantsBump > 0) refreshGrants();
  }, [grantsBump, refreshGrants]);

  const [form, setForm] = useState({
    name: pack.name,
    slug: pack.slug,
    industry_id: pack.industry_id ?? NONE,
    industry: pack.industry ?? "",
    summary: pack.summary ?? "",
    description: pack.description ?? "",
    geo_model: pack.geo_model,
    source_notes: pack.source_notes ?? "",
  });
  useEffect(() => {
    setForm({
      name: pack.name,
      slug: pack.slug,
      industry_id: pack.industry_id ?? NONE,
      industry: pack.industry ?? "",
      summary: pack.summary ?? "",
      description: pack.description ?? "",
      geo_model: pack.geo_model,
      source_notes: pack.source_notes ?? "",
    });
  }, [pack]);

  const dirty =
    form.name !== pack.name ||
    form.industry_id !== (pack.industry_id ?? NONE) ||
    form.industry !== (pack.industry ?? "") ||
    form.summary !== (pack.summary ?? "") ||
    form.description !== (pack.description ?? "") ||
    form.geo_model !== pack.geo_model ||
    form.source_notes !== (pack.source_notes ?? "");

  const save = useMutation({
    mutationFn: () =>
      savePack({
        id: pack.id,
        name: form.name.trim() || pack.name,
        industry_id: form.industry_id === NONE ? null : form.industry_id,
        industry: form.industry,
        summary: form.summary || null,
        description: form.description || null,
        geo_model: form.geo_model,
        source_notes: form.source_notes || null,
      }),
    onSuccess: async () => {
      toast.success("Pack saved");
      await onChanged();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const orgName = useMemo(
    () => new Map(directory.organizations.map((o) => [o.id, o.name])),
    [directory.organizations],
  );
  const corpus = (pack.source_corpus ?? []) as Array<Record<string, unknown>>;
  const sourceSites = Array.isArray((pack.metadata ?? {}).source_site_ids)
    ? ((pack.metadata ?? {}).source_site_ids as string[])
    : [];

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      {/* Identity */}
      <section className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input value={form.name} disabled={!canAuthor} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Slug (immutable)">
            <Input value={form.slug} disabled readOnly className="font-mono text-xs" />
          </Field>
          <Field label="Industry (taxonomy)">
            <Select
              value={form.industry_id}
              disabled={!canAuthor}
              onValueChange={(v) => setForm((f) => ({ ...f, industry_id: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose an industry…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Every industry (platform defaults)</SelectItem>
                {industries.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name} <span className="text-muted-foreground">· {i.facet.replace("_", " ")}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Geography this industry serves">
            <Select value={form.geo_model} disabled={!canAuthor} onValueChange={(v) => setForm((f) => ({ ...f, geo_model: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GEO_MODELS.map((g) => (
                  <SelectItem key={g.value} value={g.value}>
                    {g.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Who this pack fits (one line a business owner understands)">
          <Input
            value={form.industry}
            disabled={!canAuthor}
            onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
            placeholder="IT asset disposition, electronics recycling, certified data destruction"
          />
        </Field>
        <Field label="Summary">
          <Textarea
            value={form.summary}
            disabled={!canAuthor}
            onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
            className="min-h-16 text-sm"
          />
        </Field>
        <Field label="Description — what adopting it does">
          <Textarea
            value={form.description}
            disabled={!canAuthor}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="min-h-20 text-sm"
          />
        </Field>
        <Field label="Demand reading / source notes (the proposer's evidence, editable)">
          <Textarea
            value={form.source_notes}
            disabled={!canAuthor}
            onChange={(e) => setForm((f) => ({ ...f, source_notes: e.target.value }))}
            className="min-h-24 text-sm"
          />
        </Field>
        {pack.proposed_industry && !pack.industry_id ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Proposed for an industry that does not exist yet: “{pack.proposed_industry}”. Create it on the Industries tab, then pick it here.
          </p>
        ) : null}
        {canAuthor ? (
          <div className="flex justify-end">
            <Button size="sm" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
              {save.isPending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Save className="mr-1 size-3.5" />}
              Save changes
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Read-only: {pack.status === "ratified" || pack.status === "retired" ? "ratified and retired packs are edited by platform admins" : "you are not a curator of this pack's industry"}.
          </p>
        )}
      </section>

      {/* Audiences · evidence · history */}
      <aside className="space-y-5">
        <section className="space-y-1.5">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Users className="size-3.5 text-muted-foreground" aria-hidden /> Audiences & subscribers
          </h3>
          {grantsLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Loading…
            </div>
          ) : grants.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
              Not published. Reachable by admins and this industry&apos;s curators only.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {grants.map((g) => (
                <li key={g.id} className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
                  {g.audience === "global" ? (
                    <Globe className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  ) : g.audience === "industry" ? (
                    <Layers className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  ) : (
                    <Building2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  {g.audience === "global" ? (
                    <span className="text-foreground">Everyone</span>
                  ) : g.audience === "industry" ? (
                    <span className="text-foreground">Industry · {g.industryName ?? g.industrySlug}</span>
                  ) : g.organizationId ? (
                    <EntityRef
                      token="organization"
                      id={g.organizationId}
                      name={g.organizationName ?? orgName.get(g.organizationId) ?? null}
                      className="min-w-0"
                    />
                  ) : null}
                  {g.audience === "organization" ? (
                    <Badge variant="outline" className="ml-auto text-[10px]">
                      subscribed / pilot
                    </Badge>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-1.5">
          <h3 className="text-xs font-semibold text-foreground">Evidence</h3>
          {corpus.length === 0 && sourceSites.length === 0 ? (
            <p className="text-xs text-muted-foreground">Hand-authored — no sample corpus recorded.</p>
          ) : (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {sourceSites.map((id) => (
                <li key={id} className="group/entity-ref">
                  <EntityRef token="web_site" id={id} className="min-w-0" />
                </li>
              ))}
              {corpus.map((c, i) => (
                <li key={i} className="rounded-md border border-border bg-card px-2.5 py-1.5">
                  {Object.entries(c)
                    .filter(([, v]) => typeof v === "string" || typeof v === "number")
                    .slice(0, 6)
                    .map(([k, v]) => (
                      <span key={k} className="mr-3 inline-block">
                        <span className="text-muted-foreground/70">{k}</span> {String(v)}
                      </span>
                    ))}
                </li>
              ))}
            </ul>
          )}
          {pack.open_questions?.length ? (
            <details className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs">
              <summary className="cursor-pointer font-medium text-foreground">
                {pack.open_questions.length} open question{pack.open_questions.length === 1 ? "" : "s"} from the proposer
              </summary>
              <ul className="mt-1.5 space-y-1.5">
                {pack.open_questions.map((q, i) => (
                  <li key={i}>
                    <p className="text-foreground">{q.question}</p>
                    <p className="text-muted-foreground">Why: {q.why_it_matters}</p>
                    <p className="text-muted-foreground">Assumed meanwhile: {q.assumed_meanwhile}</p>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>

        <section className="space-y-1.5">
          <h3 className="text-xs font-semibold text-foreground">History</h3>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>
              Created {new Date(pack.created_at).toLocaleString()} · v{pack.pack_version}
              {pack.supersedes_pack_id ? (
                <>
                  {" · supersedes "}
                  <button type="button" className="underline" onClick={() => onSelectPack(pack.supersedes_pack_id as string)}>
                    previous version
                  </button>
                </>
              ) : null}
            </li>
            {pack.ratified_at ? <li>Ratified {new Date(pack.ratified_at).toLocaleString()}{pack.ratification_notes ? ` — ${pack.ratification_notes}` : ""}</li> : null}
            {[...(pack.status_history ?? [])].reverse().map((h, i) => (
              <li key={i}>
                {h.from ?? "—"} → <span className="text-foreground">{h.to}</span> · {new Date(h.at).toLocaleString()}
                {h.notes ? ` — ${h.notes}` : ""}
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}
