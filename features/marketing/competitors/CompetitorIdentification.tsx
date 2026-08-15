"use client";

import { useMemo, useState } from "react";
import { Check, ExternalLink, Loader2, Plus, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { useAppDispatch } from "@/lib/redux/hooks";

import type { CompetitorRow, CompetitorSite, CompetitorLookupResult } from "./data";
import { addCompetitor, classifyCompetitor, lookupCompetitor, saveCompetitorClassification } from "./data";

const BUSINESS = ["direct", "adjacent", "none"] as const;
const MARKET = ["same_market", "different_market", "market_agnostic"] as const;
const ROLE = ["business", "marketplace", "publisher", "reference", "community", "supplier", "partner", "own_brand"] as const;
const POSTURE = ["compete", "copy", "outreach", "link_source", "monitor", "ignore"] as const;

export function derivedCompetitorLabel(row: Pick<CompetitorRow, "business_overlap" | "market_overlap" | "entity_role" | "search_overlap_band">): string {
  if (row.entity_role === "marketplace") return "Marketplace / lead broker";
  if (row.entity_role === "publisher") return "Publisher";
  if (row.entity_role === "reference") return "Reference site";
  if (row.entity_role === "community") return "Community site";
  if (row.entity_role === "supplier") return "Supplier";
  if (row.entity_role === "partner") return "Partner";
  if (row.entity_role === "own_brand") return "Your own brand";
  if (row.business_overlap === "none") return row.search_overlap_band && row.search_overlap_band !== "none" ? "Search-only competitor" : "Not a competitor";
  if (row.business_overlap === "direct") return row.market_overlap === "different_market" ? "Out-of-market peer" : "Direct competitor";
  if (row.business_overlap === "adjacent") return row.market_overlap === "different_market" ? "Adjacent peer" : "Adjacent competitor";
  return "Unclassified";
}

export function ManualCompetitorAdd({ site, onAdded }: { site: CompetitorSite | null; onAdded: () => Promise<void> }) {
  const dispatch = useAppDispatch();
  const [name, setName] = useState("");
  const [results, setResults] = useState<CompetitorLookupResult[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const search = async () => {
    if (!site || name.trim().length < 2) return;
    setBusy("search");
    try {
      const found = await lookupCompetitor(site.id, name.trim(), dispatch);
      setResults(found);
      if (!found.length) toast.error("No likely official sites found. Try the full business name.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Lookup failed"); }
    finally { setBusy(null); }
  };

  const add = async (result: CompetitorLookupResult) => {
    if (!site) return;
    setBusy(result.domain);
    try {
      const row = await addCompetitor(site, result);
      await classifyCompetitor(site.id, row.id, dispatch);
      await onAdded();
      setResults([]); setName("");
      toast.success(`${result.title} added for your review`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not add competitor"); }
    finally { setBusy(null); }
  };

  return <Card className="border-primary/20">
    <CardHeader className="pb-3"><CardTitle className="text-sm">Add a competitor you already know</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <div className="flex gap-2">
        <Input value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void search(); }} placeholder="Type a business name, like Shred Nations" disabled={!site} />
        <Button onClick={() => void search()} disabled={!site || name.trim().length < 2 || busy !== null} className="gap-2">
          {busy === "search" ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Find site
        </Button>
      </div>
      {results.length ? <div className="grid gap-2 md:grid-cols-2">
        {results.map((result) => <div key={result.domain} className="flex items-start justify-between gap-3 rounded-lg border p-3">
          <div className="min-w-0"><a href={result.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">{result.title}<ExternalLink className="size-3" /></a><p className="text-xs text-muted-foreground">{result.domain}</p><p className="mt-1 line-clamp-2 text-xs">{result.description}</p></div>
          <Button size="sm" onClick={() => void add(result)} disabled={busy !== null} className="shrink-0 gap-1">{busy === result.domain ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />} Add</Button>
        </div>)}
      </div> : null}
      <p className="text-xs text-muted-foreground">We find the likely official site, then propose a classification. Nothing is confirmed until you say so.</p>
    </CardContent>
  </Card>;
}

export function CompetitorClassificationEditor({ row, onSaved }: { row: CompetitorRow; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState(row);
  const [labels, setLabels] = useState(row.custom_labels.join(", "));
  const [saving, setSaving] = useState(false);
  const reasons = useMemo(() => {
    const classification = (row.latest_autopsy as { classification?: { reasons?: Record<string, string>; uncertainty?: string } } | null)?.classification;
    return classification ?? null;
  }, [row.latest_autopsy]);
  const save = async (confirm: boolean) => {
    if (!draft.business_overlap || !draft.market_overlap || !draft.entity_role || !draft.posture) return;
    setSaving(true);
    try {
      await saveCompetitorClassification(row.id, {
        business_overlap: draft.business_overlap, market_overlap: draft.market_overlap,
        entity_role: draft.entity_role, posture: draft.posture,
        use_for_link_gap: draft.use_for_link_gap,
        custom_labels: labels.split(",").map((label) => label.trim()).filter(Boolean),
      }, confirm);
      await onSaved(); toast.success(confirm ? "Competitor confirmed" : "Classification saved");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save classification"); }
    finally { setSaving(false); }
  };
  const axis = (label: string, value: string | null, values: readonly string[], key: "business_overlap" | "market_overlap" | "entity_role" | "posture") => <div className="space-y-1.5"><Label>{label}</Label><Select value={value ?? ""} onValueChange={(next) => setDraft((current) => ({ ...current, [key]: next }))}><SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger><SelectContent>{values.map((item) => <SelectItem value={item} key={item}>{item.replaceAll("_", " ")}</SelectItem>)}</SelectContent></Select>{reasons?.reasons?.[key] ? <p className="text-xs leading-5 text-muted-foreground">{reasons.reasons[key]}</p> : null}</div>;
  return <div className="space-y-5 p-1 text-sm">
    <div className="flex flex-wrap items-center gap-2"><Badge>{derivedCompetitorLabel(draft)}</Badge><Badge variant="outline">{row.classification_status}</Badge>{row.custom_labels.map((label) => <Badge variant="secondary" key={label}>{label}</Badge>)}</div>
    <div className="grid gap-4 md:grid-cols-2">{axis("Business overlap", draft.business_overlap, BUSINESS, "business_overlap")}{axis("Market overlap", draft.market_overlap, MARKET, "market_overlap")}{axis("Entity role", draft.entity_role, ROLE, "entity_role")}{axis("What should we do?", draft.posture, POSTURE, "posture")}</div>
    <div className="space-y-1.5"><Label htmlFor={`labels-${row.id}`}>Your labels</Label><Input id={`labels-${row.id}`} value={labels} onChange={(event) => setLabels(event.target.value)} placeholder="Local rival, client priority, watch quarterly" /><p className="text-xs text-muted-foreground">Comma-separated. Your labels sit beside the derived label; they never rewrite the underlying evidence.</p></div>
    <div className="flex items-center gap-2"><Checkbox id={`gap-${row.id}`} checked={draft.use_for_link_gap === true} onCheckedChange={(checked) => setDraft((current) => ({ ...current, use_for_link_gap: checked === true }))} /><Label htmlFor={`gap-${row.id}`} className="font-normal">Use as a link-gap seed after confirmation</Label></div>
    {reasons?.uncertainty ? <div className="rounded-lg bg-muted/50 p-3"><strong>What to verify:</strong> {reasons.uncertainty}</div> : null}
    <div className="flex justify-end gap-2"><Button variant="outline" disabled={saving} onClick={() => void save(false)}>Save changes</Button><Button disabled={saving || !draft.business_overlap || !draft.market_overlap || !draft.entity_role || !draft.posture} onClick={() => void save(true)} className="gap-2">{saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Confirm classification</Button></div>
  </div>;
}
