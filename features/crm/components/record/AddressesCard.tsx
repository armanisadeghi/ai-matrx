"use client";

// features/crm/components/record/AddressesCard.tsx — postal addresses.

import { PlusTapButton, TrashTapButton, XTapButton } from "@ai-matrx/tap-target/buttons";
import { useState } from "react";
import { toast } from "@/lib/toast";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useSurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { CRM_RECORD_SURFACE_NAME } from "@/features/surfaces/manifests/crm-record.manifest";
import { addAddress, removeAddress } from "../../service";
import { parseAddress } from "../../agent-context/crmRecordSurfaceWrite";
import type { AddressPurpose, AddressRow } from "../../types";
import { ADDRESS_PURPOSES } from "../../types";
import { SectionCard, SectionEmpty } from "./SectionCard";
import { CrmRecordCopyButtons } from "./CrmRecordCopyButtons";
import {
  addressesAgentPayload,
  buildAddressCopyView,
  formatAddress,
  formatAddressesCopy,
  type CrmRecordCopyParent,
} from "./record-copy";

interface Props {
  partyId: string;
  partyLabel: string;
  orgId: string;
  addresses: AddressRow[];
  onChanged: () => Promise<void>;
}

export function AddressesCard({
  partyId,
  partyLabel,
  orgId,
  addresses,
  onChanged,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [purpose, setPurpose] = useState<AddressPurpose>("office");
  const [line1, setLine1] = useState("");
  const [locality, setLocality] = useState("");
  const [region, setRegion] = useState("");
  const [postal, setPostal] = useState("");
  const [country, setCountry] = useState("");
  const [saving, setSaving] = useState(false);
  const copyParent: CrmRecordCopyParent = {
    type: "party",
    id: partyId,
    label: partyLabel,
  };
  const addressCopyViews = addresses.map(buildAddressCopyView);

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

  useSurfaceWriteHandlers(CRM_RECORD_SURFACE_NAME, {
    add_address: async (raw: unknown) => {
      const parsed = parseAddress(raw);
      await addAddress({
        party_id: partyId,
        organization_id: orgId,
        purpose_code: parsed.purpose,
        label: parsed.label,
        line1: parsed.line1,
        line2: parsed.line2,
        locality: parsed.locality,
        region: parsed.region,
        postal_code: parsed.postalCode,
        country_code: parsed.countryCode,
      });
      await onChanged();
    },
  });

  return (
    <SectionCard
      empty={addresses.length === 0 && !adding}
      title="Addresses"
      Icon={MapPin}
      count={addresses.length}
      compactAction
      action={
        <div className="flex items-center gap-0.5">
          {addresses.length > 0 && (
            <CrmRecordCopyButtons
              label={`${partyLabel} addresses`}
              human={() => formatAddressesCopy(copyParent, addressCopyViews)}
              agent={() => addressesAgentPayload(copyParent, addressCopyViews)}
              json={() => addressCopyViews}
            />
          )}
          {adding ? (
            <XTapButton ariaLabel="Cancel add" onClick={() => setAdding(false)} />
          ) : (
            <PlusTapButton ariaLabel="Add address" onClick={() => setAdding(true)} />
          )}
        </div>
      }
    >
      {adding && (
        // An inline form on the card's own surface — no box inside the box.
        // Labelled fields in a grid: Type + Street, then City / State / ZIP /
        // Country, then the action on its own row edge.
        <div className="mb-2 grid grid-cols-6 gap-x-2 gap-y-1.5 border-b border-border pb-2">
          <label className="col-span-2 grid gap-0.5 text-xs text-muted-foreground">
            Type
            <Select
              value={purpose}
              onValueChange={(v) => setPurpose(v as AddressPurpose)}
            >
              <SelectTrigger className="h-11 text-base capitalize sm:h-7 sm:text-xs">
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
          </label>
          <label className="col-span-4 grid gap-0.5 text-xs text-muted-foreground">
            Street
            <Input
              value={line1}
              onChange={(e) => setLine1(e.target.value)}
              className="h-11 text-base sm:h-7 sm:text-xs"
              autoFocus
            />
          </label>
          <label className="col-span-6 grid gap-0.5 text-xs text-muted-foreground sm:col-span-3">
            City
            <Input
              value={locality}
              onChange={(e) => setLocality(e.target.value)}
              className="h-11 text-base sm:h-7 sm:text-xs"
            />
          </label>
          <label className="col-span-2 grid gap-0.5 text-xs text-muted-foreground sm:col-span-1">
            State
            <Input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="h-11 text-base sm:h-7 sm:text-xs"
            />
          </label>
          <label className="col-span-2 grid gap-0.5 text-xs text-muted-foreground sm:col-span-1">
            ZIP
            <Input
              value={postal}
              onChange={(e) => setPostal(e.target.value)}
              className="h-11 text-base sm:h-7 sm:text-xs"
            />
          </label>
          <label className="col-span-2 grid gap-0.5 text-xs text-muted-foreground sm:col-span-1">
            Country
            <Input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="US"
              maxLength={2}
              className="h-11 text-base uppercase sm:h-7 sm:text-xs"
            />
          </label>
          <div className="col-span-6 flex justify-end">
            <Button
              size="sm"
              className="h-11 px-4 text-sm sm:h-7 sm:px-3 sm:text-xs"
              onClick={submit}
              disabled={saving}
            >
              Add address
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
              <span className="shrink-0 rounded-full border border-border bg-muted px-1.5 py-0.5 text-xs font-medium capitalize leading-none text-muted-foreground">
                {address.purpose_code}
              </span>
              <span className="min-w-0 truncate text-sm text-foreground">
                {formatAddress(address) || "—"}
              </span>
              <span className="inline-flex ml-auto shrink-0 opacity-100 sm:pointer-fine:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100"><TrashTapButton
                ariaLabel="Remove address"
                onClick={() => void remove(address)}
                className="text-muted-foreground hover:text-destructive"
              /></span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
