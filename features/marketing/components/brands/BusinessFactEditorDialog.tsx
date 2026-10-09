"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@ai-matrx/design-system/controls";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreateBusinessFact,
  useUpdateBusinessFact,
} from "@/features/marketing/data/hooks";
import {
  BUSINESS_FACT_KIND_LABELS,
  BUSINESS_FACT_KINDS,
  type BusinessFact,
  type BusinessFactKind,
} from "@/features/marketing/types";
import { extractErrorMessage } from "@/utils/errors";
import {
  applyPostalAddressFields,
  businessFactValueText,
  postalAddressFields,
  withFactText,
  type PostalAddressFields,
} from "@/features/marketing/lib/business-fact-value";
import type { Json } from "@/types/database.types";

/**
 * The ONE business-fact editor — create and edit expose EVERY user-editable
 * fact field. Discovered promotion lives in the discovery inbox; this dialog
 * covers manual curation.
 */
export function BusinessFactEditorDialog({
  open,
  onOpenChange,
  brandId,
  organizationId,
  fact,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  organizationId: string;
  /** null = create mode */
  fact: BusinessFact | null;
}) {
  return (
    <BusinessFactEditorDialogBody
      key={`${open}:${fact?.id ?? "new"}:${fact?.version ?? 0}`}
      open={open}
      onOpenChange={onOpenChange}
      brandId={brandId}
      organizationId={organizationId}
      fact={fact}
    />
  );
}

function BusinessFactEditorDialogBody({
  open,
  onOpenChange,
  brandId,
  organizationId,
  fact,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  organizationId: string;
  fact: BusinessFact | null;
}) {
  const createMutation = useCreateBusinessFact();
  const updateMutation = useUpdateBusinessFact();
  const [kind, setKind] = useState<BusinessFactKind>(() =>
    fact ? (fact.kind as BusinessFactKind) : "phone",
  );
  const [label, setLabel] = useState(fact?.label ?? "");
  const [value, setValue] = useState(() => businessFactValueText(fact?.value ?? null));
  const [address, setAddress] = useState<PostalAddressFields>(() =>
    postalAddressFields(fact?.value ?? null),
  );
  const busy = createMutation.isPending || updateMutation.isPending;

  const save = async () => {
    const isAddress = kind === "address";
    const trimmedValue = value.trim();
    const hasValue = isAddress
      ? Object.values(address).some((part) => part.trim() !== "")
      : trimmedValue !== "";
    if (!hasValue) {
      toast.error("A fact needs a value.");
      return;
    }
    if (kind === "other" && !label.trim()) {
      toast.error("Other facts need a custom label.");
      return;
    }
    // A structured value keeps its shape: an address writes its fields back
    // into the PostalAddress jsonb; any other structure is left untouched
    // unless its readable line was edited, and then only that line changes.
    const nextValue: string | Json = isAddress
      ? applyPostalAddressFields(fact?.value ?? null, address)
      : fact && trimmedValue === businessFactValueText(fact.value)
        ? fact.value
        : withFactText(fact?.value ?? null, trimmedValue);
    try {
      if (fact) {
        await updateMutation.mutateAsync({
          factId: fact.id,
          expectedVersion: fact.version,
          kind,
          label: label.trim() || null,
          value: nextValue,
        });
        toast.success("Fact saved");
      } else {
        await createMutation.mutateAsync({
          organizationId,
          brandId,
          kind,
          label: label.trim() || null,
          value: nextValue,
        });
        toast.success("Fact added");
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(fact ? "Could not save fact" : "Could not add fact", {
        description: extractErrorMessage(error),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{fact ? "Edit fact" : "Add fact"}</DialogTitle>
          <DialogDescription>
            Confirmed business truth — phones, faxes, emails, addresses, and
            brand copy.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select
                value={kind}
                onValueChange={(next) => setKind(next as BusinessFactKind)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BUSINESS_FACT_KINDS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {BUSINESS_FACT_KIND_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="fact-label" className="text-xs">
                Label
              </Label>
              <Input
                id="fact-label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Main office"
              />
            </div>
          </div>

          {kind === "address" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="fact-street" className="text-xs">
                  Street
                </Label>
                <Input
                  id="fact-street"
                  value={address.street}
                  onChange={(event) =>
                    setAddress({ ...address, street: event.target.value })
                  }
                  placeholder="1 Main St"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="fact-city" className="text-xs">
                  City
                </Label>
                <Input
                  id="fact-city"
                  value={address.city}
                  onChange={(event) =>
                    setAddress({ ...address, city: event.target.value })
                  }
                  placeholder="Springfield"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="fact-region" className="text-xs">
                  State or region
                </Label>
                <Input
                  id="fact-region"
                  value={address.region}
                  onChange={(event) =>
                    setAddress({ ...address, region: event.target.value })
                  }
                  placeholder="IL"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="fact-postal" className="text-xs">
                  Postal code
                </Label>
                <Input
                  id="fact-postal"
                  value={address.postalCode}
                  onChange={(event) =>
                    setAddress({ ...address, postalCode: event.target.value })
                  }
                  placeholder="62701"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="fact-country" className="text-xs">
                  Country
                </Label>
                <Input
                  id="fact-country"
                  value={address.country}
                  onChange={(event) =>
                    setAddress({ ...address, country: event.target.value })
                  }
                  placeholder="US"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="fact-value" className="text-xs">
                Value
              </Label>
              <Input
                id="fact-value"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder="(555) 010-0000 or https://…"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="quiet"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button icon={busy ? <Loader2 className="animate-spin" /> : null} variant="primary" disabled={busy} onClick={() => void save()}>
            {fact ? "Save fact" : "Add fact"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
