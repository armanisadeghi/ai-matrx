"use client";

/**
 * A Rulebook, seen from the Matrx Library catalog.
 *
 * THE SUBSCRIBE LAW for `rulebook` is COPY (Arman, 2026-08-23): taking one
 * writes YOUR organization its own editable Rulebook, seeded from the
 * Library's, through the ONE write path `public.library_subscribe`. So the verb
 * here is **Add to my Rulebooks**, never "subscribe" — and the panel says out
 * loud that what lands is yours to edit.
 *
 * NO DEAD ENDS: once you have it, this panel links straight to YOUR copy at
 * /masterwork/{id}. If the Library has added rules since you took it, the same
 * button takes only the new ones (additive, never over a rule you changed).
 *
 * Everything here is server truth — the Library row is read through the grant
 * lane, and the copy is found by its `source_rulebook_id` provenance column.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  Building2,
  Loader2,
  Plus,
  ScrollText,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { supabase } from "@/utils/supabase/client";
import { EntitlementChip } from "@/features/rag/components/library-catalog/EntitlementChip";
import type { LibraryResource } from "@/features/rag/hooks/useLibraryResources";
import type { RulebookRule } from "@/features/masterwork/types";

/** Rulebook status in the tenant's words. */
const STATUS_META: Record<string, { label: string; hint: string; tone: string }> = {
  active: {
    label: "Expert-approved",
    hint: "The Expert who wrote this has approved its rules.",
    tone: "border-success/40 bg-success/10 text-success",
  },
  draft: {
    label: "Draft",
    hint: "Still being written. Only admins and this industry's curators can see it.",
    tone: "border-border bg-muted text-muted-foreground",
  },
  archived: {
    label: "Archived",
    hint: "Superseded. Kept so organizations that took it can still see where their rules came from.",
    tone: "border-border bg-muted text-muted-foreground",
  },
};

interface AdoptedCopy {
  id: string;
  name: string;
  version: number;
  ruleCount: number;
  sourceVersion: number | null;
}

/** The recipient org's own copy of this Library Rulebook, if it has one. */
async function fetchAdoptedCopy(
  sourceRulebookId: string,
  organizationId: string,
): Promise<AdoptedCopy | null> {
  const { data, error } = await supabase
    .schema("platform")
    .from("rulebook")
    .select("id,name,version,rules,source_version")
    .eq("source_rulebook_id", sourceRulebookId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: String(data.id),
    name: String(data.name),
    version: Number(data.version),
    ruleCount: Array.isArray(data.rules) ? data.rules.length : 0,
    sourceVersion:
      data.source_version == null ? null : Number(data.source_version),
  };
}

