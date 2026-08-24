"use client";

/**
 * "+ ADD A LOCATION" — P23, inside the picker that needed one.
 *
 * Arman, 2026-08-23: "it's the lazy coding agent who builds a popover with a
 * drop down but is too lazy to include an add feature." Binding a service area
 * to a business location is worthless on a brand that has no locations yet —
 * which is most brands, and is exactly the state `datadestruction.com` is in.
 * So the picker's empty state is not a wall, it is a form.
 *
 * IT ASKS FOR CITY AND STATE, NOT JUST A NAME. `seo.gsc_location_readiness`
 * reports "N location(s) have no city or state — those locations can never win
 * a keyword". Creating a row that trips its own gauge one second later is not
 * a shortcut, it is a defect with a nice animation.
 *
 * It writes through the ONE location-create path (`createBusinessLocation` via
 * `useCreateBusinessLocation`), never a second insert into web.business_location.
 */

import { useState } from "react";
import { Loader2, MapPin } from "lucide-react";
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
import { extractErrorMessage } from "@/utils/errors";
import { useCreateBusinessLocation } from "@/features/marketing/data/hooks";
import type { BusinessLocation } from "@/features/marketing/types";

export function AddLocationDialog({
  brandId,
  organizationId,
  initialName,
  onCancel,
  onCreated,
}: {
  brandId: string;
  organizationId: string;
  /** Whatever was typed into the picker — the reason this dialog opened. */
  initialName: string;
  onCancel: () => void;
  onCreated: (location: BusinessLocation) => void;
}) {
  const [name, setName] = useState(initialName);
  const [locality, setLocality] = useState("");
  const [region, setRegion] = useState("");
  const create = useCreateBusinessLocation();

  const trimmedName = name.trim();
  const ready = trimmedName.length > 0 && create.isPending === false;

  const submit = () => {
    if (!ready) return;
    create.mutate(
      {
        organizationId,
        brandId,
        name: trimmedName,
        locality: locality.trim() || null,
        region: region.trim() || null,
      },
      {
        onSuccess: (location) => {
          toast.success("Location added", {
            description:
              locality.trim() || region.trim()
                ? `Searches naming ${[locality.trim(), region.trim()]
                    .filter(Boolean)
                    .join(", ")} can now be attributed to it.`
                : "Add its city and state and local searches start finding it.",
          });
          onCreated(location);
        },
        onError: (error) => toast.error(extractErrorMessage(error)),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onCancel())}>
      <DialogContent className="w-[min(28rem,94vw)] gap-3">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4 text-primary" aria-hidden />
            Add a business location
          </DialogTitle>
          <DialogDescription className="text-xs">
            A real place this business operates from. Its city and state are how
            a search that names a town finds its way to it — a location without
            them can never win a keyword.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5">
          <label className="block space-y-1">
            <span className="block text-[11px] font-medium text-foreground">
              What you call it
            </span>
            <Input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
              }}
              placeholder="Irvine HQ"
              className="h-8 text-sm"
            />
          </label>
          <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
            <label className="block space-y-1">
              <span className="block text-[11px] font-medium text-foreground">
                City
              </span>
              <Input
                value={locality}
                onChange={(event) => setLocality(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submit();
                }}
                placeholder="Irvine"
                className="h-8 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="block text-[11px] font-medium text-foreground">
                State
              </span>
              <Input
                value={region}
                onChange={(event) => setRegion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submit();
                }}
                placeholder="CA"
                className="h-8 text-sm"
              />
            </label>
          </div>
          <p className="text-[10px] leading-4 text-muted-foreground">
            The full address, hours and directory listings live on the
            location&apos;s own page — this is only what attribution needs.
          </p>
        </div>

        <DialogFooter className="flex-row justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={create.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={submit}
            disabled={!ready}
            className="gap-1.5"
          >
            {create.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : null}
            Add location
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
