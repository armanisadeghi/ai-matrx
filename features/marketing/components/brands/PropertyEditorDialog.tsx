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
  useCreateProperty,
  useUpdateProperty,
} from "@/features/marketing/data/hooks";
import {
  PROPERTY_KINDS,
  type BrandProperty,
  type PropertyKind,
} from "@/features/marketing/types";
import { extractErrorMessage } from "@/utils/errors";

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "archived", label: "Archived" },
];

function kindLabel(kind: PropertyKind): string {
  return kind === "x"
    ? "X (Twitter)"
    : kind.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

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
  const [url, setUrl] = useState(property?.url ?? "");
  const [handle, setHandle] = useState(property?.handle ?? "");
  const [displayName, setDisplayName] = useState(property?.display_name ?? "");
  const [status, setStatus] = useState(property?.status ?? "active");
  const busy = createMutation.isPending || updateMutation.isPending;
  const kindOptions = property
    ? PROPERTY_KINDS
    : PROPERTY_KINDS.filter((value) => value !== "website");

  const save = async () => {
    const trimmedUrl = url.trim();
    const trimmedHandle = handle.trim();
    if (!isWebsite && !trimmedUrl && !trimmedHandle) {
      toast.error("A property needs at least a URL or a handle.");
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
            display_name: displayName.trim() || null,
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
          displayName: displayName.trim() || null,
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
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Kind</Label>
              <Select
                value={kind}
                onValueChange={(value) => setKind(value as PropertyKind)}
                disabled={isWebsite}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {kindOptions.map((value) => (
                    <SelectItem key={value} value={value}>
                      {kindLabel(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-9">
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
          </div>

          <div className="space-y-1">
            <Label htmlFor="property-url" className="text-xs">
              Profile URL
            </Label>
            <Input
              id="property-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://instagram.com/yourbrand"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="property-handle" className="text-xs">
                Handle
              </Label>
              <Input
                id="property-handle"
                value={handle}
                onChange={(event) => setHandle(event.target.value)}
                placeholder="@yourbrand"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="property-display-name" className="text-xs">
                Display name
              </Label>
              <Input
                id="property-display-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Your Brand"
              />
            </div>
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
            {property ? "Save property" : "Add property"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
