"use client";

// features/crm/components/deals/DealCreateDialog.tsx
//
// The compact create flow: name, pipeline + entry stage, value, the party the
// deal is with (contact-only search through the canonical predicate — the same
// contact-only boundary every party picker enforces), expected close.
// Creation is a direct RLS write (see deals/service.ts header) — the DB
// triggers derive status and append the first stage event.

import { useEffect, useMemo, useState } from "react";
import { Building2, Loader2, Search, User, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { searchPartiesByName } from "../../service";
import type { PartyRef } from "../../types";
import { createDeal } from "../../deals/service";
import type { DealPipeline, DealRow } from "../../deals/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipelines: DealPipeline[];
  /** The org the deal is stamped into. */
  orgId: string | null;
  /** Defaults the owner to the caller. */
  userId: string | null;
  /** Preselects the pipeline the board/list is narrowed to. */
  defaultPipelineId?: string | null;
  /** Pre-binds the party (the party record page's "New deal" door). */
  defaultParty?: PartyRef | null;
  onCreated: (deal: DealRow) => void;
}

export function DealCreateDialog({
  open,
  onOpenChange,
  pipelines,
  orgId,
  userId,
  defaultPipelineId,
  defaultParty,
  onCreated,
}: Props) {
  const [name, setName] = useState("");
  const [pipelineId, setPipelineId] = useState<string>("");
  const [stageId, setStageId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [expectedClose, setExpectedClose] = useState("");
  const [party, setParty] = useState<PartyRef | null>(null);
  const [partySearch, setPartySearch] = useState("");
  const [partyResults, setPartyResults] = useState<PartyRef[]>([]);
  const [searching, setSearching] = useState(false);
  // A completed empty search must SAY so — without this flag the dropdown
  // unmounted on zero results and the "No contacts match" branch was
  // unreachable (D227's silent half).
  const [searched, setSearched] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset per open; land the defaults the caller knows about.
  useEffect(() => {
    if (!open) return;
    setName("");
    setAmount("");
    setCurrency("USD");
    setExpectedClose("");
    setParty(defaultParty ?? null);
    setPartySearch("");
    setPartyResults([]);
    const pipeline =
      pipelines.find((p) => p.id === defaultPipelineId) ?? pipelines[0] ?? null;
    setPipelineId(pipeline?.id ?? "");
    // The entry stage is the first OPEN stage — never Won/Lost.
    setStageId(pipeline?.stages.find((s) => !s.outcome)?.id ?? "");
  }, [open, pipelines, defaultPipelineId, defaultParty]);

  const pipeline = useMemo(
    () => pipelines.find((p) => p.id === pipelineId) ?? null,
    [pipelines, pipelineId],
  );

  // Debounced contact-only party search in the deal's org.
  useEffect(() => {
    if (!open || !orgId || party || !partySearch.trim()) {
      setPartyResults([]);
      setSearched(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const rows = await searchPartiesByName({ orgId, search: partySearch });
        if (!cancelled) {
          setPartyResults(rows);
          setSearched(true);
        }
      } catch (e) {
        if (!cancelled) console.error("[crm] deal party search failed:", e);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, orgId, party, partySearch]);

  const submit = async () => {
    if (!orgId) {
      toast.error("No organization to create the deal in");
      return;
    }
    if (!name.trim()) {
      toast.error("Name the deal");
      return;
    }
    if (!pipelineId || !stageId) {
      toast.error("Pick a pipeline and a stage");
      return;
    }
    const parsedAmount = amount.trim() ? Number(amount) : null;
    if (parsedAmount !== null && (!Number.isFinite(parsedAmount) || parsedAmount < 0)) {
      toast.error("The value must be a non-negative number");
      return;
    }
    setSaving(true);
    try {
      const deal = await createDeal({
        name,
        pipelineId,
        stageId,
        orgId,
        amount: parsedAmount,
        currency,
        expectedCloseDate: expectedClose || null,
        primaryPartyId: party?.id ?? null,
        assignedTo: userId,
      });
      toast.success(`"${deal.name}" created`);
      onOpenChange(false);
      onCreated(deal);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the deal");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New deal</DialogTitle>
          <DialogDescription className="text-xs">
            A deal tracks money through a pipeline. Move it between stages on
            the board; winning it records the outcome automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="deal-name" className="text-xs">
              Name
            </Label>
            <Input
              id="deal-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme — annual plan"
              className="h-9 text-sm"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Pipeline</Label>
              <Select
                value={pipelineId}
                onValueChange={(id) => {
                  setPipelineId(id);
                  const p = pipelines.find((x) => x.id === id);
                  setStageId(p?.stages.find((s) => !s.outcome)?.id ?? "");
                }}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Pipeline" />
                </SelectTrigger>
                <SelectContent>
                  {pipelines.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Stage</Label>
              <Select value={stageId} onValueChange={setStageId}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Stage" />
                </SelectTrigger>
                <SelectContent>
                  {(pipeline?.stages ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                      {s.outcome ? ` (${s.outcome})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-[1fr_6rem] gap-2">
            <div className="space-y-1">
              <Label htmlFor="deal-amount" className="text-xs">
                Value
              </Label>
              <Input
                id="deal-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="e.g. 12500"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="deal-currency" className="text-xs">
                Currency
              </Label>
              <Input
                id="deal-currency"
                value={currency}
                onChange={(e) =>
                  setCurrency(e.target.value.toUpperCase().slice(0, 3))
                }
                placeholder="USD"
                className="h-9 text-sm uppercase"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">With (person or company)</Label>
            {party ? (
              <div className="flex h-9 items-center justify-between rounded-md border border-border px-2">
                <span className="inline-flex min-w-0 items-center gap-1.5 text-sm">
                  {party.party_kind === "person" ? (
                    <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate">{party.display_name}</span>
                </span>
                <button
                  type="button"
                  aria-label="Clear selection"
                  onClick={() => setParty(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={partySearch}
                  onChange={(e) => setPartySearch(e.target.value)}
                  placeholder="Search your contacts…"
                  className="h-9 pl-7 text-sm"
                />
                {(partyResults.length > 0 || searching || searched) &&
                  partySearch.trim() && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-popover p-1 shadow-md">
                    {searching && (
                      <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> Searching…
                      </div>
                    )}
                    {partyResults.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setParty(p)}
                        className={cn(
                          "flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm",
                          "hover:bg-accent",
                        )}
                      >
                        {p.party_kind === "person" ? (
                          <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        ) : (
                          <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <span className="truncate">{p.display_name}</span>
                      </button>
                    ))}
                    {!searching && partyResults.length === 0 && (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        No contacts match &quot;{partySearch.trim()}&quot;
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="deal-close" className="text-xs">
              Expected close
            </Label>
            <Input
              id="deal-close"
              type="date"
              value={expectedClose}
              onChange={(e) => setExpectedClose(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={() => void submit()} disabled={saving}>
            {saving ? "Creating…" : "Create deal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