/** The Library row's own rules, for the preview list. */
async function fetchLibraryRules(rulebookId: string): Promise<RulebookRule[]> {
  const { data, error } = await supabase
    .schema("platform")
    .from("rulebook")
    .select("rules")
    .eq("id", rulebookId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return Array.isArray(data?.rules) ? (data.rules as RulebookRule[]) : [];
}

export function RulebookDetailPanel({
  item,
  onBack,
  organizationId,
  onAdd,
}: {
  item: LibraryResource;
  /** Mobile: return to the list pane. */
  onBack: () => void;
  /** For the "why you have this" door into the org's industry opt-ins. */
  organizationId: string | null;
  /** Runs `library_subscribe` through the generic hook. Returns success. */
  onAdd: () => Promise<boolean>;
}) {
  const status = STATUS_META[item.status ?? ""] ?? null;
  const [rules, setRules] = useState<RulebookRule[] | null>(null);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [copy, setCopy] = useState<AdoptedCopy | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshCopy = useCallback(async () => {
    if (!organizationId) {
      setCopy(null);
      return;
    }
    try {
      setCopy(await fetchAdoptedCopy(item.id, organizationId));
    } catch (e) {
      console.error("[RulebookDetailPanel] could not read the adopted copy:", e);
      setCopy(null);
    }
  }, [item.id, organizationId]);

  useEffect(() => {
    let cancelled = false;
    setRules(null);
    setRulesError(null);
    fetchLibraryRules(item.id)
      .then((r) => {
        if (!cancelled) setRules(r);
      })
      .catch((e) => {
        if (!cancelled)
          setRulesError(
            e instanceof Error ? e.message : "Could not load this Rulebook.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  useEffect(() => {
    void refreshCopy();
  }, [refreshCopy]);

  // The Library has moved on since this org took its copy: the SAME action
  // takes only the new rules, so there is never a second "sync" path.
  const behind =
    copy != null &&
    copy.sourceVersion != null &&
    rules != null &&
    rules.length > copy.ruleCount;

  const add = async () => {
    setBusy(true);
    const ok = await onAdd();
    setBusy(false);
    if (!ok) return;
    await refreshCopy();
    toast.success(
      copy ? `Took the new rules into ${copy.name}` : `${item.name} is now yours to edit`,
    );
  };

  const preview = rules?.slice(0, 12) ?? [];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="shrink-0 space-y-2 border-b px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to the Library list"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <ScrollText className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold">{item.name}</h1>
          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-secondary-foreground">
            Rulebook
          </span>
          {status ? (
            <span
              className={cn(
                "rounded border px-1.5 py-0.5 text-[10px] font-medium",
                status.tone,
              )}
              title={status.hint}
            >
              {status.label}
            </span>
          ) : null}
          <EntitlementChip
            entitledVia={item.entitledVia}
            industryName={item.entitledIndustryName}
          />
          <div className="ml-auto flex items-center gap-1.5">
            {copy ? (
              <Link
                href={`/masterwork/${copy.id}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium hover:border-primary/50 hover:bg-accent"
              >
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                Open your copy
              </Link>
            ) : null}
            {!copy || behind ? (
              <Button size="sm" className="h-8" disabled={busy} onClick={add}>
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                {copy ? "Take the new rules" : "Add to my Rulebooks"}
              </Button>
            ) : null}
          </div>
        </div>
        {item.description ? (
          <p className="text-xs text-muted-foreground">{item.description}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {item.entitledIndustryName ? (
            <span className="inline-flex items-center gap-1">
              <Building2 className="h-3 w-3" />
              {item.entitledIndustryName}
            </span>
          ) : null}
          <span className="tabular-nums">
            {item.itemCount} rule{item.itemCount === 1 ? "" : "s"}
          </span>
          <span className="tabular-nums">
            {item.subscriberCount} organization
            {item.subscriberCount === 1 ? "" : "s"} using it
          </span>
          {item.slug ? <span className="font-mono">{item.slug}</span> : null}
          <span className="select-all font-mono text-[10px]">{item.id}</span>
        </div>
        {item.entitledVia === "industry" && organizationId ? (
          <p className="text-[11px] text-muted-foreground">
            You have this because your organization is in{" "}
            <Link
              href={`/organizations/${organizationId}/settings`}
              className="font-medium text-primary hover:underline"
            >
              {item.entitledIndustryName ?? "this industry"}
            </Link>
            .
          </p>
        ) : null}
        {copy ? (
          <p className="text-[11px] text-muted-foreground">
            Your organization has this as{" "}
            <Link
              href={`/masterwork/${copy.id}`}
              className="font-medium text-primary hover:underline"
            >
              {copy.name}
            </Link>{" "}
            — {copy.ruleCount} rule{copy.ruleCount === 1 ? "" : "s"}, yours to
            edit.
          </p>
        ) : null}
      </header>

      <div className="flex-1 space-y-4 overflow-auto p-4">
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            What it carries
          </h2>
          {rulesError ? (
            <div className="text-xs text-destructive">{rulesError}</div>
          ) : rules == null ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading the rules…
            </div>
          ) : preview.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              This Rulebook has no rules yet.
            </p>
          ) : (
            <div className="rounded-md border">
              <div className="border-b bg-muted/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Rules
              </div>
              <ul className="divide-y">
                {preview.map((rule, i) => (
                  <li key={rule.id ?? `rule-${i}`} className="px-3 py-1.5">
                    <p className="text-xs font-medium">{rule.name}</p>
                    {rule.statement ? (
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                        {rule.statement}
                      </p>
                    ) : null}
                  </li>
                ))}
                {rules.length > preview.length ? (
                  <li className="px-3 py-1.5 text-[11px] text-muted-foreground">
                    +{rules.length - preview.length} more
                  </li>
                ) : null}
              </ul>
            </div>
          )}
        </section>

        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground/80">
          <BadgeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          A Rulebook is COPIED into your organization — you get your own, and
          every rule stays yours to edit, retire, or build on. Taking it again
          later brings only the rules the Library has ADDED since; it never
          touches a rule you changed.
        </p>
        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground/80">
          <BookOpenCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Point a Masterwork at your copy to turn these rules into work that
          runs.
        </p>
      </div>
    </div>
  );
}
