"use client";

// features/crm/components/record/AddressesCard.tsx — postal addresses.

import { useState } from "react";
import { toast } from "@/lib/toast";
import { MapPin, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { addAddress, removeAddress } from "../../service";
import type { AddressPurpose, AddressRow } from "../../types";
import { ADDRESS_PURPOSES } from "../../types";
import { SectionCard, SectionEmpty } from "./SectionCard";

interface Props {
  partyId: string;
  orgId: string;
  addresses: AddressRow[];
  onChanged: () => Promise<void>;
}

function formatAddress(a: AddressRow): string {
  return [
    a.line1,
    a.line2,
    [a.locality, a.region].filter(Boolean).join(", "),
    a.postal_code,
    a.country_code,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function AddressesCard({ partyId, orgId, addresses, onChanged }: Props) {
  const [adding, setAdding] = useState(false);
  const [purpose, setPurpose] = useState<AddressPurpose>("office");
  const [line1, setLine1] = useState("");
  const [locality, setLocality] = useState("");
  const [region, setRegion] = useState("");
  const [postal, setPostal] = useState("");
  const [country, setCountry] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!line1.trim() && !locality.trim()) {
      toast.error("Enter at least a street or a city");
      return;
    }
    setSaving(true);
    try {
      await addAddress({
        party_id: partyId,
        organization_id: orgId,
        purpose_code: purpose,
        label: null,
        line1: line1.trim() || null,
        line2: null,
        locality: locality.trim() || null,
        region: region.trim() || null,
        postal_code: postal.trim() || null,
        country_code: country.trim().toUpperCase() || null,
      });
      setLine1("");
      setLocality("");
      setRegion("");
      setPostal("");
      setCountry("");
      setAdding(false);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add address");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (address: AddressRow) => {
    const ok = await confirm({
      title: "Remove this address?",
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await removeAddress(address.id);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
    }
  };

  return (
    <SectionCard
      title="Addresses"
      Icon={MapPin}
      count={addresses.length}
      action={
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          aria-label={adding ? "Cancel add" : "Add address"}
          className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {adding ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
        </button>
      }
    >
      {adding && (
        <div className="mb-2 space-y-1.5 rounded border border-border bg-muted/30 p-1.5">
          <div className="flex gap-1.5">
            <Select
              value={purpose}
              onValueChange={(v) => setPurpose(v as AddressPurpose)}
            >
              <SelectTrigger className="h-7 w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ADDRESS_PURPOSES.map((p) => (
                  <SelectItem key={p} value={p} className="text-xs capitalize">
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={line1}
              onChange={(e) => setLine1(e.target.value)}
              placeholder="Street"
              className="h-7 flex-1 text-xs"
              autoFocus
            />
          </div>
          <div className="flex gap-1.5">
            <Input
              value={locality}
              onChange={(e) => setLocality(e.target.value)}
              placeholder="City"
              className="h-7 flex-1 text-xs"
            />
            <Input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="State"
              className="h-7 w-16 text-xs"
            />
            <Input
              value={postal}
              onChange={(e) => setPostal(e.target.value)}
              placeholder="ZIP"
              className="h-7 w-20 text-xs"
            />
            <Input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="US"
              maxLength={2}
              className="h-7 w-12 text-xs uppercase"
            />
            <Button
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={submit}
              disabled={saving}
            >
              Add
            </Button>
          </div>
        </div>
      )}

      {addresses.length === 0 && !adding ? (
        <SectionEmpty>No addresses yet</SectionEmpty>
      ) : (
        <ul className="space-y-0.5">
          {addresses.map((address) => (
            <li
              key={address.id}
              className="group flex items-center gap-2 rounded px-1.5 py-1 hover:bg-accent/50"
            >
              <span className="shrink-0 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[11px] font-medium capitalize leading-none text-muted-foreground">
                {address.purpose_code}
              </span>
              <span className="min-w-0 truncate text-sm text-foreground">
                {formatAddress(address) || "—"}
              </span>
              <button
                type="button"
                aria-label="Remove address"
                onClick={() => void remove(address)}
                className="ml-auto shrink-0 rounded p-0.5 text-muted-foreground/40 opacity-0 hover:text-destructive group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
