"use client";

import { useEffect, useState } from "react";
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
import { SocialAccountInput, useSocialAccountInput } from "@/features/marketing/social/components/SocialAccountInput";
import { isSocialPlatform } from "@/features/marketing/social/types";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreateProperty,
  useUpdateProperty,
} from "@/features/marketing/data/hooks";
import {
  PROPERTY_KINDS,
  PROPERTY_KIND_LABELS,
  type BrandProperty,
  type PropertyKind,
  isPropertyKind,
} from "@/features/marketing/types";
import { extractErrorMessage } from "@/utils/errors";

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "archived", label: "Archived" },
];

/**
 * The ONE property editor — create and edit expose EVERY user-editable
 * property field. Website properties are managed through their `web.site`
 * record, so create offers only non-website kinds and a website property's
 * kind is locked.
 */
export function PropertyEditorDialog({
  open,
  onOpenChange,
  brandId,
  organizationId,
  property,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  organizationId: string;
  /** null = create mode */
  property: BrandProperty | null;
}) {
  return (
    <PropertyEditorDialogBody
      key={`${open}:${property?.id ?? "new"}:${property?.version ?? 0}`}
      open={open}
      onOpenChange={onOpenChange}
      brandId={brandId}
      organizationId={organizationId}
      property={property}
    />
  );
}

function PropertyEditorDialogBody({
  open,
  onOpenChange,
  brandId,
  organizationId,
  property,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  organizationId: string;
  property: BrandProperty | null;
}) {
  const createMutation = useCreateProperty();
  const updateMutation = useUpdateProperty();
  const isWebsite = property?.kind === "website";
  const [kind, setKind] = useState<PropertyKind>(() =>
    property ? (property.kind as PropertyKind) : "instagram",
  );
  // A link for the kinds that are not a social account (a website, a listing, anything else).
  const [url, setUrl] = useState(property?.url ?? "");
  const [displayName, setDisplayName] = useState(property?.display_name ?? "");
  const [status, setStatus] = useState(property?.status ?? "active");
  const [moreOpen, setMoreOpen] = useState((property?.status ?? "active") !== "active");
  const social = isSocialPlatform(kind);
  const input = useSocialAccountInput({
    initialText: property?.handle || property?.url || "",
    contextPlatform: social ? kind : null,
    organizationId,
  });
  const busy = createMutation.isPending || updateMutation.isPending;
  // A pasted link names its own platform: the Type follows it.
  const { parsed } = input;
  useEffect(() => {
    if (parsed.status === "ok" && parsed.detected && parsed.platform !== kind && !isWebsite && isPropertyKind(parsed.platform)) {
      setKind(parsed.platform);
    }
  }, [parsed, kind, isWebsite]);
  const kindOptions = property
    ? PROPERTY_KINDS
    : PROPERTY_KINDS.filter((value) => value !== "website");

  const account = social ? input.account : null;
  const canSave = social ? account !== null : isWebsite || url.trim().length > 0;

  const save = async () => {
    const trimmedUrl = social ? (account?.url ?? "") : url.trim();
    const trimmedHandle = social ? (account?.handle ?? "") : (property?.handle ?? "");
    const name = social ? (account?.displayName ?? property?.display_name ?? "") : displayName.trim();
    if (!isWebsite && !trimmedUrl && !trimmedHandle) {
      toast.error("Enter a handle or link first.");
      return;
    }
    try {
      if (property) {
        await updateMutation.mutateAsync({
          propertyId: property.id,
          expectedVersion: property.version,
          patch: {
            ...(isWebsite ? {} : { kind }),
            url: trimmedUrl || null,
            handle: trimmedHandle || null,
            display_name: name || null,
            status,
          },
        });
        toast.success("Property saved");
      } else {
        await createMutation.mutateAsync({
          organizationId,
          brandId,
          kind,
          url: trimmedUrl || null,
          handle: trimmedHandle || null,
          displayName: name || null,
          status,
        });
        toast.success("Property added");
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(
        property ? "Could not save property" : "Could not add property",
        { description: extractErrorMessage(error) },
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {property ? "Edit property" : "Add property"}
          </DialogTitle>
          <DialogDescription>
            {isWebsite
              ? "Website properties are managed through their site — edit the presence details here."
              : "A social account or other presence this brand owns."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Type</Label>
            <Select
              value={kind}
              onValueChange={(value) => setKind(value as PropertyKind)}
              disabled={isWebsite}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {kindOptions.map((value) => (
                  <SelectItem key={value} value={value}>
                    {PROPERTY_KIND_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {social ? (
            <div className="space-y-1">
              <Label htmlFor="property-account" className="text-xs">
                Handle or link
              </Label>
              <SocialAccountInput input={input} id="property-account" autoFocus />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="property-url" className="text-xs">
                  Link
                </Label>
                <Input id="property-url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://yourbrand.com" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="property-display-name" className="text-xs">
                  Name
                </Label>
                <Input id="property-display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your Brand" />
              </div>
            </div>
          )}

          {moreOpen ? (
            <div className="space-y-1 sm:w-1/2">
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <button
              type="button"
              className="w-fit text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setMoreOpen(true)}
            >
              More options
            </button>
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
          <Button icon={busy ? <Loader2 className="animate-spin" /> : null} variant="primary" disabled={busy || !canSave} onClick={() => void save()}>
            {property ? "Save property" : "Add property"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
