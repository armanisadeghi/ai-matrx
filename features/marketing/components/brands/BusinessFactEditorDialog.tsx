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
import { Input } from "@/components/ui/input";
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
  isJsonRecord,
  type BusinessFact,
  type BusinessFactKind,
} from "@/features/marketing/types";
import { extractErrorMessage } from "@/utils/errors";

function factValueString(fact: BusinessFact | null): string {
  if (!fact) return "";
  if (isJsonRecord(fact.value)) {
    const candidate = fact.value.url ?? fact.value.text ?? fact.value.value;
    if (typeof candidate === "string") return candidate;
    return JSON.stringify(fact.value);
  }
  return String(fact.value ?? "");
}

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
  const [value, setValue] = useState(() => factValueString(fact));
  const busy = createMutation.isPending || updateMutation.isPending;

  const save = async () => {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      toast.error("A fact needs a value.");
      return;
    }
    if (kind === "other" && !label.trim()) {
      toast.error("Other facts need a custom label.");
      return;
    }
    try {
      if (fact) {
        await updateMutation.mutateAsync({
          factId: fact.id,
          expectedVersion: fact.version,
          kind,
          label: label.trim() || null,
          value: trimmedValue,
        });
        toast.success("Fact saved");
      } else {
        await createMutation.mutateAsync({
          organizationId,
          brandId,
          kind,
          label: label.trim() || null,
          value: trimmedValue,
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
                <SelectTrigger className="h-9">
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
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void save()}>
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            {fact ? "Save fact" : "Add fact"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
